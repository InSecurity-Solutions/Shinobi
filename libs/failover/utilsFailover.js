const path = require('path')
const bson = require('bson')
const { createReadStream, createWriteStream } = require('fs')
const fs = require('fs').promises
module.exports = (s,app,config,lang) => {
    const {
        getVideoFilePath,
    } = require('./utils.js')(s,app,config,lang)
    const {
        deleteMonitor,
    } = require('../monitor/utils.js')(s,config,lang)
    const {
        parseJSON,
        stringJSON,
    } = require('../basic/utils.js')(process.cwd(),config)
    const {
        modifyConfiguration,
        getConfiguration
    } = require('../system/utils.js')(config)
    async function importMonitors(monitors){
        for(const monitor of monitors){
            const details = parseJSON(monitor.details)
            details.dir = ''
            monitor.details = stringJSON(details)
            await s.addOrEditMonitor(monitor, null, { uid: '$SYSTEM' })
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
    function uploadVideo(video, connectionToNormal){
        return new Promise((resolve) => {
            const filePath = getVideoFilePath(video);
            const response = { ok: true, filePath }
            let chunkNumber = 0
            const videoStream = createReadStream(filePath, { highWaterMark: 20 });
            videoStream
            .on('data',function(data){
                connectionToNormal.send({ f: 'insertVideoChunk', video, data, chunkNumber });
                ++chunkNumber
            })
            .on('error',function(err){
                console.error('isFailover : uploadVideo Error : createReadStream', video, err)
                response.ok = false
                response.err = err
            })
            .on('close',function(){
                connectionToNormal.send({ f: 'insertVideoComplete', video, response, filePath })
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
                }catch(err){
                    console.error('isFailover : downloadVideosFromMonitors Error', video, err)
                }
                responses.push(response)
            }
        }
        return responses
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
    return {
        importMonitors,
        deleteMonitors,
        transmitVideosFromMonitors,
        beginVideoTransmission,
        getFailoverServerKeys,
        addFailoverServerKey,
        removeFailoverServerKey,
    }
}
