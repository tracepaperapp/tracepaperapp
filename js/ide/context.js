
window.Context = {
    reload: async function(){
        await sleep(1000);
        await Draftsman.force_reload_data();
        await sleep(10);
        load_context();
    },
    open_workspace: function(event){
        let workspace = get_attribute(event,"name");
        localStorage.workspace = workspace;
        context.selected_workspace = context.workspace.filter(x => x.name == localStorage.workspace).at(0);
    },
    open_project: function(event){
        Session.reload_from_disk(get_attribute(event,"drn"));
        load_context();
    },
    close_workspace: function(){
        delete context.selected_workspace;
        localStorage.removeItem("workspace");
    },
    close_project: function(){
        delete context.selected_project;
        localStorage.removeItem("project");
        Session.reload_from_disk("");
        checked_out_repository = "";
    }
}

document.addEventListener('draftsman:initialized', async () => {
    load_context();
    if (!context.repository){
        session.initialized = true;
    }
});

function load_context(){
    if (Alpine.store("context").get != null){
        Object.assign(context,Alpine.store("context").get);
    }
    if (localStorage.workspace && context.workspace){
        context.selected_workspace = context.workspace.filter(x => x.name == localStorage.workspace).at(0);
    }
    if (localStorage.project && context.selected_workspace){
        context.selected_project = context.selected_workspace.projects.filter(x => x.drn == localStorage.project).at(0);
    }
    if (context.selected_project){
        context.repository = context.selected_project.repositories.filter(x => x.name == "model").at(0).url;
    }
    document.dispatchEvent(new CustomEvent('tracepaper:context:changed'));
}