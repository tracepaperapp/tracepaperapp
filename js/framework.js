// Cleanup
document.addEventListener("beforeunload", (event) => {
    if (notification_socket){
        notification_socket.close();
    }
    if (trace_socket){
        trace_socket.close();
    }
});
var mutation_queries = {};
var request_cache = []

function send_mutation(command,data){
    empty_track_and_trace_log();
    var cache_key = JSON.stringify({command: command,data: data});
    if (request_cache.includes(cache_key)){
        return;
    }
    request_cache.push(cache_key);
    let query = mutation_queries[command];
    let anonymous = mutation_queries[command+"_anonymous"];
    appsync_call(query,(data,errors) => {
        if (errors){
            add_trace({
              command: command,
              status: "failed",
              message: `API denied the request`,
              timestamp: new Date().toLocaleString()
            });
            errors.forEach(function(item){
                add_trace({
                  command: "",
                  status: "",
                  message: item["message"],
                  timestamp: new Date().toLocaleString()
                });
            });
        } else {
            var cid = null;
            var tmp = data;
            while (cid == null){
                let key = Object.keys(tmp)[0];
                if (key == "correlationId"){
                    cid = tmp["correlationId"];
                } else {
                    tmp = tmp[key];
                }
            }
            add_trace({
              command: command,
              status: "pending",
              message: `Request accepted, trace id ${cid}`,
              timestamp: new Date().toLocaleString()
            });
            var query_string = `subscription TrackAndTrace($correlationId: String = "") {
                onTrace(correlationId: $correlationId) {
                  command
                  event
                  message
                  status
                  timestamp
                }
              }`;
            trace_socket = Draftsman.subscribe(query_string,(data,errors) => {
                add_trace(data["onTrace"]);
                evaluate_trace_subscribers(command,data["onTrace"]);
            },variables={"correlationId":cid});
        }
    },Draftsman.cleanEmpty(data),anonymous);
}

function list_mutations(){
    return mutation_queries;
}

function register_mutations(){
    var tags = document.getElementsByTagName("draftsman-mutation");
    Array.prototype.slice.call(tags).forEach(mutation => {
        let name = mutation.getAttribute("command");
        let query_string = mutation.innerHTML.trim();
        mutation_queries[name] = query_string;
        mutation_queries[name+"_anonymous"] = !mutation.hasAttribute("authenticated");
    });
    trigger_refresh_form_on_components();
}
window.expiringStorage = {
    getItem(key) {
        return cacheJS.get(key);
    },
    setItem(key, value) {
        cacheJS.set(key,value, this.ttl);
    },
    ttl: 3600
}
const urlParams = new URLSearchParams(window.location.search);
const registerd_variables = {};
var cache_enabled = true;
const Draftsman = {
    fetch_query_parameter: function(variable_name){
        return urlParams.get(variable_name);
    },
    set_variable: function(key,value){
        registerd_variables[key] = value;
    },
    get_variable: function(key){
        return registerd_variables[key];
    },
    query:query,
    subscribe:subscribe,
    subscribe_to_notifications:subscribe_to_notifications,
    empty_track_and_trace_log:empty_track_and_trace_log,
    cleanEmpty: function(obj) {
      if (Array.isArray(obj)) {
        return obj
            .map(v => (v && typeof v === 'object') ? Draftsman.cleanEmpty(v) : v)
            .filter(v => !(v == null));
      } else {
        return Object.entries(obj)
            .map(([k, v]) => [k, v && typeof v === 'object' ? Draftsman.cleanEmpty(v) : v])
            .reduce((a, [k, v]) => (v == null ? a : (a[k]=v, a)), {});
      }
    },
    clear_cache: function(){
        for(var i in localStorage){
            if (i.startsWith("_cache")){
                localStorage.removeItem(i);
            }
        }
    },
    set_query_mode: function(mode){
        query_mode=mode;
    },
    reload_data: async function(alias,filter,force=false){
        var previous_cache_enabled = cache_enabled;
        if (force){
            cache_enabled = false;
        }
        await load_data(alias,filter);
        cache_enabled = previous_cache_enabled;
    },
    disable_cache_for_page: function(){
        cache_enabled = false;
    },
    contains_teleports: false,
    sign_in: function(target_location){
        if (target_location){
            sessionStorage["prevLoc"] = target_location;
        } else {
            sessionStorage["prevLoc"] = location;
        }
        location = "/auth/signin"
    },
    sign_out: function(){
        for(var i in localStorage){
            localStorage.removeItem(i);
        }
        location = "/";
    }
};
//Initialize Draftsman extensions
document.addEventListener('alpine:init', () => {
    Alpine.store("notifications",[]);
    Alpine.store("trace",[]);
    Alpine.store("forms",{});
    Alpine.store("mutation",{send:send_mutation,list:list_mutations});
    for(var key in localStorage){
        if (key.startsWith("store_")){
            key_components = key.split("_");
            if (key_components[2] == location){
                let data = JSON.parse(localStorage[key]);
                Alpine.store(key_components[1],data);
            }
        }
    }
    setTimeout(async function(){
        console.log("Start initializing");
        await load_data();
        console.log("Data loaded");
        initialize_notification_subscribers();
        console.log("Notification subscribers initialized");
        initialize_trace_subscribers();
        console.log("Trace subscribers initialized");
        register_mutations();
        console.log("Mutations registered");
        console.log("Basic initialization ready!");
        setTimeout(function(){
            console.log("Fetch teleports...");
            var teleports = document.querySelectorAll('[x-target]');
            if(document.querySelectorAll('[x-target]').length != 0){
                console.log("Teleports fetched");
                teleports = Array.prototype.slice.call(teleports);
                process_teleports(teleports);
            } else {
                console.log("No teleports found, initialization ready.");
                if (Draftsman.contains_teleports){
                    location.reload();
                }
            }
        },1000);
    },500);
});

async function process_teleports(nodes){
    if (nodes.length != 0 ){
        setTimeout(function(){
            var node = nodes.shift();
            node.setAttribute("x-teleport",node.getAttribute("x-target"))
            console.log(`Teleported ${node.getAttribute("x-teleport")}, ${nodes.length} to go`);
            process_teleports(nodes);
        },1);
    } else {
        console.log("Complete initialization ready!");
        trigger_refresh_form_on_components();
    }
}

function trigger_refresh_form_on_components(){
    var elements = document.getElementsByClassName("form-element");
    for (var i = 0; i < elements.length; i++) {
        elements[i].dispatchEvent(new CustomEvent('refresh'));
    }
}
var subscription_reconnect_backoff = 100;

async function query(query,variables,anonymous){
    var cache_key = JSON.stringify({query: query,variables: variables});
    if(cache_enabled && query.indexOf("filter(") == -1) {
        var cached_response = cacheJS.get(cache_key);
    } else {
        var cached_response = null;
    }
    if (cached_response){
        console.log("cache hit");
        return cached_response;
    } else {
        console.log("cache miss");
        console.log({query: query,variables: variables});
        var data = await appsync_call_promise(query,variables,anonymous);
        if (data){
            cacheJS.set(cache_key,data, 3600);
        }
        return data;
    }
}

function appsync_call_promise(query,variables,anonymous) {
    return new Promise(function (resolve, reject) {
        let xhr = new XMLHttpRequest();
        xhr.responseType = 'json';
        xhr.open('POST', api_url);
        xhr.setRequestHeader('Content-Type', 'application/json');
        if (anonymous) {
            xhr.setRequestHeader('x-api-key', api_key);
        } else {
            xhr.setRequestHeader('Authorization', localStorage["token"]);
        }
        xhr.onreadystatechange = function () {
            if(xhr.readyState == 4 && xhr.status == 401){
                sessionStorage["prevLoc"] = location;
                location = "/auth/signin";
            }
        }
        xhr.onload = function () {
            console.log(xhr.response);
            if (this.status >= 200 && this.status < 300) {
                resolve(xhr.response.data);
            } else {
                reject(xhr.response.errors);
            }
        };
        xhr.onerror = function () {
            console.log(xhr.statusText);
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };
        xhr.send(JSON.stringify({
            query: query,
            variables: variables
        }));
    });
}

function subscribe(query,callback,variables={},anonymous=true,cid=""){
    const data = {
        query : query,
        variables: Object.fromEntries(Object.entries(variables).filter(([_, v]) => v != null))
    };
    console.log(data);
    var header = {
        "host": api_url.replace("https://","").replace("/graphql",""),
    }
    if (cid != ""){
        header["correlation-id"] = cid;
    }
    if (anonymous){
        header["x-api-key"] = api_key;
    } else {
        header["Authorization"] = localStorage["token"];
    }
    let ws = `${api_ws}?header=${btoa(JSON.stringify(header))}&payload=e30=`;
    let socket = new WebSocket(ws,"graphql-ws");
    socket.onopen = function(e) {
      socket.send(JSON.stringify({
        "id":uuidv4(),
        "payload":{
            "data": JSON.stringify(data),
            "extensions":{
                "authorization": header
            }
        },
        "type":"start"
      }));
    };
    socket.onmessage = function(event) {
        let data = JSON.parse(event.data).payload
        if (data){
            callback(data.data, data.errors);
        }
    };
    socket.onclose = function(event) {
      if (event.wasClean) {
        console.log(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
      } else {
        subscription_reconnect_backoff += 1000;
        console.log(`[close] Connection died, attempt to reconnect in ${subscription_reconnect_backoff/1000} seconds`);
        setTimeout(function(){
            Draftsman.subscribe(query,callback,variables);
        },subscription_reconnect_backoff);
      }
    };
    socket.onerror = function(error) {
      console.log(`[error] ${error.message}`);
    };
    return socket;
}

function appsync_call(query,callback,variables={},anonymous=false){
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'json';
    xhr.open('POST', api_url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (anonymous){
        xhr.setRequestHeader('x-api-key', api_key);
    } else {
        xhr.setRequestHeader('Authorization', localStorage["token"]);
    }
    xhr.onreadystatechange = function () {
        if(xhr.readyState == 4 && xhr.status == 401){
            sessionStorage["prevLoc"] = location;
            location = "/auth/signin";
        }
    }
    xhr.onload = function () {
        callback(xhr.response.data,xhr.response.errors);
    };
    console.log("Send request",JSON.stringify({
        query: query,
        variables: variables
    },indent=4));
    xhr.send(JSON.stringify({
        query: query,
        variables: variables
    }));
}



var notification_socket = null;
var notification_actions = [];
var notification_subscription_started = false;
var notifications = [];

function initialize_notification_subscribers(){
    var tags = document.getElementsByTagName("draftsman-notification");
    Array.prototype.slice.call(tags).forEach(sub => {
        Draftsman.subscribe_to_notifications(filter={
            identifier: sub.getAttribute("identifier"),
            message: sub.getAttribute("message"),
            type: sub.getAttribute("type")
        },function(notification){
            sub.dispatchEvent(new CustomEvent('notification',{detail:notification}));
        });
    });
}

function subscribe_to_notifications(filter={
        identifier: null,
        message: null,
        type: null
    },callback=console.log){
    notification_actions.push({filter:filter,callback:callback});
    start_notification_subscription();
}

function start_notification_subscription(){
    if (notification_subscription_started){return;}
    var query_string = `subscription Notification {
      onNotification {
        identifier
        message
        type
      }
    }`;
    notification_socket = Draftsman.subscribe(query_string,(data,errors) => {
        if (data.onNotification){
            console.log(JSON.stringify(data,null,2));
            Alpine.store("notifications").push(data.onNotification);
            notification_actions.forEach(action => {
                var checks = [];
                if (action.filter.identifier != null){
                    checks.push(action.filter.identifier == data.onNotification.identifier);
                }
                if (action.filter.message != null){
                    checks.push(action.filter.message == data.onNotification.message);
                }
                if (action.filter.type != null){
                    checks.push(action.filter.type == data.onNotification.type);
                }
                if (checks.every(v => v === true)){
                    action.callback(data.onNotification);
                }
            });
        }
    });
    notification_subscription_started = true;
}
var query_mode = "automtic";
async function load_data(alias,filter){
    let key = "lq" + location;
    if (query_mode == "on-demand" && alias != null){
        localStorage[key] = JSON.stringify({
            alias:alias,
            filter:filter
        });
    } else if (query_mode == "on-demand" && alias == null && localStorage[key]){
        let param = JSON.parse(localStorage[key]);
        return load_data(param["alias"],param["filter"]);
    } else if (query_mode == "on-demand" && alias == null){
        return;
    }
    if (filter){
        filter = Object.fromEntries(Object.entries(filter).filter(([_, v]) => v != null && v != ""));
        for (const [key, value] of Object.entries(filter)) {
          Draftsman.set_variable(key,value);
        }
    }

    var tags = document.getElementsByTagName("draftsman-query");
    tags = Array.prototype.slice.call(tags);
    if (query_mode == "on-demand" && alias != null){
        tags = tags.filter(q => q.getAttribute("alias") == alias);
    }
    var aliases = [];
    var authorized = false;
    var variable_defaults = [];
    var variable_mapping = {};
    var query = "";
    var variable_number = 0;
    tags.forEach(q => {

        // Extract query
        let nested_query = q.innerHTML.trim();
        nested_query = nested_query.substring(nested_query.indexOf('{')+1).trim().slice(0, -1);

        // Extract variables
        let variables = [];
        try{
            variables = q.innerHTML.split("{").at(0).split(")").at(0).split("(").at(1).split(",").map(v =>{
                            variable_number++;
                            let replacement = "$V" + variable_number;
                            let key = v.split(":").at(0);
                            variable_defaults.push(v.replace(key,replacement));
                            let param_key = key.replace("$","").trim();
                            let value = Draftsman.fetch_query_parameter(param_key);
                            if (value){
                                variable_mapping[replacement.replace("$","")] = value;
                            } else if (Object.keys(registerd_variables).includes(param_key)){
                                variable_mapping[replacement.replace("$","")] = registerd_variables[param_key];
                            }
                            return {
                                "key" : key,
                                "replacement" : replacement
                            };
                        });
        } catch {
            //pass
        }

        let alias = q.getAttribute("alias");
        Alpine.store(alias, {});
        authorized = authorized || q.hasAttribute("authenticated");
        aliases.push(alias);

        //Replace keys
        if (filter){
            var filter_keys = Object.keys(filter);
            var new_filter = "";
            var excluded = [];
            variables.forEach(v =>{
                var key = v["key"].replace("$","").trim();
                if (filter_keys.indexOf(key) !== -1){
                    new_filter += `${key}: ${v["key"]},`;
                } else {
                   excluded.push(v["replacement"].trim());
                }
            });
            new_filter = new_filter.slice(0, -1);
            nested_query = nested_query.split("(").at(0) + "(" + new_filter + ")" + nested_query.split(")").at(-1);
            nested_query = nested_query.replace("()","");
            variable_defaults = variable_defaults.filter(d => !excluded.includes(d.split(":").at(0)))
        }
        variables.forEach(v =>{
                nested_query = nested_query.replace(v["key"],v["replacement"]);
        });
        query += `${alias}: ${nested_query}\n`;
    });

    if (variable_defaults.length != 0){
        query = `query Query(${variable_defaults.join()}) {\n${query}`;
    } else {
        query = "query Query {\n" + query;
    }
    query += "}";
    console.log(query);
    console.log(variable_mapping);
    if(query.replaceAll("\n","") == "query Query {}"){
        return;
    }
    var data = await Draftsman.query(query,variable_mapping,!authorized);
    aliases.forEach(alias => {
        Alpine.store(alias, data[alias]);
        let key = "store_" + alias + "_" + location;
        localStorage[key] = JSON.stringify(data[alias]);
    });
    trigger_refresh_data_on_components();
}

function trigger_refresh_data_on_components(){
    var elements = document.getElementsByClassName("data-element");
    for (var i = 0; i < elements.length; i++) {
        elements[i].dispatchEvent(new CustomEvent('refresh'));
    }
}
var trace_socket = null;
var trace_actions = [];

function initialize_trace_subscribers(){
    var tags = document.getElementsByTagName("draftsman-trace");
    Array.prototype.slice.call(tags).forEach(sub => {
        trace_actions.push({
            "command" : sub.getAttribute("command"),
            "component" : sub.getAttribute("component"),
            "status" : sub.getAttribute("status"),
            "element": sub
        });
    });
}

function evaluate_trace_subscribers(command,trace_message){
    trace_actions.forEach(action => {
        if (command == action.command){
            var checks = [true];
            if (action.component){
                checks.push(trace_message.command == action.component);
            }
            if (action.status){
                checks.push(trace_message.status == action.status);
            }
            if (checks.every(v => v === true)){
                action.element.dispatchEvent(new CustomEvent('trace',{detail:trace_message}));
            }
        }
    });
}

function add_trace(message){
    Alpine.store("trace").unshift(message);
}

function empty_track_and_trace_log(){
    if (trace_socket){
        trace_socket.close();
    }
    while (Alpine.store("trace").length != 0){
        Alpine.store("trace").pop();
    }
}
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
