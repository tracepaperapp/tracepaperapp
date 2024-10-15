window.ModelValidator = {
    errors: [],

    addError(filePath, field, message, issueType) {
        this.errors.push({
            filePath: filePath,
            field: field,
            message: message,
            type: issueType
        });
    },

    validatePascalCase(filePath, field, value) {
        const regex = /^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/;
        if (!regex.test(value)) {
            this.addError(filePath, field, `${field} must be PascalCase.`, 'Format Error');
        }
    },

    validateCamelCase(filePath, field, value) {
        const regex = /^[a-z][a-zA-Z]+$/;
        if (!regex.test(value)) {
            this.addError(filePath, field, `${field} must be camelCase.`, 'Format Error');
        }
    },

    validateNumeric(filePath, field, value) {
        if (isNaN(value)) {
            this.addError(filePath, field, `${field} must be numeric.`, 'Type Error');
        }
    },

    validateEventMapping(filePath, handler, event) {
        const requiredFields = [handler.key_mapping].concat(handler.mappings.map(m => m.value));
        const eventFields = event.fields.map(f => f.name);

        requiredFields.forEach(field => {
            if (!eventFields.includes(field)) {
                this.addError(filePath, handler.on, `Event handler for ${handler.on} is missing field: ${field}.`, 'Mapping Error');
            }
        });
    },

    validateAggregateMapping(filePath, handler, aggregate) {
        const requiredFields = [handler.key_mapping].concat(handler.mappings.map(m => m.value));
        const aggregateFields = aggregate.fields.map(f => f.name).concat(aggregate.nested_objects.map(n => n.name), ["snapshot"]);

        requiredFields.forEach(field => {
            if (!aggregateFields.includes(field)) {
                this.addError(filePath, aggregate.name, `Aggregate handler for ${aggregate.name} is missing field: ${field}.`, 'Mapping Error');
            }
        });
    },

    validateBehaviorHasTestCase(filePath, model) {
        if (!model["test-case"] || model["test-case"].length === 0) {
            this.addError(filePath, 'test-case', 'Behavior must have at least one test case.', 'Missing Test Case');
        }
    },

    validateAggregateHasBehavior(filePath, files) {
        let folder = filePath.replace("/root.xml", "/behavior-flows/");
        if (files.filter(x => x.startsWith(folder)).length === 0) {
            this.addError(filePath, 'behavior', 'Aggregate must have at least one behavior flow.', 'Missing Behavior Flow');
        }
    },
    validateAggregateHasEvents(filePath, files) {
            let folder = filePath.replace("/root.xml", "/events/");
            if (files.filter(x => x.startsWith(folder)).length === 0) {
                this.addError(filePath, 'behavior', 'Aggregate must have at least one domain event.', 'Missing Domain Event');
            }
        },

    async validateBehavior(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
        if (model.trigger.length === 0) {
            this.addError(filePath, "", 'Behavior flow must have at least one trigger configured.', 'No Trigger');
        }
        for (const trigger of model.trigger) {
            let event = null;
            try{
                event = await Modeler.get_by_name(trigger.att_source,true);
            } catch {
                this.addError(filePath, "", `Trigger is configured to an unknown event ${trigger.att_source}`, 'Trigger Source');
                return;
            }
            if (trigger["att_key-field"] === "") {
                this.addError(filePath, "", `Trigger ${trigger.att_source} has no business key mapping configured`, 'Trigger Business Key');
            }
            if (trigger.mapping.length === 0) {
                this.addError(filePath, "", `Trigger ${trigger.att_source} has no mapping configured`, 'Trigger Mapping');
            } else {
                let fields = event.field.map(x => x.att_name);
                fields = fields.concat(event["nested-object"].map(x => x.att_name));
                for (const m of trigger.mapping) {
                    if (!m.att_value.startsWith("#") && !fields.includes(m.att_value)) {
                        this.addError(filePath, "", `Trigger ${trigger.att_source} maps an unknown event field [${m.att_value}] to flowvar [${m.att_target}].`, 'Trigger Mapping');
                    }
                }
            }
        }
        if (model.processor.length == 0 ){
            this.addError(filePath, "", 'Behavior flow must have at least one processor configured.', 'No Processor');
        } else {
            let events = model.processor.filter(x => x.att_type == "emit-event");
            if (events.length == 0){
                this.addError(filePath, "", 'Behavior flow must have at least one "emit-event" processor configured.', 'No Emit Event Processor');
            }
            for (const emit of events){
                let event = null;
                try{
                    event = await Modeler.get_by_name(emit.att_ref,true);
                } catch {
                    this.addError(filePath, "", `Processor emits an unknown event ${emit.att_ref}`, 'Emit Event');
                    continue;
                }
                let fields = event.field.map(x => x.att_name);
                fields = fields.concat(event["nested-object"].map(x => x.att_name));
                emit.mapping.forEach(m => {
                    if (!fields.includes(m.att_target)){
                        this.addError(filePath, "", `Processor maps an unknown field [${m.att_target}] to event [${emit.att_ref}]`, 'Emit Event');
                    } else {
                        fields = fields.filter(x => x != m.att_target);
                    }
                });
                fields.forEach(f => {
                    this.addError(filePath, "", `Processor is missing a mapping to map field [${f}] to event [${emit.att_ref}]`, 'Emit Event');
                });
            }
        }
    },

    async resetValidation(){
        session.issues = [];
        let files = await FileSystem.listFiles();
        ModelValidator.validateModel(files);
    },
    async validateModel(files) {
        if (sessionStorage["_x_validation_enabled"] != "true"){return;}
        console.log("Start validation");
        this.lock = true
        this.errors = [];
        try{
            for (const file of files.filter(x => !x.endsWith(".log") && !x.endsWith(".md"))) {
                console.log("Validate:",file);
                const type = Modeler.determine_type(file);

                if (type === "readme" || type === "unknown") {
                    continue; // Skip readme and unknown files
                }

                let model = await Modeler.get(file, true); // Load the model using Modeler.get
                switch (type) {
                    case "config":
                        this.validateConfig(file, model);
                        break;
                    case "command":
                        this.validateCommand(file, model);
                        break;
                    case "aggregate":
                        this.validateAggregate(file, model);
                        this.validateAggregateHasBehavior(file, files); // Voeg specifieke aggregate-validatie toe
                        this.validateAggregateHasEvents(file,files);
                        break;
                    case "behavior":
                        //await sleep(Math.floor(Math.random() * 1000 ));
                        await this.validateBehavior(file, model);
                        this.validateBehaviorHasTestCase(file, model); // Voeg specifieke behavior-validatie toe
                        break;
                    case "event":
                        //await sleep(Math.floor(Math.random() * 1000 ));
                        await this.validateEvent(file, model);
                        break;
                    case "view":
                        this.validateView(file, model);
                        break;
                    case "projection":
                        this.validateProjection(file, model);
                        break;
                    case "notifier":
                        //await sleep(Math.floor(Math.random() * 1000 ));
                        await this.validateNotifier(file, model);
                        break;
                    case "code":
                        this.validateCode(file, model);
                        break;
                    case "expression":
                        this.validateExpression(file, model);
                        break;
                    case "pattern":
                        this.validatePattern(file, model);
                        break;
                    case "scenario":
                        this.validateScenario(file, model);
                        break;
                    default:
                        console.log(`No specific validation for file type: ${type}`);
                }
                let keys = session.issues.map(x => JSON.stringify(x));
                let bck = session.issues.map(x => JSON.stringify(x));
                let current = [];
                this.errors.forEach(x => {
                    let k = JSON.stringify(x);
                    if (!keys.includes(k)) {
                        keys.push(k);
                        session.issues.push(x);
                    }
                    current.push(k);
                });
                let remove = bck.filter(x => !current.includes(x));
                session.issues = session.issues.filter(x => !remove.includes(JSON.stringify(x)));
            }
        } catch(error) {
            console.error(error);
        }
        console.log("Done");
        console.log(this.errors);
//        setTimeout(async () => {
//            let files = await FileSystem.listFiles();
//            await window.ModelValidator.validateModel(files);
//        }, 5000);
        return this.errors;
    },

    validateConfig(filePath, model) {
        if (!model.global) {
            this.addError(filePath, 'global', 'Missing global configuration.', 'Config Error');
        }
    },

    validateCommand(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
        if (model.id) {
            this.validateNumeric(filePath, 'id', model.id);
        }
    },

    validateAggregate(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
        if (model.handlers) {
            model.handlers.forEach(handler => {
                if (handler.type === 'event') {
                    this.validateEventMapping(filePath, handler, model.events[handler.on]);
                }
                if (handler.type === 'aggregate') {
                    this.validateAggregateMapping(filePath, handler, model.aggregates[handler.aggregate]);
                }
            });
        }
    },

    async validateEvent(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
        if (model.field) {
            model.field.forEach(field => {
                this.validateCamelCase(filePath, `Field: ${field.att_name}`, field.att_name);
            });
        }
        try {
            let handler = await Modeler.get(filePath.replace("/events/","/event-handlers/"),true);
            let root = await Modeler.get(filePath.split("events/").at(0) + "root.xml", true);
            let eventFields = model.field.map(x => x.att_name);
            let documentFields = root.field.map(x => x.att_name);
            handler.mapping.filter(m => ["set","add","subtract"].includes(m.att_operand)).forEach(m => {
                if (!documentFields.includes(m.att_target)){
                    console.log(m.att_target,documentFields);
                    this.addError(filePath, 'domain-event', `Event [${model.att_name}] maps to an unknown aggregate field [${m.att_target}]`, 'Invalid Mapping');
                }
                if (!eventFields.includes(m.att_value)){
                    this.addError(filePath, 'domain-event', `Event [${model.att_name}] maps an unknown event field [${m.att_value}]`, 'Invalid Mapping');
                }
            });
        } catch(e) {
            console.error(e);
        }
    },

    validateView(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
        if (model.field) {
            model.field.forEach(field => {
                this.validateCamelCase(filePath, `Field: ${field.att_name}`, field.att_name);
            });
        }
    },

    validateProjection(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
    },

    async validateNotifier(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
        if (model.trigger.length === 0) {
            this.addError(filePath, "", 'Notifier must have at least one trigger configured.', 'No Trigger');
        }
        for (const trigger of model.trigger) {
            let event = null;
            if (trigger.att_source.startsWith("@")){
                continue;
            }
            try{
                event = await Modeler.get_by_name(trigger.att_source,true);
            } catch {
                this.addError(filePath, "", `Trigger is configured to an unknown event ${trigger.att_source}`, 'Trigger Source');
                return;
            }
            if (trigger["att_key-field"] === "") {
                this.addError(filePath, "", `Trigger ${trigger.att_source} has no business key mapping configured`, 'Trigger Business Key');
            }
            if (trigger.mapping.length === 0) {
                this.addError(filePath, "", `Trigger ${trigger.att_source} has no mapping configured`, 'Trigger Mapping');
            } else {
                let fields = event.field.map(x => x.att_name);
                fields = fields.concat(event["nested-object"].map(x => x.att_name));
                for (const m of trigger.mapping) {
                    if (!m.att_value.startsWith("#") && !fields.includes(m.att_value)) {
                        this.addError(filePath, "", `Trigger ${trigger.att_source} maps an unknown event field [${m.att_value}] to flowvar [${m.att_target}].`, 'Trigger Mapping');
                    }
                }
            }
        }
        if (model.activity.length === 0) {
            this.addError(filePath, "", 'Notifier must have at least one activity configured.', 'No Activity');
        }
        //TODO: hier ben ik
        console.log(model);
    },

    validateCode(filePath, model) {
        // Voeg code-specifieke validaties toe
    },

    validateExpression(filePath, model) {
        if (model.att_name) {
            this.validateCamelCase(filePath, 'att_name', model.att_name);
        }
    },

    validatePattern(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
    },

    validateScenario(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
    }
};