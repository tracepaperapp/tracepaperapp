document.addEventListener('alpine:init', () => {
    Alpine.data('viewModel', function(){
        return {
            model: Modeler.prepare_model("view",{}),
            selectedTab: this.$persist({}).using(sessionStorage).as("notifierTab"),
            _taskId: "",
            listnerId: "",
            search: "",
            newName: "",
            newPath: "",
            duplicateName: false,
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.reload.bind(this));
                if (!(this.navigation in this.selectedTab)){
                    this.selectedTab[this.navigation] = 1;
                }
            },
            async reload(){
                this.view_lock = true;
                try {
                    await this.read();
                } finally {
                    await Draftsman.sleep(100);
                    this.view_lock = false;
                }
            },
            async read(){
                await Draftsman.sleep(10);
                this.model = await Modeler.get_model(this.navigation);
                this.newName = this.model.att_name;
                this.newPath = this.navigation.replace("views/","").replace("/" + this.model.att_name + ".xml","");
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
            },
            async delete_model(){
                await Modeler.delete_model(this.navigation);
            },
            async check_name(){
                let repo = await GitRepository.open();
                if (!viewPathRegex.test(this.newPath)){
                    this.duplicateName = true;
                    return;
                }
                let files = await repo.list(x => x.endsWith("views/" + this.newPath + "/" + this.newName + ".xml"));
                this.duplicateName = files.length > 0;
            },
            async rename(){
                if(this.view_lock){return}
                if (!viewPathRegex.test(this.newPath) || !pascalCaseRegex.test(this.newName)){return}
                // alter name in model
                let newPath = "views/" + this.newPath + "/" + this.newName + ".xml";
                this.model.att_name = this.newName;
                await this._execute_save();
                this.view_lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.navigation,newPath);
            },
            async _execute_save(){
                if(this.view_lock){return}
                await Modeler.save_model(this.navigation,this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
    Alpine.data("viewData", function(){
        return {
            fields: [],
            relations: [],
            views: [],
            fkeys: [],
            types: ['String', 'Int', 'Float', 'Boolean','StringList'],
            relation_types: ["ObjectList", "OneToMany", "ManyToOne", "OneToOne", "ManyToMany"],
            async init(){
                this.$watch("model",this.prepare_data.bind(this));
                let repo = await GitRepository.open();
                let views = await repo.list(x => x.startsWith("views/") && x.endsWith(".xml"));
                this.views = views.map(x => x.split("/").at(-1).replace(".xml",""));
            },
            prepare_data(){
                this.fields = this.model.field.filter(x => this.types.includes(x.att_type));
                this.relations = this.model.field.filter(x => this.relation_types.includes(x.att_type));
                this.fkeys = this.fields.filter(x => x.att_type == "String").map(x => x.att_name);
            },
            add_field(){
                this.model.field.push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    att_type: "String"
                });
            }
        }
    });
});