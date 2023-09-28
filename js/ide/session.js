
var clear_exception_timer = null;
window.Session = {
    reload_from_disk: function(project){
        clearInterval(save_session_interval);
        localStorage.project = project;
        if (localStorage[localStorage.project]){
            for (var member in session) delete session[member];
            let data = JSON.parse(localStorage[localStorage.project]);
            delete data.initialized;
            delete data.exception;
            Object.assign(session,data);
        }
        start_save_session_interval();
    },
    show_exception: function(message){
        clearTimeout(clear_exception_timer);
        session.exception = message;
        clear_exception_timer = setTimeout(function(){
            session.exception = "";
        },5000);
    },
    disable_editing: function(){
        session.editing_disabled = true;
        session.hide_edit_button = true;
    },
    enable_editing: function(){
        session.hide_edit_button = false;
    }
};

document.addEventListener('tracepaper:session:initialized', async () => {
    Session.reload_from_disk(localStorage.project);
});

var save_session_interval = null;
function start_save_session_interval(){
    setInterval(function(){
    if (localStorage.project){
        localStorage[localStorage.project] = JSON.stringify(session);
    }
    },1000);
}

if (localStorage.project){
    Session.reload_from_disk(localStorage.project);
}
