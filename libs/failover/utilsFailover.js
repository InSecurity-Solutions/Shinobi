const path = require('path')
const bson = require('bson')
const fs = require('fs').promises
const { createReadStream, createWriteStream } = require('fs')
module.exports = async (s,app,config,lang) => {
    const {
        getVideoFilePath,
    } = require('./utils.js')(s,app,config,lang)
    const {
        deleteMonitor,
    } = require('../monitor/utils.js')(s,config,lang)
    const {
        legacyCreateAdminUser,
        legacyEditAdminUser,
        legacyDeleteUser,
    } = require('../user/utils.js')(s,config,lang)
    const {
        parseJSON,
        stringJSON,
    } = require('../basic/utils.js')(process.cwd(),config)
    const {
        modifyConfiguration,
        getConfiguration
    } = require('../system/utils.js')(config)
    const failoverStateFilePath = path.join(process.cwd(),'failoverState.json')
    const failoverStateCachedMonitorsFilePath = path.join(process.cwd(),'failoverStateMonitors.json')
    const reconnectedLostServerActionTimeouts = {}
    const lostServerActionTimeouts = {}
    const videosTransmitting = {}
    const eventsTransmitting = {}
    const cloudRecordsTransmitting = {}
    const normalServerConnections = {}
    const allowCloudUploads = config.failoverAllowCloudUploaders;
    async function loadFailoverState(){
        const data = await loadCurrentState()
        const monitorsCache = await loadMonitorsCache()
        if(data.lostServerActionTimeoutsIndex.length > 0){
            for(indexItem of data.lostServerActionTimeoutsIndex){
                setLostServerActionTimeout(indexItem)
            }
        }
        return { ...data, ...monitorsCache }
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
    async function saveFailoverState(saveMonitors = false, saveState = true){
        if(saveState){
            saveCurrentState({
                time: new Date(),
                cachedUsers,
                cachedPermissions,
                lostConnections,
                gracefulExitRequested,
                skipImport,
                lostServerActionTimeoutsIndex: Object.keys(lostServerActionTimeouts)
            })
        }
        if(saveMonitors){
            saveMonitorsCache({
                cachedMonitors,
                cachedMonitorsIndex,
            })
        }
    }
    function sendMessage(client, data){
        try{
            client.send(bson.serialize(data))
            return true
        }catch(err){
            console.log('Failover : Failure to sendMessage', data, err)
            return false
        }
    }
    async function importMonitors(peerConnectKey){
        const monitors = cachedMonitors[peerConnectKey]
        for(const monitor of monitors){
            const details = parseJSON(monitor.details)
            details.dir = ''
            monitor.details = stringJSON(details)
            const monitorIdentifier = `${monitor.ke}${monitor.mid}`;
            if(!skipImport[peerConnectKey])skipImport[peerConnectKey] = {}
            if(lostConnections[peerConnectKey] && !skipImport[peerConnectKey][monitorIdentifier]){
                skipImport[peerConnectKey][monitorIdentifier] = true
                await s.addOrEditMonitor(monitor, null, { uid: '$SYSTEM' })
                await saveFailoverState(true, false)
            }
        }
    }
    async function deleteMonitors(peerConnectKey, deleteFiles){
        const monitors = cachedMonitors[peerConnectKey]
        for(const monitor of monitors){
            const { mid: monitorId, ke: groupKey } = monitor;
            await deleteMonitor({
                ke: groupKey,
                mid: monitorId,
                user: '$SYSTEM',
                deleteFiles,
            })
        }
    }
    async function stopMonitorQueues(peerConnectKey){
        const monitors = cachedMonitors[peerConnectKey]
        const groupKeys = [...new Set(Object.values(monitors).map(monitor => monitor.ke))]
        for(const groupKey of groupKeys){
            try{
                s.group[groupKey].startMonitorInQueue.kill()
            }catch(err){
                console.log(err)
            }
        }
    }
    function stopMonitors(peerConnectKey, deleteFiles){
        const monitors = cachedMonitors[peerConnectKey]
        return new Promise(function(resolve){
            let finished = 0
            let numberOf = monitors.length
            for(const monitor of monitors){
                s.camera('stop',monitor).then(() => {
                    ++finished
                    if(finished === numberOf){
                        resolve()
                    }
                })
            }
        })
    }
    async function importUsers(users){
        for(user of users){
            await legacyCreateAdminUser(user, 'ke', false)
        }
    }
    async function deleteUsers(peerConnectKey, deleteFiles){
        const users = cachedUsers[peerConnectKey]
        for(const user of users){
            await legacyDeleteUser({
                account: user,
                deleteSubAccounts: true,
                deleteMonitors: false,
                stopMonitors: false,
                deleteVideos: false,
                deleteEvents: false,
                systemAction: true,
            })
        }
    }
    async function importPermissions(permissions){
        for(permission of permissions){
            const { rows } = await s.knexQueryPromise({
                action: "select",
                table: "Permission Sets",
                where: {
                    ke: permission.ke,
                    name: permission.name,
                },
                limit: 1,
            });
            if(!rows[0])await s.knexQueryPromise({
                action: "insert",
                table: "Permission Sets",
                insert: permission
            });
        }
    }
    async function deletePermissions(permissions){
        for(const permission of permissions){
            await s.knexQueryPromise({
                action: "delete",
                table: "Permission Sets",
                where: {
                    ke: permission.ke,
                    name: permission.name,
                }
            });
        }
    }
    function uploadVideo(video, connectionToNormal, monitor){
        return new Promise((resolve) => {
            const filePath = getVideoFilePath(video);
            const response = { ok: true, filePath }
            const monitorInfo = {
                mid: video.mid,
                ke: video.ke,
                details: {
                    dir: parseJSON(monitor.details).dir
                }
            }
            let chunkNumber = 0
            const videoStream = createReadStream(filePath, { highWaterMark: 20 });
            videoStream
            .on('data',function(data){
                const ok = sendMessage(connectionToNormal,{ f: 'insertVideoChunk', video, data, monitorInfo, chunkNumber });
                if(!ok){
                    response.ok = false
                    response.err = 'Lost Connection'
                    try{ videoStream.destroy() }catch(err){ }
                }
                ++chunkNumber
            })
            .on('error',function(err){
                console.error('isFailover : uploadVideo Error : createReadStream', video, err)
                response.ok = false
                response.err = err
            })
            .on('close',function(){
                sendMessage(connectionToNormal,{ f: 'insertVideoComplete', video, response, filePath })
                resolve(response)
            })
        })
    }
    async function deleteVideo(video){
        const { mid: monitorId, ke: groupKey } = video;
        const filename = s.formattedTime(video.time)
        return await s.deleteVideo({
            filename : filename,
            ke : groupKey,
            id : monitorId
        })
    }
    async function transmitVideosFromMonitors(peerConnectKey, deleteAfterUpload){
        const monitors = cachedMonitors[peerConnectKey]
        const connectionToNormal = normalServerConnections[peerConnectKey]
        const responses = []
        for(const monitor of monitors){
            const { mid: monitorId, ke: groupKey } = monitor;
            const { rows: videos } = await s.knexQueryPromise({
                action: "select",
                columns: "*",
                table: "Videos",
                where: {
                    ke: groupKey,
                    mid: monitorId,
                }
            });
            for(const video of videos){
                try{
                    const response = await uploadVideo(video, connectionToNormal, monitor);
                    if(deleteAfterUpload && response.ok){
                        await deleteVideo(video)
                    }
                    responses.push(response)
                }catch(err){
                    console.error('isFailover : downloadVideosFromMonitors Error', video, err)
                }
            }
        }
        return responses
    }
    async function transmitEventsFromMonitors(peerConnectKey, deleteAfterUpload){
        const monitors = cachedMonitors[peerConnectKey]
        const connectionToNormal = normalServerConnections[peerConnectKey]
        const response = { ok: true }
        for(const monitor of monitors){
            const { mid: monitorId, ke: groupKey } = monitor;
            const { rows: events } = await s.knexQueryPromise({
                action: "select",
                columns: "*",
                table: "Events",
                where: {
                    ke: groupKey,
                    mid: monitorId,
                }
            });
            if(deleteAfterUpload){
                await s.knexQueryPromise({
                    action: "delete",
                    table: "Events",
                    where: {
                        ke: groupKey,
                        mid: monitorId,
                    }
                });
            }
            sendMessage(connectionToNormal,{ f: 'insertEvents', events })
        }
        return response
    }
    async function transmitCloudUploadRecordsFromMonitors(peerConnectKey, deleteAfterUpload){
        const monitors = cachedMonitors[peerConnectKey]
        const connectionToNormal = normalServerConnections[peerConnectKey]
        const response = { ok: true }
        for(const monitor of monitors){
            const { mid: monitorId, ke: groupKey } = monitor;
            const { rows: videos } = await s.knexQueryPromise({
                action: "select",
                columns: "*",
                table: "Cloud Videos",
                where: {
                    ke: groupKey,
                    mid: monitorId,
                }
            });
            if(deleteAfterUpload){
                await s.knexQueryPromise({
                    action: "delete",
                    table: "Cloud Videos",
                    where: {
                        ke: groupKey,
                        mid: monitorId,
                    }
                });
            }
            sendMessage(connectionToNormal,{ f: 'insertCloudVideos', videos })
        }
        return response
    }
    function getFailoverServerKeys(){
        const response = { ok: true }
        response.failoverConnectionKeys = config.failoverConnectionKeys || {};
        return response
    }
    async function addFailoverServerKey(connectionKey, details = {}){
        const response = { ok: true }
        const currentConfig = await getConfiguration();
        if(!currentConfig.failoverConnectionKeys)currentConfig.failoverConnectionKeys = {};
        currentConfig.failoverConnectionKeys[connectionKey] = details;
        config = Object.assign(config, { failoverConnectionKeys: currentConfig.failoverConnectionKeys })
        const configError = await modifyConfiguration(currentConfig)
        if(configError){
            response.ok = false;
            response.err = configError
            s.systemLog(configError)
        }
        return response
    }
    async function setTargetManagmentServerUser(userMail){
        const response = { ok: true }
        const currentConfig = await getConfiguration();
        currentConfig.mgmtTargetUser = userMail
        config = Object.assign(config, { mgmtTargetUser: userMail })
        const configError = await modifyConfiguration(currentConfig)
        if(configError){
            response.ok = false;
            response.err = configError
            s.systemLog(configError)
        }
        return response
    }
    async function removeFailoverServerKey(connectionKey){
        const response = { ok: true }
        const currentConfig = await getConfiguration();
        if(!currentConfig.failoverConnectionKeys)currentConfig.failoverConnectionKeys = {};
        const currentPeerConnectKey = currentConfig.failoverConnectionKeys[connectionKey];
        delete(currentConfig.failoverConnectionKeys[connectionKey])
        config = Object.assign(config, { failoverConnectionKeys: currentConfig.failoverConnectionKeys })
        const configError = await modifyConfiguration(currentConfig)
        if(configError){
            response.ok = false;
            response.err = configError
            s.systemLog(configError)
        }
        return response
    }
    function updateCachedMonitor(peerConnectKey, monitor, deleteMonitor){
        const monitors = cachedMonitors[peerConnectKey]
        const { ke: groupKey, mid: monitorId } = monitor;
        const monitorCacheIndex = monitors.findIndex(row => row.ke === groupKey && row.mid === monitorId)
        if(deleteMonitor){
            monitors.splice(monitorCacheIndex, 1)
        }else{
            monitors[monitorCacheIndex] = monitor
        }
    }
    function updateCachedUser(peerConnectKey, user, deleteUser){
        const users = cachedUsers[peerConnectKey]
        const { ke: groupKey, uid: userId } = user;
        const userCacheIndex = users.findIndex(row => row.ke === groupKey && row.mid === userId)
        if(deleteUser){
            users.splice(userCacheIndex, 1)
        }else{
            disableCloudUploaders(user)
            users[userCacheIndex] = user
        }
    }
    function disableCloudUploaders(user){
        if(!config.failoverAllowCloudUploaders){
            const uploaders = s.definitions["Account Settings"].blocks["Uploaders"].info;
            for(uploader of uploaders){
                const uploaderEnabledToggleName = uploader.info.find(item => item.name.endsWith('_save')).name.replace('detail=','')
                user.details[uploaderEnabledToggleName] = '0'
            }
        }
    }
    async function saveCurrentState(data){
        await fs.writeFile(failoverStateFilePath, JSON.stringify(data))
    }
    async function saveMonitorsCache(data){
        await fs.writeFile(failoverStateCachedMonitorsFilePath, JSON.stringify(data))
    }
    async function loadCurrentState(){
        const defaultObject = {
            lostServerActionTimeoutsIndex: []
        }
        try{
            return JSON.parse(await fs.readFile(failoverStateFilePath, 'utf8')) || defaultObject
        }catch(err){
            return defaultObject
        }
    }
    async function loadMonitorsCache(){
        const defaultObject = {}
        try{
            return JSON.parse(await fs.readFile(failoverStateCachedMonitorsFilePath, 'utf8')) || defaultObject
        }catch(err){
            return defaultObject
        }
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
    function setNormalServerConnection(peerConnectKey, client){
        if(!client){
            delete(normalServerConnections[peerConnectKey])
        }else{
            normalServerConnections[peerConnectKey] = client
        }
    }
    function getNormalServerConnection(peerConnectKey){
        return normalServerConnections[peerConnectKey]
    }
    function getNormalServerConnections(){
        return normalServerConnections
    }
    async function loadPendingMonitorImports(){
        for(peerConnectKey in lostConnections){
            if(lostConnections[peerConnectKey]){
                await importMonitors(peerConnectKey)
            }
        }
    }
    function runOnNormalServerConnections(callback){
        for(peerConnectKey in normalServerConnections){
            const serverConnection = normalServerConnections[peerConnectKey]
            callback(peerConnectKey, serverConnection)
        }
    }
    function reconnectedLostServerActionTimeout(peerConnectKey,callback){
        if(lostConnections[peerConnectKey]){
            lostConnections[peerConnectKey] = false
            clearTimeout(reconnectedLostServerActionTimeouts[peerConnectKey])
            reconnectedLostServerActionTimeouts[peerConnectKey] = setTimeout(function(){
                callback()
            },10000)
        }
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
                await importMonitors(peerConnectKey)
                await saveFailoverState()
            }
        })
    }
    function deleteLostServerActionTimeout(peerConnectKey){
        clearTimeout(lostServerActionTimeouts[peerConnectKey])
        delete(lostServerActionTimeouts[peerConnectKey])
    }
    function clearSkipImport(peerConnectKey){
        skipImport[peerConnectKey] = {}
    }
    async function beginVideoTransmission(peerConnectKey){
        var response = []
        if(!videosTransmitting[peerConnectKey]){
            videosTransmitting[peerConnectKey] = true
            response = await transmitVideosFromMonitors(peerConnectKey, true)
            videosTransmitting[peerConnectKey] = false
        }
        sendMessage(normalServerConnections[peerConnectKey], { f: 'transmitVideosFromMonitorsResponse', response })
    }
    async function beginEventTransmission(peerConnectKey){
        var response = { ok: true }
        if(!eventsTransmitting[peerConnectKey]){
            eventsTransmitting[peerConnectKey] = true
            await transmitEventsFromMonitors(peerConnectKey, true)
            eventsTransmitting[peerConnectKey] = false
        }
        sendMessage(normalServerConnections[peerConnectKey], { f: 'transmitEventsFromMonitorsResponse', response })
    }
    async function beginCloudUploadRecordsTransmission(peerConnectKey){
        var response = { ok: true }
        if(allowCloudUploads && !cloudRecordsTransmitting[peerConnectKey]){
            cloudRecordsTransmitting[peerConnectKey] = true
            await transmitCloudUploadRecordsFromMonitors(peerConnectKey, true)
            cloudRecordsTransmitting[peerConnectKey] = false
        }
        sendMessage(normalServerConnections[peerConnectKey], { f: 'transmitCloudUploadRecordsFromMonitorsResponse', response })
    }
    function setMonitorCache(peerConnectKey, monitors){
        cachedMonitors[peerConnectKey] = monitors
    }
    function setUserCache(peerConnectKey, monitors){
        cachedUsers[peerConnectKey] = monitors
    }
    function setPermissionCache(peerConnectKey, monitors){
        cachedPermissions[peerConnectKey] = monitors
    }
    function setGracefulExitRequest(peerConnectKey, theBoolean){
        gracefulExitRequested[peerConnectKey] = theBoolean
    }
    function getGracefulExitRequest(peerConnectKey, theBoolean){
        return gracefulExitRequested[peerConnectKey]
    }
    return {
        importUsers,
        importPermissions,
        deleteUsers,
        deletePermissions,
        importMonitors,
        stopMonitors,
        stopMonitorQueues,
        deleteMonitors,
        updateCachedMonitor,
        updateCachedUser,
        transmitVideosFromMonitors,
        transmitEventsFromMonitors,
        transmitCloudUploadRecordsFromMonitors,
        getFailoverServerKeys,
        addFailoverServerKey,
        removeFailoverServerKey,
        disableCloudUploaders,
        sendMessage,
        setTargetManagmentServerUser,
        saveCurrentState,
        loadCurrentState,
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
        saveFailoverState,
    }
}
