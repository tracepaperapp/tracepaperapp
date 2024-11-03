document.addEventListener('alpine:init', () => {
    Alpine.data('aggregateRoot', function(){
        return {
            model: null,
            _taskId: "",
            listnerId: "",
            newName: "",
            newSubdomain: "",
            subdomain: "",
            duplicateName: false,
            entities: [],
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async read(){
                await Draftsman.sleep(10);
                this.model = await Modeler.get_model(this.navigation);
                this.newName = this.model.att_name;
                this.subdomain = this.navigation.split("/").at(1);
                this.newSubdomain = this.subdomain;
                let repo = await GitRepository.open();
                this.entities = await repo.list(x => x.startsWith(this.navigation.replace("root.xml","entities/")) && x.endsWith(".xml"));
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
            async add_entity(){
                let name = Draftsman.generateRandomCamelCaseString();
                let path = this.navigation.replace("root.xml","entities/" + name + ".xml");
                Modeler._roots[path] = "nested-object";
                await Modeler.save_model(path,{
                    att_name: name,
                    "att_business-key": ""
                });
                this.navigate(this.navigation);
            },
            async delete_model(){
                try{
                    let dir = this.navigation.replace("root.xml","");
                    let repo = await GitRepository.open();
                    await repo.deleteDirectory(dir);
                } finally {
                    await Draftsman.sleep(100);
                    Draftsman.publishMessage("file-reverted",this.navigation);
                }
            },
            async check_name(){
                let repo = await GitRepository.open();
                let files = await repo.list(x => x.endsWith(this.newSubdomain + "/" + this.newName + "/root.xml"));
                this.duplicateName = files.length > 0;
            },
            async rename(){
                let oldName = this.model.att_name;
                this.model.att_name = this.newName;
                await this._execute_save();
                this.lock = true;
                await Draftsman.sleep(10);
                let force_reload = this.subdomain != this.newSubdomain;
                let sourcePath = this.navigation.replace("root.xml","");
                let targetPath = sourcePath.replace(`/${this.subdomain}/${oldName}/`,`/${this.newSubdomain}/${this.newName}/`);
                let repo = await GitRepository.open();
                await repo.moveDirectory(sourcePath,targetPath);
                await Draftsman.sleep(100);
                Draftsman.publishMessage("file-renamed",{
                    oldPath: sourcePath + "root.xml",
                    newPath: targetPath + "root.xml"
                });
                if (force_reload){
                    Draftsman.sleep(500);
                    location.reload();
                }
            },
            async _execute_save(){
                if(this.lock){return}
                let model = JSON.parse(JSON.stringify(this.model));
                model.field = model.field.filter(x => !x.deleted);
                await Modeler.save_model(this.navigation,this.model);
                this.model = model;
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});