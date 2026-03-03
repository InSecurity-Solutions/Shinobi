$(document).ready(function(){
    var theEnclosure = $('#failoverServers')
    var theList = $('#failoverServers-list')
    var theForm = theEnclosure.find('form')
    function getServers(){
        return new Promise((resolve) => {
            $.get(superApiPrefix + $user.sessionKey + '/failover/list',function(data){
                resolve(data.failoverServers)
            })
        })
    }
    function addServer({ failoverServer, peerConnectKey }){
        return new Promise((resolve) => {
            $.post(superApiPrefix + $user.sessionKey + '/failover/save',{
                failoverServer,
                peerConnectKey,
            },function(data){
                resolve(data)
            })
        })
    }
    function removeServer({ failoverServer, peerConnectKey }){
        return new Promise((resolve) => {
            $.post(superApiPrefix + $user.sessionKey + '/failover/disconnect',{
                failoverServer,
                peerConnectKey,
            },function(data){
                resolve(data)
            })
        })
    }
    function drawServerRow({ failoverServer, peerConnectKey }){
        var notExist = $(`[data-server="${failoverServer}"][data-peerconnectkey="${peerConnectKey}"]`).length === 0
        if(notExist)theList.append(`<tr class="server-row" data-server="${failoverServer}" data-peerconnectkey="${peerConnectKey}">
            <td>${failoverServer}</td>
            <td>${peerConnectKey}</td>
            <td><a class="btn btn-sm btn-danger delete"><i class="fa fa-trash-o"></i></a></td>
        </tr>`)
    }
    async function drawServers(){
        const list = await getServers()
        for(failoverServer in list){
            var peerConnectKey = list[failoverServer];
            drawServerRow({ failoverServer, peerConnectKey })
        }
    }
    theEnclosure.find('.submit').click(function(){
        theForm.submit()
    })
    theEnclosure.on('click', '.delete', function(){
        var el = $(this).parents('.server-row')
        var failoverServer = el.attr('data-server')
        var peerConnectKey = el.attr('data-peerconnectkey')
        $.confirm.create({
            title: lang["Delete"],
            body: `${lang.DeleteThisMsg}`,
            clickOptions: {
                title: '<i class="fa fa-trash-o"></i> ' + lang.Delete,
                class: 'btn-danger btn-sm'
            },
            clickCallback: async function(){
                const response = await removeServer({ failoverServer, peerConnectKey })
                if(response.ok){
                    el.remove();
                }
            }
        });
    })
    theForm.submit(async function(e){
        e.preventDefault()
        var formValues = $(this).serializeObject()
        var response = await addServer(formValues)
        if(response.ok){
            new PNotify({
                type: 'success',
                title: lang['Settings Changed'],
                text: lang.failoverServersSaved,
            })
            drawServerRow(formValues)
        }
        return false
    })
    onInitSuccess(function(){
        drawServers()
    })
})
