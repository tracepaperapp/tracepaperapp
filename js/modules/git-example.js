document.addEventListener('alpine:init', () => {
    Alpine.data('gitModule', function(){
        return {
            documentation: [],
            changes: [],
            unpushedCommits: 0,
            showModal: false,
            commitModal: false,
            conflict: false,
            commitMessage: this.$persist(""),
            selected: this.$persist("README.md"),
            newFile: this.$persist({path: "example.md", content: "#Hello World!\n\nContent here..."}),
            force: [],
            readyToCommit: false,
            last_pull: this.$persist(""),
            last_pull_raw: this.$persist(0),
            commit_diff: {},
            diff: {},
            repo: null,
            async init(){
                console.log("Init");
                sessionStorage.proxyToken = "eyJzY29wZSI6IHsidXJsIjogImh0dHBzOi8vZ2l0aHViLmNvbS9ib2hhbnNzZW4vYXNzaXN0ZHVtbXlyZXBvLW1vZGVsIiwgInByaXZlbGlnZSI6ICJ3cml0ZSIsICJleHBpcmF0aW9uIjogMTgxNTk0MDg0Ny41NzY5NzU4fSwgImNoZWNrc3VtIjogIjY5MzNiZDhmZmE2NjQ2MzFiZTA3YjQyNzhmMjM4MzdlIn0=";
                let repo = await GitRepository.open("https://github.com/bohanssen/assistdummyrepo-model");
                this.repo = repo;
                await this._reload_gui();
                Draftsman.registerTask(this._list_changes.bind(this),1);
                this.unpushedCommits = await this.repo.hasUnpushedChanges();
            },
            async load_content(){
                let file = this.$el.getAttribute("file");
                let content = await this.repo.read(file);
                content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
                this.$el.value = content;
            },
            async save_content(){
                let file = this.$el.getAttribute("file");
                let content = this.$el.value;
                let hist = await this.repo.read(file);
                if (hist != content){
                    await this.repo.write(file,content);
                }
            },
            async save_new_item(){
                this.showModal = false;
                await this.repo.write(this.newFile.path,this.newFile.content);
                await this._reload_gui();
                this.newFile.path = "example.md";
                this.newFile.content = "# Hello World!\n\nContent here..."
            },
            async delete_file(){
                let file = this.$el.getAttribute("file");
                await this.repo.delete(file);
                await this._reload_gui();
            },
            async revert_file(){
                let file = this.$el.getAttribute("file");
                await this.repo.revert(file);
                await this._reload_gui();
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
                if (GitRepository.last_pull != 0 && this.last_pull_raw != GitRepository.last_pull){
                    await this._reload_gui();
                }
                if (GitRepository.last_pull != 0){
                    this.last_pull_raw = GitRepository.last_pull;
                }
                this.commit_diff = GitRepository.commit_diff;
                this.last_pull = luxon.DateTime.fromMillis(this.last_pull_raw).toRelative();
            },
            async _reload_gui(){
                this.documentation = [];
                let files = await this.repo.list();
                this.documentation = files.filter(x => x.endsWith(".md"));
            }
        }
    });
});