$(document).ready(function(){
    var theEnclosure = $('#failoverKeys')
    var theList = $('#failoverKeys-list')
    var theForm = theEnclosure.find('form')
    function getServers(){
        return new Promise((resolve) => {
            $.get(superApiPrefix + $user.sessionKey + '/failoverKeys/list',function(data){
                resolve(data.failoverConnectionKeys)
            })
        })
    }
    function addServer({ failoverServer }){
        return new Promise((resolve) => {
            $.post(superApiPrefix + $user.sessionKey + '/failoverKeys/save',{
                failoverServer,
            },function(data){
                resolve(data)
            })
        })
    }
    function removeServer({ failoverServer }){
        return new Promise((resolve) => {
            $.post(superApiPrefix + $user.sessionKey + '/failoverKeys/disconnect',{
                failoverServer,
            },function(data){
                resolve(data)
            })
        })
    }
    function drawServerRow({ failoverServer }){
        var notExist = $(`[data-key="${failoverServer}"]`).length === 0
        if(notExist)theList.append(`<tr class="server-row" data-key="${failoverServer}">
            <td>${failoverServer}</td>
            <td class="text-end"><a class="btn btn-sm btn-danger delete"><i class="fa fa-trash-o"></i></a></td>
        </tr>`)
    }
    async function drawServers(){
        const list = await getServers()
        for(failoverServer in list){
            var details = list[failoverServer];
            drawServerRow({ failoverServer, details })
        }
    }
    theEnclosure.find('.submit').click(function(){
        theForm.submit()
    })
    theEnclosure.on('click', '.delete', function(){
        var el = $(this).parents('.server-row')
        var failoverServer = el.attr('data-key')
        $.confirm.create({
            title: lang["Delete"],
            body: `${lang.DeleteThisMsg}`,
            clickOptions: {
                title: '<i class="fa fa-trash-o"></i> ' + lang.Delete,
                class: 'btn-danger btn-sm'
            },
            clickCallback: async function(){
                const response = await removeServer({ failoverServer })
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
