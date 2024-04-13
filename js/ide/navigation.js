
var navigation_block = false;
setInterval(function(){
    navigation_block = false;
    if (Object.keys(tab_state).length > 1){
        localStorage[session.tab] = JSON.stringify(tab_state);
    }
},1000);

window.addEventListener(
  "hashchange",
  async () => {
    await sleep(100);
    if (window.location.hash.startsWith("#tab:")){
        let path = window.location.hash.replace("#tab:","");
        if(session.tab != path){
            Navigation.execute_open_tab(path);
        }
    }
  },
  false,
);

window.Navigation = {
    filter_tabs: function(search){
        return Object.keys(model)
            .filter(x => x.toLowerCase().includes(search.toLowerCase()))
            .filter(x => {
                if (x.startsWith("commands/")){
                    return true;
                } else if (x.startsWith("notifiers/")){
                   return true;
               }else if (x.startsWith("views/")){
                   return true;
               }else if (x.startsWith("projections/")){
                                   return true;
               }else if (x.startsWith("scenarios/")){
                   return true;
               }else if (x.startsWith("domain/") && x.endsWith("root.xml")){
                   return true;
               }else if (x.startsWith("domain/") && x.includes("/behavior-flows/")){
                   return true;
               }else{
                    return false;
               }
            });
    },
    toggle: function(section){
        if(navigation_block){return}else{navigation_block=true}
        if (session.navigation[section]){
            session.navigation[section] = false;
        } else {
            session.navigation[section] = true;
        }
    },
    toggle_document: function(){
        if(navigation_block){return}else{navigation_block=true}
        tab_state.document_mode = tab_state.document_mode == 'table' ? 'json' : 'table';
    },
    open_tab: function(event){
        let file = get_attribute(event,"file");
        Navigation.execute_open_tab(file);
    },
    execute_open_tab: function(file){
        Navigation.load_tab(file);
        if (!session.tabs.includes(file)){
            session.tabs.push(file);
        }
        session.tab_history = session.tab_history.filter(x => x != file);
        session.tab_history.unshift(file);
        setTimeout(function(){
            window.location.hash = "tab:" + file;
        },100);
    },
    close_tab: function(event){
        let file = get_attribute(event,"file");
        Navigation.execute_close_tab(file);
    },
    close_tabs_left: function(tab){
        let tabs = [];
        let detected = false;
        session.tabs.forEach(x=>{
            if (detected || x == tab){
                tabs.push(x);
                detected = true;
            }
        });
        session.tabs = tabs;
    },
    close_other: function(tab){
        session.tabs = session.tabs.filter(x => x == tab);
    },
    close_tabs_right: function(tab){
        let tabs = [];
        let detected = true;
        session.tabs.forEach(x=>{
            if (detected){
                tabs.push(x);
            }
            if (x == tab){
                detected = false;
            }
        });
        session.tabs = tabs;
    },
    execute_close_tab: function(file){
        let index = session.tabs.indexOf(file);
        session.tabs = session.tabs.filter(x => x != file);
        if (session.tabs.at(index)){
            Navigation.execute_open_tab(session.tabs.at(index));
        }
        else if (session.tabs.length == 0){
            Navigation.execute_open_tab("README.md");
        }
        else {
            Navigation.execute_open_tab(session.tabs.at(-1));
        }
    },
    get_tabname: function(file){
        if (file == "README.md"){
                return "About";
        } else if (file.startsWith("commands/")){
            return file.replace("commands/","").replace("Requested.xml","");
        } else if (file.startsWith("domain/") && file.endsWith("README.md")){
            return file.split("/").at(1);
        } else if (file.startsWith("domain/") && file.endsWith("root.xml")){
            return file.split("/").at(2);
        } else if (file.startsWith("domain/") && file.includes("/behavior-flows/") && !file.includes("#")){
            let path = file.replace(".xml","").split("/");
            return path.at(-3) + ": " + path.at(-1);
        } else if (file.startsWith("domain/") && file.includes("/behavior-flows/") && file.includes("#")){
            let path = file.replace(".xml","").split("/");
            return path.at(-3) + ": " + path.at(-1).replace("#",": ");
        } else if (file.startsWith("documentation")){
            return "Docs: " + file.split("/").at(-1);
        } else if (file.startsWith("views/")){
            return file.replace("views/","").replace(".xml","");
        } else if (file.startsWith("projections/")){
            return file.replace("projections/","").replace(".xml","");
        } else if (file.startsWith("notifiers/")){
            return file.replace("notifiers/","").replace(".xml","");
        } else if (file.startsWith("lib/")){
            return file.replace("lib/","").replace(".py","");
        } else if (file.startsWith("scenarios/")){
            return file.replace("scenarios/","").replace(".xml","");
        } else if (file.startsWith("build/")){
            return "Build";
        } else if (file.startsWith("api/")){
            return "API overview";
        } else if (file == "patterns/"){
            return "Patterns";
        } else if (file == "expressions/"){
            return "Expressions";
        } else if (file == "roles/"){
            return "Roles";
        } else if (file == "dependencies/"){
            return "Dependencies";
        } else if (file == "deployments/"){
            return "Deployments";
        } else {
            return file.split("/").at(-1);
        }
    },
    load_data_in_tab: function(file){
        if (file == "README.md"){
            Modeler.open_readme();
        } else if (file.startsWith("commands/")){
            Commands.load(file);
        } else if (file.startsWith("domain/") && file.endsWith("README.md")){
            Subdomains.load(file);
        } else if (file.startsWith("domain/") && file.endsWith("root.xml")){
            Aggregates.load(file);
        } else if (file.startsWith("domain/") && file.includes("/behavior-flows/") && !file.includes("#")){
            Behavior.load(file);
        }else if (file.startsWith("domain/") && file.includes("/behavior-flows/") && file.includes("#")){
            Behavior.load_testcase(file);
        } else if (file.startsWith("views/")){
            Views.load(file);
        } else if (file.startsWith("projections/")){
            Projections.load(file);
        } else if (file.startsWith("notifiers/")){
            Notifiers.load(file);
        } else if (file.startsWith("lib/")){
            Code.load(file);
        } else if (file.startsWith("scenarios/")){
            Scenarios.load(file);
        } else if (file.startsWith("build/")){
            Builds.load();
        } else if (file.startsWith("api/")){
            Modeler.load_api_overview();
        } else if (file == "patterns/"){
            Patterns.load();
        } else if (file == "expressions/"){
            Expressions.load();
        } else if (file == "roles/"){
            session.type = "roles";
        } else if (file == "dependencies/"){
            session.type = "dependencies";
        } else if (file == "deployments/"){
            session.type = "deployments";
        } else if (file.startsWith("documentation")){
            Documentation.load(file);
        }
        if (!("document_selected_entity" in tab_state)){
            tab_state.document_selected_entity = "root";
        }
        if (!("document_mode" in tab_state)){
            //tab_state.document_mode = "table";
        }
        tab_state.document_mode = 'table';
        console.trace("tab state:",tab_state);
        document.dispatchEvent(new CustomEvent('navigated'));
    },
    load_tab: function(file){
            session.type = "";
            let data = {};
            if (localStorage[file]){
                data = JSON.parse(localStorage[file]);
            }

            session.tab = file;
            Object.keys(tab_state).forEach(key => {delete tab_state[key]});
            Object.keys(data).forEach(key => {tab_state[key] = data[key]});
            Navigation.load_data_in_tab(file);
            if(file.startsWith('build/')){
                return;
            }
            setTimeout(function(){
                document.dispatchEvent(new CustomEvent('soft-reload'));
                document.getElementById("main-canvas").scrollTo(0,data.scrollposition);
            },100);
            setTimeout(function(){
                document.dispatchEvent(new CustomEvent('soft-reload'));
                document.getElementById("main-canvas").scrollTo(0,data.scrollposition);
            },500);
        },
    fresh_reload: function(file){
            session.tab = file;
            session.type = "";
            Object.keys(tab_state).forEach(key => {delete tab_state[key]});
            Navigation.load_data_in_tab(file);
        },
    reload_tab: function(){
        localStorage[session.tab] = JSON.stringify(tab_state);
        Navigation.load_tab(session.tab);
        Navigation.soft_reload_tab();
    },
    soft_reload_tab: function(){
        setTimeout(function(){
            document.dispatchEvent(new CustomEvent('soft-reload'));
            document.dispatchEvent(new CustomEvent('navigated'));
        },1000);
    },
    hard_reload_tab: function(){
        localStorage[session.tab] = JSON.stringify(tab_state);
        setTimeout(function(){
            Object.keys(tab_state).forEach(key => {delete tab_state[key]});
            setTimeout(function(){
                Navigation.load_tab(session.tab);
            },1);
        },1);
    }
};

document.addEventListener('tracepaper:model:loaded', async () => {
    try{
        if (window.location.hash.startsWith("#tab:")){
            try{
                Navigation.execute_open_tab(window.location.hash.replace("#tab:",""));
            }catch{}
        }
        if (session.tab){
            Navigation.load_tab(session.tab);
        } else {
            Navigation.execute_open_tab("README.md");
        }
    }catch{}
    let files = await FileSystem.listFiles();
    files = files.concat(Object.keys(model));
    files = files.concat(Object.keys(documentation));
    session.tabs.map(x=> x.split("#").at(0)).filter(x=> !files.includes(x) && !x.startsWith("documentation/") && !x.startsWith("build/") && !x.startsWith("api/") && !["patterns/","expressions/","roles/","deployments/","dependencies/"].includes(x)).forEach(tab=> {
        try{
            console.log("auto close tab:",tab);
            Navigation.execute_close_tab(tab);
        }catch{}
    });
    session.tab_history = session.tab_history.filter(tab => files.includes(tab));
});