
document.addEventListener('alpine:init', () => {
    Alpine.data('navigation', function(){
        return {
            navigation: this.$persist("").using(sessionStorage),
            navigationFile: this.$persist("").using(sessionStorage),
            tabs: this.$persist([]).using(sessionStorage),
            issuesView: false,
            async init(){
                if (!sessionStorage.project_url && localStorage.session){
                    let items = JSON.parse(localStorage.session);
                    items.forEach(item => {
                        sessionStorage.setItem(item.key,item.value);
                    });
                    location.reload();
                }
                Draftsman.registerTask(this._save_session.bind(this),10,"save-session");
                this.listnerId = Draftsman.registerListener("file-renamed",this._handle_rename.bind(this));
                this.tabCleanupId = Draftsman.registerListener("file-reverted",this.cleanup_tabs.bind(this));
                await this.cleanup_tabs(false);
                Draftsman.registerTask(Diagram.prepare_data,30,"prepare-diagram-data");
            },
            async cleanup_tabs(cascade=true){
                let repo = await GitRepository.open();
                let files = await repo.list();
                files.push("/diagram","/dummy")
                if (this.tabs.length != 0){
                    this.tabs = this.tabs.filter(x => files.includes(x));
                }
                if (this.navigation == "" || this.tabs.length == 0) {
                    this.navigation = "README.md";
                    this.tabs = ["README.md"];
                }
                if (!files.includes(this.navigation)){
                    this.navigation = this.tabs.at(-1);
                }
                if (cascade){
                    Draftsman.publishMessage("force-reload",this.navigation);
                }
            },
            _save_session(){
                if (!sessionStorage.project_url){return}
                if (document.visibilityState !== "visible"){return}
                const items = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    const value = sessionStorage.getItem(key);
                    if (value == 'false'){
                        continue;
                    }
                    items.push({ key, value });
                }
                localStorage.session = JSON.stringify(items);
            },
            navigationElementActive: function(){
                let navigation = this.$el.getAttribute("navigation");
                let type = this.$el.getAttribute("navigation-type");
                let file_type = Modeler.determine_type(this.navigation);

                // temp testcode
                if (!["readme","diagram","command"].includes(file_type) && navigation != this.navigation){
                    file_type = "dummy";
                }

                if (type && type == file_type){
                    return "active";
                } else if (navigation == this.navigation){
                    return "active";
                } else {
                    return "";
                }
            },
            navigate: function(){
                this.issuesView = false;
                let navigation = this.$el.getAttribute("navigation");
                if (!navigation.endsWith(".xml") && !navigation.endsWith(".md") && !["/diagram"].includes(navigation)){
                    navigation += "/root.xml";
                }
                this.navigation = navigation;
                Draftsman.publishMessage("force-reload",this.navigation);
                this.update_tabs();
            },
            open_diagram: function(){

                console.log(this.$el);
                let request = this.$el.getAttribute("navigation") + ";";
                request += this.$el.getAttribute("radius");
                sessionStorage.diagramRequest = request;
                this.navigation = "/diagram";
                this.update_tabs();
            },
            update_tabs: function(){
                let tabs = [...this.tabs];
                if (!tabs.includes(this.navigation)){
                    if (tabs.length > 5){
                        tabs.shift();
                    }
                    tabs.push(this.navigation);
                }
                this.tabs = tabs;
            },
            close_tab: function(){
                this.$event.preventDefault();
                let tab = this.$el.getAttribute("navigation");
                this.tabs = this.tabs.filter(x => x != tab);
                if (this.navigation == tab && this.tabs.length != 0){
                    this.navigation = this.tabs.at(-1);
                    Draftsman.publishMessage("force-reload",this.navigation);
                } else if (this.tabs.length == 0){
                    this.navigation = "README.md";
                    this.tabs = [this.navigation];
                    Draftsman.publishMessage("force-reload",this.navigation);
                }
            },
            get_name: function(){
                let path = this.$el.getAttribute("navigation");
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
            clear_cache: async function(){
                let api = await API.initialize();
                await api.clear_cache();
                location.reload();
            },
            clear_storage: async function(){
                if(confirm("All local data wil be removed")){
                    // 1. Clear localStorage
                      localStorage.clear();
                      console.log("localStorage cleared");

                      // 2. Clear sessionStorage
                      sessionStorage.clear();
                      console.log("sessionStorage cleared");

                      // 3. Clear all IndexedDB databases
                      const databases = await indexedDB.databases();
                      databases.forEach(db => {
                        indexedDB.deleteDatabase(db.name);
                        console.log(`IndexedDB '${db.name}' deleted`);
                      });
                      console.log("All storage cleared.");
                      location.reload();
                }
            },
            _handle_rename: function(message){
                console.log(message);
                this.tabs = this.tabs.filter(x => x != message.oldPath);
                this.navigation = message.newPath;
                this.update_tabs();
            },
            destroy: function(){
                Draftsman.deregisterListener(this.listnerId);
                Draftsman.deregisterListener(this.tabCleanupId);
            },
            editing_enabled: function(){
                return sessionStorage.privelige == "write";
            },
            editing_disabled: function(){
                return sessionStorage.privelige != "write";
            }
        }
    });
})