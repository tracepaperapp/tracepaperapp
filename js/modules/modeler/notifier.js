document.addEventListener('alpine:init', () => {
    Alpine.data('notifierModel', function(){
        return {
            model: Modeler.prepare_model("notifier",{}),
            selectedTab: this.$persist({}).using(sessionStorage).as("notifierTab"),
            _taskId: "",
            listnerId: "",
            triggerModal: false,
            search: "",
            availableTriggers: [],
            async remove_trigger(){
                let triggers = this.model.trigger.filter(x => this.$el.getAttribute("trigger") != x.att_source);
                this.model.trigger = triggers;
                this.balance_triggers();
                await this._execute_save();
                await Draftsman.sleep(100);
                this.navigate(this.path);
            },
            async sync_to_disk(){
                await this._execute_save();
                this.navigate(this.navigation);
            },
            balance_triggers(){
                let variables = [];
                this.model.trigger.forEach(trigger => {
                    trigger.mapping.filter(m => m.att_value != "#''").forEach(map =>{
                        variables.push(map.att_target);
                    });
                });
                this.model.trigger.forEach(trigger => {
                    let mapping = trigger.mapping.filter(m => m.att_value != "#''");
                    let targets = mapping.map(x => x.att_target);
                    variables.filter(v => !targets.includes(v)).forEach(v => {
                        mapping.push({
                            att_target: v,
                            att_value: "#''"
                        });
                    });
                    trigger.mapping = mapping;
                });
            },
            async prepare_add_trigger(){
                this.triggerModal = true;
                let repo = await GitRepository.open();
                let triggers = await repo.list(x => x.endsWith(".xml") && (x.startsWith("commands/") || (x.startsWith("domain/") && x.includes("/events/"))));
                this.availableTriggers = triggers.map(x => {
                    return {
                        name: x.split("/").at(-1).replace(".xml",""),
                        file: x,
                        type: Modeler.determine_type(x)
                    };
                });
                this.availableTriggers.push|(...[
                    {name: "@afterDeployment", file: "@afterDeployment", type: "Scheduled"},
                    {name: "@cron(0 0 * * ? *)", file: "@cron(0 0 * * ? *)", type: "Scheduled"},
                    {name: "@rate(1 minute)", file: "@rate(1 minute)", type: "Scheduled"}
                ]);
            },
            async add_trigger(){
                this.triggerModal = false;
                let root = await Modeler.get_model(this.path.split("behavior-flows/").at(0) + "root.xml");
                let event = await Modeler.get_model(this.$el.getAttribute("file"));
                let fields = event.field.map(x => x.att_name);
                let trigger = {att_source: event.att_name, mapping: [], "att_idempotency-key": ""};
                if (fields.includes(root["att_business-key"])){
                    trigger["att_key-field"] = root["att_business-key"];
                } else {
                    trigger["att_key-field"] = "";
                }
                fields.forEach(field => {
                    trigger.mapping.push({att_target: field, att_value: field});
                });
                event["nested-object"].forEach(x => {
                    trigger.mapping.push({att_target: x.att_name, att_value: x.att_name});
                });
                this.model.trigger.push(trigger);
                this.balance_triggers();
            },
            async init(){
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
                if (!(this.navigation in this.selectedTab)){
                    this.selectedTab[this.navigation] = 2;
                }
            },
            async read(){
                await Draftsman.sleep(10);
                this.model = await Modeler.get_model(this.navigation);
                let availableEvents = await repo.list(x => x.startsWith(this.path.split("behavior-flows/").at(0) + "events/") && x.endsWith(".xml"));
                await Draftsman.updateIfChanged(this, 'availableEvents', availableEvents);
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
//                // alter name in model
//                await this._execute_save();
//                this.lock = true;
//                // Move files to new path
//                await Modeler.force_rename_model(this.preparedRename.oldPath,this.preparedRename.newPath);
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