const crypto = require('crypto');
function prettyPrint(obj){
    return JSON.stringify(obj,null,3)
}
function generateId(x) {
    if (!x) { x = 10; }
    const bytes = Math.ceil(x * 3 / 4);
    return crypto.randomBytes(bytes)
        .toString('base64')
        .replace(/[+/=]/g, '')
        .slice(0, x);
}
function parseJSON(string){
    var parsed
    try{
        parsed = JSON.parse(string)
    }catch(err){

    }
    if(!parsed)parsed = string
    return parsed
}
module.exports = {
    parseJSON,
    prettyPrint,
    generateId,
}
