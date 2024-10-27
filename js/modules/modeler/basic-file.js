document.addEventListener('alpine:init', () => {
    Alpine.data('basicFile', function(){
        return {
            content: "",
            path: "",
            repo: null,
            _taskId: "",
            listnerId: "",
            async init(){
                this.repo = await GitRepository.open();
                this.path = this.$el.getAttribute("file");
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("content",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async read(){
                this.path = this.$el.getAttribute("file");
                this.content = await this.repo.read(this.path);
                await Draftsman.sleep(10);
                await Diagram.node_diagram(this.path,"node-diagram");
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                await this.repo.write(this.path,this.content);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});