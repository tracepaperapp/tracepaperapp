/*
ctrl + m --> open wizard
    c --> add command
ctrl + shift + c --> copy wizard
*/
const enabled_for_copy = ["command","aggregate","view"];
document.addEventListener('alpine:init', () => {
    Alpine.data('modelWizard', function(){
        return {
            copy_modal: false,
            active: this.$persist(false).using(sessionStorage).as("wizardActive"),
            state: this.$persist(0).using(sessionStorage).as("wizardState"),
            parameters: this.$persist({}).using(sessionStorage).as("wizardParameters"),
            copyCommand: "",
            files: [],
            aggregates: [],
            targets: [],
            model: {},
            type: "",
            sources: [],
            search: "",
            ready: false,
            next: false,
            copyEnabled: false,
            previous: false,
            conflicted: this.$persist(false).using(sessionStorage).as("wizardConflicted"),
            dialog_id: this.$persist(0).using(sessionStorage).as("wizardDialog"),

            async init(){
                this.$watch("state",this.update_context.bind(this));
                this.$watch("navigation",this.update_context.bind(this));
                await this.update_context();
            },
            async update_context(){
                await this.set_context();
                switch(this.state){

                    // Command modeler
                    case 10:
                        this.update_action_buttons(true);
                        break;
                    case 11:
                        this.update_action_buttons(true,true);
                        break;
                    case 12:
                        await this.list_sources();
                        this.update_action_buttons(false,true,true);
                        break;

                    // Aggregate
                    case 20:
                        this.update_action_buttons(true);
                        break;
                    case 21:
                        await this.list_sources();
                        this.update_action_buttons(false,true,true);
                        break;

                    // Domain event
                    case 30:
                        this.aggregates = this.files.filter(x => x.endsWith("/root.xml")).map(x => x.split("/").at(1) + "." + x.split("/").at(2));
                        this.update_action_buttons(true);
                        break;
                    case 31:
                        this.targets = this.files.filter(x => x.endsWith(".xml") && x.includes(this.parameters.aggregate.replace(".","/")) && x.includes("/entities/")).map(x => x.split("/").at(-1).replace(".xml",""));
                        this.targets.unshift("root");
                        this.update_action_buttons(false,true,true);
                        break;

                    // Behavior flow
                    case 40:
                        this.aggregates = this.files.filter(x => x.endsWith("/root.xml")).map(x => x.split("/").at(1) + "." + x.split("/").at(2));
                        this.update_action_buttons(false,false,true);
                        break;

                    // Notifier
                    case 50:
                        this.update_action_buttons(false,false,true);
                        break;

                    // View
                    case 60:
                        this.update_action_buttons(false,false,true);
                        break;

                    // Projection
                    case 70:
                        this.update_action_buttons(false,false,true);
                        break;

                    // Expression
                    case 80:
                        this.update_action_buttons(false,false,true);
                        break;

                    // Pattern
                    case 90:
                        this.update_action_buttons(false,false,true);
                        break;

                    // Python Module
                    case 100:
                        this.update_action_buttons(false,false,true);
                        break;

                    // Template
                    case 110:
                        this.update_action_buttons(false,false,true);
                        break;

                    // Scenario
                    case 120:
                        this.update_action_buttons(false,false,true);
                        break;

                    default:
                        this.update_action_buttons();
                }
            },
            update_action_buttons(next=false,previous=false,ready=false){
                this.next = next;
                this.previous = previous;
                this.ready = ready;
            },

            async prepare_command(prepared_model){
                Modeler._roots[this.parameters.file] = "event";
                prepared_model["att_graphql-namespace"] = this.parameters.namespace;
                prepared_model["att_graphql-name"] = this.parameters.method;
                prepared_model.att_name = this.parameters.eventName;
                prepared_model.att_type = "ActorEvent";
                prepared_model.att_authorization = this.parameters.att_authorization;
                if (this.parameters.att_role){
                    prepared_model.att_role = this.parameters.att_role;
                }
                let attributes = await this.fetch_attributes();
                let keysWhitelist = ["att_name","att_type","att_pattern","att_default","att_auto-fill"];
                prepared_model.field = Draftsman.filterKeys(attributes.fields,keysWhitelist);
                attributes.entities.forEach(e => {
                    e.field = Draftsman.filterKeys(e.field,keysWhitelist);
                });
                prepared_model["nested-object"] = Draftsman.filterKeys(attributes.entities,["att_name","field"]);
                prepared_model = Modeler.prepare_model("command",prepared_model);
                return prepared_model;
            },

            async prepare_aggregate(prepared_model){
                Modeler._roots[this.parameters.file] = "aggregate";
                prepared_model.att_name = this.parameters.name;
                prepared_model["att_business-key"] = this.parameters.key;
                let attributes = await this.fetch_attributes();
                let keysWhitelist = ["att_name","att_type"];
                prepared_model.field = Draftsman.filterKeys(attributes.fields.filter(x => x.att_name != this.parameters.key),keysWhitelist);
                prepared_model.field.unshift({
                    att_name: this.parameters.key,
                    att_type: "String"
                });

                let entities = Draftsman.filterKeys(attributes.entities,["att_name","field","att_business-key"]);
                for (const e of entities) {
                    let path = this.parameters.file.replace("root.xml", "entities/" + e.att_name + ".xml");
                    Modeler._roots[path] = "nested-object";
                    await Modeler.save_model(path, e);
                }
                prepared_model = Modeler.prepare_model("aggregate",prepared_model);
                return prepared_model;
            },

            async prepare_domain_event(prepared_model){
                Modeler._roots[this.parameters.file] = "event";
                prepared_model.att_type = "DomainEvent";
                prepared_model.att_name = this.parameters.name;
                prepared_model.att_source = this.parameters.aggregate;
                if (this.parameters.target == "root"){
                    let root_file = this.parameters.file.split("events/").at(0) + "root.xml";
                    let root = await Modeler.get_model(root_file);
                    prepared_model.field = Draftsman.filterKeys(root.field,["att_name","att_type"]);

                    let repo = await GitRepository.open();
                    let entity_folder = this.parameters.file.split("events/").at(0) + "entities/";
                    let entities = await repo.list(x => x.startsWith(entity_folder) && x.endsWith(".xml"));
                    prepared_model["nested-object"] = [];
                    for (let entity of entities){
                        entity = await Modeler.get_model(entity);
                        prepared_model["nested-object"].push(entity);
                    }
                } else {
                    let entity = this.parameters.file.split("events/").at(0) + "entities/" + this.parameters.target + ".xml";
                    entity = await Modeler.get_model(entity);
                    prepared_model.field = Draftsman.filterKeys(entity.field,["att_name","att_type"]);
                }
                prepared_model = Modeler.prepare_model("event",prepared_model);
                return prepared_model;
            },

            async prepare_behavior_flow(prepared_model){
                Modeler._roots[this.parameters.file] = "command";
                prepared_model.att_name = this.parameters.name;
                prepared_model = Modeler.prepare_model("behavior",prepared_model);
                return prepared_model;
            },

            async prepare_notifier(prepared_model){
                Modeler._roots[this.parameters.file] = "notifier";
                prepared_model.att_name = this.parameters.name;
                prepared_model = Modeler.prepare_model("notifier",prepared_model);
                return prepared_model;
            },

            async prepare_view(prepared_model){
                Modeler._roots[this.parameters.file] = "view";
                prepared_model.att_name = this.parameters.name;
                prepared_model = Modeler.prepare_model("view",prepared_model);
                return prepared_model;
            },

            async prepare_projection(prepared_model){
                Modeler._roots[this.parameters.file] = "projection";
                prepared_model.att_name = this.parameters.name;
                prepared_model = Modeler.prepare_model("projection",prepared_model);
                return prepared_model;
            },

            async prepare_expression(prepared_model){
                Modeler._roots[this.parameters.file] = "expression";
                prepared_model.att_name = this.parameters.name;
                sessionStorage.prepared_expression = this.parameters.name;
                prepared_model.att_type = "ActorEventRole";
                prepared_model = Modeler.prepare_model("expression",prepared_model);
                return prepared_model;
            },

            async prepare_pattern(prepared_model){
                Modeler._roots[this.parameters.file] = "pattern";
                prepared_model.att_name = this.parameters.name;
                sessionStorage.prepared_pattern = this.parameters.name;
                prepared_model.att_regex = this.parameters.regex;
                prepared_model = Modeler.prepare_model("pattern",prepared_model);
                return prepared_model;
            },

            async insert_model(){
                this.active = false;
                let prepared_model = {};
                let file = this.parameters.file;
                switch (this.parameters.type){
                    case "command":
                        prepared_model = await this.prepare_command(prepared_model);
                        break;
                    case "aggregate":
                        prepared_model = await this.prepare_aggregate(prepared_model);
                        break;
                    case "event":
                        if (this.files.includes(this.parameters.file + ".bin")){
                            await Modeler.force_rename_model(this.parameters.file + ".bin",this.parameters.file);
                            this.close();
                            return;
                        }
                        prepared_model = await this.prepare_domain_event(prepared_model);
                        break;
                    case "behavior":
                        prepared_model = await this.prepare_behavior_flow(prepared_model);
                        break;
                    case "notifier":
                        prepared_model = await this.prepare_notifier(prepared_model);
                        break;
                    case "view":
                        prepared_model = await this.prepare_view(prepared_model);
                        break;
                    case "projection":
                        prepared_model = await this.prepare_projection(prepared_model);
                        break;
                    case "expression":
                        prepared_model = await this.prepare_expression(prepared_model);
                        await Modeler.save_model(file,prepared_model);
                        this.navigate("Expressions");
                        this.close();
                        return;
                    case "pattern":
                        prepared_model = await this.prepare_pattern(prepared_model);
                        await Modeler.save_model(file,prepared_model);
                        this.navigate("Patterns");
                        this.close();
                        return;
                    case "code":
                        let repo = await GitRepository.open();
                        await repo.write(file, "# Content");
                        this.navigate(file);
                        this.close();
                        return;
                    case "scenario":
                        Modeler._roots[this.parameters.file] = "scenario";
                        prepared_model.att_name = this.parameters.name;
                        prepared_model = Modeler.prepare_model("scenario",prepared_model);
                        break;
                    default:
                        console.error("Create for type not implemented: ",this.parameters.type);
                }
                console.log(prepared_model);
                await Modeler.save_model(file,prepared_model);
                this.navigate(file);
                this.close();
            },
            async fetch_attributes(){
                if (!this.parameters.copyFrom){return {}};
                let type = Modeler.determine_type(this.parameters.copyFrom);
                let result = {};
                let content = await Modeler.get_model(this.parameters.copyFrom);
                result.fields = [...content.field];
                result.entities = [...content["nested-object"]];
                if (type == "aggregate"){
                    let entities = this.sources.filter(x => x.startsWith(this.parameters.copyFrom.replace("root.xml","entities/")));
                    for (let i = 0; i < entities.length; i++){
                        let entity = await Modeler.get_model(entities[i]);
                        result.entities.push(entity);
                    }
                }
                return result;
            },
            async copy_attributes(){
                this.copy_modal = false;
                let attributes = await this.fetch_attributes();

                let keysWhitelist = [];
                let fields = [];
                let entities = [];
                let keys = [];

                switch (this.type){
                    case "command":
                        keysWhitelist = ["att_name","att_type","att_pattern","att_default","att_auto-fill"];
                        fields = Draftsman.filterKeys(attributes.fields,keysWhitelist);
                        attributes.entities.forEach(e => {
                            e.field = Draftsman.filterKeys(e.field,keysWhitelist);
                        });
                        entities = Draftsman.filterKeys(attributes.entities,["att_name","field"]);
                        keys = this.model.field.map(x => x.att_name);
                        keys.push(...this.model["nested-object"].map(x => x.att_name));
                        fields.filter(x => !keys.includes(x.att_name)).forEach(f => {
                            this.model.field.push(f);
                            keys.push(f.att_name);
                        });
                        entities.filter(x => !keys.includes(x.att_name)).forEach(e => {
                            this.model["nested-object"].push(e);
                        });
                        break;
                    case "aggregate":
                        keysWhitelist = ["att_name","att_type"];
                        fields = Draftsman.filterKeys(attributes.fields,keysWhitelist);
                        attributes.entities.forEach(e => {
                            e.field = Draftsman.filterKeys(e.field,keysWhitelist);
                        });
                        entities = Draftsman.filterKeys(attributes.entities,["att_name","field","att_business-key"]);
                        keys = this.model.field.map(x => x.att_name);
                        fields.filter(x => !keys.includes(x.att_name)).forEach(f => {
                            this.model.field.push(f);
                        });
                        for (const e of entities) {
                            let path = this.file.replace("root.xml", "entities/" + e.att_name + ".xml");
                            Modeler._roots[path] = "nested-object";
                            await Modeler.save_model(path, e);
                        }
                        break;
                    case "view":
                        keysWhitelist = ["att_name","att_type"];
                        fields = Draftsman.filterKeys(attributes.fields,keysWhitelist);
                        keys = this.model.field.map(x => x.att_name);
                        fields.filter(x => !keys.includes(x.att_name)).forEach(f => {
                            this.model.field.push(f);
                        });
                        break;
                    default:
                        alert("Not implemented");
                       console.error("Create for type not implemented: ",this.type);
                }
                await Modeler.save_model(this.file,this.model);
                this.navigate(this.file);
            },

            start(){
                this.active = true;
                if (this.state == 0){
                    this.state = 1;
                }
            },
            async set_context(){
                try{
                    this.file = this.navigation;
                    this.model = await Modeler.get_model(this.file);
                    this.type = Modeler.determine_type(this.file);
                    this.copyEnabled = enabled_for_copy.includes(this.type);
                }catch{}


                let repo = await GitRepository.open();
                this.files = await repo.list();
            },

            // Command flow
            async start_command(){
                switch(this.type){
                    case "command":
                        this.parameters.path = this.model["att_graphql-namespace"] + ".methodName";
                        break;
                    case "aggregate":
                        this.parameters.path = this.file.split("/").at(1) + ".method";
                        break;
                    default:
                        this.parameters.path = "Namespace.method";
                }
                if (["command","aggregate","entity"].includes(this.type)){
                    this.parameters.copyFrom = this.file;
                }
                this.parameters.type = "command";
                this.conflicted = true;
                this.state = 10;
            },
            check_command_name_uniqueness(){
                this.conflicted = !this.parameters.path || !apiPathRegex.test(this.parameters.path);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return;
                }
                let elements = Draftsman.splitOnLastDot(this.parameters.path);
                let eventName = Draftsman.capitalizeFirstLetter(elements[1]) + elements[0].replaceAll(".","") + "Requested";
                this.parameters.eventName = eventName;
                this.parameters.commandName = eventName.replace('Requested','');
                this.parameters.namespace = elements[0];
                this.parameters.method = elements[1];
                let newFile = `commands/${elements[0].replaceAll('.','/')}/${eventName}.xml`;
                this.parameters.file = newFile;
                this.conflicted = this.files.includes(newFile);

                if (this.conflicted){
                    this.dialog_id = 1;
                } else {
                    this.dialog_id = 0;
                }
            },

            // Aggregate flow
            async start_aggregate(){
                this.parameters.subdomain = "";
                this.parameters.name = "";
                switch(this.type){
                    case "command":
                        this.parameters.subdomain = this.model["att_graphql-namespace"].split(".").at(0);
                        break;
                    case "aggregate":
                        this.parameters.subdomain = this.file.split("/").at(1);
                        break;
                }
                if (["command","aggregate","entity"].includes(this.type)){
                    this.parameters.copyFrom = this.file;
                }
                this.parameters.type = "aggregate";
                this.conflicted = true;
                this.state = 20;
            },
            check_aggregate_name_uniqueness(){
                this.conflicted = !pascalCaseRegex.test(this.parameters.subdomain) || !pascalCaseRegex.test(this.parameters.name) || !camelCaseRegex.test(this.parameters.key);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return
                }
                this.conflicted = !this.parameters.subdomain || !this.parameters.name || !this.parameters.key;
                if (this.conflicted){
                    this.dialog_id = 0;
                    return
                }
                this.parameters.file = `domain/${this.parameters.subdomain}/${this.parameters.name}/root.xml`;
                this.conflicted = this.files.includes(this.parameters.file);
                if (this.conflicted){
                    this.dialog_id = 1;
                } else {
                    this.dialog_id = 0;
                }
            },

            // Domain event flow
            async start_domain_event(){
                this.parameters.aggregate = "";
                this.parameters.name = "";
                this.parameters.target = "root";
                this.parameters.type = "event";
                if (["aggregate","event","behavior"].includes(this.type)){
                    let params = this.file.split("/");
                    this.parameters.aggregate = params.at(1) + "." + params.at(2);
                }
                this.conflicted = true;
                this.state = 30;
            },
            check_domain_event_name(){
                this.conflicted = !this.aggregates.includes(this.parameters.aggregate) || !this.parameters.name || !pascalCaseRegex.test(this.parameters.name);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return
                }
                this.parameters.file = `domain/${this.parameters.aggregate.replace(".","/")}/events/${this.parameters.name}.xml`;
                this.parameters.conflicts = this.files.filter(x => !x.includes("/event-handlers/") && x.endsWith(this.parameters.name + ".xml"));
                this.conflicted = this.parameters.conflicts.length != 0;
                if (this.conflicted){
                    this.dialog_id = 1;
                } else {
                    this.dialog_id = 0;
                }
            },

            // Behavior flow
            async start_behavior_flow(){
                this.parameters.aggregate = "";
                this.parameters.name = "";
                this.parameters.type = "behavior";
                if (["aggregate","event","behavior"].includes(this.type)){
                    let params = this.file.split("/");
                    this.parameters.aggregate = params.at(1) + "." + params.at(2);
                }
                this.conflicted = true;
                this.state = 40;
            },
            check_behavior_name(){
                this.conflicted = !this.aggregates.includes(this.parameters.aggregate) || !this.parameters.name || !pascalCaseRegex.test(this.parameters.name);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return
                }
                this.parameters.file = `domain/${this.parameters.aggregate.replace(".","/")}/behavior-flows/${this.parameters.name}.xml`;
                this.conflicted = this.files.includes(this.parameters.file);
                if (this.conflicted){
                    this.dialog_id = 1;
                } else {
                    this.dialog_id = 0;
                }
            },

            // Notifier
            async start_notifier(){
                this.parameters.name = "";
                this.parameters.type = "notifier";
                this.conflicted = true;
                this.state = 50;
            },
            check_notifier_name(){
                this.conflicted = !this.parameters.name || !pascalCaseRegex.test(this.parameters.name);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return
                }
                this.parameters.file = `notifiers/${this.parameters.name}.xml`;
                this.conflicted = this.files.includes(this.parameters.file);
                if (this.conflicted){
                    this.dialog_id = 1;
                } else {
                    this.dialog_id = 0;
                }
            },

            // View
            async start_view(){
                this.parameters.name = "";
                this.parameters.type = "view";
                this.conflicted = true;
                this.state = 60;
            },
            check_view_name(){
                this.conflicted = !this.parameters.name || !pascalCaseRegex.test(this.parameters.name);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return
                }
                this.parameters.file = `views/${this.parameters.path ? this.parameters.path : this.parameters.name}/${this.parameters.name}.xml`;
                this.conflicted = this.files.filter(x => x.startsWith("views/") && x.endsWith(this.parameters.name + ".xml")).length != 0;
                if (this.conflicted){
                    this.dialog_id = 1;
                } else {
                    this.dialog_id = 0;
                }
            },

            // Projection
            async start_projection(){
                this.parameters.name = "";
                this.parameters.type = "projection";
                this.conflicted = true;
                this.state = 70;
            },
            check_projection_name(){
                this.conflicted = !this.parameters.name || !pascalCaseRegex.test(this.parameters.name);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return
                }
                this.parameters.file = `projections/${this.parameters.path ? this.parameters.path : this.parameters.name}/${this.parameters.name}.xml`;
                this.conflicted = this.files.filter(x => x.startsWith("projections/") && x.endsWith(this.parameters.name + ".xml")).length != 0;
                if (this.conflicted){
                    this.dialog_id = 1;
                } else {
                    this.dialog_id = 0;
                }
            },

            // Expression
            async start_expression(){
                this.parameters.name = "";
                this.parameters.type = "expression";
                this.conflicted = true;
                this.state = 80;
            },
            check_expression_name(){
                this.conflicted = !this.parameters.name || !camelCaseRegex.test(this.parameters.name);
                if (this.conflicted){
                    this.dialog_id = 0;
                    return
                }
                this.parameters.file = `expressions/${this.parameters.name}.xml`;
                this.conflicted = this.files.includes(this.parameters.file);
                if (this.conflicted){
                    this.dialog_id = 1;
                } else {
                    this.dialog_id = 0;
                }
            },

            // Pattern
            async start_pattern(){
                this.parameters.name = "";
                this.parameters.regex = "";
                this.parameters.type = "pattern";
                this.conflicted = true;
                this.state = 90;
            },
            check_pattern_name(){
                    this.conflicted = !this.parameters.name || !pascalCaseRegex.test(this.parameters.name);
                    if (this.conflicted){
                        this.dialog_id = 0;
                        return
                    }
                    this.parameters.file = `patterns/${this.parameters.name}.xml`;
                    this.conflicted = this.files.includes(this.parameters.file);
                    if (this.conflicted){
                        this.dialog_id = 1;
                    } else {
                        this.dialog_id = 0;
                    }
            },

            // Python Module
            async start_module(){
                this.parameters.name = "";
                this.parameters.type = "code";
                this.conflicted = true;
                this.state = 100;
            },
            check_module_name(){
                    this.conflicted = !this.parameters.name || !pascalCaseRegex.test(this.parameters.name);
                    if (this.conflicted){
                        this.dialog_id = 0;
                        return
                    }
                    this.parameters.file = `lib/${this.parameters.name}.py`;
                    this.conflicted = this.files.includes(this.parameters.file);
                    if (this.conflicted){
                        this.dialog_id = 1;
                    } else {
                        this.dialog_id = 0;
                    }
            },

            // Template
            async start_template(){
                this.parameters.name = "templates/new.md";
                this.parameters.type = "code";
                this.conflicted = true;
                this.state = 110;
            },
            check_template_name(){
                    this.conflicted = !this.parameters.name || !templatePath.test(this.parameters.name);
                    if (this.conflicted){
                        this.dialog_id = 0;
                        return
                    }
                    this.parameters.file = this.parameters.name;
                    this.conflicted = this.files.includes(this.parameters.file);
                    if (this.conflicted){
                        this.dialog_id = 1;
                    } else {
                        this.dialog_id = 0;
                    }
            },

            // Scenario
            async start_scenario(){
                this.parameters.name = "";
                this.parameters.type = "scenario";
                this.conflicted = true;
                this.state = 120;
            },
            check_scenario_name(){
                    this.conflicted = !this.parameters.name || !pascalCaseRegex.test(this.parameters.name);
                    if (this.conflicted){
                        this.dialog_id = 0;
                        return
                    }
                    this.parameters.file = "scenarios/" + this.parameters.name + ".xml";
                    this.conflicted = this.files.includes(this.parameters.file);
                    if (this.conflicted){
                        this.dialog_id = 1;
                    } else {
                        this.dialog_id = 0;
                    }
            },

            close(){
                this.active = false;
                this.state = 0;
                this.conflicted = false;
                this.dialog_id = 0;
                this.parameters = {};
                this.next = false;
                this.previous = false;
                this.ready = false;
            },
            async copy_fields(){
                await this.list_sources();
                this.copy_modal = true;
            },
            async list_sources(){
                let repo = await GitRepository.open();
                this.sources = await repo.list(x => (
                        x.startsWith("commands/") ||
                        (x.startsWith("domain/") && x.includes("/root")) ||
                        (x.startsWith("domain/") && x.includes("/entities/"))
                    )&& x.endsWith(".xml"));
            },
            handle_keydown(event) {
                // Check voor Windows (Ctrl + M) of Mac (Cmd + M)
                let type = Modeler.determine_type(this.navigation);
                if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
                    event.preventDefault();
                    this.start();
                } else if (this.state == 1 && event.key === 'c'){
                    event.preventDefault();
                    this.start_command();
               } else if (this.state == 1 && event.key === 'a'){
                     event.preventDefault();
                     this.start_aggregate();
               } else if (this.state == 1 && event.key === 'd'){
                    event.preventDefault();
                    this.start_domain_event();
               } else if (this.state == 1 && event.key === 'b'){
                   event.preventDefault();
                   this.start_behavior_flow();
               } else if (this.state == 1 && event.key === 'n'){
                   event.preventDefault();
                   this.start_notifier();
               } else if (this.state == 1 && event.key === 'v'){
                   event.preventDefault();
                   this.start_view();
               } else if (this.state == 1 && event.key === 'p'){
                  event.preventDefault();
                  this.start_projection();
               } else if (this.state == 1 && event.key === 'e'){
                 event.preventDefault();
                 this.start_expression();
               } else if (this.state == 1 && event.key === 'r'){
                 event.preventDefault();
                 this.start_pattern();
               } else if (this.state == 1 && event.key === 'm'){
                    event.preventDefault();
                    this.start_module();
               } else if (this.state == 1 && event.key === 't'){
                   event.preventDefault();
                   this.start_template();
               } else if (this.state == 1 && event.key === "s"){
                   event.preventDefault();
                   this.start_scenario();
               } else if((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'c' && enabled_for_copy.includes(type)) {
                   event.preventDefault();
                   this.copy_fields();
               } else if (event.key === 'Escape' || event.key === 'Esc') {
                   this.active = false;
                   this.copy_modal = false;
               }
            }
        }
    });
});