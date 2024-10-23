document.addEventListener('alpine:init', () => {
    Alpine.data('contextManagement', function(){
        return {
            drn: this.$persist(""),
            projects: [],
            projectModal: false,
            raw_data: {},
            async init(){
                let api = await API.initialize(true);

                // Fetch user context
                let data = await api.query("/prepared-statements/get-user-context.txt",{username:sessionStorage.username});
                this.projects = [];
                this.raw_data = data.data.User.get;
                this.raw_data.workspace.forEach(w => {
                    w.projects.forEach(p => {
                        this.projects.push({
                            name: p.name,
                            drn: p.drn,
                            workspace: w.name,
                            repo: p.repositories.filter(x => x.name == "model").at(0).url
                        });
                    });
                });

                // Fetch git-proxy token
                Draftsman.registerTask(this._fetch_token.bind(this),1500,"repo-token-refresher");
            },
            async open_project(){
                this.drn = this.$el.getAttribute("drn");
                sessionStorage.removeItem('proxyToken');
                localStorage.project_name = this.projects.filter(x => x.drn == this.drn).at(0).name;
                localStorage.project_url = this.projects.filter(x => x.drn == this.drn).at(0).repo;
                await Draftsman.sleep(100);
                location.reload();
            },
            async _fetch_token(){
                if (this.drn){
                    console.log("Refresh token!");
                    let api = await API.initialize(true);
                    let data = await api.query("/prepared-statements/fetch-repo-token.txt",{projectDrn:this.drn},true);
                    sessionStorage.proxyToken = data.data.RepositoryToken.get.token;
                }
            }
        }
    });
});