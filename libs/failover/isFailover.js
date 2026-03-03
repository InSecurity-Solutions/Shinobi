const { createWebSocketServer } = require('../basic/websocketTools.js')
module.exports = (s,app,config,lang) => {
    if(config.isFailover){
        const {
            importMonitors,
            deleteMonitors,
            downloadVideosFromMonitors,
            getFailoverServerKeys,
            addFailoverServerKey,
            removeFailoverServerKey,
        } = require('./utilsFailover.js')(s,app,config,lang)
        const lostConnections = {}
        const gracefulExitRequested = {}
        const cachedMonitors = {}
        const videosTransmitting = {}
        const theWebSocket = createWebSocketServer()
        function setClientKillTimerIfNotAuthenticatedInTime(client){
            client.killTimer = setTimeout(function(){
                client.terminate()
            },10000)
        }
        function clearKillTimer(client){
            clearTimeout(client.killTimer)
        }
        theWebSocket.on('connection',(client) => {
            let peerConnectKey = ''
            // client.send(someDataToSendAsStringOrBinary)
            setClientKillTimerIfNotAuthenticatedInTime(client)
            async function beginVideoTransmission(){
                var response = []
                if(!videosTransmitting[peerConnectKey]){
                    videosTransmitting[peerConnectKey] = true
                    response = await transmitVideosFromMonitors(data.monitors, client, true)
                    videosTransmitting[peerConnectKey] = false
                }
                connectionToNormal.send({ f: 'transmitVideosFromMonitorsResponse', response })
            }
            function onAuthenticate(data){
                clearKillTimer(client)
                client.removeListener('message', onAuthenticate);
                if(Object.keys(config.failoverConnectionKeys).includes(data.key)){
                    peerConnectKey = data.key
                    client.on('message', onAuthenticatedData)
                    client.on('close', onAuthenticatedExit)
                    if(lostConnections[peerConnectKey]){
                        lostConnections[peerConnectKey] = false
                        beginVideoTransmission()
                    }
                }else{
                    client.terminate()
                }
            }
            function onAuthenticatedExit(){
                if(!gracefulExitRequested[peerConnectKey]){
                    importMonitors(cachedMonitors[peerConnectKey] || [])
                    lostConnections[peerConnectKey] = true
                }
            }
            function onAuthenticatedData(data){
                switch(data.f){
                    case'exit':
                        gracefulExitRequested[peerConnectKey] = true
                    break;
                    case'cacheMonitors':
                        cachedMonitors[peerConnectKey] = data.monitors
                    break;
                    case'importMonitors':
                        importMonitors(data.monitors)
                    break;
                    case'deleteMonitors':
                        deleteMonitors(data.monitors, false)
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
    }
}
