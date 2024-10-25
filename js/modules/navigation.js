
document.addEventListener('alpine:init', () => {
    Alpine.data('navigation', function(){
        return {
            navigation: this.$persist("").using(sessionStorage),
            tabs: this.$persist([]).using(sessionStorage),
            issuesView: false,
            navigationElementActive: function(){
                let navigation = this.$el.getAttribute("navigation");
                let type = this.$el.getAttribute("navigation-type");
                let file_type = Modeler.determine_type(this.navigation);

                // temp testcode
                if (!["readme"].includes(file_type)){
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
                this.navigation = this.$el.getAttribute("navigation");
                Draftsman.publishMessage("force-reload",this.navigation);
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
            }
        }
    });
})