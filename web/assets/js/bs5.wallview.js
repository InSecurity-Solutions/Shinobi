var loadedMonitors = {}
var selectedMonitors = {}
PNotify.prototype.options.styling = "fontawesome";
var wallViewMonitorList = $('#wallview-monitorList')
var wallViewControls = $('#wallview-controls')
var wallViewCanvas = $('#wallview-canvas')
var wallViewInfoScreen = $('#wallview-info-screen')
var theWindow = $(window);
var lastWindowWidth = theWindow.width()
var lastWindowHeight = theWindow.height()
var loadedLiveGrids = {}
var liveGridElements = {}
var liveGridPlayingNow = {}
var websocketPath = checkCorrectPathEnding(urlPrefix.replace(location.origin, '')) + 'socket.io'
function featureIsActivated(showNotice){
    if(userHasSubscribed){
        return true
    }else{
        if(showNotice){
            new PNotify({
                title: lang.activationRequired,
                text: lang.featureRequiresActivationText,
                type: 'warning'
            })
        }
        return false
    }
}
function createWallViewWindow(windowName){
    var el = $(document)
    var width = el.width()
    var height = el.height()
    window.open(getApiPrefix() + '/wallview/' + groupKey + (windowName ? '?window=' + windowName : ''), 'wallview_'+windowName, 'height='+height+',width='+width)
}
function getApiPrefix(innerPart){
    return `${urlPrefix}${authKey}${innerPart ? `/${innerPart}/${groupKey}` : ''}`
}
function getWindowName(){
    const urlParams = new URLSearchParams(window.location.search);
    const theWindowChoice = urlParams.get('window');
    return theWindowChoice || '1'
}
function drawMonitorList(){
    return new Promise((resolve) => {
        $.get(getApiPrefix('monitor'),function(monitors){
            $.each(monitors, function(n,monitor){
                if(monitor.mode !== 'stop' && monitor.mode !== 'idle'){
                    loadedMonitors[monitor.mid] = monitor;
                }
            })
            var tags = getListOfTagsFromMonitors()
            var monitorsOrdered = Object.values(loadedMonitors).sort((a, b) => a.name.localeCompare(b.name));
            var allFound = [
                {
                    attributes: `tag=""`,
                    class: `cursor-pointer wallview-open-monitor-group`,
                    color: 'forestgreen',
                    label: lang['All Monitors'],
                }
            ]
            $.each(tags,function(tag,monitors){
                allFound.push({
                    attributes: `tag="${tag}"`,
                    class: `cursor-pointer wallview-open-monitor-group`,
                    color: 'blue',
                    label: tag,
                })
            })
            $.each(monitorsOrdered,function(monitorKey,monitor){
                var monitorId = monitor.mid
                var label = monitor.name
                allFound.push({
                    attributes: `select-monitor="${monitorId}"`,
                    class: `cursor-pointer`,
                    color: 'grey',
                    label,
                })
            })
            var html = allFound.map(item => `<div class="mb-1"><a class="btn d-block btn-primary btn-sm ${item.class}" ${item.attributes} href="#">${item.label}</a></div>`).join('')
            wallViewMonitorList.html(html)
            resolve(monitors)
        })
    })
}
function getMonitorListItem(monitorId){
    return wallViewMonitorList.find(`[select-monitor="${monitorId}"]`)
}
function buildStreamElementHtml(streamType){
    var html = ''
    switch(streamType){
        case'hls':case'flv':case'mp4':
            html = `<video class="stream-element" playsinline autoplay muted></video>`;
        break;
        case'mjpeg':
            html = '<iframe class="stream-element"></iframe>';
        break;
        case'jpeg':
            html = '<img class="stream-element">';
        break;
        default://base64//h265
            html = '<canvas class="stream-element"></canvas>';
        break;
    }
    return html
}
function attachVideoElementErrorHandler(monitorId){
    try{
        var monitor = loadedMonitors[monitorId]
        var monitorDetails = monitor.details
        var subStreamChannel = monitor.subStreamChannel
        var streamType = subStreamChannel ? monitorDetails.substream ? monitorDetails.substream.output.stream_type : 'hls' : monitorDetails.stream_type
        if(
            streamType === 'flv' ||
            streamType === 'hls'
        ){
            var streamBlock = liveGridElements[monitorId].streamElement
            streamBlock[0].onerror = function(){
                // setTimeout(function(){
                //     mainSocket.f({f:'monitor',ff:'watch_on',id:monitorId})
                // },2000)
            }
        }
    }catch(err){
        console.error(`Failed to Set Error Handler for Video Element`,err)
    }
}
function initiateLiveGridPlayer(monitor,subStreamChannel){
    var monitorId = monitor.mid
    var details = monitor.details
    var groupKey = monitor.ke
    var monitorId = monitor.mid
    var livePlayerBlocks = liveGridElements[monitorId]
    var monitorItem = livePlayerBlocks.monitorItem
    var loadedMonitor = loadedMonitors[monitorId]
    var loadedPlayer = loadedLiveGrids[monitorId]
    var containerElement = $(`#monitor_live_${monitor.mid}`)
    console.log(`#monitor_live_${monitor.mid}`, containerElement)
    var streamType = subStreamChannel ? details.substream ? details.substream.output.stream_type : 'hls' : details.stream_type
    liveGridPlayingNow[monitorId] = true
    switch(streamType){
        case'jpeg':
            startJpegStream(monitorId)
        break;
        case'b64':
            if(loadedPlayer.Base64 && loadedPlayer.Base64.connected){
                loadedPlayer.Base64.disconnect()
            }
            loadedPlayer.Base64 = io(location.origin,{ path: websocketPath, query: websocketQuery, transports: ['websocket'], forceNew: false})
            var ws = loadedPlayer.Base64
            var buffer
            ws.on('diconnect',function(){
                console.log('Base64 Stream Disconnected')
            })
            ws.on('connect',function(){
                ws.emit('Base64',{
                    auth: $user.auth_token,
                    uid: $user.uid,
                    ke: monitor.ke,
                    id: monitor.mid,
                    channel: subStreamChannel
                })
                if(!loadedPlayer.ctx || loadedPlayer.ctx.length === 0){
                    loadedPlayer.ctx = containerElement.find('canvas');
                }
                var ctx = loadedPlayer.ctx[0]
                var ctx2d = ctx.getContext("2d")
                loadedPlayer.image = new Image()
                var image = loadedPlayer.image
                image.onload = function() {
                    loadedPlayer.imageLoading = false
                    var x = 0
                    var y = 0
                    ctx.getContext("2d").drawImage(image,x,y,ctx.width,ctx.height)
                    URL.revokeObjectURL(loadedPlayer.imageUrl)
                }
                ws.on('data',function(imageData){
                    try{
                        if(loadedPlayer.imageLoading === true)return console.log('drop');
                        loadedPlayer.imageLoading = true
                        var arrayBufferView = new Uint8Array(imageData);
                        var blob = new Blob( [ arrayBufferView ], { type: "image/jpeg" } );
                        loadedPlayer.imageUrl = URL.createObjectURL( blob );
                        loadedPlayer.image.src = loadedPlayer.imageUrl
                        loadedPlayer.last_frame = 'data:image/jpeg;base64,'+base64ArrayBuffer(imageData)
                    }catch(er){
                        debugLog('base64 frame')
                    }
                    // $.ccio.init('signal',d);
                })
            })
        break;
        case'mp4':
            var stream = containerElement.find('.stream-element');
            var onPoseidonError = function(){
                // setTimeout(function(){
                //     mainSocket.f({f:'monitor',ff:'watch_on',id:monitorId})
                // },2000)
            }
            if(!loadedPlayer.PoseidonErrorCount)loadedPlayer.PoseidonErrorCount = 0
            if(loadedPlayer.PoseidonErrorCount >= 5)return
            if(subStreamChannel ? details.substream.output.stream_flv_type === 'ws' : monitor.details.stream_flv_type === 'ws'){
                if(loadedPlayer.Poseidon){
                    loadedPlayer.Poseidon.stop()
                    revokeVideoPlayerUrl(monitorId)
                }
                try{
                    loadedPlayer.Poseidon = new Poseidon({
                        video: stream[0],
                        auth_token: $user.auth_token,
                        ke: monitor.ke,
                        uid: $user.uid,
                        id: monitor.mid,
                        url: location.origin,
                        path: websocketPath,
                        query: websocketQuery,
                        onError : onPoseidonError,
                        channel : subStreamChannel
                    })
                    loadedPlayer.Poseidon.start();
                    console.log('started',stream[0], {
                        video: stream[0],
                        auth_token: $user.auth_token,
                        ke: monitor.ke,
                        uid: $user.uid,
                        id: monitor.mid,
                        url: location.origin,
                        path: websocketPath,
                        query: websocketQuery,
                        onError : onPoseidonError,
                        channel : subStreamChannel
                    })
                }catch(err){
                    // onPoseidonError()
                    console.log('onTryPoseidonError',err)
                }
            }else{
                stream.attr('src',getApiPrefix(`mp4`)+'/'+monitor.mid + (subStreamChannel ? `/${subStreamChannel}` : '')+'/s.mp4?time=' + (new Date()).getTime())
                stream[0].onerror = function(err){
                    console.error(err)
                }
            }
        break;
        case'flv':
            if (flvjs.isSupported()) {
                if(loadedPlayer.flv){
                    loadedPlayer.flv.destroy()
                    revokeVideoPlayerUrl(monitorId)
                }
                var options = {};
                if(monitor.details.stream_flv_type==='ws'){
                    if(monitor.details.stream_flv_maxLatency&&monitor.details.stream_flv_maxLatency!==''){
                        monitor.details.stream_flv_maxLatency = parseInt(monitor.details.stream_flv_maxLatency)
                    }else{
                        monitor.details.stream_flv_maxLatency = 20000;
                    }
                    options = {
                        type: 'flv',
                        isLive: true,
                        auth_token: $user.auth_token,
                        ke: monitor.ke,
                        uid: $user.uid,
                        id: monitor.mid,
                        maxLatency: monitor.details.stream_flv_maxLatency,
                        hasAudio:false,
                        url: location.origin,
                        path: websocketPath,
                        channel : subStreamChannel,
                        query: websocketQuery
                    }
                }else{
                    options = {
                        type: 'flv',
                        isLive: true,
                        url: getApiPrefix(`flv`)+'/'+monitor.mid + (subStreamChannel ? `/${subStreamChannel}` : '')+'/s.flv'
                    }
                }
                loadedPlayer.flv = flvjs.createPlayer(options);
                loadedPlayer.flv.attachMediaElement(containerElement.find('.stream-element')[0]);
                loadedPlayer.flv.on('error',function(err){
                    console.log(err)
                });
                loadedPlayer.flv.load();
                loadedPlayer.flv.play();
            }else{
                new PNotify({title:'Stream cannot be started',text:'FLV.js is not supported on this browser. Try another stream type.',type:'error'});
            }
        break;
        case'hls':
            function createSteamNow(){
                clearTimeout(loadedPlayer.m3uCheck)
                var url = getApiPrefix(`hls`) + '/' + monitor.mid + (subStreamChannel ? `/${subStreamChannel}` : '') + '/s.m3u8'
                $.get(url,function(m3u){
                    if(m3u == 'File Not Found'){
                        loadedPlayer.m3uCheck = setTimeout(function(){
                            createSteamNow()
                        },2000)
                    }else{
                        var video = containerElement.find('.stream-element')[0]
                        if (isAppleDevice) {
                            video.src = url;
                            video.addEventListener('loadedmetadata', function() {
                              setTimeout(function(){
                                video.play();
                              },3000)
                            }, false);
                        }else{
                            var hlsOptions = safeJsonParse(dashboardOptions().hlsOptions) || {}
                            if(hlsOptions instanceof String){
                                hlsOptions = {}
                                new PNotify({
                                    title: lang['Invalid JSON'],
                                    text: lang.hlsOptionsInvalid,
                                    type: `warning`,
                                })
                            }
                            if(loadedPlayer.hls){
                                loadedPlayer.hls.destroy()
                                revokeVideoPlayerUrl(monitorId)
                            }
                            loadedPlayer.hls = new Hls(hlsOptions)
                            loadedPlayer.hls.loadSource(url)
                            loadedPlayer.hls.attachMedia(video)
                            loadedPlayer.hls.on(Hls.Events.MANIFEST_PARSED,function() {
                                if (video.paused) {
                                    video.play();
                                }
                            });
                        }
                    }
                })
            }
            createSteamNow()
        break;
        case'mjpeg':
            var liveStreamElement = containerElement.find('.stream-element')
            var setSource = function(){
                liveStreamElement.attr('src',getApiPrefix(`mjpeg`)+'/'+monitorId + (subStreamChannel ? `/${subStreamChannel}` : ''))
                liveStreamElement.unbind('ready')
                liveStreamElement.ready(function(){
                    setTimeout(function(){
                        liveStreamElement.contents().find("body").append('<style>img{width:100%;height:100%}</style>')
                    },1000)
                })
            }
            setSource()
            liveStreamElement.on('error',function(err){
                setTimeout(function(){
                    setSource()
                },4000)
            })
        break;
    }
    // var monitorMutes = dashboardOptions().monitorMutes || {}
    // if(dashboardOptions().switches.monitorMuteAudio === 1){
    //     containerElement.find('video').each(function(n,el){
    //         el.muted = "muted"
    //     })
    // }else{
    //     var hasFocus = windowFocus && window.hadFocus
    //     $.each(loadedMonitors,function(frontId,monitor){
    //         setTimeout(() => {
    //             var monitorId = monitor.mid
    //             var muted = monitorMutes[monitorId]
    //             try{
    //                 var vidEl = $('.monitor_item[mid="' + monitorId + '"] video')[0]
    //                 if(vidEl.length === 0)return;
    //                 if(muted === 1){
    //                     vidEl.muted = true
    //                 }else{
    //                     if(hasFocus){
    //                         vidEl.muted = false
    //                     }else{
    //                         console.error('User must have window active to unmute.')
    //                     }
    //                 }
    //             }catch(err){
    //                 // console.log(err)
    //             }
    //         },2000)
    //     })
    // }
    //initiate signal check
    if(streamType !== 'useSubstream'){
        // var signalCheckInterval = (isNaN(loadedMonitor.details.signal_check) ? 10 : parseFloat(loadedMonitor.details.signal_check)) * 1000 * 60
        // if(signalCheckInterval > 0){
        //     clearInterval(loadedPlayer.signal)
        //     loadedPlayer.signal = setInterval(function(){
        //         signalCheckLiveStream({
        //             mid: monitorId,
        //             checkSpeed: 3000,
        //         })
        //     },signalCheckInterval);
        // }
    }
}
function closeLiveGridPlayer(monitorId,killElement){
    try{
        var loadedPlayer = loadedLiveGrids[monitorId]
        if(loadedPlayer){
            if(loadedPlayer.hls){loadedPlayer.hls.destroy()}
            clearTimeout(loadedPlayer.m3uCheck)
            if(loadedPlayer.Poseidon){loadedPlayer.Poseidon.stop()}
            if(loadedPlayer.Base64){loadedPlayer.Base64.disconnect()}
            if(loadedPlayer.dash){loadedPlayer.dash.reset()}
            if(loadedPlayer.jpegInterval){
                stopJpegStream(monitorId)
            }
            clearInterval(loadedPlayer.signal)
        }
        if(liveGridElements[monitorId]){
            revokeVideoPlayerUrl(monitorId)
            if(killElement){
                var livePlayerElement = liveGridElements[monitorId]
                delete(loadedLiveGrids[monitorId])
                delete(liveGridElements[monitorId])
            }
        }
    }catch(err){
        console.log(err)
    }
}
function revokeVideoPlayerUrl(monitorId){
    try{
        URL.revokeObjectURL(liveGridElements[monitorId].streamElement[0].src)
    }catch(err){
        // console.log(err)
    }
}
function startJpegStream(monitorId){
    if(loadedLiveGrids[monitorId]){
        var monitor = loadedMonitors[monitorId]
        var loadedBlock = loadedLiveGrids[monitorId]
        var jpegInterval = !isNaN(monitor.details.jpegInterval) ? parseFloat(monitor.details.jpegInterval) : 1
        resetMonitorCanvas(monitorId,false)
        var streamElement = $('#monitor_live_' + monitorId + ' .stream-element');
        // stopJpegStream(monitorId)
        var jpegUrl = getApiPrefix('jpeg') + '/' + monitorId + '/s.jpg?time='
        function drawNewFrame(){
            streamElement.attr('src',jpegUrl + (new Date()).getTime())
        }
        streamElement.on('load',function(){
            loadedBlock.jpegInterval = setTimeout(drawNewFrame,1000/jpegInterval)
        }).on('error',function(){
            loadedBlock.jpegInterval = setTimeout(drawNewFrame,1000/jpegInterval)
        })
        drawNewFrame()
    }
}
function stopJpegStream(monitorId){
    var livePlayerElement = loadedLiveGrids[monitorId]
    if(!livePlayerElement)return;
    try{
        liveGridElements[monitorId].streamElement.off('load').off('error')
        clearTimeout(livePlayerElement.jpegInterval)
    }catch(err){
        console.log(err)
        console.log(monitorId)
    }
}
function cacheMonitorElements(monitorId){
    var theBlock = $('#monitor_live_' + monitorId);
    var streamElement = theBlock.find('.stream-element')
    liveGridElements[monitorId] = {
        monitorItem: theBlock,
        streamElement: streamElement,
        eventObjects: theBlock.find('.stream-objects'),
        motionMeter: theBlock.find('.indifference .progress-bar'),
        motionMeterText: theBlock.find('.indifference .progress-bar span'),
        width: streamElement.width(),
        height: streamElement.height(),
        miniVideoList: theBlock.find('.videos-mini'),
    }
    return theBlock
}
function selectMonitor(monitorId, css){
    css = css || {};
    var loadedMonitor = loadedMonitors[monitorId];
    var details = loadedMonitor.details;
    var subStreamChannel = loadedMonitor.subStreamChannel;
    var isSelected = selectedMonitors[monitorId]
    var streamType = subStreamChannel ? details.substream ? details.substream.output.stream_type : 'hls' : details.stream_type
    if(isSelected)return;
    var numberOfSelected = Object.keys(selectedMonitors)
    if(numberOfSelected > 3 && !featureIsActivated(true)){
        return
    }
    if(!loadedLiveGrids[monitorId])loadedLiveGrids[monitorId] = {}
    selectedMonitors[monitorId] = Object.assign({}, loadedMonitor);
    wallViewCanvas.append(`<div id="monitor_live_${monitorId}" class="wallview-video p-0 m-0" live-stream="${monitorId}" style="left:${css.left || 0}px;top:${css.top || 0}px;width:${css.width ? css.width + 'px' : '50vw'};height:${css.height ? css.height + 'px' : '50vh'};"><div class="overlay"><div class="wallview-item-controls text-end"><a class="btn btn-sm btn-outline-danger wallview-item-close"><i class="fa fa-times"></i></a></div></div>
        ${buildStreamElementHtml(streamType)}
    </div>`);
    const newElement = cacheMonitorElements(monitorId);
    newElement.draggable({
        grid: [40, 40],
        snap: '#wallview-canvas',
        containment: "window",
        stop: function(){
            saveLayout()
        }
    })
    .resizable({
        grid: [40, 40],
        snap: '#wallview-container',
        stop: function(){
            saveLayout()
        }
    });
    initiateLiveGridPlayer(loadedMonitor, subStreamChannel)
    attachVideoElementErrorHandler(monitorId)
    getMonitorListItem(monitorId).removeClass('btn-primary').addClass('btn-warning')
}
function deselectMonitor(monitorId){
    delete(selectedMonitors[monitorId])
    closeLiveGridPlayer(monitorId, true)
    var monitorItem = wallViewCanvas.find(`[live-stream="${monitorId}"]`);
    monitorItem.remove()
    getMonitorListItem(monitorId).removeClass('btn-warning').addClass('btn-primary')
}

function getCurrentLayout(){
    var layout = []
    wallViewCanvas.find('.wallview-video').each(function(n,v){
        var el = $(v)
        var monitorId = el.attr('live-stream')
        var position = el.position()
        layout.push({
            monitorId,
            css: {
                left: position.left,
                top: position.top,
                width: el.width(),
                height: el.height(),
            }
        })
    })
    return layout
}

function saveLayout(){
    var windowName = getWindowName();
    var layouts = getAllLayouts();
    var layout = getCurrentLayout();
    var saveContainer = {
        layout,
        windowInnerWidth: window.innerWidth,
        windowInnerHeight: window.innerHeight,
    }
    layouts[windowName] = saveContainer;
    localStorage.setItem('windowLayouts', JSON.stringify(layouts));
}

function getAllLayouts(){
    return JSON.parse(localStorage.getItem(`windowLayouts`) || '{}');
}

function getLayout(full){
    var windowName = getWindowName();
    var saveContainer = getAllLayouts()[windowName]
    if(full)return saveContainer || { layout: [] };
    var layout = saveContainer.layout || []
    return layout;
}

function resetWindowDimensions(){
    var saveContainer = getLayout(true);
    if(saveContainer.windowInnerWidth && saveContainer.windowInnerHeight){
        var widthDiff = window.outerWidth - window.innerWidth;
        var heightDiff = window.outerHeight - window.innerHeight;
        lastWindowWidth = saveContainer.windowInnerWidth
        lastWindowHeight = saveContainer.windowInnerHeight
        window.resizeTo(saveContainer.windowInnerWidth + widthDiff, saveContainer.windowInnerHeight + heightDiff);
    }
}

function loadSavedLayout(){
    var saveContainer = getLayout(true);
    resetWindowDimensions()
    saveContainer.layout.forEach(function({ monitorId, css }, n){
        selectMonitor(monitorId, css);
    });
    displayInfoScreen();
}

function displayInfoScreen(){
    if(getCurrentLayout().length === 0){
        wallViewInfoScreen.css('display','flex')
    }else{
        wallViewInfoScreen.hide()
    }
}
function resizeMonitorItem({ monitorId, css }, oldWidth, oldHeight, newWidth, newHeight){
    var monitorItem = wallViewCanvas.find(`[live-stream="${monitorId}"]`);
    var newCss = rescaleMatrix(css, oldWidth, oldHeight, newWidth, newHeight)
    monitorItem.css(newCss)
}
function rescaleMatrix(matrix, oldWidth, oldHeight, newWidth, newHeight) {
    const scaleX = newWidth / oldWidth;
    const scaleY = newHeight / oldHeight;

    return {
        left: matrix.left * scaleX,
        top: matrix.top * scaleY,
        width: matrix.width * scaleX,
        height: matrix.height * scaleY
    };
}

function onWindowResize(){
    var currentWindowWidth = theWindow.width()
    var currentWindowHeight = theWindow.height()
    var layout = getCurrentLayout();
    for(item of layout){
        resizeMonitorItem(item,lastWindowWidth,lastWindowHeight,currentWindowWidth,currentWindowHeight)
    }
    lastWindowWidth = currentWindowWidth
    lastWindowHeight = currentWindowHeight
}

function autoPlaceCurrentMonitorItems() {
    const wallviewVideos = wallViewCanvas.find('.wallview-video');
    const totalItems = wallviewVideos.length;

    let numRows, numCols;

    if (totalItems === 6 || totalItems === 5) {
        numCols = 3;
        numRows = 2;
    } else {
        numRows = Math.ceil(Math.sqrt(totalItems));
        numCols = Math.ceil(totalItems / numRows);
    }

    const containerWidth = wallViewCanvas.width();
    const containerHeight = wallViewCanvas.height();
    const itemWidth = containerWidth / numCols;
    const itemHeight = containerHeight / numRows;

    wallviewVideos.each(function(index, element) {
        const row = Math.floor(index / numCols);
        const col = index % numCols;

        $(element).css({
            left: col * itemWidth,
            top: row * itemHeight,
            width: itemWidth,
            height: itemHeight
        });
    });
}

function openAllMonitors(){
    $.each(loadedMonitors,function(monitorId, monitor){
        var modeAccepted = monitor.mode !== 'stop' && monitor.mode !== 'idle'
        if(modeAccepted)selectMonitor(monitorId)
    })
    autoPlaceCurrentMonitorItems()
    displayInfoScreen()
    saveLayout()
}

function openMonitors(monitorIds, savePlaces){
    $.each(monitorIds,function(n, monitorId){
        selectMonitor(monitorId)
    })
    autoPlaceCurrentMonitorItems()
    displayInfoScreen()
    if(savePlaces)saveLayout()
}

function openNextMonitors(numberOf){
    var allLayouts = getAllLayouts()
    var ignoreMonitors = []
    var availableMonitors = []
    var numberToOpen = parseInt(numberOf) || 4;
    $.each(allLayouts,function(windowName, { layout }){
        $.each(layout,function(n, { monitorId }){
            ignoreMonitors.push(monitorId)
        })
    });
    $.each(loadedMonitors,function(monitorId, monitor){
        if(ignoreMonitors.indexOf(monitor.mid) === -1){
            var modeAccepted = monitor.mode !== 'stop' && monitor.mode !== 'idle'
            if(modeAccepted)availableMonitors.push(monitorId)
        }
    });
    for (let i = 0; i < numberToOpen; i++) {
        selectMonitor(availableMonitors[i])
    }
    autoPlaceCurrentMonitorItems()
    displayInfoScreen()
    saveLayout()
}

function closeAllMonitors(){
    $.each(loadedMonitors,function(monitorId, monitor){
        deselectMonitor(monitorId)
    })
    displayInfoScreen()
    saveLayout()
}

addExtender('onDashboardReady')

$(document).ready(function(){
    drawMonitorList().then(() => {
        loadSavedLayout()
        setTimeout(() => {
            theWindow.resize(() => {
                onWindowResize()
                saveLayout()
            })
            executeExtender('onDashboardReady')
        },500)
    })
    $('body')
    .on('click', '[select-monitor]', function(e){
        e.preventDefault()
        var el = $(this);
        var monitorId = el.attr('select-monitor')
        var isSelected = selectedMonitors[monitorId]
        if(isSelected){
            deselectMonitor(monitorId)
        }else{
            selectMonitor(monitorId)
        }
        displayInfoScreen()
        saveLayout()
    })
    .on('click', '.open-wallview', function(e){
        e.preventDefault()
        var windowName = getWindowName();
        if(isNaN(windowName)){
            windowName = windowName + '2'
        }else{
            windowName = `${parseInt(windowName) + 1}`
        }
        createWallViewWindow(windowName)
    })
    .on('click', '.wallview-autoplace', function(e){
        e.preventDefault()
        autoPlaceCurrentMonitorItems()
        saveLayout()
    })
    .on('click', '.wallview-item-close', function(e){
        e.preventDefault()
        var monitorId = $(this).parents('[live-stream]').attr('live-stream')
        deselectMonitor(monitorId)
    })
    .on('click', '.wallview-open-all', function(e){
        e.preventDefault()
        openAllMonitors()
    })
    .on('click', '.wallview-open-next', function(e){
        e.preventDefault()
        var numberOf = $(this).attr('number-of')
        openNextMonitors(numberOf)
    })
    .on('click', '.wallview-close-all', function(e){
        e.preventDefault()
        closeAllMonitors()
    })
    .on('click', '.wallview-toggle-monitor-list', function(e){
        e.preventDefault();
        wallViewMonitorList.toggleClass('d-none')
        return false;
    })
    .on('click', '.wallview-open-monitor-group', function(e){
        e.preventDefault();
        var el = $(this)
        var tag = el.attr('tag')
        if(!tag){
            for(monitorId of Object.keys(loadedMonitors)){
                selectMonitor(monitorId)
            }
        }else{
            var tags = getListOfTagsFromMonitors()
            var monitorIds = tags[tag]
            for(monitorId of monitorIds){
                selectMonitor(monitorId)
            }
        }
        autoPlaceCurrentMonitorItems()
        displayInfoScreen()
        saveLayout()
        return false;
    });
    createWebsocket(location.origin,{
        path: websocketPath
    });
});
