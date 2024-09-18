
window.Navigation = {
    soft_reload: function(){
        document.dispatchEvent(new CustomEvent('soft-reload'));
    },
    open: function(file){
        file = file.startsWith("Patterns") ? "Patterns" : file;
        if (session.tab == file){
            Navigation.force_reload();
            return;
        }
        push_to_remote();
        session.tab = file;
        location.hash = file;
        if (!session.tabs.includes(file)){
            session.tabs.push(file);
        }
        Navigation.soft_reload();
    },
    open_diagram: function(file){
        session.tab = "/diagram#" + file;
        session.tabs = session.tabs.filter(x => !x.startsWith("/diagram#"));
        session.tabs.push(session.tab);
    },
    close: function(file){
        session.tabs = session.tabs.filter(x => x != file);
        if (session.tab == file){
            if (session.tabs.length != 0){
                session.tab = session.tabs.at(0);
            } else {
                setTimeout(function(){
                    Navigation.open("README.md");
                    Navigation.soft_reload();
                },1000);
            }
        }
        Navigation.soft_reload();
    },
    get_name: function(path){
        if (path.startsWith("/diagram")){
            return "Domain Diagram";
        }
        let type = Modeler.determine_type(path);
        if (type == "aggregate"){
            return path.split("/").at(2);
        } else if (type == "readme"){
            return "About";
        } else {
            return path.split('/').at(-1).replace('Requested.xml','').replace('.xml','');
        }
    },
    rename: function(oldPath,newPath){
        setTimeout(function(){
            parent.postMessage({type:'rename',oldPath:oldPath,newPath:newPath});
        },1000);
    },
    reload: function(file){
        setTimeout(function(){
            parent.postMessage({type:'reload',file:file});
        },1000);
    },
    force_reload: async function(file){
        let history = session.tab;
        session.tab = "";
        await sleep(1);
        if (file){
            await FileSystem.auto_commit();
        }
        await sleep(1);
        session.tab = file ? file : history;
    }
}

window.addEventListener("message", async function(event) {
    // if (event.origin !== location.origin)
    //     return;
    console.log(event);
    if (event.data.type == "popout"){
        Navigation.close(event.data.file);
    } else if (event.data.type == "diagram"){
        Navigation.open_diagram(event.data.file);
    } else if (event.data.type == "open"){
        let file = event.data.file;
        if (file.startsWith("domain/") && !file.endsWith(".xml")){
            file += "/root.xml";
        }
        Navigation.open(file);
    } else if (event.data.type == "rename"){
        Navigation.close(event.data.oldPath);
        await FileSystem.auto_commit();
        Navigation.open(event.data.newPath);
        await sleep(2000);
        location.reload();
    } else if (event.data.type == "deleted"){
        Navigation.close(event.data.file);
        await FileSystem.auto_commit();
        await sleep(2000);
        location.reload();
    } else if (event.data.type == "shortcut"){
        Shortcut.open(event.data.shortcut);
    } else if (event.data.type == "reload"){
        Navigation.force_reload(event.data.file);
    } else {
        console.log(event.data);
    }
});
