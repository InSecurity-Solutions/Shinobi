const path = require('path')
const bson = require('bson')
const fs = require('fs').promises
const { createReadStream, createWriteStream } = require('fs')
module.exports = (s,app,config,lang) => {
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
    function sendMessage(client, data){
        try{
            client.send(bson.serialize(data))
            return true
        }catch(err){
            console.log('Failover : Failure to sendMessage', data, err)
            return false
        }
    }
    async function importMonitors(monitors, peerConnectKey, lostConnections, skipImport, saveFailoverState){
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
    async function deleteMonitors(monitors, deleteFiles){
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
    async function stopMonitorQueues(monitors){
        const groupKeys = [...new Set(Object.values(monitors).map(monitor => monitor.ke))]
        for(const groupKey of groupKeys){
            try{
                s.group[groupKey].startMonitorInQueue.kill()
            }catch(err){
                console.log(err)
            }
        }
    }
    function stopMonitors(monitors, deleteFiles){
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
    async function deleteUsers(users, deleteFiles){
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
    function uploadVideo(video, connectionToNormal){
        return new Promise((resolve) => {
            const filePath = getVideoFilePath(video);
            const response = { ok: true, filePath }
            let chunkNumber = 0
            const videoStream = createReadStream(filePath, { highWaterMark: 20 });
            videoStream
            .on('data',function(data){
                const ok = sendMessage(connectionToNormal,{ f: 'insertVideoChunk', video, data, chunkNumber });
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
    async function transmitVideosFromMonitors(monitors, connectionToNormal, deleteAfterUpload){
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
                    const response = await uploadVideo(video);
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
    async function transmitEventsFromMonitors(monitors, connectionToNormal, deleteAfterUpload){
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
    async function transmitCloudUploadRecordsFromMonitors(monitors, connectionToNormal, deleteAfterUpload){
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
    function updateCachedMonitor(cachedMonitors, monitor, deleteMonitor){
        const { ke: groupKey, mid: monitorId } = monitor;
        const monitorCacheIndex = cachedMonitors.findIndex(row => row.ke === groupKey && row.mid === monitorId)
        if(deleteMonitor){
            cachedMonitors.splice(monitorCacheIndex, 1)
        }else{
            cachedMonitors[monitorCacheIndex] = monitor
        }
    }
    function updateCachedUser(cachedUsers, user, deleteUser){
        const { ke: groupKey, uid: userId } = user;
        const userCacheIndex = cachedUsers.findIndex(row => row.ke === groupKey && row.mid === userId)
        if(deleteUser){
            cachedUsers.splice(userCacheIndex, 1)
        }else{
            disableCloudUploaders(user)
            cachedUsers[userCacheIndex] = user
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
    }
}
