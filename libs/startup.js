var fs = require('fs');
var exec = require('child_process').exec;
module.exports = function(s,config,lang,io){
    const {
        scanForOrphanedVideos
    } = require('./video/utils.js')(s,config,lang)
    const {
        checkSubscription,
        checkAgainSubscription,
    } = require('./checker/actCheck.js')(s,config)
    const {
        checkForStaticUsers
    } = require('./user/startup.js')(s,config,lang,io)
    const {
        loadCloudDiskUseForUser,
        loadAddStorageDiskUseForUser,
        loadDiskUseForUser,
    } = require('./user/utils.js')(s,config,lang)
    return new Promise((resolve, reject) => {
        var checkedAdminUsers = {}
        var loadedAccounts = []
        var foundMonitors = []
        console.log('FFmpeg version : '+s.ffmpegVersion)
        console.log('Node.js version : '+process.version)
        s.processReady = function(){
            s.timeReady = new Date()
            delete(checkedAdminUsers)
            resolve()
            s.systemLog(lang.startUpText5)
            s.onProcessReadyExtensions.forEach(function(extender){
                extender(true)
            })
            process.send('ready')
        }
        function checkForTerminalCommands(callback){
            var next = function(){
                if(callback)callback()
            }
            if(!s.isWin && s.packageJson.mainDirectory !== '.'){
                var etcPath = '/etc/shinobisystems/cctv.txt'
                fs.stat(etcPath,function(err,stat){
                    if(err || !stat){
                        exec('node '+ s.mainDirectory + '/INSTALL/terminalCommands.js',function(err){
                            if(err)console.log(err)
                        })
                    }
                    next()
                })
            }else{
                next()
            }
        }
        async function loadMonitors(callback){
            for (let i = 0; i < s.beforeMonitorsLoadedOnStartupExtensions.length; i++) {
                await s.beforeMonitorsLoadedOnStartupExtensions[i]()
            }
            s.systemLog(lang.startUpText4)
            //preliminary monitor start
            s.knexQuery({
                action: "select",
                columns: "*",
                table: "Monitors",
            },function(err,monitors) {
                foundMonitors = monitors.map(item => {
                    item.details = JSON.parse(item.details)
                    return item
                })
                if(err){s.systemLog('Startup Error', err.toString())}
                if(monitors && monitors[0]){
                    var didNotLoad = 0
                    var loadCompleted = 0
                    var orphanedVideosForMonitors = {}
                    var loadMonitor = function(monitor){
                        const checkAnother = function(){
                            ++loadCompleted
                            if(loadCompleted <= s.cameraCount && monitors[loadCompleted]){
                                loadMonitor(monitors[loadCompleted])
                            }else{
                                if(didNotLoad > 0)console.log(`${didNotLoad} Monitor${didNotLoad === 1 ? '' : 's'} not loaded because Admin user does not exist for them. It may have been deleted.`);
                                callback()
                            }
                        }
                        if(checkedAdminUsers[monitor.ke]){
                            setTimeout(async function(){
                                if(!orphanedVideosForMonitors[monitor.ke])orphanedVideosForMonitors[monitor.ke] = {}
                                if(!orphanedVideosForMonitors[monitor.ke][monitor.mid])orphanedVideosForMonitors[monitor.ke][monitor.mid] = 0
                                s.initiateMonitorObject(monitor)
                                s.group[monitor.ke].rawMonitorConfigurations[monitor.mid] = monitor
                                s.sendMonitorStatus({
                                    id: monitor.mid,
                                    ke: monitor.ke,
                                    status: 'Stopped',
                                    code: 5
                                });
                                const monObj = Object.assign({},monitor,{id : monitor.mid})
                                await s.camera('stop',monObj);
                                if(!config.safeMode)await s.camera(monitor.mode,monObj);
                                checkAnother()
                            },1000)
                        }else{
                            ++didNotLoad
                            checkAnother()
                        }
                    }
                    loadMonitor(monitors[loadCompleted])
                }else{
                    callback()
                }
            })
        }
        async function checkForOrphanedVideos(callback){
            var monitors = foundMonitors
            if(monitors && monitors[0]){
                var loadCompleted = 0
                var orphanedVideosForMonitors = {}
                var checkForOrphanedVideosForMonitor = async function(monitor){
                    if(!orphanedVideosForMonitors[monitor.ke])orphanedVideosForMonitors[monitor.ke] = {}
                    if(!orphanedVideosForMonitors[monitor.ke][monitor.mid])orphanedVideosForMonitors[monitor.ke][monitor.mid] = 0
                    try{
                        await fs.promises.mkdir(s.getStreamsDirectory(monitor), { recursive: true })
                    }catch(err){
                        s.debugLog(err)
                    }
                    const { orphanedFilesCount } = await scanForOrphanedVideos(monitor,{forceCheck: true})
                    if(orphanedFilesCount){
                        orphanedVideosForMonitors[monitor.ke][monitor.mid] += orphanedFilesCount
                    }
                    if(orphanedVideosForMonitors[monitor.ke][monitor.mid] == 0)delete(orphanedVideosForMonitors[monitor.ke][monitor.mid]);
                    ++loadCompleted
                    if(monitors[loadCompleted]){
                        await checkForOrphanedVideosForMonitor(monitors[loadCompleted])
                    }else{
                        s.systemLog(lang.startUpText6, s.s(orphanedVideosForMonitors))
                        delete(foundMonitors)
                        callback()
                    }
                }
                await checkForOrphanedVideosForMonitor(monitors[loadCompleted])
            }else{
                callback()
            }
        }
        function loadAdminUsers(callback){
            //get current disk used for each isolated account (admin user) on startup
            s.knexQuery({
                action: "select",
                columns: "*",
                table: "Users",
                where: [
                    ['details','NOT LIKE','%"sub"%']
                ]
            }, async function(err,users) {
                if(users && users[0]){
                    users.forEach(function(user){
                        checkedAdminUsers[user.ke] = user
                    })
                    var loadLocalDiskUse = function(callback){
                        var count = users.length
                        var countFinished = 0
                        users.forEach(function(user){
                            s.loadGroup(user)
                            s.loadGroupApps(user)
                            loadedAccounts.push(user.ke)
                            loadDiskUseForUser(user,function(){
                                ++countFinished
                                if(countFinished === count){
                                    callback()
                                }
                            })
                        })
                    }
                    var loadCloudDiskUse = function(callback){
                        var count = users.length
                        var countFinished = 0
                        users.forEach(function(user){
                            loadCloudDiskUseForUser(user,function(){
                                ++countFinished
                                if(countFinished === count){
                                    callback()
                                }
                            })
                        })
                    }
                    loadLocalDiskUse(function(){
                        loadCloudDiskUse(function(){
                            callback()
                        })
                    })
                }else{
                    await s.runExtensionsForArrayAwaited('onLoadedUsersAtStartup', null, [])
                    s.processReady()
                }
            })
        }
        //check disk space every 20 minutes
        if(config.autoDropCache===true){
            setInterval(function(){
                exec('echo 3 > /proc/sys/vm/drop_caches',{detached: true})
            },60000*20)
        }
        if(config.childNodes.mode !== 'child'){
            //master node - startup functions
            //hourly check to see if sizePurge has failed to unlock
            //checks to see if request count is the number of monitors + 10
            s.checkForStalePurgeLocks()
            //run prerequsite queries, load users and monitors
            //sql/database connection with knex
            s.databaseEngine = require('knex')(s.databaseOptions)
            //run prerequsite queries
            s.preQueries().then(() => {
                setTimeout(async () => {
                    await checkForStaticUsers()
                    //check for subscription
                    checkSubscription(config.subscriptionId || config.peerConnectKey || config.p2pApiKey, function(){
                        //check terminal commander
                        checkForTerminalCommands(function(){
                            //load administrators (groups)
                            loadAdminUsers(async function(){
                                await s.runExtensionsForArrayAwaited('onLoadedUsersAtStartup', null, [])
                                //load monitors (for groups)
                                loadMonitors(function(){
                                    //check for orphaned videos
                                    checkForOrphanedVideos(() => {
                                        s.processReady()
                                    })
                                })
                            })
                        })
                    })
                },1500);
                s.subscriptionIntervalCheck = checkAgainSubscription();
            })
        }
    })
}
