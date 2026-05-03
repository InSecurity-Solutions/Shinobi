const bson = require('bson')
const fs = require('fs').promises
const { createWebSocketServer } = require('../basic/websocketTools.js')
module.exports = async (s,app,config,lang) => {
    if(config.isFailover){
        let {
            importUsers,
            importMonitors,
            importPermissions,
            deleteUsers,
            stopMonitors,
            stopMonitorQueues,
            deleteMonitors,
            downloadVideosFromMonitors,
            getFailoverServerKeys,
            addFailoverServerKey,
            removeFailoverServerKey,
            sendMessage,
            transmitVideosFromMonitors,
            transmitEventsFromMonitors,
            transmitCloudUploadRecordsFromMonitors,
            disableCloudUploaders,
            setTargetManagmentServerUser,
            saveCurrentState,
            loadCurrentState,
            updateCachedMonitor,
            saveMonitorsCache,
            loadMonitorsCache,
            setMonitorInCacheIndex,
            setNormalServerConnection,
            getNormalServerConnection,
            getNormalServerConnections,
            loadPendingMonitorImports,
            runOnNormalServerConnections,
            reconnectedLostServerActionTimeout,
            lostServerActionTimeout,
            setLostServerActionTimeout,
            clearSkipImport,
            beginVideoTransmission,
            beginEventTransmission,
            beginCloudUploadRecordsTransmission,
            setMonitorCache,
            setUserCache,
            setPermissionCache,
            setGracefulExitRequest,
            getGracefulExitRequest,
            deleteLostServerActionTimeout,
            //
            getVideoFilePath,
            saveFailoverState,
        } = await require('./utilsFailover.js')(s,app,config,lang)
        let thisDetectedServerIp = null
        const failoverServerCache = {}
        const awaitingCallbacks = {}
        const theWebSocket = createWebSocketServer()
        function setClientKillTimerIfNotAuthenticatedInTime(client){
            client.killTimer = setTimeout(function(){
                client.terminate()
            },10000)
        }
        function clearKillTimer(client){
            clearTimeout(client.killTimer)
        }
        function videoExistsInNormal(client, video, monitor){
            return new Promise(async function(resolve){
                const filePath = getVideoFilePath(video);
                const callbackId = s.gid(5)
                const fileSize = (await fs.stat(filePath)).size
                const monitorInfo = {
                    mid: video.mid,
                    ke: video.ke,
                    details: {
                        dir: s.parseJSON(monitor.details).dir
                    }
                }
                awaitingCallbacks[callbackId] = function(exists){
                    clearTimeout(awaitedTimeout)
                    delete(awaitingCallbacks[callbackId])
                    resolve(exists)
                }
                sendMessage(client, { f: 'videoExistsInNormal', video, monitorInfo, fileSize, callbackId })
                let awaitedTimeout = setTimeout(() => {
                    delete(awaitingCallbacks[callbackId])
                    resolve(false)
                },10000)
            })
        }
        theWebSocket.on('connection',(client, req) => {
            const ip = req.socket.remoteAddress;
            client._ipAddress = ip;
            let peerConnectKey = ''
            // client.send(someDataToSendAsStringOrBinary)
            setClientKillTimerIfNotAuthenticatedInTime(client)

            function onAuthenticate(data){
                const { key } = bson.deserialize(Buffer.from(data))
                client.removeListener('message', onAuthenticate);
                if(Object.keys(config.failoverConnectionKeys).includes(key)){
                    peerConnectKey = `${key}`
                    deleteLostServerActionTimeout(peerConnectKey)
                    setNormalServerConnection(peerConnectKey, client)
                    console.log('Authenticated as Failover for ', peerConnectKey)
                    client.on('message', onAuthenticatedData)
                    client.on('close', onAuthenticatedExit)
                    sendMessage(client, { f: 'init' })
                    console.log('Initializing as Failover for ', peerConnectKey)
                }else{
                    console.log('Failed Authentication as Failover for ', key)
                    client.terminate()
                }
            }
            async function onAuthenticatedExit(){
                if(!getGracefulExitRequest(peerConnectKey) && checkIfFirstConnectedFailoverServer(peerConnectKey)){
                    setLostServerActionTimeout(peerConnectKey)
                }
            }
            function checkIfFirstConnectedFailoverServer(peerConnectKey) {
                let oldestServer = null;
                for (const serverIp in failoverServerCache[peerConnectKey]) {
                    const aServer = failoverServerCache[peerConnectKey][serverIp];
                    if (oldestServer === null || aServer.time < oldestServer.time) {
                        oldestServer = serverIp;
                    }
                }
                if(oldestServer === thisDetectedServerIp)return true;
                return false;
            }
            async function onAuthenticatedData(message){
                const data = bson.deserialize(Buffer.from(message))
                switch(data.f){
                    case'exit':
                        console.log('Failover : Requested Graceful Exit ', peerConnectKey)
                        setGracefulExitRequest(peerConnectKey, true)
                    break;
                    case'cache_other_failovers':
                        thisDetectedServerIp = data.serverIp
                        failoverServerCache[peerConnectKey] = data.allServers;
                    break;
                    case'init_complete':
                        console.log('Initialized as Failover for ', peerConnectKey)
                        clearKillTimer(client)
                        clearSkipImport(peerConnectKey)
                        await saveFailoverState()
                        reconnectedLostServerActionTimeout(peerConnectKey, async () => {
                            console.log('Failover : Reconnected to ', peerConnectKey)
                            await stopMonitorQueues(peerConnectKey)
                            await stopMonitors(peerConnectKey)
                            await beginVideoTransmission(peerConnectKey, videoExistsInNormal)
                            await beginEventTransmission(peerConnectKey)
                            await beginCloudUploadRecordsTransmission(peerConnectKey)
                            await deleteMonitors(peerConnectKey)
                            await deleteUsers(peerConnectKey)
                            await s.resetAllManagementServers()
                            await saveFailoverState()
                        })
                    break;
                    // case'importUsers': // UNUSED
                    //     const filteredUsers = data.users.filter(user => user.mail !== 'dummy@shinobi.dummy');
                    //     if(filteredUsers[0]){
                    //         await setTargetManagmentServerUser(filteredUsers[0].mail)
                    //         await importUsers(filteredUsers)
                    //         await s.resetAllManagementServers()
                    //     }
                    // break;
                    case'cacheMonitors':
                        setMonitorCache(peerConnectKey, data.monitors)
                        await saveFailoverState()
                    break;
                    case'updateCachedMonitor':
                        setMonitorInCacheIndex(peerConnectKey,data.monitor.ke,data.monitor.mid,true)
                        updateCachedMonitor(peerConnectKey, data.monitor)
                        await saveFailoverState(true, false)
                    break;
                    case'deleteCachedMonitor':
                        setMonitorInCacheIndex(peerConnectKey,data.monitor.ke,data.monitor.mid,false)
                        updateCachedMonitor(peerConnectKey, data.monitor, true)
                        await saveFailoverState(true, false)
                    break;
                    case'cacheUsers':
                        for(user of data.users){
                            disableCloudUploaders(user)
                        }
                        setUserCache(peerConnectKey, data.users)
                        await saveFailoverState()
                    break;
                    case'cachePermissions':
                        setPermissionCache(peerConnectKey, data.permissions)
                        await saveFailoverState()
                    break;
                    case'updateCachedUser':
                        updateCachedUser(peerConnectKey, data.user)
                        await saveFailoverState()
                    break;
                    case'deleteCachedUser':
                        updateCachedUser(peerConnectKey, data.user, true)
                        await saveFailoverState()
                    break;
                    case'deleteMonitors':
                        deleteMonitors(data.monitors, false)
                    break;
                    case'deleteUsers':
                        deleteUsers(data.users, false)
                    break;
                    case'videoExistsInNormalResponse':
                        awaitingCallbacks[data.callbackId](data.exists)
                    break;
                    default:
                        console.log(`No Failover Handler!`)
                        console.log(`here's what we got :`)
                        console.log(data)
                    break;
                }
            }
            client.on('message', onAuthenticate)
            client.on('close', () => {
                if(getGracefulExitRequest(peerConnectKey)){
                    console.log('Failover : Gracefully Disconnected ', peerConnectKey)
                }else{
                    console.log('Failover : Lost Connection for ', peerConnectKey)
                }
                clearTimeout(client.killTimer)
                client.removeAllListeners()
            })
        })
        s.onHttpRequestUpgrade('/failover',(request, socket, head) => {
            theWebSocket.handleUpgrade(request, socket, head, function done(ws) {
                theWebSocket.emit('connection', ws, request)
            })
        })
        /**
        * API : Superuser : Get Failover Keys
        */
        app.get(config.webPaths.superApiPrefix+':auth/failoverKeys/list', function (req,res){
            s.superAuth(req.params,(resp) => {
                const response = getFailoverServerKeys()
                s.closeJsonResponse(res,response)
            },res,req)
        })

        /**
        * API : Superuser : Save Failover Keys
        */
        app.post(config.webPaths.superApiPrefix+':auth/failoverKeys/save', function (req,res){
            s.superAuth(req.params,async (resp) => {
                const failoverServer = req.body.failoverServer;
                const response = await addFailoverServerKey(failoverServer)
                s.closeJsonResponse(res,response)
            },res,req)
        })

        /**
        * API : Delete Failover Keys
        */
        app.post(config.webPaths.superApiPrefix+':auth/failoverKeys/disconnect', async function (req,res){
            s.superAuth(req.params,async (resp) => {
                const failoverServer = req.body.failoverServer;
                const response = await removeFailoverServerKey(failoverServer)
                s.closeJsonResponse(res,response)
            },res,req)
        })

        /**
        * API : Get Connected Servers
        */
        app.get(config.webPaths.superApiPrefix+':auth/failoverServersConnected', async function (req,res){
            s.superAuth(req.params,async (resp) => {
                const response = { servers: {}, ok: true }
                const foundServers = {}
                const normalServerConnections = getNormalServerConnections()
                for(peerConnectKey in normalServerConnections){
                    const serverClient = normalServerConnections[peerConnectKey]
                    foundServers[serverClient._ipAddress] = peerConnectKey
                    response.servers = foundServers
                }
                s.closeJsonResponse(res,response)
            },res,req)
        })

        s.onMonitorSave((monitorConfig) => {
            runOnNormalServerConnections((peerConnectKey, connectionToNormal) => {
                if(setMonitorInCacheIndex(peerConnectKey,monitorConfig.ke,monitorConfig.mid)){
                    updateCachedMonitor(peerConnectKey, monitorConfig)
                    saveFailoverState(true, false)
                }
            })
        })
        s.onMonitorDelete((monitorConfig) => {
            runOnNormalServerConnections((peerConnectKey, connectionToNormal) => {
                if(setMonitorInCacheIndex(peerConnectKey,monitorConfig.ke,monitorConfig.mid)){
                    updateCachedMonitor(peerConnectKey, monitorConfig, true)
                    saveFailoverState(true, false)
                }
            })
        })
        s.onProcessReady(() => {
            loadPendingMonitorImports()
        });
    }
}
