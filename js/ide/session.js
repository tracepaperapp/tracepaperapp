
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
    session.issues = [];
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


// Disable/Enable editing
window.addEventListener("load", function(){
    if (!location.pathname.startsWith("/modeler")){return}
    setTimeout(function(){

        // Editable class
        let collection = document.getElementsByClassName("editable");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
          }
        }

        // select class
        collection = document.getElementsByClassName("select-ghost");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
          }
        }

        // input class
        collection = document.getElementsByClassName("input-ghost");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
          }
        }

        // checkbox class
        collection = document.getElementsByClassName("checkbox");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
          }
        }

        // Content editable
        if (session.editing_disabled){
            collection = document.querySelectorAll('[contenteditable="true"]');
            for (let i = 0; i < collection.length; i++) {
              collection[i].setAttribute("contenteditable", false);
            }
        }

        // editor buttons
        collection = document.getElementsByClassName("btn");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
            collection[i].style.display = 'none';
          }
        }
    },1000);
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
            delete data.unsaved_files;
            Object.assign(session,data);
        }
        session.saving = false;
        session.last_save = "";
        session.last_pull = "";
        start_save_session_interval();
    },
    get_users: async function(){
        let query_string = `
        query FilterUser {
          User {
            filter {
               resultset {
                username
                fullName
              }
            }
          }
        }
        `;
        var data = await Draftsman.query(query_string);
        console.log(data);
        return data.User.filter.resultset.filter(x => x.username != "");
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
    },
    enable_editing: function(){
        session.editing_disabled = false;
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
    },2000);
}

if (localStorage.project_drn && location.pathname == "/"){
    Session.reload_from_disk(localStorage.project_drn);
}

window.sleep = function(ms) {
    console.trace(`Sleep ${ms} milliseconds`);
    return new Promise(resolve => setTimeout(resolve, ms));
}