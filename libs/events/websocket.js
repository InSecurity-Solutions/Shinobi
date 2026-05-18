module.exports = function(s,config,lang,io){
    s.onOtherWebSocketMessages(async (d,cn,tx) => {
        const authKey = cn.auth
        const groupKey = cn.ke
        const user = s.group[groupKey] && s.group[groupKey].users && s.group[groupKey].users[authKey];
        const monitorId = d.mid || d.id;
        const callbackId = d.callbackId;
        const response = { f: 'callback', callbackId, args: [true] }
        switch(d.f){
            case'getEvents':
                response.ff = 'getEvents'
                if(!user || !user.details){
                    response.msg = lang['Not Authorized'];
                    tx(response);
                    break;
                }
                var {
                    monitorPermissions,
                    monitorRestrictions,
                } = s.getMonitorsPermitted(user.details,monitorId)
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
                    const queryOptions = d.options
                    if(queryOptions.onlyCount === '1'){
                        const eventsGetResponse = { ok: true }
                        const { rows, err } = await s.knexQueryPromise({
                            action: "count",
                            columns: "mid",
                            table: "Events",
                            where: [
                                ['ke','=',groupKey],
                                ['time','>=',queryOptions.start],
                                ['time','<=',queryOptions.end],
                                monitorRestrictions
                            ]
                        });
                        if(err){
                            s.debugLog(err)
                            eventsGetResponse.ok = false
                        }else{
                            eventsGetResponse.count = rows[0]['count(`mid`)']
                        }
                        response.args = [eventsGetResponse]
                    }else{
                        s.sqlQueryBetweenTimesWithPermissions({
                            table: 'Events',
                            user: user,
                            groupKey,
                            monitorId,
                            startTime: queryOptions.start,
                            endTime: queryOptions.end,
                            startTimeOperator: queryOptions.startOperator,
                            endTimeOperator: queryOptions.endOperator,
                            noLimit: queryOptions.noLimit,
                            limit: queryOptions.limit,
                            archived: queryOptions.archived,
                            endIsStartTo: true,
                            parseRowDetails: true,
                            noFormat: true,
                            noCount: true,
                            rowName: 'events',
                            preliminaryValidationFailed: false
                        },(eventsGetResponse) => {
                            response.args = [eventsGetResponse]
                        })
                    }
                }
                tx(response);
            break;
        }
    })
}
