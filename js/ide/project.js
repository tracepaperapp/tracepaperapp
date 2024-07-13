
var projects = {};
var context = {};

function get_navigation_item(file){
    return {
       name: file.split("/").at(-1).replace(".xml",""),
       type: "file",
       path: file
   }
}

function get_parent(path){
    let i = path.lastIndexOf("/");
    return path.substring(0, i);
}

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

window.Project = {
    list: function(data){
        context = data.get;
        let project_menu = [];
        context.workspace.forEach(workspace => {
            workspace.projects.forEach(project => {
                let item = {
                    name: project.name,
                    drn: project.drn,
                    workspace: workspace.name
                }
                project_menu.push(item);
                projects[project.drn] = project;
            });
        });
        return project_menu
    },
    open: function(drn){
        let project = projects[drn];
        localStorage.project_drn = drn;
        localStorage.project_name = project.name;
        localStorage.project_repo = project.repositories.filter(x => x.name == "model").at(0).url;
        location.reload(true);
    },
    get: function(){
        return projects[localStorage.project_drn];
    },
    force_open: function(workspace,name,repo){
        localStorage.project_drn = workspace + ":" + name;
        localStorage.project_name = name;
        localStorage.project_repo = repo;
        location.reload(true);
    },
    get_files: async function(){
        if (!("" in directories)){
            directories[""] = [];
        }
        let items = directories[""];

        let files = await FileSystem.listFiles();
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
        return items;
    },
    get_attribute_sources: async function(){
        let sources = {
            commands: [],
            aggregates: []
        };

        let files = await FileSystem.listFiles();
        files.forEach(file => {
            if (file.startsWith("commands/") && file.endsWith(".xml")){
                let name = file.split("/").at(-1).replace("Requested.xml","");
                sources["commands"].push({
                    type: 'command',
                    name: name,
                    file: file
                });
            }

            if (file.startsWith("domain/") && file.endsWith(".xml")){
                if (file.endsWith("root.xml")){
                    let name = file.split("/").at(-2);
                    sources["aggregates"].push({
                        type: 'aggregate',
                        name: name + " - root",
                        file: file
                    });
                }
                if (file.includes("entities") && file.endsWith(".xml")){
                    let name = file.split("/").at(-3);
                    let entity = file.split("/").at(-1).replace(".xml","");
                    sources["aggregates"].push({
                        type: 'aggregate',
                        name: name + " - " + entity,
                        file: file
                    });
                }
            }
        });
        return sources;
    },
    create: function(){
        localStorage.project_drn = "";
        localStorage.project_name = "";
        localStorage.project_repo = "";
        sessionStorage.new_project = true;
        location.reload(true);
    }
};
