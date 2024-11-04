document.addEventListener('alpine:init', () => {
    Alpine.data('contextManagement', function(){
        return {
            drn: this.$persist("").using(sessionStorage),
            fullName: "",
            profileModal: false,
            projects: this.$persist([]).as("projectList"),
            projectModal: false,
            githubAccount: this.$persist(""),
            newProject: this.$persist({}).using(sessionStorage),
            newProjectModal: false,
            deferredInstallPrompt: false,
            raw_data: {},
            traces: [],
            offline: false,
            async init(){
                window.addEventListener('beforeinstallprompt', (e) => {
                  e.preventDefault();
                  this.deferredInstallPrompt = e;
                  console.log(this.deferredInstallPrompt);
                });

                let api = await API.initialize(true);
                try{
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

                    // Fetch git-proxy token (every 25 minutes)
                    Draftsman.registerTask(this._fetch_token.bind(this),1500,"repo-token-refresher");

                    // Prepare new project command
                    if (!this.newProject.workspaceDrn){
                        this.newProject.workspaceDrn = this.raw_data.workspace.at(0).drn;
                    }

                    // Initialize project if non is found or ask to open a project
                    this.newProjectModal = this.projects.length == 0
                    if (!this.newProjectModal && !this.drn){
                        this.projectModal = true;
                    }
                } catch(err) {
                    this.offline = true;
                    this.projects.forEach(p => {
                        checkIfDatabaseExists(p.repo.replace('https://github.com/','')).then(exists => {
                            p.available = exists;
                        });
                    });
                }
                if (sessionStorage.force_reload){
                    console.log("Force reload!");
                    sessionStorage.removeItem("force_reload");
                    await Draftsman.sleep(500);
                    location.reload();
                }
            },
            async install(){
                this.deferredInstallPrompt.prompt();
                const {outcome} = await this.deferredInstallPrompt.userChoice;
                // Optionally, send analytics event with outcome of user choice
                console.log(`User response to the install prompt: ${outcome}`);
                this.deferredInstallPrompt = !("accepted" == outcome);
            },
            async create_user(){
                this.profileModal = false;
                this.traces.push({
                    name: "Create personal workspace",
                    status: "info",
                    message: "Preparing your personal workspace, one moment please..."
                });
                setTimeout(this._remove_first_trace.bind(this),5000);
                let api = await API.initialize(true);
                let correlationId = Draftsman.uuidv4();
                this.subscriptionId = await api.subscription("/prepared-statements/subscribe-track-and-trace.txt",{correlationId},this._track.bind(this));
                console.log(this.subscriptionId);
                await api.mutation("/prepared-statements/create-user.txt",{fullName: this.fullName},true,true,correlationId);
            },
            async open_project(){
                this.drn = this.$el.getAttribute("drn");
                sessionStorage.removeItem('proxyToken');
                sessionStorage.project_name = this.projects.filter(x => x.drn == this.drn).at(0).name;
                sessionStorage.project_url = this.projects.filter(x => x.drn == this.drn).at(0).repo;
                sessionStorage.branch = "main";
                sessionStorage.force_reload = "true";
                if (this.offline){
                    sessionStorage.proxyToken = "dummy";
                }
                await Draftsman.sleep(100);
                location.reload();
            },
            prepare_repos(){
                let base = `https://github.com/${this.githubAccount}/${this.newProject.name.toLowerCase()}`;
                this.newProject.modelRepo = base + "-model";
                this.newProject.codeRepo = base + "-backend";
                this.newProject.guiRepo = base + "-gui";
            },
            create_repo(){
                let repo = this.$el.getAttribute("repo");
                let url = `https://github.com/new?name=${repo.split('/').at(-1)}&owner=${this.githubAccount}&visibility=private`;
                window.open(url, '_blank');
            },
            invite_draftsman(){
                let repo = this.$el.getAttribute("repo");
                let url = repo + "/settings/access";
                window.open(url, '_blank');
            },
            async start_new_project(){
                this.newProjectModal = false;
                this.traces.push({
                    name: "Create project",
                    status: "info",
                    message: "Preparing project, one moment please..."
                });
                setTimeout(this._remove_first_trace.bind(this),5000);
                let api = await API.initialize(true);
                let correlationId = Draftsman.uuidv4();
                this.subscriptionId = await api.subscription("/prepared-statements/subscribe-track-and-trace.txt",{correlationId},this._track.bind(this));
                console.log(this.subscriptionId);
                await api.mutation("/prepared-statements/initialize-project.txt",this.newProject,true,true,correlationId);
                this.drn = this.newProject.workspaceDrn + ":" + this.newProject.name;
                sessionStorage.removeItem('proxyToken');
                sessionStorage.project_name = this.newProject.name;
                sessionStorage.project_url = this.newProject.modelRepo;
            },
            async _fetch_token(){
                if (this.drn){
                    console.log("Refresh token!");
                    let api = await API.initialize(true);
                    let data = await api.query("/prepared-statements/fetch-repo-token.txt",{projectDrn:this.drn},true);
                    sessionStorage.proxyToken = data.data.RepositoryToken.get.token;
                    sessionStorage.privelige = JSON.parse(atob(sessionStorage.proxyToken)).scope.privelige;
                }
            },
            _remove_first_trace(){
                this.traces.shift();
            },
            async _track(data){
                data = data["data"]["onTrace"];
                if (data.status != "success" && data.status != "error"){
                    return;
                }
                this.traces.push({
                    name: data.command ? data.command : data.event,
                    status: data.status,
                    message: data.message
                });
                setTimeout(this._remove_first_trace.bind(this),5000);
                if (data.command == "SetupWorkspace-Notifier" && data.status == "success"){
                    Draftsman.signOut();
                }
                if (data.command == "Project.Create" && data.status == "success"){
                    await Draftsman.sleep(3000);
                    location.reload();
                }
            }
        }
    });
});

function checkIfDatabaseExists(dbName) {
  return new Promise((resolve, reject) => {
    // Probeer de database te openen zonder deze te creëren
    const request = indexedDB.open(dbName);

    request.onsuccess = function () {
      // Database bestaat, dus sluit deze
      request.result.close();
      resolve(true);
    };

    request.onerror = function () {
      // Database bestaat niet of er is een andere fout opgetreden
      resolve(false);
    };

    request.onupgradeneeded = function () {
      // Deze event wordt alleen getriggerd als de database niet bestond of een upgrade nodig is
      request.transaction.abort(); // Annuleer de transactie
      resolve(false);
    };
  });
}