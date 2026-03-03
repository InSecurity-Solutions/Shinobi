module.exports = (s,app,config,lang) => {
    if(config.userHasSubscribed){
        if(config.isFailover){
            require('./isFailover.js')(s,app,config,lang)
        }else{
            require('./isNormal.js')(s,app,config,lang)
        }
    }
}
