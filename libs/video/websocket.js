module.exports = function(s,config,lang,io){
    s.onOtherWebSocketMessages(async (d,cn,tx) => {
        const authKey = cn.auth
        const groupKey = cn.ke
        const user = s.group[groupKey] && s.group[groupKey].users && s.group[groupKey].users[authKey];
        const monitorId = d.mid || d.id;
        const callbackId = d.callbackId;
        const response = { f: 'callback', callbackId, args: [true] }
        switch(d.f){
            case'getVideos':
            case'getCloudVideos':
                response.ff = 'getVideos'
                if(!user || !user.details){
                    response.msg = lang['Not Authorized'];
                    tx(response);
                    break;
                }
                var {
                    monitorPermissions,
                    monitorRestrictions,
                } = s.getMonitorsPermitted(user.details,monitorId,'video_view')
                var {
                    isRestricted,
                    userPermissions,
                    isRestrictedApiKey,
                    apiKeyPermissions,
                } = s.checkPermission(user)
                if(
                    isRestrictedApiKey && apiKeyPermissions.watch_videos_disallowed ||
                    isRestricted && (
                        monitorId && !monitorPermissions[`${monitorId}_video_view`] ||
                        monitorRestrictions.length === 0
                    )
                ){
                    //not authorized
                }else{
                    let videoParam = 'videos'
                    let videoSet = 'Videos'
                    const queryOptions = d.options
                    switch(d.f){
                        case'getCloudVideos':
                            videoParam = 'cloudVideos'
                            videoSet = 'Cloud Videos'
                        break;
                    }
                    const videosGetResponse = await s.sqlQueryBetweenTimesWithPermissionsPromise({
                        table: videoSet,
                        user: user,
                        noCount: true,
                        groupKey,
                        monitorId,
                        startTime: queryOptions.start,
                        endTime: queryOptions.end,
                        startTimeOperator: queryOptions.startOperator,
                        endTimeOperator: queryOptions.endOperator,
                        noLimit: queryOptions.noLimit,
                        limit: queryOptions.limit,
                        archived: queryOptions.archived,
                        endIsStartTo: !!queryOptions.endIsStartTo,
                        parseRowDetails: false,
                        rowName: 'videos',
                        monitorRestrictions: monitorRestrictions,
                        preliminaryValidationFailed: false
                    })
                    if(videosGetResponse && videosGetResponse.videos){
                        s.buildVideoLinks(videosGetResponse.videos,{
                            auth : authKey,
                            videoParam : videoParam,
                            hideRemote : config.hideCloudSaveUrls,
                        })
                    }
                    response.args = [videosGetResponse]
                }
                tx(response);
            break;
        }
    })
}
