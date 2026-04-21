const path = require('path')
const bson = require('bson')
const { createReadStream, createWriteStream } = require('fs')
const fs = require('fs').promises
const { createWebSocketClient } = require('../basic/websocketTools.js')
module.exports = (s,app,config,lang) => {
    const failoverServerConnections = {}
    const failoverServerCache = {}
    const writeStreams = {}
    const reconnectTimeouts = {}
    const {
        getVideoFilePath,
    } = require('./utils.js')(s,app,config,lang)
    const {
        modifyConfiguration,
        getConfiguration
    } = require('../system/utils.js')(config)
    async function getMonitors(){
        const { rows: monitors } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "Monitors"
        });
        return monitors || []
    }
    async function cacheMonitors(connectionToFailover){
        const monitors = await getMonitors();
        sendMessage(connectionToFailover,{ f: 'cacheMonitors', monitors });
        return monitors
    }
    async function updateCachedMonitor(connectionToFailover, monitor, deleteMonitor){
        if(monitor){
            if(deleteMonitor){
                sendMessage(connectionToFailover,{ f: 'deleteCachedMonitor', monitor });
            }else{
                sendMessage(connectionToFailover,{ f: 'updateCachedMonitor', monitor });
            }
        }
    }
    async function getUsers(){
        const { rows: users } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "Users"
        });
        return users || []
    }
    async function cacheUsers(connectionToFailover){
        const users = await getUsers();
        sendMessage(connectionToFailover,{ f: 'cacheUsers', users });
        return users
    }
    async function updateCachedUser(connectionToFailover, user, deleteUser){
        if(user){
            if(deleteMonitor){
                sendMessage(connectionToFailover,{ f: 'deleteCachedUser', user });
            }else{
                sendMessage(connectionToFailover,{ f: 'updateCachedUser', user });
            }
        }
    }
    // async function importUsers(connectionToFailover){
    //     const users = await getUsers();
    //     sendMessage(connectionToFailover,{ f: 'importUsers', users });
    //     return users
    // }
    function getWriteStream(filePath){
        let writeStream = writeStreams[filePath]
        if(!writeStream){
            writeStreams[filePath] = createWriteStream(filePath)
            return writeStreams[filePath]
        }
        return writeStream
    }
    function insertVideoChunk(video, chunk){
        const filePath = getVideoFilePath(video);
        let writeStream = getWriteStream(filePath)
        if(!writeStreams[filePath]){
            const activeMonitor = s.group[video.ke].activeMonitors[video.mid]
            const monitorConfig = s.group[video.ke].rawMonitorConfigurations[video.mid]
            const videoDirectory = s.getVideoDirectory(monitorConfig)
            const filename = s.formattedTime(video.time)
            writeStreams[filePath] = createWriteStream(filePath)
            writeStream = writeStreams[filePath]
            wstream.on('finish', async () => {
                const groupKey = video.ke
                const monitorId = video.mid
                const filesize = await fs.stat(filePath)
                const insert = {
                    startTime : video.time,
                    filesize : filesize,
                    endTime : video.end,
                    dir : videoDirectory,
                    file : filename,
                    filename : filename,
                    filesizeMB : parseFloat((filesize/1048576).toFixed(2))
                }
                s.insertDatabaseRow(monitorConfig,insert,function(response){
                    postProcessCompletedMp4Video(response.insertQuery).then((isGood) => {
                        s.insertCompletedVideoExtensions.forEach(function(extender){
                            extender(activeMonitor, monitorConfig, insert)
                        })
                        s.purgeDiskForGroup(groupKey)
                        s.setDiskUsedForGroup(groupKey,insert.filesizeMB)
                        clearTimeout(activeMonitor.recordingChecker)
                        clearTimeout(activeMonitor.streamChecker)
                    })
                })
            })
        }
        writeStream.write(chunk)
    }
    function sendMessage(clientConnection,data){
        clientConnection.send(bson.serialize(data))
    }
    async function insertEvents(events){
        for(anEvent of events){
            await s.knexQueryPromise({
                action: "insert",
                table: "Events",
                insert: anEvent
            });
        }
    }
    async function insertCloudVideos(events){
        for(anEvent of events){
            await s.knexQueryPromise({
                action: "insert",
                table: "Cloud Videos",
                insert: anEvent
            });
        }
    }
    function sendFailoverServerCache(){
        runOnFailoverConnections((host, serverConnection) => {
            sendMessage(serverConnection, { f: 'cache_other_failovers', allServers: failoverServerCache, serverIp: host })
        })
    }
    function connectToFailover({ host, key }){
        clearTimeout(reconnectTimeouts[host])
        const parsedIp = parseNewConnectionAddress(host)
        s.debugLog('Attempting Connection to Failover at ', parsedIp)
        const clientConnection = createWebSocketClient(parsedIp)
        function reconnectOnFailure(){
            s.debugLog('Failover Connection Failed, Trying again...', host)
            try{
                failoverServerConnections[host].terminate()
            }catch(err){}
            delete(failoverServerConnections[host])
            delete(failoverServerCache[host])
            clearTimeout(reconnectTimeouts[host])
            reconnectTimeouts[host] = setTimeout(function(){
                connectToFailover({ host, key })
            },10000)
        }
        clientConnection.onclose = reconnectOnFailure
        clientConnection.on('open', () => {
            s.debugLog('Connected to Failover, Attempting Authentication... ', host)
            sendMessage(clientConnection, { key })
        })
        clientConnection.on('error', (data) => {
            s.debugLog('Failover Connection Error : ', data)
        })
        clientConnection.on('message', async (message) => {
            const data = bson.deserialize(Buffer.from(message))
            switch(data.f){
                case'init':
                    s.debugLog('Initializing Failover at ', host)
                    await cacheUsers(clientConnection)
                    await cacheMonitors(clientConnection)
                    sendMessage(clientConnection, { f: 'init_complete' })
                    sendFailoverServerCache()
                    s.debugLog('Initialized Failover at ', host)
                break;
                case'insertEvents':
                    insertEvents(data.events)
                break;
                case'insertCloudVideos':
                    insertCloudVideos(data.videos)
                break;
                case'insertVideoChunk':
                    insertVideoChunk(data.video, data.data)
                break;
                case'insertVideoComplete':
                    try{
                        getWriteStream(data.filePath).end()
                    }catch(err){
                        console.log(err)
                    }
                break;
            }
        })
        failoverServerConnections[host] = clientConnection
        failoverServerCache[host] = { time: new Date(), key };
    }
    function getFailoverConnections(){
        return failoverServerConnections
    }
    function runOnFailoverConnections(callback){
        for(host in failoverServerConnections){
            const serverConnection = failoverServerConnections[host]
            callback(host, serverConnection)
        }
    }
    function getFailoverConnection(host){
        return failoverServerConnections[host]
    }
    function closeFailoverConnection(host){
        sendFailoverServerCache()
        if(failoverServerConnections[host]){
            return new Promise(function(resolve){
                try{
                    sendMessage(failoverServerConnections[host],{ f: 'exit' })
                    failoverServerConnections[host].onclose = (event) => {
                        delete(failoverServerConnections[host])
                        delete(failoverServerCache[host])
                        resolve()
                    }
                    failoverServerConnections[host].terminate()
                }catch(err){
                    s.debugLog(err)
                    resolve()
                }
            })
        }
    }
    async function connectFailoverServers(){
        if(config.failoverServers){
            // console.log('Attempting to Connect to Failover Servers')
            for(host in config.failoverServers){
                console.log('Attempting to Connect to Failover Server : ',host)
                const key = config.failoverServers[host];
                await closeFailoverConnection(host)
                connectToFailover({ host, key })
            }
        }
    }
    function parseNewConnectionAddress(serverIp){
        let parsedIp = `${serverIp}`
        if(parsedIp.indexOf('://') === -1)parsedIp = `ws://${parsedIp}`
        // if(parsedIp.split(':').length === 2)parsedIp = `${parsedIp}:8080`
        if(!parsedIp.endsWith('/failover'))parsedIp += `/failover`
        return parsedIp;
    }
    function getFailoverServers(){
        const response = { ok: true }
        response.failoverServers = config.failoverServers || {};
        return response
    }
    async function addFailoverServer(serverIp, p2pKey){
        const response = { ok: true }
        const trimmedKey = `${p2pKey}`.trim()
        const parsedIp = parseNewConnectionAddress(serverIp.trim())
        const currentConfig = await getConfiguration();
        if(!currentConfig.failoverServers)currentConfig.failoverServers = {};
        let keyInUse = false
        for(existingIp in currentConfig.failoverServers){
            const existingKey = currentConfig.failoverServers[existingIp];
            if(existingIp !== parsedIp && existingKey === trimmedKey)keyInUse = true;
        }
        if(keyInUse){
            response.ok = false;
            response.msg = lang['Key Already Exists']
            return response
        }
        currentConfig.failoverServers[parsedIp] = trimmedKey;
        config = Object.assign(config, { failoverServers: currentConfig.failoverServers })
        const configError = await modifyConfiguration(currentConfig)
        response.host = parsedIp;
        response.key = trimmedKey;
        if(configError){
            response.ok = false;
            response.msg = lang['Failed to Save']
            response.err = configError
            s.systemLog(configError)
        }
        return response
    }
    async function removeFailoverServer(serverIp, p2pKey){
        const response = { ok: true }
        let foundMatching = false;
        const currentConfig = await getConfiguration();
        if(!currentConfig.failoverServers)currentConfig.failoverServers = {};
        const currentPeerConnectKey = currentConfig.failoverServers[serverIp];
        if(currentPeerConnectKey === p2pKey){
            foundMatching = true
            delete(currentConfig.failoverServers[serverIp])
            config = Object.assign(config, { failoverServers: currentConfig.failoverServers })
            const configError = await modifyConfiguration(currentConfig)
            if(configError){
                response.ok = false;
                response.err = configError
                s.systemLog(configError)
            }
        }else{
            response.ok = false;
            response.msg = 'Peer Connect Key not matching! Cannot disconnect.';
        }
        return response
    }
    return {
        getMonitors,
        getWriteStream,
        cacheMonitors,
        cacheUsers,
        updateCachedMonitor,
        updateCachedUser,
        insertVideoChunk,
        connectToFailover,
        runOnFailoverConnections,
        getFailoverConnections,
        getFailoverConnection,
        connectFailoverServers,
        getFailoverServers,
        addFailoverServer,
        removeFailoverServer,
        closeFailoverConnection,
        parseNewConnectionAddress,
    }
}
