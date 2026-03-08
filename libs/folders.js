var fs = require('fs');
module.exports = function(s,config,lang){
    //directories
    function isValidPath(givenPath){
        if(!givenPath)return false;
        return /^(\/?[a-z0-9A-Z\-_. ]+)*\/?$/.test(givenPath.replace('__DIR__',s.mainDirectory))
    }
    s.group = {}
    const defaultWindowsTempPath = 'C:/Windows/Temp';
    const defaultVideosPath = s.mainDirectory+'/videos/';
    const defaultFileBinPath = s.mainDirectory+'/fileBin/';
    if(!config.windowsTempDir&&s.isWin===true){config.windowsTempDir=defaultWindowsTempPath}
    if(!config.defaultMjpeg){config.defaultMjpeg=s.mainDirectory+'/web/libs/img/bg.jpg'}
    //default stream folder check
    if(!config.streamDir || !isValidPath(config.streamDir)){
        if(s.isWin === false){
            config.streamDir = '/dev/shm'
        }else{
            config.streamDir = config.windowsTempDir
        }
        if(!fs.existsSync(config.streamDir)){
            if(fs.existsSync('/dev/shm')){
                config.streamDir = '/dev/shm/streams/'
            }else{
                config.streamDir = s.mainDirectory+'/streams/'
            }
        }else{
            config.streamDir += '/streams/'
        }
    }
    if(!config.videosDir || !isValidPath(config.videosDir)){config.videosDir = defaultVideosPath}
    if(!config.binDir || !isValidPath(config.binDir)){config.binDir = defaultFileBinPath}
    if(!config.addStorage || !(config.addStorage instanceof Array)){config.addStorage = []}
    const addStorage = config.addStorage.filter(item => isValidPath(item.path))
    s.dir = {
        videos: s.checkCorrectPathEnding(config.videosDir),
        streams: s.checkCorrectPathEnding(config.streamDir),
        fileBin: s.checkCorrectPathEnding(config.binDir),
        addStorage,
        languages: s.location.languages+'/'
    };
    //streams dir
    if(!fs.existsSync(s.dir.streams)){
        fs.mkdirSync(s.dir.streams);
    }
    //videos dir
    if(!fs.existsSync(s.dir.videos)){
        fs.mkdirSync(s.dir.videos);
    }
    //fileBin dir
    if(!fs.existsSync(s.dir.fileBin)){
        fs.mkdirSync(s.dir.fileBin);
    }
    //additional storage areas
    s.listOfStorage = [{
        name: lang['Default'],
        value: ""
    }]
    s.dir.addStorage.forEach(function(v,n){
        v.path = s.checkCorrectPathEnding(v.path)
        if(!fs.existsSync(v.path)){
            fs.mkdirSync(v.path);
        }
        s.listOfStorage.push({
            name: v.name,
            value: v.path
        })
    })
    //get audio files list
    s.listOfAudioFiles = [
        {
            name:lang['No Sound'],
            value:""
        }
    ]
    fs.readdirSync(s.mainDirectory + '/web/libs/audio').forEach(function(file){
        s.listOfAudioFiles.push({
            name: file,
            value: file
        })
    })
    //get themes list
    s.listOfThemes = [
        {
            name:lang['Default'],
            value:""
        }
    ]
    fs.readdirSync(s.mainDirectory + '/web/libs/themes').forEach(function(folder){
        s.listOfThemes.push({
            name: folder,
            value: folder
        })
    })
}
