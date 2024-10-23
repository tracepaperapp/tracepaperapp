document.addEventListener('alpine:init', () => {
    Alpine.data('sourceManagement', function(){
        return {
            changes: [],
            unpushedCommits: 0,
            conflict: false,
            commitMessage: this.$persist(""),
            force: [],
            readyToCommit: false,
            last_pull: this.$persist(""),
            last_pull_raw: this.$persist(0),
            commit_diff: {},
            diff: {},
            repo: null,
            async init(){
                let repo = await GitRepository.open();
                this.repo = repo;
                Draftsman.registerTask(this._list_changes.bind(this),0.2,"source-administration");
                this.unpushedCommits = await this.repo.hasUnpushedChanges();
            },
            async revert_file(){
                let file = this.$el.getAttribute("file");
                await this.repo.revert(file);
                await this.execute_diff();
            },
            async commit_changes(){
                this.commitModal = false;
                this.repo.commit(this.commitMessage);
                await Draftsman.sleep(1000);
                this.unpushedCommits = await this.repo.hasUnpushedChanges();
            },
            async push_commits(){
                console.log(await this.repo.push());
                this.unpushedCommits = 0;
                this.force = [];
                this.readyToCommit = false;
            },
            async execute_diff(){
                this.readyToCommit = false;
                this.commitModal = true;
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
                    remote: remoteFileHighlighted
                };
            },
            async _list_changes(){
                let changes = await this.repo.status();
                this.changes = changes.filter(x => x.status != "unmodified");
                this.conflict = changes.some(file => file.hasConflict);
                this.readyToCommit = this.changes.every(x => !x.hasConflict || this.force.includes(x.filePath));
                if (GitRepository.last_pull != 0){
                    this.last_pull_raw = GitRepository.last_pull;
                }
                this.commit_diff = GitRepository.commit_diff;
                this.last_pull = luxon.DateTime.fromMillis(this.last_pull_raw).toRelative();
            }
        }
    });
});