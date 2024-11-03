document.addEventListener('alpine:init', () => {
    Alpine.data('aggregateEntity', function(){
        return {
            model: null,
            _taskId: "",
            path: "",
            listnerId: "",
            newName: "",
            duplicateName: false,
            async init(){
                this.path = this.$el.getAttribute("file");
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async read(){
                await Draftsman.sleep(10);
                this.model = await Modeler.get_model(this.path);
                this.newName = this.model.att_name;
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            add_field(){
                this.model.field.push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    att_type: "String"
                });
            },
            async delete_model(){
                this.lock = true;
                await Modeler.delete_model(this.path);
            },
            async check_name(){
                let repo = await GitRepository.open();
                let newPath = this.path.split("/entities/").at(0) + "/entities/" + this.newName + ".xml";
                let files = await repo.list(x => x == newPath);
                this.duplicateName = files.length > 0;
            },
            async rename(){
                if(this.lock){return}
                let newPath = this.path.split("/entities/").at(0) + "/entities/" + this.newName + ".xml";
                this.model['att_name'] = this.newName;
                await this._execute_save();
                this.lock = true;
                let repo = await GitRepository.open();
                console.log(await repo.rename(this.path,newPath,true));
                this.navigate(this.navigation);
            },
            async _execute_save(){
                if(this.lock){return}
                let hash = Draftsman.generateFingerprint(this.model);
                if (hash == this.hash){return}
                this.hash = hash;
                console.log("save",this.path);
                try{
                    this.lock = true;
                    let model = JSON.parse(JSON.stringify(this.model));
                    model.field = model.field.filter(x => !x.deleted);
                    await Modeler.save_model(this.path,model);
                    this.model = model;
                } finally {
                    await Draftsman.sleep(10);
                    this.lock = false;
                }
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});