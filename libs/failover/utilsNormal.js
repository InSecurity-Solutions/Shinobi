const path = require('path')
const bson = require('bson')
const { createReadStream, createWriteStream } = require('fs')
const fs = require('fs').promises
const { createWebSocketClient } = require('../basic/websocketTools.js')
module.exports = (s,app,config,lang) => {
    const failoverServerConnections = {}
    const writeStreams = {}
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
        connectionToFailover.send({ f: 'cacheMonitors', monitors });
        return monitors
    }
    async function updateCachedMonitor(connectionToFailover, monitor, deleteMonitor){
        if(monitor){
            if(deleteMonitor){
                connectionToFailover.send({ f: 'deleteCachedMonitor', monitor });
            }else{
                connectionToFailover.send({ f: 'updateCachedMonitor', monitor });
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
    async function importUsers(connectionToFailover){
        const monitors = await getUsers();
        connectionToFailover.send({ f: 'importUsers', users });
        return users
    }
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
    function connectToFailover({ host, key }){
        const parsedIp = parseNewConnectionAddress(host)
        const clientConnection = createWebSocketClient(parsedIp,{})
        clientConnection.on('open', () => {
            clientConnection.send({
                key,
            })
        })
        clientConnection.on('message', async (data) => {
            switch(data.f){
                case'init':
                    await importUsers(clientConnection)
                    await cacheMonitors(clientConnection)
                    clientConnection.send({ f: 'init_complete' })
                break;
                case'insertVideoChunk':
                    insertVideoChunk(data.video, data.data)
                break;
                case'insertVideoComplete':
                    getWriteStream(data.filePath).end()
                break;
            }
        })
        failoverServerConnections[host] = clientConnection
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
        if(failoverServerConnections[host]){
            return new Promise(function(resolve){
                failoverServerConnections[host].send({ f: 'exit' })
                failoverServerConnections[host].onclose = (event) => {
                    delete(failoverServerConnections[host])
                    resolve()
                }
                failoverServerConnections[host].terminate()
            })
        }
    }
    async function connectFailoverServers(){
        if(config.failoverServers){
            for(host in config.failoverServers){
                const key = config.failoverServers[host];
                await closeFailoverConnection(host)
                connectToFailover(host, key)
            }
        }
    }
    function parseNewConnectionAddress(serverIp){
        let parsedIp = `${serverIp}`
        if(parsedIp.indexOf('://') === -1)parsedIp = `ws://${parsedIp}`
        if(parsedIp.split(':').length === 2)parsedIp = `ws://${parsedIp}:8663`
        return parsedIp;
    }
    function getFailoverServers(){
        const response = { ok: true }
        response.failoverServers = config.failoverServers || {};
        return response
    }
    async function addFailoverServer(serverIp, p2pKey){
        const response = { ok: true }
        const currentConfig = await getConfiguration();
        if(!currentConfig.failoverServers)currentConfig.failoverServers = {};
        currentConfig.failoverServers[serverIp] = p2pKey;
        config = Object.assign(config, { failoverServers: currentConfig.failoverServers })
        const configError = await modifyConfiguration(currentConfig)
        if(configError){
            response.ok = false;
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
        updateCachedMonitor,
        insertVideoChunk,
        connectToFailover,
        runOnFailoverConnections,
        getFailoverConnections,
        getFailoverConnection,
        connectFailoverServers,
        getFailoverServers,
        addFailoverServer,
        removeFailoverServer,
    }
}
