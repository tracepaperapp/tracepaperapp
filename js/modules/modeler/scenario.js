document.addEventListener('alpine:init', () => {
    Alpine.data('scenarioModel', function(){
        return {
            model: Modeler.prepare_model("scenario",{}),
            path: "",
            repo: null,
            _taskId: "",
            listnerId: "",
            newName: "",
            scenarios: [],
            commands: {},
            queries: {},
            flowvars: [],
            components: [],
            scs: "",
            sqs: "",
            duplicateName: false,
            initialized: false,
            active: "",
            insertActivityModal: false,
            add_dependency(){
                if(this.$el.value && !this.model.att_extends.includes(this.$el.value)){
                    let dependencies = this.model.att_extends.split(";");
                    dependencies.push(this.$el.value);
                    this.model.att_extends = dependencies.join(";");
                }
                this.$el.value = "";
            },
            onScroll() {
                const scrollContainer = this.$el;
                const tables = scrollContainer.querySelectorAll('table');
                const containerRect = scrollContainer.getBoundingClientRect();
                const threshold = containerRect.top + (containerRect.height * 0.4);

                let active = "";
                for (const table of tables) {
                    const rect = table.getBoundingClientRect();
                    if (
                        rect.top < threshold && // Bovenkant van de tabel is boven de drempel
                        rect.bottom > containerRect.top // Onderkant van de tabel is onder de bovenkant van de container
                        && table.getAttribute("x-activity-id")
                    ) {
                        if (rect.bottom > containerRect.top && active == ""){
                            active = table.getAttribute("x-activity-id");
                        } else if (rect.top < threshold
                                    && rect.bottom > containerRect.top){
                            active = table.getAttribute("x-activity-id");
                        }
                    }
                }
                this.active = active;
                this.scrollContainer = scrollContainer;
            },
            scrollToTable(id) {
                this.active = id;
                const table = this.scrollContainer.querySelector(`table[x-activity-id="${id}"]`);

                if (table) {
                    table.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                        inline: 'nearest'
                    });
                } else {
                    console.error(`Table with activity.att_id "${id}" not found.`);
                }
            },
            async move_activity_up() {
                let index = parseInt(this.$el.getAttribute("index"), 10);
                if (index > 0 && index < this.model.activity.length) {
                    [this.model.activity[index - 1], this.model.activity[index]] =
                        [this.model.activity[index], this.model.activity[index - 1]];
                }
            },
            move_activity_down(){
                let index = parseInt(this.$el.getAttribute("index"), 10);
                if (index >= 0 && index < this.model.activity.length - 1) {
                    [this.model.activity[index + 1], this.model.activity[index]] =
                        [this.model.activity[index], this.model.activity[index + 1]];
                }
            },
            remove_activity(){
                this.model.activity = this.model.activity.filter(x => x.att_id != this.$el.getAttribute("id"));
            },
            prepare_insert_after(){
                this.insert_mode = "after";
                this.reference_index = parseInt(this.$el.getAttribute("index"), 10);
                this.insertActivityModal = true;
            },
            prepare_insert_before(){
                this.insert_mode = "before";
                this.reference_index = parseInt(this.$el.getAttribute("index"), 10);
                this.insertActivityModal = true;
            },
            insert(){
                this.insertActivityModal = false;
//                let type = this.$el.getAttribute("activity-type");
//                let activity = {};
//
//                switch(type){
//                    case "loop":
//                        activity.activity = [];
//                        break;
//                }
//
//                activity.att_type = type;
//                activity.att_id = Draftsman.makeid(6);
//                switch(this.insert_mode){
//                    case "after":
//                        this.activity_array.splice(this.reference_index + 1, 0, activity);
//                        break;
//                    case "before":
//                        this.activity_array.splice(this.reference_index, 0, activity);
//                        break;
//                }
            },
            async init(){
                this.repo = await GitRepository.open();
                this.path = this.$el.getAttribute("file");
                this.newName = this.path.split("/").at(1).split(".").at(0);
                this.read();
                this._taskId = Draftsman.uuidv4();
                this.$watch("model",this.save.bind(this));
                this.listnerId = Draftsman.registerListener("force-reload",this.read.bind(this));
            },
            async check_name(){
                let files = await this.repo.list(x => x == "scenarios/" + this.newName + ".xml");
                this.duplicateName = files.length != 0;
            },
            _update_code(code){
                this.content = code;
            },
            async determine_flow_vars(file){
                let model = await Modeler.get_model(file);
                model.activity.filter(x => ["set-variables","query"].includes(x.att_type)).forEach(activity => {
                    if (activity.att_type == "set-variables"){
                        activity.input.forEach(i => {
                            this.add_flow_var(`#${i.att_name}#`);
                        });
                    } else {
                        activity["extract-value"].forEach(e => {
                            this.add_flow_var(`#${e["att_put-key"]}#`);
                        });
                    }
                });
                for (scenario of model.att_extends.split(";")){
                    if (scenario){
                        await this.determine_flow_vars(`scenarios/${scenario}.xml`);
                    }
                }
            },
            add_flow_var(flowvar){
                if (!this.flowvars.includes(flowvar)){
                    this.flowvars.push(flowvar);
                }
            },
            async read(){
                this.initialized = false;
                this.model = await Modeler.get_model(this.path);
                let scenarios = await this.repo.list(x => x.startsWith("scenarios/") && x.endsWith(".xml"));
                scenarios = scenarios.map(x => x.split("/").at(-1).replace(".xml",""));
                this.scenarios = scenarios.filter(x => x != this.model.att_name && !this.model.att_extends.includes(x));
                this.initialized = true;
                if (this.active == ""){
                    this.active = this.model.activity.at(0).att_id;
                }
                await this.determine_flow_vars(this.path);
                let behaviors = await this.repo.list(x => x.startsWith("domain/") && x.includes('/behavior-flows/') && x.endsWith(".xml"));
                behaviors.forEach(file => {
                    let x = file.split("/");
                    this.add_component(`${x.at(1)}.${x.at(2)}.${x.at(4).replace(".xml","")}`);
                });
                let notifiers = await this.repo.list(x => x.startsWith("notifiers/") && x.endsWith(".xml"));
                notifiers.forEach(file => {
                    let x = file.split("/");
                    this.add_component(`${x.at(-1).replace(".xml","")}-Notifier`);
                });
                let commands = await this.repo.list(x => x.startsWith("commands/") && x.endsWith(".xml"));
                for (file of commands){
                    let command = await Modeler.get_model(file);
                    this.commands[file] = command["att_graphql-namespace"] + "." + command["att_graphql-name"];
                }
                let views = await this.repo.list(x => x.startsWith("views/") && x.endsWith(".xml"));
                for (file of views){
                    let view = await Modeler.get_model(file);
                    view.query.forEach(q => {
                        this.queries[q["att_graphql-namespace"] + "." + q["att_field-name"]] = {q,view};
                    });
                }
            },
            add_component(component){
                if (!this.components.includes(component)){
                    this.components.push(component);
                }
            },
            async rename(){
                if(this.lock){return}
                this.model.att_name = this.newName;
                await this._execute_save();
                this.lock = true;
                // Move files to new path
                await Modeler.force_rename_model(this.path,"scenarios/" + this.newName + ".xml");
            },
            async delete_model(){
                await Modeler.delete_model(this.path);
            },
            async save(){
                Draftsman.debounce(this._taskId,this._execute_save.bind(this),1500);
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
    Alpine.data('scenarioActivity',function(){
        return {
            type: "",
            reference: null,
            select_command: false,
            select_query: false,
            init(){
                switch(this.activity.att_type){
                    case "mutation":
                        this.type = "Command";
                        break;
                    default:
                        this.type = Draftsman.capitalizeFirstLetter(this.activity.att_type.replace("-"," "));
                }
            },
            add_input(){
                this.activity.input.push({
                    att_name: Draftsman.generateRandomCamelCaseString(),
                    att_type: "String",
                    att_value: ""
                });
            },
            change_query(){
                this.select_query = false;
                this.activity.att_path = this.query;
                let query = this.queries[this.query].q;
                let view = this.queries[this.query].view;
                if (query.att_type == "get"){
                    this.activity.input = [{
                        att_name: "key",
                        att_type: "String",
                        att_value: "#",
                        att_id: Draftsman.makeid(6)
                    }];
                } else if ("att_use-canonical-search" in query && query["att_use-canonical-search"] == "true"){
                    this.activity.input = [{
                        att_name: "key_begins_with",
                        att_type: "String",
                        att_value: "#",
                        att_id: Draftsman.makeid(6)
                    }];
                } else {
                    this.activity.input = [];
                }
                query["filter-clause"].forEach(c => {
                    this.activity.input.push({
                         att_name: c["att_field-name"],
                         att_type: view.field.filter(x => x.att_name == c["att_field-name"]).at(0).att_type,
                         att_value: "#",
                         att_id: Draftsman.makeid(6)
                     });
                });
                //this.activity.input
            },
            async change_command(){
                console.log(this.path,this.file);
                this.select_command = false;
                this.activity["expected-trace"] = [];
                this.activity.att_path = this.path;
                let command = await Modeler.get_model(this.file);
                this.activity.input = command.field.filter(x => !x["att_auto-fill"] || x["att_auto-fill"] == "").map(x => {
                    return {
                        att_name: x.att_name,
                        att_type: x.att_type,
                        att_value: "#"
                    }
                });
                command["nested-object"].forEach(x => {
                    this.activity.input.push({
                        att_name: x.att_name,
                        att_type: "Nested",
                        att_value: "#"
                    });
                });
                this.reference = command;
            },
            async add_object(){
                console.log(this.input.att_name);
                if (!this.reference){
                    let file = Draftsman.getKeyByValue(this.commands,this.activity.att_path);
                    this.reference = await Modeler.get_model(file);
                }
                let obj = this.reference["nested-object"].filter(x => x.att_name == this.input.att_name).at(0);
                let val = {};
                obj.field.forEach(x => {
                    val[x.att_name] = x.att_type == "Boolean" ? true : x.att_type == "String" ? "" : 0;
                });
                this.data.push(val);
            }
        }
    });
    Alpine.data('scenarioActivityNestedInput',function(){
            return {
                data: [],
                lock: false,
                init(){
                    try{
                        let data = JSON.parse(this.input.att_value);
                        this.data = data;
                    }catch{}
                    this.$watch("data",this.save.bind(this));
                },
                async save(){
                    if (this.lock){return}
                    this.lock = true;
                    try{
                        let data = this.data.filter(x => Object.keys(x).length != 0);
                        this.input.att_value = JSON.stringify(data);
                        this.data = data;
                        await Draftsman.sleep(100);
                    } finally{
                        this.lock = false;
                    }
                },
                insertField(item){
                    if (this.$el.value
                        && camelCaseRegex.test(this.$el.value)
                        && !(this.$el.value in item)){
                        item[this.$el.value] = "";
                        this.$el.value = "";
                    }
                },
                convert_value(value,type){
                    switch(type){
                        case "Int":
                            return parseInt(value,10);
                        case "Float":
                            return parseFloat(value);
                        case "Boolean":
                            return value.toLowerCase() == "true";
                        default:
                            return String(value);
                    }
                },
                determine_type(value){
                    if (typeof value === "boolean"){
                        return "Boolean";
                    } else if (typeof value === "number" && Number.isInteger(value)){
                        return "Int";
                    } else if (typeof value === "number" && !Number.isInteger(value)){
                        return "Float";
                    } else {
                        return "String"
                    }
                }
            }
        });
});