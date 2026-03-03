const path = require('path')
const bson = require('bson')
const { createReadStream, createWriteStream } = require('fs')
const fs = require('fs').promises
module.exports = (s,app,config,lang) => {
    function getVideoFilePath(video){
        const monitor = s.group[video.ke].rawMonitorConfigurations[video.mid]
        const videosDirectory = s.getVideoDirectory(monitor)
        const filename = s.formattedTime(video.time)
        const filePath = path.join(videosDirectory, filename)
        return filePath
    }
    return {
        getVideoFilePath,
    }
}
