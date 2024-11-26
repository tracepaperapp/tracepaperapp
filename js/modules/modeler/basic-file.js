document.addEventListener('alpine:init', () => {
    Alpine.data('basicFile', function(){
        return {
            content: "",
            path: "",
            repo: null,
            _taskId: "",
            listnerId: "",
            newName: "",
            duplicateName: false,
            initialized: false,
            async init(){
                this.repo = await GitRepository.open();
                this.path = this.$el.getAttribute("file");
                this.newName = this.path.split("/").at(1).split(".").at(0);
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("content",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            render_editor(){
                let completions = new CodeCompletions();
                //completions.add_items(this.model.input.map(x => `arguments["${x.att_name}"]`));
                Draftsman.codeEditor(this.$el,this.content,this._update_code.bind(this),completions);
            },
            async check_name(){
                let files = await this.repo.list(x => x == "lib/" + this.newName + ".py");
                this.duplicateName = files.length != 0;
            },
            _update_code(code){
                this.content = code;
            },
            async read(){
                this.initialized = false;
                this.path = this.$el.getAttribute("file");
                this.content = await this.repo.read(this.path);
                this.initialized = true;
            },
            async rename(){
                if(this.lock){return}
                await this._execute_save();
                this.lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.path,"lib/" + this.newName + ".py");
            },
            async delete_model(){
                await Modeler.delete_model(this.path);
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async _execute_save(){
                if(this.lock){return}
                await this.repo.write(this.path,this.content);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});