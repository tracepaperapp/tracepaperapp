document.addEventListener('alpine:init', () => {
    Alpine.data('modelFile', function(){
        return {
            model: null,
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
                this.model = await Modeler.get_model(this.navigation);
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async delete_model(){
                let file = ``;
                await Modeler.delete_model(file);
            },
            async rename(){
                if(this.lock){return}
                // alter name in model
                await this._execute_save();
                this.lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.preparedRename.oldPath,this.preparedRename.newPath);
            },
            async _execute_save(){
                if(this.lock){return}
                let model = JSON.parse(JSON.stringify(this.model));
                // e.g. model.field = model.field.filter(x => !x.deleted);
                await Modeler.save_model(this.navigation,model);
                this.model = model;
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});