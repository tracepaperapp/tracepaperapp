var directories = {};
const directory_labels = {
    "commands" : "Commands",
    "domain": "Domain",
    "behavior-flows": "Behavior",
    "events": "Events",
    "notifiers": "Notifiers",
    "views": "Views",
    "projections": "Projections",
    "lib": "Python Modules",
    "templates": "Templates",
    "scenarios": "Scenarios"
};

function get_parent(path){
    let i = path.lastIndexOf("/");
    return path.substring(0, i);
}

function get_directory(path,name=""){
    if (path in directories){
        return directories[path];
    } else {
        let items = [];
        let parent = get_directory(get_parent(path));
        name = name ? name : path.split("/").at(-1);
        if (name in directory_labels){
            name = directory_labels[name];
        }
        parent.push({
            name: name,
            type: "directory",
            items: items,
            path: path
        });
        directories[path] = items;
        return items;
    }
}

function repair_path(path){
    ["/write/","/view/","/utils/","/"].forEach(prefix => {
        if (path.startsWith(prefix)){
            path = path.replace(prefix,"");
        }
    });
    return path;
}

function add_file(file, name){
    let directory = get_directory(get_parent(file))
    directory.push({
        name: name ? name : file.split("/").at(-1).split(".").at(0),
        type: "file",
        path: repair_path(file)
    });
}

document.addEventListener('alpine:init', () => {
    Alpine.data('fileBrowser', function(){
        return {
            items: this.$persist([]).using(sessionStorage).as("fileList"),
            async init(){
                if (this.items.length != 0){
                    this.render_browser(this.items, this.$el);
                }
                await this.prepare();
                this.renameListner = Draftsman.registerListener("file-renamed",this.reload.bind(this));
                this.reloadListner = Draftsman.registerListener("force-reload",this.reload.bind(this));
                this.focusListner = Draftsman.registerListener("focus",this.focus.bind(this));
            },
            async reload(){
                Draftsman.debounce("file-browser-reload",this.prepare.bind(this),10000);
            },
            async focus(){
                let type = Modeler.determine_type(this.navigation);
                let key = "";
                switch(type){
                    case "command":
                    case "event":
                    case "aggregate":
                    case "behavior":
                    case "notifier":
                        key = "/write/" + this.navigation.replace("root.xml","");
                        break;
                    case "view":
                    case "projection":
                        key = "/view/" + this.navigation;
                        break;
                    case "code":
                        key = "/utils/" + this.navigation
                        break;
                }
                if (key){
                    Object.keys(directories).forEach(p => {
                        sessionStorage.setItem(p,key.startsWith(p) || p.startsWith(key));
                    });
                    await this.prepare();
                }
            },
            async prepare(){
                if (this.lock){return}
                this.lock = true;
                try{
                    directories = {};
                    let repo = await GitRepository.open();
                    let files = await repo.list();
                    while (files.length < 2){
                        await Draftsman.sleep(100);
                        files = await repo.list();
                    }

                    if (!("" in directories)){
                        directories[""] = [];
                    }
                    let items = directories[""];
                    add_file("/README.md","About")

                    // Prepare structure
                    get_directory("/write","Write Domain");
                    get_directory("/view","View Domain");
                    get_directory("/view/views");
                    get_directory("/view/projections");
                    get_directory("/utils","Utils");
                    add_file("/utils/Expressions")
                    add_file("/utils/Dependencies")
                    add_file("/utils/Patterns")
                    add_file("/utils/Roles")
                    files.forEach(file => {
                        if (file.startsWith("commands/") && file.endsWith(".xml")){
                            let name = file.split("/").at(-1).replace("Requested.xml","");
                            add_file("/write/" + file,name);
                        }

                        if (file.startsWith("domain/") && file.endsWith(".xml")){
                            if (file.endsWith("root.xml")){
                                add_file("/write/" + file,"Root");
                            }
                            if (file.includes("behavior-flows") && file.endsWith(".xml")){
                                add_file("/write/" + file);
                            }
                            if (file.includes("/events/") && file.endsWith(".xml")){
                                add_file("/write/" + file);
                            }
                        }
                        if (file.startsWith("notifiers/") && file.endsWith(".xml")){
                            add_file("/write/" + file);
                        }
                        if (file.startsWith("views/") && file.endsWith(".xml")){
                            add_file("/view/" + file);
                        }
                        if (file.startsWith("projections/") && file.endsWith(".xml")){
                            add_file("/view/" + file);
                        }
                        if (file.startsWith("lib/") && file.endsWith(".py")){
                            add_file("/utils/" + file);
                        }
                        if (file.startsWith("templates/")){
                            add_file("/utils/" + file);
                        }
                        if (file.startsWith("scenarios/") && file.endsWith(".xml")){
                            add_file("/" + file);
                        }
                    });
                    this.$el.innerHTML = '';
                    this.render_browser(items, this.$el);
                    this.items = items;
                    const li = document.createElement('li');
                    const fileLink = document.createElement('a');
                    fileLink.innerHTML = `<i class="fa-solid fa-gear"></i> Settings`;
                    fileLink.setAttribute("navigation","Settings");
                    fileLink.setAttribute(":class","navigationElementActive");
                    fileLink.setAttribute("x-on:click","navigate");
                    li.appendChild(fileLink);
                    this.$el.appendChild(li);
                } finally {
                    await Draftsman.sleep(100);
                    this.lock = false;
                }
            },
            render_browser(items, parentElement){
                items.forEach(file => {
                    const li = document.createElement('li');

                    if (file.type === 'file') {
                        const fileLink = document.createElement('a');
                        fileLink.innerHTML = `<i class="fa-regular fa-file-code"></i> ${file.name}`;
                        fileLink.setAttribute("navigation",file.path);
                        fileLink.setAttribute(":class","navigationElementActive");
                        fileLink.setAttribute("x-on:click","navigate");
                        li.appendChild(fileLink);
                    } else if (file.type === 'directory') {
                        const details = document.createElement('details');
                        const summary = document.createElement('summary');
                        summary.innerHTML = `<i class="fa-regular fa-folder"></i> ${file.name}`;
                        details.appendChild(summary);

                        const sublist = document.createElement('ul');
                        this.render_browser(file.items, sublist);
                        details.appendChild(sublist);
                        li.appendChild(details);

                        const isOpen = sessionStorage.getItem(file.path);
                        if (isOpen === 'true') {
                            details.setAttribute('open', '');
                        }

                        // Opslaan van de staat wanneer de directory wordt geopend/gesloten
                        details.addEventListener('toggle', () => {
                            const isOpen = details.hasAttribute('open');
                            sessionStorage.setItem(file.path, isOpen.toString());
                        });
                    }
                    parentElement.appendChild(li);
                });
            },
            destroy: function(){
                Draftsman.deregisterListener(this.renameListner);
                Draftsman.deregisterListener(this.reloadListner);
                Draftsman.deregisterListener(this.focusListner);
            }
        }
    });
});