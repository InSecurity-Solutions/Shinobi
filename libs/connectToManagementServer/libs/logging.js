module.exports = (s,config,lang) => {
    if(config.saveLogsInCentral){
        function getMonitorName(logEvent){
            if(logEvent.mid === '$USER')return 'User Event'
            return s.group[logEvent.ke].rawMonitorConfigurations[logEvent.mid].name
        }
        function sendLog(options){
            s.runExtensionsForArray('onSaveLogToCentral', null, [options])
        }
        s.onSystemLog(function(insertQuery){
            sendLog({
                source: config.isFailover ? 'Failover' : 'Recorder',
                eventType: insertQuery.info.type,
                message: insertQuery.info.msg,
            })
        })
        s.onUserLog(function(logEvent, forceSave){
            if(forceSave){
                const log = logEvent.log;
                const type = log.type;
                const msg = log.msg;
                sendLog({
                    source: config.isFailover ? 'Failover' : 'Recorder',
                    eventType: `${type ? type : 'From Core Server'}: ${getMonitorName(logEvent)}`,
                    message: msg ? msg : typeof log === 'object' ? s.s(log) : log,
                })
            }
        })
    }
}
