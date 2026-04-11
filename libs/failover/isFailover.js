const bson = require('bson')
const { createWebSocketServer } = require('../basic/websocketTools.js')
module.exports = (s,app,config,lang) => {
    if(config.isFailover){
        const {
            importUsers,
            importMonitors,
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
        } = require('./utilsFailover.js')(s,app,config,lang)
        const lostConnections = {}
        const reconnectedLostServerActionTimeouts = {}
        const lostServerActionTimeouts = {}
        const gracefulExitRequested = {}
        const cachedMonitors = {}
        const cachedMonitorsIndex = {}
        const cachedUsers = {}
        const videosTransmitting = {}
        const eventsTransmitting = {}
        const cloudRecordsTransmitting = {}
        const normalServerConnections = {}
        const allowCloudUploads = config.failoverAllowCloudUploaders;
        const theWebSocket = createWebSocketServer()
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
                if(!gracefulExitRequested[peerConnectKey]){
                    lostServerActionTimeout(peerConnectKey, async () => {
                        console.log('Failover : Setting up lost Server configurations ', peerConnectKey)
                        await importUsers(cachedUsers[peerConnectKey] || [])
                        await importMonitors(cachedMonitors[peerConnectKey] || [])
                        lostConnections[peerConnectKey] = true
                    })
                }
            }
            async function onAuthenticatedData(message){
                const data = bson.deserialize(Buffer.from(message))
                switch(data.f){
                    case'exit':
                        console.log('Failover : Requested Graceful Exit ', peerConnectKey)
                        gracefulExitRequested[peerConnectKey] = true
                    break;
                    case'init_complete':
                        console.log('Initialized as Failover for ', peerConnectKey)
                        if(lostConnections[peerConnectKey]){
                            lostConnections[peerConnectKey] = false
                            reconnectedLostServerActionTimeout(peerConnectKey, async () => {
                                console.log('Failover : Reconnected to ', peerConnectKey)
                                await stopMonitorQueues(cachedMonitors[peerConnectKey] || [])
                                await stopMonitors(cachedMonitors[peerConnectKey] || [])
                                await beginVideoTransmission()
                                await beginEventTransmission()
                                await beginCloudUploadRecordsTransmission()
                                await deleteMonitors(cachedMonitors[peerConnectKey] || [])
                                await deleteUsers(cachedUsers[peerConnectKey] || [])
                            })
                        }
                    break;
                    case'importUsers':
                        const filteredUsers = data.users.filter(user => user.mail !== 'dummy@shinobi.dummy');
                        if(filteredUsers[0]){
                            await setTargetManagmentServerUser(filteredUsers[0].mail)
                            await importUsers(filteredUsers)
                            await s.connectAllManagementServers()
                        }
                    break;
                    case'cacheMonitors':
                        cachedMonitors[peerConnectKey] = data.monitors
                    break;
                    case'updateCachedMonitor':
                        setMonitorInCacheIndex(peerConnectKey,data.monitor.ke,data.monitor.mid,true)
                        updateCachedMonitor(cachedMonitors[peerConnectKey], data.monitor)
                    break;
                    case'deleteCachedMonitor':
                        setMonitorInCacheIndex(peerConnectKey,data.monitor.ke,data.monitor.mid,false)
                        updateCachedMonitor(cachedMonitors[peerConnectKey], data.monitor, true)
                    break;
                    case'cacheUsers':
                        for(user of data.users){
                            disableCloudUploaders(user)
                        }
                        cachedUsers[peerConnectKey] = data.users
                    break;
                    case'updateCachedUser':
                        updateCachedUser(cachedUsers[peerConnectKey], data.user)
                    break;
                    case'deleteCachedUser':
                        updateCachedUser(cachedUsers[peerConnectKey], data.user, true)
                    break;
                    case'importMonitors':
                        importMonitors(data.monitors)
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
    }
}
