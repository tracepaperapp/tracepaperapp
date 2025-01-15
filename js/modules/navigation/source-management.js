document.addEventListener('alpine:init', () => {
    Alpine.data('sourceManagement', function(){
        return {
            changes: [],
            conflict: false,
            drn: this.$persist("").using(sessionStorage),
            commitMessage: this.$persist("").using(sessionStorage),
            force: [],
            readyToCommit: false,
            last_pull: this.$persist("").using(sessionStorage),
            last_pull_raw: this.$persist(0).using(sessionStorage),
            commit_diff: {},
            diff: {},
            last_build: "",
            repo: null,
            commitModal: false,
            buildView: false,
            issues: [],
            builds: [],
            async init(){
                this.repo = await GitRepository.open();
                Draftsman.registerTask(this._list_changes.bind(this),0.2,"source-administration");
                Draftsman.registerTask(this.validate_model.bind(this),10,"model-validation");
                await this.update_build_log_list();
            },
            async validate_model(){
                this.issues = await Modeler.validate();
            },
            async revert_file(){
                let file = this.$el.getAttribute("file");
                await this.repo.revert(file);
                location.reload();
            },
            async revert_all(){
                if(!confirm("Remove all local changes, are you sure?")){return}
                for (let i = 0; i < this.changes.length; i++){
                    await this.repo.revert(this.changes[i].filePath);
                }
                await this.execute_diff();
                Draftsman.publishMessage("force-reload","");
                Draftsman.publishMessage("file-reverted","");
            },
            async start_commit(){
                this.commitModal = true;
                await this.execute_diff();
            },
            async commit_changes(){
                this.commitModal = false;
                try{
                    await this.repo.commit(this.commitMessage);
                    await Draftsman.sleep(1000);
                    await this.repo.push();
                    this.force = [];
                    this.readyToCommit = false;
                    this.diff = {};
                    await this.start_build();
                } catch(err){
                    console.log(err);
                }
            },
            async execute_diff(){
                this.readyToCommit = false;
                let changes = await this.repo.status(true);
                this.changes = changes.filter(x => x.status != "unmodified");
            },
            accept_mine(){
                let file = this.$el.getAttribute("file");
                if (this.force.includes(file)){
                    this.force = this.force.filter(x => x != file);
                }else{
                    this.force.push(file);
                }
            },
            async compare_diff(){
                let file = this.$el.getAttribute("file");
                let local = await this.repo.read(file);
                let remote = await this.repo.fetchRemoteFile(file);
                const diff = Diff.diffWords(local, remote);

                // Verwerk de verschillen voor de lokale file
                let localFileHighlighted = diff.map(part => {
                    if (part.added){
                        return `<span></span>`;
                    }   else {
                        return `<span>${part.value}</span>`;
                    }
                }).join('');

                // Verwerk de verschillen voor de remote file
                let remoteFileHighlighted = diff.map(part => {
                    if (part.added) {
                        return `<span class="bg-green-200">${part.value}</span>`;
                    } else if (part.removed){
                        return `<span class="bg-red-200">${part.value}</span>`;
                    }
                    return `<span>${part.value}</span>`;
                }).join('');
                this.diff = {
                    local: localFileHighlighted,
                    remote: remoteFileHighlighted,
                    file: file
                };
            },
            async _list_changes(){
                let changes = await this.repo.status();
                this.changes = changes.filter(x => x.status != "unmodified");
                this.conflict = changes.some(file => file.hasConflict);
                this.readyToCommit = this.changes.every(x => !x.hasConflict || this.force.includes(x.filePath));
                if (GitRepository.last_pull != 0){
                    if (this.last_pull_raw < GitRepository.last_pull){
                        Draftsman.publishMessage("force-reload","");
                    }
                    this.last_pull_raw = GitRepository.last_pull;
                }
                if (this.changes.length == 0){
                    this.commitModal = false;
                }
                this.commit_diff = GitRepository.commit_diff;
                this.last_pull = luxon.DateTime.fromMillis(this.last_pull_raw).toRelative();
            },
            async start_build(){
                let api = await API.initialize(true);
                let correlationId = Draftsman.uuidv4();

                let now = new Date();
                let year = now.getFullYear().toString();
                let month = (now.getMonth() + 1).toString().padStart(2, '0');
                let day = now.getDate().toString().padStart(2, '0');
                let hour = now.getHours().toString().padStart(2, '0');
                let minute = now.getMinutes().toString().padStart(2, '0');
                this.buildId = `${year}-${month}-${day}T${hour}:${minute}`;

                this.subscriptionId = await api.subscription("/prepared-statements/subscribe-track-and-trace.txt",{correlationId},this._track_build_request.bind(this));
                await api.mutation("/prepared-statements/start-build.txt",{drn: this.drn, buildId: this.buildId},true,true,correlationId);
            },
            open_last_build(){
                window.open('/build-log.html?drn=' + this.drn + ":" + this.buildId, '_blank');
            },
            _reset_last_build(){
                this.last_build = "";
            },
            _track_build_request(data){
                data = data["data"]["onTrace"];
                if(data.status == "success"){
                    this.last_build = this.drn + ":" + this.buildId;
                    setTimeout(this._reset_last_build.bind(this),60000);
                }
            },
            async update_build_log_list(){
                let api = await API.initialize(true);
                let data = await api.query("/prepared-statements/list-builds.txt",{key_begins_with:this.drn},true);
                this.builds = Draftsman.sortArrayByKey(data.data.Build.filter.resultset,"drn");
                this.builds.reverse();
            }
        }
    });
});