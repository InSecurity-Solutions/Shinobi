module.exports = (s,app,config,lang) => {
    s.onLoadedUsersAtStartup(() => {
        if(config.userHasSubscribed){
            if(config.isFailover){
                require('./isFailover.js')(s,app,config,lang)
            }else{
                require('./isNormal.js')(s,app,config,lang)
            }
        }
    })
}
