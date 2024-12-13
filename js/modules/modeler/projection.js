document.addEventListener('alpine:init', () => {
    Alpine.data('projectionModel', function(){
        return {
            model: Modeler.prepare_model("projection",{}),
            selectedTab: this.$persist({}).using(sessionStorage).as("projectionTab"),
            _taskId: "",
            listnerId: "",
            search: "",
            newName: "",
            newPath: "",
            views: [],
            duplicateName: false,
            initialized: false,
            add_parameter(){
                this.model.input.push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    att_type: "String",
                    att_required: "false",
                    att_id: Draftsman.makeid(6)
                });
            },
            render_editor(){
                let completions = new CodeCompletions();
                console.log(this.model);
                completions.add_items(this.model.input.map(x => `arguments["${x.att_name}"]`));
                Draftsman.codeEditor(this.$el,this.model.att_code,this._update_code.bind(this),completions);
            },
            _update_code(code){
                this.model.att_code = code.replaceAll("\n","|LB|");
            },
            async generate_code(){
                this.rendering = true;
                let code = "\nfrom draftsman.ViewStoreApi import Query\n\n";
                code += "def transform(arguments, username):\n\n";
                code += '\tprint(f"Handle graph request [{arguments}/{username}]")\n';
                this.model.input.forEach(input => {
                    code += `\t${input.att_name} = arguments["${input.att_name}"]\n`
                });

                let view = await Modeler.get_model_by_name(this.model.att_return,"views/");
                console.log(view);

                if (this.model['att_return-type'] == "result set"){
                    code += "\n\tquery = Query('ViewName').get_items()\n";
                    code += "\t# add filters\n\t#query = query.equals('key','value').between('key',0,100)\n";
                    code += "\tresults = query.run()\n";
                    code += "\treturn[{\n";
                } else {
                    code += "\n\tresult = Query('ViewName').get_item('FunctionalKey').run()\n"
                    code += "\treturn {\n"
                }

                const fields = view.field.filter(x => ['String', 'Int', 'Float', 'Boolean'].includes(x.att_type));
                fields.forEach((x, index) => {
                    if (index === fields.length - 1) {
                        code += `\t\t"${x.att_name}": result["<placeholder>"]\n`;
                    } else {
                        code += `\t\t"${x.att_name}": result["<placeholder>"],\n`;
                    }
                });

                if (this.model['att_return-type'] == "result set"){
                    code += "\t} for result in results]\n"
                } else {
                    code += "\t}\n"
                }
                this.model.att_code = code.replaceAll("\n","|LB|");
                await Draftsman.sleep(2000);
                this.rendering = false;
                this.navigate(this.navigation);
            },
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.reload.bind(this));
                if (!(this.navigation in this.selectedTab)){
                    this.selectedTab[this.navigation] = 2;
                }
                const urlParams = new URLSearchParams(window.location.search);
                const tab = urlParams.get('tab');
                console.log(tab)
                if (tab) {
                    this.selectedTab[this.navigation] = Number(tab);
                }
                let repo = await GitRepository.open();
                let views = await repo.list(x => x.startsWith("views/") && x.endsWith(".xml"));
                this.views = views.map(x => x.split("/").at(-1).replace(".xml",""));
            },
            async reload(){
                this.projection_lock = true;
                try {
                    this.initialized = false;
                    await this.read();
                } finally {
                    await Draftsman.sleep(100);
                    this.projection_lock = false;
                }
            },
            async read(){
                await Draftsman.sleep(10);
                this.model = await Modeler.get_model(this.navigation);
                this.newName = this.model.att_name;
                this.newPath = this.navigation.replace("projections/","").replace("/" + this.model.att_name + ".xml","");
                if (!this.model.att_role){this.model.att_role = ""}
                this.model.input.forEach(input => {
                    if (!("att_id" in input)){
                        input.att_id = Draftsman.makeid(6);
                    }
                });
                this.initialized = true;
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
                let files = await repo.list(x => x.endsWith("projections/" + this.newPath + "/" + this.newName + ".xml"));
                this.duplicateName = files.length > 0;
            },
            async rename(){
                if(this.projection_lock){return}
                if (!viewPathRegex.test(this.newPath) || !pascalCaseRegex.test(this.newName)){return}
                // alter name in model
                let newPath = "projections/" + this.newPath + "/" + this.newName + ".xml";
                this.model.att_name = this.newName;
                await this._execute_save();
                this.projection_lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.navigation,newPath);
            },
            async _execute_save(){
                if(this.projection_lock){return}
                await Modeler.save_model(this.navigation,this.model);
            },
            destroy(){
                Draftsman.deregisterListener(this.listnerId);
            }
        }
    });
});