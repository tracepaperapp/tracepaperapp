document.addEventListener('alpine:init', () => {
    Alpine.data('navigation', function(){
        return {
            navigation: this.$persist("db-example-page").using(sessionStorage),
            navigationElementActive: function(){
                let navigation = this.$el.getAttribute("navigation");
                return navigation == this.navigation ? 'active' : ''
            },
            navigate: function(){
                this.navigation = this.$el.getAttribute("navigation");
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