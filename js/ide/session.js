
var clear_exception_timer = null;
var session = {
    initialized:false,
    navigation: {},
    selected_node: "",
    all_links: {},
    saving: false,
    tab: '',
    tabs: [],
    frame: ''
};

function open_frame(uri){
    session.frame = "";
    setTimeout(function(){
        session.frame = uri;
    },1);
}
document.addEventListener('alpine:init', async () => {
    session = Alpine.reactive(session);
    label = Alpine.reactive(label);
    Alpine.data('session', () => ({
        session: session,
        label: label
    }));
    setTimeout(Navigation.soft_reload,100);
    Alpine.effect(() => {
        if (session.tab.startsWith("/diagram")){
            open_frame(session.tab);
        } else {
            open_frame('/modeler#' + session.tab);
        }
    });
});
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
        session.saving = false;
        session.last_save = "";
        session.last_pull = "";
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
    },
    load_data: function (updated_value,original){
        setTimeout(function(){
            if (updated_value != original){
                original = updated_value;
            }
        },1);
    }
};

var save_session_interval = null;
function start_save_session_interval(){
    setInterval(function(){
    if (localStorage.project_drn){
        localStorage[localStorage.project_drn] = JSON.stringify(session);
    }
    if (session.tabs.length == 0){
        Navigation.open("README.md");
    }
    },1000);
}

if (localStorage.project_drn){
    Session.reload_from_disk(localStorage.project_drn);
}

window.sleep = function(ms) {
    console.trace(`Sleep ${ms} milliseconds`);
    return new Promise(resolve => setTimeout(resolve, ms));
}