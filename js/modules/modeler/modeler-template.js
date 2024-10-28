document.addEventListener('alpine:init', () => {
    Alpine.data('modelFile', function(){
        return {
            model: {},
            _taskId: "",
            listnerId: "",
            preparedRename: {},
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async read(){
                await Draftsman.sleep(10);
                this.path = this.$el.getAttribute("file");
                this.model = await Modeler.get_model(this.path);
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async delete_model(){
                let file = ``;
                await Modeler.delete_model(file);
            },
            async prepare_change_name(){
                this.preparedRename = {
                    dummydata: "",
                    oldPath: `dummy/dummy/dummy.xml`,
                    newPath: `dummy/dummy/dummy2.xml`,
                };
                let repo = await GitRepository.open();
                let files = await repo.list();
                this.preparedRename.force = files.includes(this.preparedRename.newPath);
                this.preparedRename.init = true;
            },
            cancel_rename(){
                this.preparedRename = {};
                // revert model name
            },
            async rename(){
                this.preparedRename.init = false;
                if(this.lock){return}
                // alter name in model
                await this._execute_save();
                this.lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.preparedRename.oldPath,this.preparedRename.newPath);
            },
            async _execute_save(){
                if(this.lock){return}
                await Modeler.save_model(this.path,this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});