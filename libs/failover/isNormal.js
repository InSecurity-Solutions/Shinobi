module.exports = (s,app,config,lang) => {
    if(!config.isFailover){
        const {
            connectToFailover,
            runOnFailoverConnections,
            connectFailoverServers,
            getFailoverServers,
            addFailoverServer,
            removeFailoverServer,
        } = require('./utilsNormal.js')(s,app,config,lang)
        s.onLoadedUsersAtStartup(() => {
            connectFailoverServers()
        })
        s.onMonitorSave((monitorConfig) => {
            runOnFailoverConnections((host, connectionToFailover) => {
                updateCachedMonitor(connectionToFailover, monitorConfig)
            })
        })
        s.onMonitorDelete((monitorConfig) => {
            runOnFailoverConnections((host, connectionToFailover) => {
                updateCachedMonitor(connectionToFailover, monitorConfig, true)
            })
        })
        /**
        * API : Superuser : Get Failover Server Settings
        */
        app.get(config.webPaths.superApiPrefix+':auth/failover/list', function (req,res){
            s.superAuth(req.params,(resp) => {
                const response = getFailoverServers()
                s.closeJsonResponse(res,response)
            },res,req)
        })

        /**
        * API : Superuser : Save Failover Server Settings
        */
        app.post(config.webPaths.superApiPrefix+':auth/failover/save', function (req,res){
            s.superAuth(req.params,async (resp) => {
                const failoverServer = req.body.failoverServer;
                const peerConnectKey = req.body.peerConnectKey;
                const response = await addFailoverServer(failoverServer, peerConnectKey)
                await connectToFailover(failoverServer, peerConnectKey)
                s.closeJsonResponse(res,response)
            },res,req)
        })

        /**
        * API : Delete Failover Server Settings
        */
        app.post(config.webPaths.superApiPrefix+':auth/failover/disconnect', async function (req,res){
            s.superAuth(req.params,async (resp) => {
                const failoverServer = req.body.failoverServer;
                const peerConnectKey = req.body.peerConnectKey;
                const response = await removeFailoverServer(failoverServer, peerConnectKey)
                await disconnectFromManagmentServer(failoverServer, peerConnectKey)
                s.closeJsonResponse(res,response)
            },res,req)
        })
    }
}
