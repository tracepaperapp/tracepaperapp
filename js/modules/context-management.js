document.addEventListener('alpine:init', () => {
    Alpine.data('contextManagement', function(){
        return {
            drn: this.$persist("").using(sessionStorage),
            fullName: "",
            profileModal: false,
            projects: [],
            projectModal: false,
            newProject: this.$persist({}).using(sessionStorage),
            newProjectModal: false,
            raw_data: {},
            traces: [],
            async init(){
                let api = await API.initialize(true);

                // Fetch user context
                let data = await api.query("/prepared-statements/get-user-context.txt",{username:sessionStorage.username},true);
                this.projects = [];
                this.raw_data = data.data.User.get;
                if(!this.raw_data){
                    this.profileModal = true;
                    return;
                }
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

                // Prepare new project command
                if (!this.newProject.workspaceDrn){
                    this.newProject.workspaceDrn = this.raw_data.workspace.at(0).drn;
                }
            },
            async create_user(){
                this.profileModal = false;
                this.traces.push({
                    name: "Create personal workspace",
                    status: "info",
                    message: "Preparing your personal workspace, one moment please..."
                });
                setTimeout(this._remove_first_trace.bind(this),8000);
                let api = await API.initialize(true);
                let correlationId = Draftsman.uuidv4();
                this.subscriptionId = await api.subscription("/prepared-statements/subscribe-track-and-trace.txt",{correlationId},this._track_create_user.bind(this));
                console.log(this.subscriptionId);
                await api.mutation("/prepared-statements/create-user.txt",{fullName: this.fullName},true,true,correlationId);
            },
            async open_project(){
                this.drn = this.$el.getAttribute("drn");
                sessionStorage.removeItem('proxyToken');
                sessionStorage.project_name = this.projects.filter(x => x.drn == this.drn).at(0).name;
                sessionStorage.project_url = this.projects.filter(x => x.drn == this.drn).at(0).repo;
                await Draftsman.sleep(100);
                location.reload();
            },
            async start_new_project(){

            },
            async _fetch_token(){
                if (this.drn){
                    console.log("Refresh token!");
                    let api = await API.initialize(true);
                    let data = await api.query("/prepared-statements/fetch-repo-token.txt",{projectDrn:this.drn},true);
                    sessionStorage.proxyToken = data.data.RepositoryToken.get.token;
                }
            },
            _remove_first_trace(){
                this.traces.shift();
            },
            async _track_create_user(data){
                data = data["data"]["onTrace"];
                if (data.status != "success" && data.status != "error"){
                    return;
                }
                this.traces.push({
                    name: data.command ? data.command : data.event,
                    status: data.status,
                    message: data.message
                });
                setTimeout(this._remove_first_trace.bind(this),8000);
                if (data.command == "SetupWorkspace-Notifier" && data.status == "success"){
                    Draftsman.signOut();
                }
            }
        }
    });
});