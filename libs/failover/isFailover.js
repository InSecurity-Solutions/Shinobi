const bson = require('bson')
const { createWebSocketServer } = require('../basic/websocketTools.js')
module.exports = async (s,app,config,lang) => {
    if(config.isFailover){
        const {
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
        } = require('./utilsFailover.js')(s,app,config,lang)
        const reconnectedLostServerActionTimeouts = {}
        const lostServerActionTimeouts = {}
        const videosTransmitting = {}
        const eventsTransmitting = {}
        const cloudRecordsTransmitting = {}
        const normalServerConnections = {}
        const failoverServerCache = {}
        let thisDetectedServerIp = null
        const allowCloudUploads = config.failoverAllowCloudUploaders;
        async function loadFailoverState(){
            const data = await loadCurrentState()
            if(data.lostServerActionTimeoutsIndex.length > 0){
                for(indexItem of data.lostServerActionTimeoutsIndex){
                    setLostServerActionTimeout(indexItem)
                }
            }
            return data
        }

        const {
            cachedMonitors = {},
            cachedMonitorsIndex = {},
            cachedUsers = {},
            cachedPermissions = {},
            lostConnections = {},
            gracefulExitRequested = {},
            skipImport = {},
        } = await loadFailoverState();
        const theWebSocket = createWebSocketServer()
        function saveFailoverState(){
            return saveCurrentState({
                time: new Date(),
                cachedMonitors,
                cachedMonitorsIndex,
                cachedUsers,
                cachedPermissions,
                lostConnections,
                gracefulExitRequested,
                skipImport,
                lostServerActionTimeoutsIndex: Object.keys(lostServerActionTimeouts)
            })
        }
        async function loadPendingMonitorImports(){
            for(peerConnectKey in lostConnections){
                if(lostConnections[peerConnectKey])await importMonitors(cachedMonitors[peerConnectKey] || [], peerConnectKey, lostConnections, skipImport, saveFailoverState)
            }
        }
        function runOnNormalServerConnections(callback){
            for(peerConnectKey in normalServerConnections){
                const serverConnection = normalServerConnections[peerConnectKey]
                callback(peerConnectKey, serverConnection)
            }
        }
        function reconnectedLostServerActionTimeout(peerConnectKey,callback){
            clearTimeout(reconnectedLostServerActionTimeouts[peerConnectKey])
            reconnectedLostServerActionTimeouts[peerConnectKey] = setTimeout(function(){
                callback()
            },10000)
        }
        function lostServerActionTimeout(peerConnectKey,callback){
            clearTimeout(lostServerActionTimeouts[peerConnectKey])
            lostServerActionTimeouts[peerConnectKey] = setTimeout(function(){
                callback()
            },10000)
        }
        function setLostServerActionTimeout(peerConnectKey){
            lostServerActionTimeout(peerConnectKey, async () => {
                console.log('Failover : Setting up lost Server configurations ', peerConnectKey)
                // need to send signal to other Failover servers not to do the same thing if one is already doing
                const filteredUsers = (cachedUsers[peerConnectKey] || []).filter(user => user.mail !== 'dummy@shinobi.dummy');
                if(filteredUsers[0]){
                    lostConnections[peerConnectKey] = true
                    delete(lostServerActionTimeouts[peerConnectKey])
                    await saveFailoverState()
                    await setTargetManagmentServerUser(filteredUsers[0].mail)
                    await importPermissions(cachedPermissions[peerConnectKey] || [])
                    await importUsers(cachedUsers[peerConnectKey] || [])
                    await s.resetAllManagementServers()
                    await importMonitors(cachedMonitors[peerConnectKey] || [], peerConnectKey, lostConnections, skipImport, saveFailoverState)
                    await saveFailoverState()
                }
            })
        }
        function setClientKillTimerIfNotAuthenticatedInTime(client){
            client.killTimer = setTimeout(function(){
                client.terminate()
            },10000)
        }
        function clearKillTimer(client){
            clearTimeout(client.killTimer)
        }
        function setMonitorInCacheIndex(peerConnectKey,groupKey,monitorId,modifierBoolean){
            if(!cachedMonitorsIndex[peerConnectKey])cachedMonitorsIndex[peerConnectKey] = {}
            if(modifierBoolean !== undefined){
                if(!modifierBoolean){
                    delete(cachedMonitorsIndex[peerConnectKey][`${groupKey}${monitorId}`])
                }else{
                    cachedMonitorsIndex[peerConnectKey][`${groupKey}${monitorId}`] = true
                }
            }
            return cachedMonitorsIndex[peerConnectKey][`${groupKey}${monitorId}`]
        }
        theWebSocket.on('connection',(client, req) => {
            const ip = req.socket.remoteAddress;
            client._ipAddress = ip;
            let peerConnectKey = ''
            // client.send(someDataToSendAsStringOrBinary)
            setClientKillTimerIfNotAuthenticatedInTime(client)
            async function beginVideoTransmission(){
                var response = []
                if(!videosTransmitting[peerConnectKey]){
                    videosTransmitting[peerConnectKey] = true
                    response = await transmitVideosFromMonitors(cachedMonitors[peerConnectKey] || [], client, true)
                    videosTransmitting[peerConnectKey] = false
                }
                sendMessage(client, { f: 'transmitVideosFromMonitorsResponse', response })
            }
            async function beginEventTransmission(){
                var response = { ok: true }
                if(!eventsTransmitting[peerConnectKey]){
                    eventsTransmitting[peerConnectKey] = true
                    await transmitEventsFromMonitors(cachedMonitors[peerConnectKey] || [], client, true)
                    eventsTransmitting[peerConnectKey] = false
                }
                sendMessage(client, { f: 'transmitEventsFromMonitorsResponse', response })
            }
            async function beginCloudUploadRecordsTransmission(){
                var response = { ok: true }
                if(allowCloudUploads && !cloudRecordsTransmitting[peerConnectKey]){
                    cloudRecordsTransmitting[peerConnectKey] = true
                    await transmitCloudUploadRecordsFromMonitors(cachedMonitors[peerConnectKey] || [], client, true)
                    cloudRecordsTransmitting[peerConnectKey] = false
                }
                sendMessage(client, { f: 'transmitCloudUploadRecordsFromMonitorsResponse', response })
            }
            function onAuthenticate(data){
                const { key } = bson.deserialize(Buffer.from(data))
                clearKillTimer(client)
                client.removeListener('message', onAuthenticate);
                if(Object.keys(config.failoverConnectionKeys).includes(key)){
                    clearTimeout(lostServerActionTimeouts[peerConnectKey])
                    delete(lostServerActionTimeouts[peerConnectKey])
                    peerConnectKey = `${key}`
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
                if(!gracefulExitRequested[peerConnectKey] && checkIfFirstConnectedFailoverServer(peerConnectKey)){
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
                        gracefulExitRequested[peerConnectKey] = true
                    break;
                    case'cache_other_failovers':
                        thisDetectedServerIp = data.serverIp
                        failoverServerCache[peerConnectKey] = data.allServers;
                    break;
                    case'init_complete':
                        console.log('Initialized as Failover for ', peerConnectKey)
                        if(lostConnections[peerConnectKey]){
                            lostConnections[peerConnectKey] = false
                            skipImport[peerConnectKey] = {}
                            reconnectedLostServerActionTimeout(peerConnectKey, async () => {
                                console.log('Failover : Reconnected to ', peerConnectKey)
                                await stopMonitorQueues(cachedMonitors[peerConnectKey] || [])
                                await stopMonitors(cachedMonitors[peerConnectKey] || [])
                                await beginVideoTransmission()
                                await beginEventTransmission()
                                await beginCloudUploadRecordsTransmission()
                                await deleteMonitors(cachedMonitors[peerConnectKey] || [])
                                await deleteUsers(cachedUsers[peerConnectKey] || [])
                                await s.resetAllManagementServers()
                            })
                        }
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
                        cachedMonitors[peerConnectKey] = data.monitors
                        await saveFailoverState()
                    break;
                    case'updateCachedMonitor':
                        setMonitorInCacheIndex(peerConnectKey,data.monitor.ke,data.monitor.mid,true)
                        updateCachedMonitor(cachedMonitors[peerConnectKey], data.monitor)
                        await saveFailoverState()
                    break;
                    case'deleteCachedMonitor':
                        setMonitorInCacheIndex(peerConnectKey,data.monitor.ke,data.monitor.mid,false)
                        updateCachedMonitor(cachedMonitors[peerConnectKey], data.monitor, true)
                        await saveFailoverState()
                    break;
                    case'cacheUsers':
                        for(user of data.users){
                            disableCloudUploaders(user)
                        }
                        cachedUsers[peerConnectKey] = data.users
                        await saveFailoverState()
                    break;
                    case'cachePermissions':
                        cachedPermissions[peerConnectKey] = data.permissions
                        await saveFailoverState()
                    break;
                    case'updateCachedUser':
                        updateCachedUser(cachedUsers[peerConnectKey], data.user)
                        await saveFailoverState()
                    break;
                    case'deleteCachedUser':
                        updateCachedUser(cachedUsers[peerConnectKey], data.user, true)
                        await saveFailoverState()
                    break;
                    case'deleteMonitors':
                        deleteMonitors(data.monitors, false)
                    break;
                    case'deleteUsers':
                        deleteUsers(data.users, false)
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
                if(gracefulExitRequested[peerConnectKey]){
                    console.log('Failover : Gracefully Disconnected ', peerConnectKey)
                }else{
                    console.log('Failover : Lost Connection for ', peerConnectKey)
                }
                clearTimeout(client.killTimer)
                client.removeAllListeners()
            })
            normalServerConnections[peerConnectKey] = client
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
                if(setMonitorInCacheIndex(peerConnectKey,monitorConfig.ke,monitorConfig.mid))updateCachedMonitor(cachedMonitors[peerConnectKey], monitorConfig)
            })
        })
        s.onMonitorDelete((monitorConfig) => {
            runOnNormalServerConnections((peerConnectKey, connectionToNormal) => {
                if(setMonitorInCacheIndex(peerConnectKey,monitorConfig.ke,monitorConfig.mid))updateCachedMonitor(cachedMonitors[peerConnectKey], monitorConfig, true)
            })
        })
        s.onProcessExit(() => {
            saveFailoverState()
        });
        s.onProcessReady(() => {
            loadPendingMonitorImports()
        });
    }
}
