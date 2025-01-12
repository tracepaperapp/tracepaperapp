importScripts('/js/tp/isomorphic-git.js');
importScripts('/js/tp/lightning-fs.js');
importScripts('/js/utils/helper.js');
importScripts('/js/tp/fast-xml-parser.js');
importScripts('/js/utils/modeler.js');

const options = {
    ignoreAttributes : false,
    format: true,
    attributeNamePrefix : "att_"
};
var parser = new XMLParser(options);

const isogit = self.git;
var fs = null;
var repo = "";
const dir = '/';
let files = [];

self.onmessage = async function (event) {
    const { action, repoUrl, request_id} = event.data;
    try {
        switch (action) {
          case 'validate':
            if (!fs || repo != repoUrl){
                fs = new LightningFS(repoUrl.replace("https://github.com/", ""));
                repo = repoUrl;
            }
            let report = await validate_model();
            postMessage({ result: report, request_id });
            break;
          default:
            postMessage({ error: 'Unknown action', request_id });
        }
      } catch (error) {
        console.error(error);
        postMessage({ error: error.message, request_id });
      }
}

async function validate_model(){
    files = await isogit.listFiles({ fs, dir: dir, ref: 'HEAD' });
    return await ModelValidator.validateModel(files);
}

async function get_model(file){
    let content = await fs.promises.readFile(dir + "/" + file, "utf8");
    if (file.endsWith(".xml")){
        content = parser.parse(content);
        let root = Object.keys(content).at(0);
        if (root == "?xml"){
            root = Object.keys(content).at(1);
        }
        content = content[root];
        let type = Modeler.determine_type(file);
        content = Modeler.prepare_model(type,content);
    } else if (file.endsWith(".json")){
        content = JSON.parse(content);
        if (file == "meta.json"){
            content.roles = make_sure_is_list(content.roles);
        }
    } else {
        content = {content:content};
    }
    return content;
}

async function get_by_name(name){
    let targets = [...files];
    if (name == "FileUploaded"){
        return {
            att_name: "FileUploaded",
            att_type: "DomainEvent",
            att_source: "appsync",
            field: [
                {att_name: "bucket", att_type: "String"},
                {att_name: "uri", att_type: "String"},
                {att_name: "location", att_type: "String"},
                {att_name: "username", att_type: "String"}
            ],
            "nested-object": []
        };
    }
    targets = targets.filter(x => x.endsWith("/" + name + ".xml"));
    targets = targets.filter(x => !x.includes("/event-handlers/"))
    if (targets.lenght == 0){
        throw new Error('Model not found');
    }
    if (targets.length > 1){
        throw new Error('Ambiguous name');
    }
    return await get_model(targets.at(0));
}
ModelValidator = {
    errors: [],

    async validateModel(files) {
        this.errors = [];
        try{
            for (const file of files.filter(x => !x.endsWith(".log") && !x.endsWith(".md") && !x.endsWith(".bin"))) {
                const type = Modeler.determine_type(file);

                if (type === "readme" || type === "unknown") {
                    continue; // Skip readme and unknown files
                }

                let model = await get_model(file); // Load the model using Modeler.get
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
                        await this.validateBehavior(file, model);
                        this.validateBehaviorHasTestCase(file, model); // Voeg specifieke behavior-validatie toe
                        break;
                    case "event":
                        await this.validateEvent(file, model);
                        break;
                    case "view":
                        await this.validateView(file, model);
                        break;
                    case "projection":
                        this.validateProjection(file, model);
                        break;
                    case "notifier":
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
                        break;
                }

            }
        } catch(error) {
            console.error(error);
        }
        return this.errors;
    },

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
        if (!model.att_name){
            model = await get_model_verbose(filePath);
        }
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
        if (model.trigger.length === 0) {
            this.addError(filePath, "", 'Behavior flow must have at least one trigger configured.', 'No Trigger');
        }
        for (const trigger of model.trigger) {
            let event = null;
            try{
                event = await get_by_name(trigger.att_source);
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
                    event = await get_by_name(emit.att_ref);
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

    validateConfig(filePath, model) {
        if (!("global" in model)) {
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
        if (!model.field || model.field.length == 0){
            this.addError(filePath, 'domain-event', `Event [${model.att_name}] has no fields configured`, 'Missing fields');
        }
        if (model.field) {
            model.field.forEach(field => {
                this.validateCamelCase(filePath, `Field: ${field.att_name}`, field.att_name);
            });
        }
        try {
            let handler = await get_model(filePath.replace("/events/","/event-handlers/"));
            let root = await get_model(filePath.split("events/").at(0) + "root.xml");
            let eventFields = model.field.map(x => x.att_name);
            let documentFields = root.field.map(x => x.att_name);
            handler.mapping.filter(m => ["set","add","subtract"].includes(m.att_operand)).forEach(m => {
                if (!documentFields.includes(m.att_target)){
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

    async validateView(filePath, model) {
        if (model.att_name) {
            this.validatePascalCase(filePath, 'att_name', model.att_name);
        }
        let has_key = false
        if (!model.field || model.field.length == 0){
            this.addError(filePath, 'view', `View [${model.att_name}] has no fields configured`, 'Missing fields');
        }
        if (model.field) {
            model.field.forEach(field => {
                has_key = has_key || (field.att_pk && field.att_pk == "true");
                this.validateCamelCase(filePath, `Field: ${field.att_name}`, field.att_name);
            });
        }
        let has_handler = model["snapshot-handler"].length !=0 || model["custom-handler"].length != 0;
        if (has_key && !has_handler){
            this.addError(filePath, 'view', `View [${model.att_name}] has a primary-key configured but no data-mapper`, 'Missing data-mapper');
        }
        if (!has_key && has_handler){
            this.addError(filePath, 'view', `View [${model.att_name}] has a data-mapper configured but has no primary-key`, 'Missing primary-key');
        }
        let has_query = model.query.length != 0;
        if (!has_key && has_query){
            this.addError(filePath, 'view', `View [${model.att_name}] has a query configured but has no primary-key`, 'Missing primary-key');
        }
        model.query.forEach(q => {
            //console.log(q);
        });
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
                event = await get_by_name(trigger.att_source);
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
        //TODO: activity validators
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