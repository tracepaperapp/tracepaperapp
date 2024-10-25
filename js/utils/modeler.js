const NESTED = "nested-object";
const TEST = "test-case";
const HANDLER = "event-handler";
const NESTED_MAPPING = "nested-mapping";
const CUSTOM_HANDLER = "custom-handler";
const SNAPSHOT_HANDLER = "snapshot-handler";
const QUERY_FILTER = "filter-clause";

make_sure_is_list = function(elements,deduplicate=true){
    if (Array.isArray(elements)){
        let array = [];
        let check = [];
        if (deduplicate){
            elements.forEach(x =>{
                let hash = btoa(JSON.stringify(x,true));
                if (!(check.includes(hash))){
                    array.push(x);
                    check.push(hash);
                }
            });
        } else {
            array = elements;
        }
        return array;
    } else if (elements){
        return [elements];
    } else {
        return [];
    }
}

class Modeler {
    static worker = null;
    static callbacks = {};

    static determine_type(file){
            if (file == "README.md"){
                return "readme";
            } else if (file == "config.xml"){
                return "config";
            } else if (file.startsWith("commands/")){
                return "command";
            } else if (file.startsWith("domain/") && file.endsWith("root.xml")){
                return "aggregate";
            } else if (file.startsWith("domain/") && file.includes("/behavior-flows/")){
                return "behavior";
            } else if (file.startsWith("domain/") && file.includes("/events/")){
                return "event";
            } else if (file.startsWith("views/")){
                return "view";
            } else if (file.startsWith("projections/")){
                return "projection";
            } else if (file.startsWith("notifiers/")){
                return "notifier";
            } else if (file.startsWith("lib/")){
                return "code";
            } else if (file.startsWith("expressions/")){
                return "expression";
            } else if (file.startsWith("patterns")){
                return "pattern";
            } else if (file.startsWith("scenarios/")){
                return "scenario";
            } else if (file == "Patterns"){
                return "patterns";
            } else if (file == "Expressions"){
                return "expressions";
            } else if (file == "Roles"){
                return "roles";
            } else if (file == "Dependencies"){
                return "dependencies";
            } else {
                return "unknown";
            }
        }

    static prepare_model(type,model){
       if (type == "view"){
           return prepare_view(model);
       } else if (type == "behavior"){
           return prepare_behavior(model);
       } else if (type == "notifier"){
           return prepare_notifier(model);
       } else if (type == "projection"){
           return prepare_projection(model);
       } else if (type == "command"){
           return prepare_command(model);
       } else if (type == "config"){
           if (!model.global || model.global == ''){
               model.global = {};
           }
           model.global.dependency = make_sure_is_list(model.global.dependency);
           return model;
      } else if(type == "scenario"){
           return prepare_scenario(model);
       } else {
           model.field = make_sure_is_list(model.field);
           model["nested-object"] = make_sure_is_list(model["nested-object"]);
           model["nested-object"].forEach(x => {x.field = make_sure_is_list(x.field)});
           model.mapping = make_sure_is_list(model.mapping);
           model['nested-mapping']  = make_sure_is_list(model['nested-mapping']);
           model["nested-mapping"].forEach(x => {x.mapping = make_sure_is_list(x.mapping)});
           return model;
       }
   }

    static async validate(){
        await Draftsman.waitFor(() => sessionStorage.project_url);
        if (!Modeler.worker) {
          Modeler.worker = new Worker('/js/webworkers/modelValidatorWorker.js');
          Modeler.worker.onmessage = (event) => {
            Modeler.callbacks[event.data.request_id](event);
            delete Modeler.callbacks[event.data.request_id];
          };
        }
        return await Modeler._sendMessage({action: "validate"});
    }

    static _sendMessage(message) {
        message.request_id = Draftsman.uuidv4();
        message.repoUrl = sessionStorage.project_url;
        return new Promise((resolve, reject) => {
          Modeler.callbacks[message.request_id] = function(event){
            if (event.data && event.data.result) {
              resolve(event.data.result);
            } else if (event.data.error) {
              reject(new Error(event.data.error));
            }
          };
          Modeler.worker.postMessage(message);
        });
      }
}

function prepare_scenario(scenario){
    scenario.activity = make_sure_is_list(scenario.activity);
    scenario.activity = scenario.activity.map(activity => {
        activity.input = make_sure_is_list(activity.input);
        activity['expected-trace'] = make_sure_is_list(activity['expected-trace']);
        activity["extract-value"] = make_sure_is_list(activity["extract-value"]);
        activity["expect-value"] = make_sure_is_list(activity["expect-value"]);
        return activity
    });
    if(!scenario.att_extends){scenario.att_extends = ""};
    return scenario;
}
function prepare_command(command){
    command['field'] = make_sure_is_list(command['field']);
    command['nested-object'] = make_sure_is_list(command['nested-object']);
    command['nested-object'].forEach(entity => {
        entity.field = make_sure_is_list(entity.field);
    });
    return command;
}
function prepare_projection(projection){
    projection['input'] = make_sure_is_list(projection['input']);
    return projection;
}
function prepare_notifier(notifier){
                 notifier.trigger = make_sure_is_list(notifier.trigger);
                 notifier.trigger.forEach(trigger=> {
                     trigger.mapping = make_sure_is_list(trigger.mapping);
                 });
                 notifier.activity = make_sure_is_list(notifier.activity);
                 notifier.activity.forEach(activity=> {
                     activity.activity = make_sure_is_list(activity.activity);
                     if(!activity.att_id){
                         activity.att_id = makeid(6);
                     }
                 });
                 return notifier;
             }
function prepare_behavior(flow){
        flow.trigger = make_sure_is_list(flow.trigger);
        flow.trigger.forEach(trigger => {
            trigger.mapping = make_sure_is_list(trigger.mapping);
        });
        flow.processor = make_sure_is_list(flow.processor);
        flow.processor.forEach(processor => {
            processor.mapping = make_sure_is_list(processor.mapping);
            if (!processor.att_id){
                processor.att_id = makeid(5);
            }
        });
        flow[TEST] = make_sure_is_list(flow[TEST]);
        flow[TEST].forEach(test => {
            test.input = make_sure_is_list(test.input);
            test.expected = make_sure_is_list(test.expected);
            test.expected.forEach(event => {
                event.field = make_sure_is_list(event.field);
            });
        });
        return flow;
    }
function prepare_view(view){
    view.field = make_sure_is_list(view.field);
    view[SNAPSHOT_HANDLER] = make_sure_is_list(view[SNAPSHOT_HANDLER]);
    view[SNAPSHOT_HANDLER].forEach( handler => {
        handler.mapping = make_sure_is_list(handler.mapping);
        handler.delete = make_sure_is_list(handler.delete);
        handler.delete.forEach(d => {
            if (!d.att_id){
                d.att_id = makeid(6);
            }
        });
        if (!handler.att_id){
            handler.att_id = makeid(6);
        }
    });
    view[CUSTOM_HANDLER] = make_sure_is_list(view[CUSTOM_HANDLER]);
    view[CUSTOM_HANDLER].forEach( handler => {
        if (!handler.att_id){
            handler.att_id = makeid(6);
        }
    });
    view.query = make_sure_is_list(view.query);
    view.query.forEach( query => {
        query[QUERY_FILTER] = make_sure_is_list(query[QUERY_FILTER]);
        query[QUERY_FILTER].forEach(x => {
            if (!x.att_id){
                x.att_id = makeid(6);
            }
        });
    });
    if (!view["att_data-retention-days"]){view["att_data-retention-days"] = -1}
    if (!view["att_exclude-notification"]){view["att_exclude-notification"] = "false"}
    return view;
}