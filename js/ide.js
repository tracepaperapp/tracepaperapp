
window.Expression = {
    get_role_expressions: async function(){
        let files = await FileSystem.listFiles();
        let expressions = files.filter(x => x.startsWith("expressions/") && x.endsWith(".xml"));
        expressions = await Promise.all(expressions.map(async x => await Modeler.get(x)));
        return expressions.filter(x => x.att_type == 'ActorEventRole');
    },
    get_keyfield_expressions: async function(){
        let files = await FileSystem.listFiles();
        let expressions = files.filter(x => x.startsWith("expressions/") && x.endsWith(".xml"));
        expressions = await Promise.all(expressions.map(async x => await Modeler.get(x)));
        return expressions.filter(x => x.att_type == 'TriggerKeyField');
    },
    list: async function(){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith("expressions/") && x.endsWith(".xml"));
        let expressions = [];
        for(let i =0; i < files.length; i++){
            expressions.push({
                    model: await Modeler.get(files[i]),
                    docs: await Modeler.get(files[i].replace('.xml','.md')),
                    file: files[i]
                });
        }
        return expressions;
    },
    rename: async function(model,file,name){
        let newPath = "expressions/" + name + ".xml"
        if (await Modeler.exists(newPath)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        model.att_name = name;
        try{
            await Modeler.sync_to_disk();
        }catch{}
        await Modeler.rename(file,newPath);
        await Modeler.rename(file.replace('.xml','.md'),newPath.replace('.xml','.md'));
        try{
            await Modeler.sync_to_disk();
        }catch{}
        await sleep(2000);
        location.reload();
    },
    create: async function(data){
        if (!check_pattern(data.name,lower_or_camel_cased)){
            Session.show_exception("Invalid configuration, expression not created!");
            return;
        }
        let file = "expressions/" + data.name + ".xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let expression = {
            "att_name": data.name,
            "att_type": data.type,
            "att_input": data.input,
            "att_expression": data.expression
        };
        expression = {expression:expression};
        let tab = session.tab;
        session.tab = "";
        await Modeler.save_model(file,expression);
        if (data.docs && data.docs != 'documentation'){
            await Modeler.save_model(file.replace('.xml','.md'),{content:data.docs});
        }
        await sleep(1000);
        session.tab = tab;
    }
}
import http from '/js/http.js';

const dir = '/project';
const proxy = "https://git.draftsman.io";
var fs = null;
var branch = "main";
var CHANGES = false;

async function connect_repository(){
    if (location.href.indexOf("/modeler") > -1){
        return;
    }
    let reload_tab = false;
    session.loading = true;
    //branch = localStorage.username;
    localStorage.branch = branch;
    try{
    fs = new LightningFS(localStorage.project_drn);
    if (await FileSystem.read("README.md") == "documentation"){
        console.log("clone project",localStorage.project_drn);
        await git.clone({ fs, http, dir, url: localStorage.project_repo, corsProxy: proxy });

        console.log("set author");
        await git.setConfig({
          fs,
          dir: dir,
          path: 'user.name',
          value: context.fullName
        });
        reload_tab = true;
    } else {
        if(await FileSystem.staged_files()){
            console.log("local changes found, push to remote");
            await push_to_remote();
            await sleep(1000);
        }else{
            console.log("Pull", localStorage.project_name);
            await FileSystem.pull();
        }
    }
    }catch(exception){
        console.error("could not connect repo -->",exception);
    }
    setTimeout(async function(){
        console.log("Checkout branch", localStorage.project_drn + ":" + branch);
        try{
            await FileSystem.checkout_branch(branch);
        }catch(exception){
            console.error("checkout failed -->",exception);
        }
        sessionStorage.checkout = localStorage.project_drn;
        setTimeout(Navigation.soft_reload,500);
        session.loading = false;
        Navigation.soft_reload();
        setTimeout(SearchEngine.index,1000);
        if (reload_tab){
            document.getElementById('modeler-container').contentWindow.location.reload();
        }
    },100);

}

window.FileSystem = {
    listFiles: async function(){
        return await git.listFiles({ fs, dir: dir, ref: 'HEAD' });
    },
    read: async function(filepath){
        try{
            return await fs.promises.readFile(dir + "/" + filepath, "utf8");
        } catch {
            if (filepath.endsWith(".md")){
                return "documentation";
            } else {
                return "file not found";
            }
        }
    },
    write: async function(filepath,content){
        let check = await FileSystem.read(filepath);
        if (check == content){
            return;
        }
        if (content == ""){
            await FileSystem.delete(filepath);
        } else {
            await FileSystem.create_dir(filepath);
            await fs.promises.writeFile(dir + "/" + filepath, content,"utf8");
            await git.add({ fs, dir: dir, filepath: filepath });
        }
    },
    rename: async function(oldPath,newPath){
        await FileSystem.create_dir(newPath);
        let source = await FileSystem.read(oldPath);
        await FileSystem.write(newPath,source);
        await FileSystem.delete(oldPath);
    },
    delete: async function(filepath){
        try{
            await git.remove({ fs, dir: dir, filepath: filepath });
            await fs.promises.unlink(dir + "/" + filepath);
        }catch (err){
            console.log("-->",err);
        }
    },
    create_dir: async function(path){
        var subdir = dir;
        for (const sub of path.split('/')){
            if (!sub || sub.includes(".")){
                continue;
            }
            subdir += '/' + sub;
            try{
                await fs.promises.mkdir(subdir);
            } catch{}
        }
    },
    auto_commit: async function(){
        await FileSystem.commit("Auto commit");
    },
    commit: async function(message){
        let sha = await git.commit({
          fs,
          dir: dir,
          author: {
            name: context.fullName,
            email: context.username + '@example.com',
          },
          message: message
        });
        let pushResult = await git.push({
          fs,
          http,
          dir: dir,
          remote: 'origin',
          force: true,
          ref: branch,
          corsProxy: proxy
        })
        await FileSystem.pull();
    },
    pull: async function(){
        await git.fetch({fs,dir: dir,http: http});
        await git.pull({fs,http,dir: dir});
        session.last_pull = getCurrentTime();
    },
    checkout_branch: async function(branch){
        await git.fetch({
          fs,
          dir: dir,
          http: http
        })
        try{
            await git.branch({ fs, dir: dir, ref: branch });
        }catch(err){console.log(err)}
        await git.checkout({
          fs,
          dir: dir,
          ref: branch
        })
        await git.pull({
          fs,
          http,
          dir: dir
        })
    },
    staged_files: async function(){
        let status = await get_status_matrix();
        return status.length != 0;
    }
}

async function get_status_matrix(){
    let status = await git.statusMatrix({fs,dir: dir});
    return status.filter(x => !(x[1] == 1 && x[3] == 1));
}

document.addEventListener('alpine:init', async () => {
    if (localStorage.project_repo && localStorage.project_repo != ""){
        console.log("Connect -->",localStorage.project_repo);
        connect_repository();
    }
});

if (location.pathname != "/"){
    //branch = localStorage.username;
    fs = new LightningFS(localStorage.project_drn);
    setTimeout(Navigation.soft_reload,100);
    localStorage.branch = branch;
}

var pull_countdown = 60;
var push_lock = false;
async function push_to_remote(){
    await validate_and_repair_model();
    if(await FileSystem.staged_files()){
        if (push_lock){return};
        push_lock = true;
        try{
            session.saving = true;
            await FileSystem.auto_commit();
            session.saving = false;
            session.last_save = getCurrentTime();
            await sleep(1000);
            await FileSystem.pull();
            Navigation.soft_reload();
            SearchEngine.index(true);
        }catch(err){
            console.error(err)
            console.log("Going to force pull");
            let repo = sessionStorage.checkout;
            sessionStorage.removeItem("checkout");
            indexedDB.deleteDatabase(repo);
            location.reload();
        }finally{
            push_lock = false;
        }
    } else {
        session.saving = false;
        pull_countdown -= 1;
        if (pull_countdown == 0){
            pull_countdown = 60;
            await FileSystem.pull();
        }
    }
}
if (location.pathname == "/"){
    setInterval(push_to_remote,5000);
}

function getCurrentTime() {
  let now = new Date();
  let hour = now.getHours().toString().padStart(2, '0');
  let minute = now.getMinutes().toString().padStart(2, '0');
  return hour + ":" + minute;
}

window.generateBuildId = function() {
  let now = new Date();
  let year = now.getFullYear().toString();
  let month = (now.getMonth() + 1).toString().padStart(2, '0');
  let day = now.getDate().toString().padStart(2, '0');
  let hour = now.getHours().toString().padStart(2, '0');
  let minute = now.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}
window.regions = [
    {
        "name": "Stockholm",
        "full_name": "EU (Stockholm)",
        "code": "eu-north-1",
        "public": true,
        "zones": [
            "eu-north-1a",
            "eu-north-1b",
            "eu-north-1c"
        ]
    },
    {
        "name": "Ireland",
        "full_name": "EU (Ireland)",
        "code": "eu-west-1",
        "public": true,
        "zones": [
            "eu-west-1a",
            "eu-west-1b",
            "eu-west-1c"
        ]
    },
    {
        "name": "London",
        "full_name": "EU (London)",
        "code": "eu-west-2",
        "public": true,
        "zones": [
            "eu-west-2a",
            "eu-west-2b",
            "eu-west-2c"
        ]
    },
    {
        "name": "Paris",
        "full_name": "EU (Paris)",
        "code": "eu-west-3",
        "public": true,
        "zones": [
            "eu-west-3a",
            "eu-west-3b",
            "eu-west-3c"
        ]
    },
    {
        "name": "Frankfurt",
        "full_name": "EU (Frankfurt)",
        "code": "eu-central-1",
        "public": true,
        "zones": [
            "eu-central-1a",
            "eu-central-1b",
            "eu-central-1c"
        ]
    },
    {
        "name": "Milan",
        "full_name": "EU (Milan)",
        "code": "eu-south-1",
        "public": true,
        "zones": [
            "eu-south-1a",
            "eu-south-1b",
            "eu-south-1c"
        ]
    },
	{
		"name": "N. Virginia",
		"full_name": "US East (N. Virginia)",
		"code": "us-east-1",
		"public": true,
		"zones": [
			"us-east-1a",
			"us-east-1b",
			"us-east-1c",
			"us-east-1d",
			"us-east-1e",
			"us-east-1f"
		]
	},
	{
		"name": "Ohio",
		"full_name": "US East (Ohio)",
		"code": "us-east-2",
		"public": true,
		"zones": [
			"us-east-2a",
			"us-east-2b",
			"us-east-2c"
		]
	},
	{
		"name": "N. California",
		"full_name": "US West (N. California)",
		"code": "us-west-1",
		"public": true,
		"zone_limit": 2,
		"zones": [
			"us-west-1a",
			"us-west-1b",
			"us-west-1c"
		]
	},
	{
		"name": "Oregon",
		"full_name": "US West (Oregon)",
		"code": "us-west-2",
		"public": true,
		"zones": [
			"us-west-2a",
			"us-west-2b",
			"us-west-2c",
			"us-west-2d"
		]
	},
	{
		"name": "GovCloud West",
		"full_name": "AWS GovCloud (US)",
		"code": "us-gov-west-1",
		"public": false,
		"zones": [
			"us-gov-west-1a",
			"us-gov-west-1b",
			"us-gov-west-1c"
		]
	},
	{
		"name": "GovCloud East",
		"full_name": "AWS GovCloud (US-East)",
		"code": "us-gov-east-1",
		"public": false,
		"zones": [
			"us-gov-east-1a",
			"us-gov-east-1b",
			"us-gov-east-1c"
		]
	},
	{
		"name": "Canada",
		"full_name": "Canada (Central)",
		"code": "ca-central-1",
		"public": true,
		"zones": [
			"ca-central-1a",
			"ca-central-1b",
			"ca-central-1c",
			"ca-central-1d"
		]
	},
	{
		"name": "Cape Town",
		"full_name": "Africa (Cape Town)",
		"code": "af-south-1",
		"public": true,
		"zones": [
			"af-south-1a",
			"af-south-1b",
			"af-south-1c"
		]
	},
	{
		"name": "Tokyo",
		"full_name": "Asia Pacific (Tokyo)",
		"code": "ap-northeast-1",
		"public": true,
		"zone_limit": 3,
		"zones": [
			"ap-northeast-1a",
			"ap-northeast-1b",
			"ap-northeast-1c",
			"ap-northeast-1d"
		]
	},
	{
		"name": "Seoul",
		"full_name": "Asia Pacific (Seoul)",
		"code": "ap-northeast-2",
		"public": true,
		"zones": [
			"ap-northeast-2a",
			"ap-northeast-2b",
			"ap-northeast-2c",
			"ap-northeast-2d"
		]
	},
	{
		"name": "Osaka",
		"full_name": "Asia Pacific (Osaka-Local)",
		"code": "ap-northeast-3",
		"public": true,
		"zones": [
			"ap-northeast-3a",
			"ap-northeast-3b",
			"ap-northeast-3c"
		]
	},
	{
		"name": "Singapore",
		"full_name": "Asia Pacific (Singapore)",
		"code": "ap-southeast-1",
		"public": true,
		"zones": [
			"ap-southeast-1a",
			"ap-southeast-1b",
			"ap-southeast-1c"
		]
	},
	{
		"name": "Sydney",
		"full_name": "Asia Pacific (Sydney)",
		"code": "ap-southeast-2",
		"public": true,
		"zones": [
			"ap-southeast-2a",
			"ap-southeast-2b",
			"ap-southeast-2c"
		]
	},
	{
		"name": "Jakarta",
		"full_name": "Asia Pacific (Jakarta)",
		"code": "ap-southeast-3",
		"public": true,
		"zones": [
			"ap-southeast-3a",
			"ap-southeast-3b",
			"ap-southeast-3c"
		]
	},
	{
		"name": "Hong Kong",
		"full_name": "Asia Pacific (Hong Kong)",
		"code": "ap-east-1",
		"public": true,
		"zones": [
			"ap-east-1a",
			"ap-east-1b",
			"ap-east-1c"
		]
	},
	{
		"name": "Mumbai",
		"full_name": "Asia Pacific (Mumbai)",
		"code": "ap-south-1",
		"public": true,
		"zones": [
			"ap-south-1a",
			"ap-south-1b",
			"ap-south-1c"
		]
	},
	{
		"name": "São Paulo",
		"full_name": "South America (São Paulo)",
		"code": "sa-east-1",
		"public": true,
		"zone_limit": 2,
		"zones": [
			"sa-east-1a",
			"sa-east-1b",
			"sa-east-1c"
		]
	},
	{
		"name": "Bahrain",
		"full_name": "Middle East (Bahrain)",
		"code": "me-south-1",
		"public": true,
		"zones": [
			"me-south-1a",
			"me-south-1b",
			"me-south-1c"
		]
	},
	{
		"name": "Beijing",
		"full_name": "China (Beijing)",
		"code": "cn-north-1",
		"public": false,
		"zones": [
			"cn-north-1a",
			"cn-north-1b",
			"cn-north-1c"
		]
	},
	{
		"name": "Ningxia",
		"full_name": "China (Ningxia)",
		"code": "cn-northwest-1",
		"public": false,
		"zones": [
			"cn-northwest-1a",
			"cn-northwest-1b",
			"cn-northwest-1c"
		]
	}
]

window.create_pipeline = function(region,project){
    console.log(region,project);
    let repo = project.repositories.filter(x => x.name == 'code').at(0).url;
    console.log(repo);
    let url = 'https://' + region.code + '.console.aws.amazon.com/cloudformation/home?region='
        + region.code + '#/stacks/create/review?templateURL=https://s3.eu-central-1.amazonaws.com/templates.draftsman.io/draftsman-application-pipeline-v5.yml&stackName='
        + project.name.toLowerCase() + '-main-pipeline&param_GithubWorkspace='
        + repo.split('/').at(-2).toLowerCase() + '&param_RepositoryName='
        + repo.split('/').at(-1).toLowerCase() + '&param_RepositoryBranch=main&param_ProjectName='
        + project.name.toLowerCase() + '&param_DRN='
        + localStorage.project + '&param_GraphQL=' + api_url + '&param_APIKEY=' + api_key;
    window.open(url, '_blank');
}

const options = {
    ignoreAttributes : false,
    format: true,
    attributeNamePrefix : "att_"
};

var parser = new XMLParser(options);
var builder = new XMLBuilder(options);
let model_cache = {};
let view_path_cache = {};

window.Modeler = {
    exists: async function(file){
        let files = await FileSystem.listFiles();
        return files.filter(x => x == file).length == 1;
    },
    event_exists: async function(eventName){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.endsWith(eventName + ".xml")).length > 0;
    },
    list_events: async function(){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.endsWith(".xml"))
            .filter(x => x.startsWith("commands/") || x.includes("/events/"))
            .map(x => x.split("/").at(-1).replace('.xml','')).sort().concat(["FileUploaded"]);
    },
    list_python_modules: async function(){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.startsWith('lib/') && x.endsWith(".py")).sort();
    },
    get_methods: async function(module,type){
        let model = await Modeler.get(module,true);
        if (type == "behavior" || type == "notifier"){
            let filter = "(flow):";
            return model.content.split("\n")
                .filter(x => x.startsWith("def ") && x.endsWith(filter))
                .map(x => x.replace("def ","").replace(filter,""));
        } else {
            return [];
        }
    },
    list_templates: async function(){
            let files = await FileSystem.listFiles();
            return files.filter(x => x.startsWith('templates/')).sort();
        },
    determine_type: function(file){
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
    },
    force_sync_to_cache: function(file,model){
        let content = Alpine.reactive(model);
        model_cache[file] = content;
    },
    get: async function(file,readonly=false){
        if (!sessionStorage.checkout){
            return null;
        }
        let content;
        if (file in model_cache && !readonly){
            content = model_cache[file];
        } else {
            content = await FileSystem.read(file);
            if (file.endsWith(".xml")){
                content = parser.parse(content);
            } else if (file.endsWith(".json")){
                content = JSON.parse(content);
                if (file == "meta.json"){
                    content.roles = make_sure_is_list(content.roles);
                }
            } else {
                content = {content:content};
            }
            if (!readonly){
                content = Alpine.reactive(content);
                model_cache[file] = content;
            }
        }
        if (file.endsWith(".xml")){
            let root = Object.keys(content).at(0);
            if (root == "?xml"){
                root = Object.keys(content).at(1);
            }
            content = content[root];
            let type = Modeler.determine_type(file);
            content = Modeler.prepare_model(type,content);
        }
        return content;
    },
    get_by_name: async function(name,readonly=false){
        if (name == "FileUploaded"){
            console.log("The FileUploaded model is only available as readonly!");
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
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.endsWith(name + ".xml"));
        files = files.filter(x => !x.includes("/event-handlers/"))
        if (files.lenght == 0){
            throw new Error('Model not found');
        }
        if (files.length > 1){
            console.log(files);
            throw new Error('Ambiguous name');
        }
        return await Modeler.get(files.at(0),readonly);
    },
    get_view_by_name: async function(name,readonly=false){
            let files = await FileSystem.listFiles();
            files = files.filter(x => x.startsWith("views/") && x.endsWith(name + ".xml"));
            if (files.lenght == 0){
                throw new Error('Model not found');
            }
            if (files.length > 1){
                console.log(files);
                throw new Error('Ambiguous name');
            }
            return await Modeler.get(files.at(0),readonly);
        },
    delete: async function(file,reload=true){
        Modeler.auto_save = false;
        let type = Modeler.determine_type(file);
        if (type == "aggregate"){
            Aggregate.delete(file);
        } else if (type == "event"){
            Aggregate.delete_event(file);
        } else {
            await FileSystem.delete(file);
            await FileSystem.delete(file.replace(".xml",".md"));
        }
        if (reload){
            await sleep(1000);
            parent.postMessage({type:'deleted',file:file});
        }
    },
    prepare_model: function(type,model){
        if (type == "view"){
            return View.prepare(model);
        } else if (type == "behavior"){
            return Behavior.prepare(model);
        } else if (type == "notifier"){
            return Notifier.prepare(model);
        } else if (type == "projection"){
            return Projection.prepare(model);
        } else if (type == "command"){
            return Command.prepare(model);
        } else if (type == "config"){
            if (!model.global || model.global == ''){
                model.global = {};
            }
            model.global.dependency = make_sure_is_list(model.global.dependency);
            return model;
       } else if(type == "scenario"){
            return Scenario.prepare(model);
        } else {
            model.field = make_sure_is_list(model.field);
            model["nested-object"] = make_sure_is_list(model["nested-object"]);
            model["nested-object"].forEach(x => {x.field = make_sure_is_list(x.field)});
            model.mapping = make_sure_is_list(model.mapping);
            model['nested-mapping']  = make_sure_is_list(model['nested-mapping']);
            model["nested-mapping"].forEach(x => {x.mapping = make_sure_is_list(x.mapping)});
            return model;
        }
    },
    convertMarkdownToHtml: function(markdown){
        try{
            var converter = new showdown.Converter();
            var html = converter.makeHtml(markdown);
            html = html.replaceAll('<img','<img style="width:100%;"');
            return html;
        } catch(ex) {
            console.error(ex);
            return markdown;
        }
    },
    get_summary: async function(){
        let summary = {};
        let files = await FileSystem.listFiles();
        summary["commands"] = files.filter(x => x.startsWith('commands/') && x.endsWith('.xml')).length;
        summary["aggregates"] = files.filter(x => x.startsWith('domain/') && x.endsWith('root.xml')).length;
        summary["subdomains"] = files.filter(x => x.startsWith('domain/') && x.endsWith('root.xml')).map(x => x.split("/").at(1));
        summary["subdomains"] = summary["subdomains"].filter(function(item, pos) {return summary["subdomains"].indexOf(item) == pos;}).length;
        summary["domainEvents"] = files.filter(x => x.startsWith('domain/') && x.endsWith('.xml') && x.includes("/events/")).length;
        summary["notifiers"] = files.filter(x => x.startsWith('notifiers/') && x.endsWith('.xml')).length;
        summary["views"] = files.filter(x => x.startsWith('views/') && x.endsWith('.xml')).length;
        summary["projections"] = files.filter(x => x.startsWith('projections/') && x.endsWith('.xml')).length;
        return summary;
    },
    render_treemap: async function(){
        let reactiveSelection = Alpine.reactive({"selected": null});
        let cb = [];
        let data = [['Concept', 'Parent'],["Domain",null],["Write Domain","Domain"],["Automations","Write Domain"],["Query Domain","Domain"]];
        let files = await FileSystem.listFiles();
        files.filter(x => x.startsWith('domain/') && x.endsWith('.xml') && x.includes('/behavior-flows/')).forEach(x => {
            let path = x.split("/");

            let sub = path[1];
            if (!cb.includes(sub)){
               cb.push(sub);
               data.push([sub,"Write Domain"]);
            }

            let agg = path[2];
            if (!cb.includes(agg)){
               cb.push(agg);
               data.push([agg,sub]);
            }

            let behavior = path[4].replace(".xml","");
            data.push([sub + "." + agg + "." + behavior,agg]);
         });

        files.filter(x => x.startsWith('notifiers/') && x.endsWith('.xml')).forEach(x => {
            data.push([":" + x.split("/").at(-1).replace(".xml",""),"Automations"]);
        });

        cb = [];
        files.filter(x => x.startsWith('views/') && x.endsWith('.xml')).forEach(x => {
            let path = x.split("/");
            path.shift();
            let viewsub = "Query Domain"
            path.forEach(p => {
                if (p.endsWith(".xml")){
                    let v = p.replace(".xml"," view");
                    data.push([v,viewsub]);
                    view_path_cache[v] = x;
                }else{
                    if (!cb.includes(p)){
                       cb.push(p);
                       data.push(["v-" + p,viewsub]);
                    }
                    viewsub = "v-" + p;
                }
            });
         });

        files.filter(x => x.startsWith('projections/') && x.endsWith('.xml')).forEach(x => {
            let path = x.split("/");
            path.shift();
            let viewsub = "Query Domain"
            path.forEach(p => {
                if (p.endsWith(".xml")){
                    let v = p.replace(".xml"," projection");
                    data.push([v,viewsub]);
                    view_path_cache[v] = x;
                }else{
                    if (!cb.includes(p)){
                       cb.push(p);
                       data.push(["v-" + p,viewsub]);
                    }
                    viewsub = "v-" + p;
                }
            });
         });

        google.charts.load('current', {'packages':['treemap']});
        google.charts.setOnLoadCallback(function(){
            let dataset = google.visualization.arrayToDataTable(data);
            let tree = new google.visualization.TreeMap(document.getElementById('treemap'));
            tree.draw(dataset, {
              minColor: '#d1dbff',
              midColor: '#d1dbff',
              maxColor: '#d1dbff',
              headerHeight: 15,
              fontColor: 'black',
              showScale: false
            });

            function navigate_tree(e){
                reactiveSelection.selected = data[e.row + 1];
            }

            google.visualization.events.addListener(tree, 'drilldown', navigate_tree);
            google.visualization.events.addListener(tree, 'rollup', function(){reactiveSelection.selected = null});
        });
        return reactiveSelection;
    },
    open_from_tree_map: function(selected){
        if (selected.at(1) == "Write Domain"){
            parent.postMessage({type:'diagram',file: `domain/${selected.at(0)}`});
        } else if (selected.at(0).startsWith(":")){
            parent.postMessage({type:'open',file: `notifiers/${selected.at(0).replace(":","")}.xml`});
        } else if (selected.at(0).endsWith(" view") || selected.at(0).endsWith(" projection")){
            parent.postMessage({type:'open',file: view_path_cache[selected.at(0)]});
        } else if (!selected.at(0).includes(".")){
            parent.postMessage({type:'open',file: `domain/${selected.at(1)}/${selected.at(0)}/root.xml`});
        } else {
            parent.postMessage({type:'open',file: `domain/${selected.at(0).replaceAll('.','/').replace(`/${selected.at(1)}/`,`/${selected.at(1)}/behavior-flows/`)}.xml`});
        }
    },
    rename: async function(oldPath,newPath){
        model_cache[newPath] = model_cache[oldPath];
        delete model_cache[oldPath];
        await FileSystem.rename(oldPath, newPath);
    },
    save_model: async function(file,content){
        if (file.endsWith(".xml")){
            let placeholder = "placeholder-6a3eacfc-85ff-4414-938d-511785c46536";
            let json = JSON.stringify(content);
            json = json.replaceAll('"true"','"' + placeholder + '"');
            json = JSON.parse(json);
            let xml = builder.build(json);
            xml = xml.replaceAll(placeholder,"true");
            await FileSystem.write(file,xml);
        } else if (file.endsWith(".json")){
            content = JSON.stringify(content,null,2);
            await FileSystem.write(file,content);
        } else {
            content = content["content"];
            await FileSystem.write(file,content);
        }
    },
    sync_to_disk: async function(){
        let keys =  Object.keys(model_cache);
        for(let i = 0; i < keys.length; i++) {
            let file = keys[i];
            let content = model_cache[file];
            let type = Modeler.determine_type(file);
            try{
                if (type == "scenario"){
                    content[type].activity.forEach(activity => {
                        activity.input = deduplicate(activity.input,'att_name');
                    });
                }
            }catch{}
            await Modeler.save_model(file,content);
            model_cache[file] = content;
        }
    },
    auto_save: true,
    get_roles: async function(){
        let roles = [""];
        let meta = await Modeler.get("meta.json",true);
        roles = roles.concat(meta.roles);
        let expressions = await Expression.get_role_expressions();
        roles = roles.concat(expressions.map(x => `#global.${x.att_name}(${x.att_input.replaceAll(';',', ')})`));
        return roles;
    },
    create_module: async function(data){
        if (!check_pattern(data.name,pascal_cased)){
            Session.show_exception("Invalid name, module not created!");
            return;
        }
        let file = "lib/" + data.name + ".py";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let code = {
            "content": code_template
        };
        await Modeler.save_model(file,code);
        await sleep(1000);
        Navigation.open(file);
    },
    prepare_wizard: async function(){
        let data = {};
        let model = await Modeler.get(session.tab,true);
        let type = Modeler.determine_type(session.tab);
        if (type == "command" || type == "projection"){
            data.namespace = model["att_graphql-namespace"];
            let path = data.namespace.split(".");
            data.subdomain = path[0];
            if (path.length > 1){
                data.aggregate = path[1];
                data.selected_aggregate = path[1];
            }
            data.key = "arn";
        } else if (type == "aggregate" || type == "event" || type == "behavior"){
            let path = session.tab.split("/");
            data.namespace = path[1] + "." + path[2];
            data.selected_aggregate = path[2];
            data.subdomain = path[1];
            data.key = model["att_business-key"];
        } else if (type == "view"){
            data.namespace = session.tab.replace('views/','').split('/').filter(x => !x.includes('.xml')).join('.');
        }
        return data;
    },
    domain_event_wizard: async function(data){
        let files = await FileSystem.listFiles();
        let entities = files.filter( x =>
            x.startsWith(`domain/${data.subdomain}/${data.selected_aggregate}/entities/`)
            && x.endsWith('.xml')).map(x => x.split("/").at(-1).replace(".xml",""));
        entities.unshift("root");
        return entities;
    }
}

async function sync_to_disk(){
    if (localStorage.project_drn && Modeler.auto_save && !sessionStorage.lock &&sessionStorage.checkout == localStorage.project_drn){
        sessionStorage.lock = "locked";
        await Modeler.sync_to_disk();
    }
    setTimeout(function(){
        sessionStorage.removeItem("lock");
    },100);
}
setInterval(sync_to_disk,1000)

var search_engine = null;

window.SearchEngine = {
    index: async function(force=false){
        if (search_engine && !force){return;}
        console.time("search-index");
        search_engine = new MiniSearch({
          fields: ['name', 'documentation'], // fields to index for full-text search
          storeFields: ['name', 'id','type'] // fields to return with search results
        });
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.endsWith(".md"));
        let documents = [];
        for (let i = 0; i < files.length; i++){
            let documentation = await Modeler.get(files[i],true);
            let model = files[i].replace(".md",".xml");
            let type = Modeler.determine_type(model);
            let name = Navigation.get_name(model);
            documents.push({
                id: files[i] == "README.md" ? "README.md" : model,
                name: name,
                documentation: documentation.content,
                type: type
            });
        }
        search_engine.addAll(documents);
        console.timeEnd("search-index");
    },
    search: function(query){
        let results = search_engine.search(query, { prefix: true, fuzzy: 0.2 });
        return results;
    }
}

var clear_exception_timer = null;
var session = {
    initialized:false,
    navigation: {},
    selected_node: "",
    all_links: {},
    saving: false,
    tab: '',
    tabs: [],
    frame: ''
};

function open_frame(uri){
    session.frame = "";
    setTimeout(function(){
        session.frame = uri;
    },1);
}
document.addEventListener('alpine:init', async () => {
    session = Alpine.reactive(session);
    label = Alpine.reactive(label);
    Alpine.data('session', () => ({
        session: session,
        label: label
    }));
    setTimeout(Navigation.soft_reload,100);
    Alpine.effect(() => {
        if (session.tab.startsWith("/diagram")){
            open_frame(session.tab);
        } else {
            open_frame('/modeler#' + session.tab);
        }
    });
});


// Disable/Enable editing
window.addEventListener("load", function(){
    if (!location.pathname.startsWith("/modeler")){return}
    setTimeout(function(){

        // Editable class
        let collection = document.getElementsByClassName("editable");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
          }
        }

        // select class
        collection = document.getElementsByClassName("select-ghost");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
          }
        }

        // input class
        collection = document.getElementsByClassName("input-ghost");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
          }
        }

        // checkbox class
        collection = document.getElementsByClassName("checkbox");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
          }
        }

        // Content editable
        if (session.editing_disabled){
            collection = document.querySelectorAll('[contenteditable="true"]');
            for (let i = 0; i < collection.length; i++) {
              collection[i].setAttribute("contenteditable", false);
            }
        }

        // editor buttons
        collection = document.getElementsByClassName("btn");
        for (let i = 0; i < collection.length; i++) {
          if (session.editing_disabled){
            collection[i].setAttribute("disabled", true);
            collection[i].style.display = 'none';
          }
        }
    },1000);
});

window.Session = {
    reload_from_disk: function(project){
        clearInterval(save_session_interval);
        localStorage.project = project;
        if (localStorage[localStorage.project]){
            for (var member in session) delete session[member];
            let data = JSON.parse(localStorage[localStorage.project]);
            delete data.initialized;
            delete data.exception;
            Object.assign(session,data);
        }
        session.saving = false;
        session.last_save = "";
        session.last_pull = "";
        start_save_session_interval();
    },
    get_users: async function(){
        let query_string = `
        query FilterUser {
          User {
            filter {
               resultset {
                username
                fullName
              }
            }
          }
        }
        `;
        var data = await Draftsman.query(query_string);
        console.log(data);
        return data.User.filter.resultset.filter(x => x.username != "");
    },
    show_exception: function(message){
        clearTimeout(clear_exception_timer);
        session.exception = message;
        clear_exception_timer = setTimeout(function(){
            session.exception = "";
        },5000);
    },
    disable_editing: function(){
        session.editing_disabled = true;
    },
    enable_editing: function(){
        session.editing_disabled = false;
    },
    load_data: function (updated_value,original){
        setTimeout(function(){
            if (updated_value != original){
                original = updated_value;
            }
        },1);
    }
};

var save_session_interval = null;
function start_save_session_interval(){
    setInterval(function(){
    if (localStorage.project_drn){
        localStorage[localStorage.project_drn] = JSON.stringify(session);
    }
    if (session.tabs.length == 0){
        Navigation.open("README.md");
    }
    },1000);
}

if (localStorage.project_drn){
    Session.reload_from_disk(localStorage.project_drn);
}

window.sleep = function(ms) {
    console.trace(`Sleep ${ms} milliseconds`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

window.Aggregate = {
    get_entities: async function(root,managed=false){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith(root.replace("root.xml","entities/")) && x.endsWith(".xml"));
        let entities = [];
        for (let i = 0; i < files.length; i++){
            let entity = await Modeler.get(files[i],!managed);
            entity.field = make_sure_is_list(entity.field);
            entities.push(entity);
        }
        return entities;
    },
    rename_entity: async function(root,entity,name){
        if (!check_pattern(name,lower_or_camel_cased)){
            Session.show_exception("Invalid name, changes not saved!");
            return;
        }
        let oldPath = root.replace("root.xml","entities/") + entity.att_name + ".xml";
        let newPath = root.replace("root.xml","entities/") + name + ".xml";
        if (oldPath == newPath){
            console.log("Do nothing!");
            return;
        }
        if (await Modeler.exists(newPath)){
            Session.show_exception("File already exists, will not overwrite <br>" + newPath);
            return;
        }
        Modeler.auto_save = false;
        entity.att_name = name;
        await Modeler.sync_to_disk();
        await Modeler.rename(oldPath, newPath);
        try{
            await Modeler.sync_to_disk();
        }catch{}
        Navigation.reload(root);
    },
    creat_collection: async function(root,name){
        let newPath = root.replace("root.xml","entities/") + name + ".xml";
        if (await Modeler.exists(newPath)){
            Session.show_exception("File already exists, will not overwrite <br>" + newPath);
            return;
        }
        await Modeler.save_model(newPath,{
            "nested-object": {
                att_name: name,
                field: {}
            }
        });
        Navigation.reload(root);
    },
    delete_entity: async function(root,entity){
        let path = root.replace("root.xml","entities/") + entity.att_name + ".xml";
        await Modeler.delete(path);
    },
    delete: async function(root){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith(root.replace("root.xml","")));
        for (let i = 0; i < files.length; i++){
            await FileSystem.delete(files[i]);
        }
    },
    create: async function(data){
        if (!check_pattern(data.subdomain,pascal_cased) || !check_pattern(data.aggregate,pascal_cased) || !check_pattern(data.key,lower_or_camel_cased)){
            Session.show_exception("Invalid configuration, aggregate not created!");
            return;
        }
        let file = "domain/" + data.subdomain + "/" + data.aggregate + "/root.xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let aggregate = {};
        aggregate.att_name = data.aggregate;
        aggregate.field = [];
        aggregate["att_business-key"] = data.key;
        aggregate["att_event-ttl"] = -1;
        aggregate["att_snapshot-interval"] = 100;
        aggregate["att_backup-interval-days"] = 0;
        aggregate["att_backup-ttl-days"] = 0;
        if (data.copy && data.source){
            let source = await Modeler.get(data.source,true);
            if (data.source.startsWith("command")){
                aggregate.field = deepcopy(source.field);
                for (let i = 0; i < source["nested-object"].length; i++){
                    let entity = "domain/" + data.subdomain + "/" + data.aggregate + "/entities/" + source["nested-object"][i].att_name + ".xml";
                    await Modeler.save_model(entity,{"nested-object":source["nested-object"][i]});
                }
            }
            if (data.source.includes("/entities/")){
                aggregate.field = deepcopy(source.field);
            }
            if (data.source.endsWith("root.xml")){
                aggregate.field = deepcopy(source.field);
                let files = await FileSystem.listFiles();
                files = files.filter(x => x.startsWith(data.source.replace("root.xml","entities/")) && x.endsWith(".xml"));
                for (let i = 0; i < files.length; i++){
                    let source = await Modeler.get(files[i],true);
                    let entity = "domain/" + data.subdomain + "/" + data.aggregate + "/entities/" + source.att_name + ".xml";
                    await Modeler.save_model(entity,{"nested-object":source});
                }
            }
        }
        let key_field = {
            att_name: data.key,
            att_type: "String"
        }
        if (!aggregate.field.includes(key_field)){
            aggregate.field.unshift(key_field);
        }
        aggregate = {aggregate:aggregate};
        await Modeler.save_model(file,aggregate);
        await sleep(1000);
        Navigation.open(file);
    },
    isMapped: function(field,mapping){
        try{
            return mapping.mapping.filter(x => x.att_target == field.att_name).length != 0 ||
                mapping['nested-mapping'].filter(x => x.att_target == field.att_name).length != 0;
        }catch{
            return false;
        }
    },
    get_event_handler_mapping: function(field,mapping){
        let map = mapping.mapping.filter(x => x.att_target == field.att_name).at(0)
        if (!map){
            map = mapping['nested-mapping'].filter(x => x.att_target == field.att_name).at(0);
        }
        if (!map){
            map = {};
        }
        return map;
    },
    create_event: async function(data){
            if (!check_pattern(data.subdomain,pascal_cased) || !check_pattern(data.selected_aggregate,pascal_cased) || !check_pattern(data.event,pascal_cased)){
                Session.show_exception("Invalid configuration, event not created!");
                return;
            }
            let file = "domain/" + data.subdomain + "/" + data.selected_aggregate + "/events/" + data.event + ".xml";
            let check = await Modeler.event_exists(data.event);
            if (check){
                Session.show_exception("Event with name: "+ data.event +" already exists");
                return;
            }
            let event = {};
            event.att_name = data.event;
            event.att_source = data.subdomain + "." + data.selected_aggregate;

            if (data.entity == "root"){
                let root = "domain/" + data.subdomain + "/" + data.selected_aggregate + "/root.xml";
                let source = await Modeler.get(root,true);
                event.field = deepcopy(source.field);
                event["nested-object"] = [];
                let files = await FileSystem.listFiles();
                files = files.filter(x => x.startsWith(root.replace("root.xml","entities/")) && x.endsWith(".xml"));
                for (let i = 0; i < files.length; i++){
                    let source = await Modeler.get(files[i],true);
                    delete source["att_business-key"];
                    event["nested-object"].push(source);
                }
            } else {
                let entity = "domain/" + data.subdomain + "/" + data.selected_aggregate + "/entities/" + data.entity + ".xml";
                let source = await Modeler.get(entity,true);
                event.field = deepcopy(source.field);

                let handler = {};
                handler.att_on = data.event;
                let code = "";
                let key = source['att_business-key'] ? source['att_business-key'] : "-businss-key-field-";
                code += `target = retrieve_nested_target(event["${key}"], self.${data.entity}, {})|LB|`;
                source.field.forEach(field => {
                    code += `target["${field.att_name}"] = event.${field.att_name}|LB|`;
                });
                code += `self.${data.entity}[event["${key}"]] = target`;
                handler.att_code = code;
                handler = {"event-handler":handler};
                await Modeler.save_model(file.replace("/events/","/event-handlers/"),handler);
            }

            event = {"event":event};
            await Modeler.save_model(file,event);

            await sleep(1000);
            Navigation.open(file);
        },
    initialize_mapper: async function(file,model,handler){
        delete handler.att_code;
        handler.mapping = [];
        handler["nested-mapping"] = [];
        let root = file.split("events/").at(0) + "root.xml";
        let document = await Modeler.get(root,true);
        let root_fields = model.field.map(x => x.att_name);
        document.field.filter(x => root_fields.includes(x.att_name) ).forEach(x => {
            handler.mapping.push({
                att_target: x.att_name,
                att_value: x.att_name,
                att_operand: "set"
            });
        });
        for (let i = 0; i < model["nested-object"].length; i++){
            let source = root.replace("root.xml","entities/") + model["nested-object"][i].att_name + ".xml";
            try{
                source = await Modeler.get(source,true);
                let nested = {};
                nested.att_source = model["nested-object"][i].att_name;
                nested.att_target = model["nested-object"][i].att_name;
                nested.att_strategy = "extend";
                nested.mapping = [];
                let fields = model["nested-object"][i].field.map(x => x.att_name);
                source.field.filter(x => fields.includes(x.att_name)).forEach(x => {
                    nested.mapping.push({
                        att_target: x.att_name,
                        att_value: x.att_name,
                        att_operand: "set"
                    });
                });
                if (fields.includes(source["att_business-key"])){
                    nested["att_business-key"] = source["att_business-key"];
                }
                if (nested.mapping.length != 0){
                    handler["nested-mapping"].push(nested);
                }
            } catch{
                console.log("No automatic mapping for: ",source);
            }
        }
    },
    initialize_code_mapper: async function(file,model,handler){
        handler.mapping = [];
        handler['nested-mapping'] = [];
        let code = '#self.isDeleted = "soft/hard"|LB|';
        let root = file.split("events/").at(0) + "root.xml";
        let document = await Modeler.get(root,true);
        let root_fields = model.field.map(x => x.att_name);
        document.field.filter(x => root_fields.includes(x.att_name) ).forEach(x => {
            code += `self.${x.att_name} = event.${x.att_name}|LB|`;
        });
        for (let i = 0; i < model["nested-object"].length; i++){
            let source = root.replace("root.xml","entities/") + model["nested-object"][i].att_name + ".xml";
            try{
                source = await Modeler.get(source,true);
                code += `for item in event.${model["nested-object"][i].att_name}:|LB|`;
                let fields = model["nested-object"][i].field.map(x => x.att_name);
                let key = fields.includes(source['att_business-key']) ? source['att_business-key'] : "-businss-key-field-";
                code += `\ttarget = retrieve_nested_target(item["${key}"], self.task, {})|LB|`;
                source.field.filter(x => fields.includes(x.att_name)).forEach(x => {
                    code += `\ttarget["${x.att_name}"] = item["${x.att_name}"]|LB|`;
                });
            } catch {
                console.log("No automatic mapping for: ", model["nested-object"][i].att_name);
            }
        }
        handler.att_code = code;
    },
    create_event_handler: async function(file,model){
        let handler = {};
        handler.att_on = model.att_name;
        await Aggregate.initialize_mapper(file,model,handler);
        handler = {"event-handler": handler};
        await Modeler.save_model(file.replace("/events/","/event-handlers/"),handler);
        Navigation.reload(file);
    },
    delete_event: async function(event){
        await FileSystem.delete(event);
        await FileSystem.delete(event.replace(".xml",".md"));
        await FileSystem.delete(event.replace("/events/","/event-handlers/"));
    },
    list_subdomains: async function(){
        let files = await FileSystem.listFiles();
        let domain = [];
        files.filter(x => x.startsWith("domain/") && x.endsWith("root.xml")).forEach(x => {
            let sub = x.split("/").at(1);
            if (!domain.includes(sub)){
                domain.push(sub);
            }
        });
        return domain;
    },
    list_aggregates: async function(sub){
        let files = await FileSystem.listFiles();
        let aggregates = [];
        files.filter(x => x.startsWith("domain/" + sub + "/") && x.endsWith("root.xml")).forEach(x => {
            let aggregate = x.split("/").at(2);
            if (!aggregates.includes(aggregate)){
                aggregates.push(aggregate);
            }
        });
        return aggregates;
    }
}

let validation_enabled = false;
setTimeout(function(){validation_enabled = true},10000);
async function validate_and_repair_model(){
    if (!validation_enabled){return}
    let files = await FileSystem.listFiles();
    // Initialize config
    if (!files.includes("config.xml")){
        await FileSystem.write("config.xml", initial_config.replace("#name#",localStorage.project_name));
    }

    // Initialize meta data store
    if (!files.includes("meta.json")){
        await FileSystem.write("meta.json", JSON.stringify({roles:["administrator"]},null,2));
    }

    // Initialize setup environment
    if (!files.includes("notifiers/SetupEnvironment.xml")){
        await FileSystem.write("notifiers/SetupEnvironment.xml", setup_environment);
        await FileSystem.write("notifiers/SetupEnvironment.md", setup_environment_docs);
    }

    for (let i = 0; i < files.length; i++){
        let file = files[i];
        if (file.startsWith("commands/") && file.endsWith(".xml")){
            let command = await Modeler.get(file,true);
            if (command.att_type != "ActorEvent"){
                command.att_type = "ActorEvent";
                await Modeler.save_model(file,{event:command});
            }
        }
        if (file.startsWith("domain/") && file.includes("/events/") &&file.endsWith(".xml")){
            let event = await Modeler.get(file,true);
            if (event.att_type != "DomainEvent"){
                event.att_type = "DomainEvent";
                await Modeler.save_model(file,{event:event});
            }
        }
        if (file.startsWith("domain/") && file.includes("/entities/") && file.endsWith(".xml")){
            let entity = await Modeler.get(file,true);
            let array = deduplicate_on_attribute(entity.field,"att_name");
            if (array.length < entity.field.length){
                entity.field = array;
                await Modeler.save_model(file,{"nested-object":entity});
            }
        }
        //TODO Validations
    }
}

let initial_config = `<draftsman project-name="#name#" xmlns="https://tracepaper.draftsman.io">
    <functional-scenarios clean-db="true" clean-iam="true" minimum-event-coverage="80" minimum-view-coverage="80"></functional-scenarios>
    <events>
      <event name="FileUploaded" type="DomainEvent" source="appsync">
        <field name="bucket" type="String"></field>
        <field name="uri" type="String"></field>
        <field name="location" type="String"></field>
        <field name="username" type="String"></field>
      </event>
    </events>
</draftsman>`;

let setup_environment = `
<notifier name="SetupEnvironment">
  <trigger source="@rate(1 day)">
    <mapping target="dummy" value="#&apos;&apos;"></mapping>
  </trigger>
  <activity type="iam-create-systemuser" fail-silent="true" id="vMB9LZ"></activity>
  <activity id="vkYuPh" fail-silent="true" type="create-iam-group" group-name="#&apos;administrator&apos;"></activity>
  <activity id="wjJU3t" fail-silent="true" group-name="#&apos;administrator&apos;" type="add-user-to-iam-group" username="#&apos;system-user&apos;"></activity>
</notifier>`;

let setup_environment_docs = `
# Setup Environment

This automation makes sure that the environment is ready for processing.
It makes sure that the system user is present and that the *administrator* role is created.
`;


window.Shortcut = {
    open: function(name){
        document.dispatchEvent(new CustomEvent('shortcut-' + name));
    },
    execute: function(name){
        Shortcut.open(name);
        parent.postMessage({type:'shortcut',shortcut: name});
    }
}
document.addEventListener('keyup', (e) => {
    if (e.ctrlKey && e.code == "Space"){
        Shortcut.execute("guide");
    } else if (e.shiftKey && e.code == "Enter"){
        Shortcut.execute("model");
    } else if (e.shiftKey && e.code == "Space"){
        Shortcut.execute("search");
    } else if (e.ctrlKey && e.code == "Enter"){
        Shortcut.execute("insert");
    }

});

window.Behavior = {
    prepare: function(flow){
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
    },
    add_trigger: async function(model,event){
        let trigger = {};
        model.trigger.push(trigger);
        await Behavior.update_trigger(trigger,event);
    },
    update_trigger: async function(trigger, event){
        let event_model = await Modeler.get_by_name(event,true );
        trigger.att_source = event;
        trigger.mapping = event_model.field.map(x => {return{
            att_target: x.att_name,
            att_value: x.att_name
        }});
        event_model["nested-object"].forEach(x => {
            trigger.mapping.push({
                 att_target: x.att_name,
                 att_value: x.att_name
             });
        });
        let root = await Behavior.get_root();
        trigger['att_key-field'] = "";
        if ("att_business-key" in root && event_model.field.map(x => x.att_name).includes(root["att_business-key"])){
            trigger['att_key-field'] = root["att_business-key"];
        }
        await sleep(100);
        Behavior.balance_triggers();
    },
    balance_triggers: async function(){
        let flow = await Modeler.get(session.tab);
        let fields = [];
        flow.trigger.forEach(trigger => {
                trigger.mapping.forEach(mapping => {
                    if (!fields.includes(mapping.att_target) && mapping.att_value != "#''"){
                        fields.push(mapping.att_target);
                    }
                });
            });
        flow.trigger.forEach(trigger => {
                trigger.mapping = trigger.mapping.filter(x => x.att_value != "#''");
                let mappings = trigger.mapping.map(x => x.att_target);
                fields.filter(x => !mappings.includes(x)).forEach(field => {
                    trigger.mapping.push({
                        att_target: field,
                        att_value: "#''"
                    });
                });
            });
    },
    get_root: async function(){
        if (!session.tab.includes('/behavior-flows/')){
            return {};
        }
        return await Modeler.get(session.tab.split('behavior-flows/').at(0) + 'root.xml',true);
    },
    get_entities: async function(){
        if (!session.tab.includes('/behavior-flows/')){
            return [];
        }
        return await Aggregate.get_entities(session.tab.split('behavior-flows/').at(0) + 'root.xml');
    },
    get_entity: async function(name){
        if (!session.tab.includes('/behavior-flows/')){
            return {};
        }
        return await Modeler.get(session.tab.split('behavior-flows/').at(0) + 'entities/' + name + ".xml",true);
    },
    get_trigger_expressions: async function(){
        let expressions = await Expression.get_keyfield_expressions();
        return expressions.map(x => `#global.${x.att_name}(${x.att_input.replaceAll(';',', ')})`);
    },
    get_processor_name: function(processor){
        if (processor.att_type == "emit-event"){
            return processor.att_ref;
        } else if (processor.att_type == "validator"){
            return processor.att_exception;
        } else if (processor.att_type == "code" && processor.att_handler){
            return processor.att_handler;
        } else if (processor.att_type == "code"){
            return "- inline -"
        } else if (processor.att_type == 'set-variable'){
            return processor.att_name;
        } else if (processor.att_type == 'update-key'){
            return processor.att_key.replace("#flow.","");
        }
    },
    get_emitable_events: async function(){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.endsWith(".xml") && x.startsWith(session.tab.split("behavior-flows/").at(0) + "events/"))
        .map(x => x.split("/").at(-1).replace(".xml",""));
    },
    get_flow_variables: async function(flow=null){
        if (!flow){
            flow = await Modeler.get(session.tab,true);
        }
        let variables = [];
        flow.trigger.forEach(trigger => {
            trigger.mapping.forEach(mapping => {
                if (!variables.includes(mapping.att_target)){
                    variables.push(mapping.att_target);
                }
            });
        });
        for (let i =0; i < flow.processor.length; i++) {
            let processor = flow.processor[i];
            if (processor.att_type == 'set-variable'){
                variables.push(processor.att_name);
            }
            if (processor.att_type == 'code'){
                if (processor.att_code){
                    let content = processor.att_code;
                    content.split("|LB|").filter(line => line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)).forEach(line => {
                        let variable = line.replace("flow.","").split("=").at(0).trim();
                        variables.push(variable);
                    });
                }else{
                    let content = await Modeler.get(processor.att_file,true);
                    content = content.content;
                    let method_detected = false;
                    content.split("\n").forEach(line => {
                        if (line.startsWith(`def ${processor.att_handler}(flow):`)){
                            method_detected = true;
                        } else if (line.startsWith("def")){
                            method_detected = false;
                        }
                        if (method_detected && line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)){
                            let variable = line.replace("flow.","").split("=").at(0).trim();
                            variables.push(variable);
                        }
                    });
                }
            }
        }
        return variables;
    },
    update_emit_event: async function(processor,event){
        processor.att_ref = event;
        let event_model = await Modeler.get_by_name(event,true);
        let variables = await Behavior.get_flow_variables();
        processor.mapping = event_model.field.map(x => {return{
            att_target: x.att_name,
            att_value: variables.includes(x.att_name) ? '#flow.' + x.att_name : ''
        }});
        event_model["nested-object"].forEach(x => {
            processor.mapping.push({
                 att_target: x.att_name,
                 att_value: variables.includes(x.att_name) ? '#flow.' + x.att_name : ''
             });
        });
    },
    toggle_code: function(processor){
        if (!processor.att_code){
            delete processor.att_file;
            delete processor.att_handler;
            processor.att_code = "flow.variable = [i for i in ranger(5)]";
        } else {
            delete processor.att_code;
            processor.att_file = "";
            processor.att_handler = "";
        }
    },
    initialize_nested: async function(trigger,collection){
        let event_model = await Modeler.get_by_name(trigger,true );
        let nested = {};
        event_model[NESTED].filter(x => x.att_name == collection).forEach(x => {
            x.field.forEach(x => {
                nested[x.att_name] = x.att_type == 'String' ? 'text' : x.att_type == 'Boolean' ? false : 0;
            });
        });
        return nested;
    },
    update_test_trigger: async function(testcase,trigger){
        let event_model = await Modeler.get_by_name(trigger,true);
        testcase.input = [];
        event_model.field.forEach(x => {
            testcase.input.push({
                att_name: x.att_name,
                att_type: x.att_type,
                att_value: x.att_type == 'String' ? 'text' : x.att_type == 'Boolean' ? false : 0
            });
        });
        event_model[NESTED].forEach(x => {
            let nested = {};
            x.field.forEach(x => {
                nested[x.att_name] = x.att_type == 'String' ? 'text' : x.att_type == 'Boolean' ? false : 0;
            });
            testcase.input.push({
                att_name: x.att_name,
                att_type: "NestedObject",
                "#text": JSON.stringify([nested],null,2)
            });
        });
    },
    add_testcase: async function(model,name){
        let testcase = {};
        testcase.att_name = name;
        let trigger = model.trigger.at(0).att_source;
        testcase["att_trigger-event"] = trigger;
        await Behavior.update_test_trigger(testcase,trigger);
        testcase.expected = [];
        return testcase;
    },
    init_expected_event: async function(event){
        let event_model = await Modeler.get_by_name(event['att_domain-event'],true);
        if (!("field" in event)){
            event.field = [];
        }
        if (!('att_id' in event)){
            event.att_id = makeid(6);
        }
        let keys = event.field.map(x => x.att_name);
        event_model.field.filter(x => !keys.includes(x.att_name)).forEach(x => {
            event.field.push({
               att_name:  x.att_name,
               att_type:  x.att_type,
               att_value: x.att_type == 'String' ? 'text' : x.att_type == 'Boolean' ? false : 0
            });
        });
    },
    create: async function(data){
        if (!check_pattern(data.subdomain,pascal_cased) || !check_pattern(data.selected_aggregate,pascal_cased) || !check_pattern(data.name,pascal_cased)){
            Session.show_exception("Invalid configuration, event not created!");
            return;
        }
        let file = "domain/" + data.subdomain + "/" + data.selected_aggregate + "/behavior-flows/" + data.name + ".xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let behavior = {"att_name":data.name};
        behavior = {command:behavior};
        await Modeler.save_model(file,behavior);
        await sleep(1000);
        Navigation.open(file);
    },
    prepare_state_variable_type: function(oldValue, newValue){
        if (typeof(oldValue) === "number") {
            return Number(newValue)
        } else if (typeof(oldValue) === "boolean") {
            return JSON.parse(newValue.toLowerCase());
        } else {
            return newValue;
        }
    },
    prepare_expected_state: async function(testcase){
        if (    !testcase['expected-state'] ||
                !testcase['expected-state']['#text'] ||
                testcase['expected-state']['#text'].includes("undefined") ||
                testcase['expected-state']['#text'] == "{}" ||
                testcase['expected-state']['#text'] == ""){
            let root = await Behavior.get_root();
            let key = root["att_business-key"];
            let obj = {};
            testcase.att_pk = testcase.att_pk ? testcase.att_pk : "-business-key-";
            obj[key] = testcase.att_pk;
            return obj;
        }else{
            return JSON.parse(testcase['expected-state']['#text'].replace('\n',''));
        }
    }
}
window.Pattern = {
    list: async function(){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith("patterns/") && x.endsWith(".xml"));
        let patterns = [];
        for(let i =0; i < files.length; i++){
            patterns.push({
                    model: await Modeler.get(files[i]),
                    docs: await Modeler.get(files[i].replace('.xml','.md')),
                    file: files[i]
                });
        }
        return patterns;
    },
    rename: async function(model,file,name){
            let newPath = "patterns/" + name + ".xml"
            if (await Modeler.exists(newPath)){
                Session.show_exception("File already exists, will not overwrite <br>" + file);
                return;
            }
            model.att_name = name;
            try{
                await Modeler.sync_to_disk();
            }catch{}
            await Modeler.rename(file,newPath);
            await Modeler.rename(file.replace('.xml','.md'),newPath.replace('.xml','.md'));
            try{
                await Modeler.sync_to_disk();
            }catch{}
            await sleep(2000);
            location.reload();
        },
    create: async function(data){
                if (!check_pattern(data.name,pascal_cased)){
                    Session.show_exception("Invalid configuration, pattern not created!");
                    return;
                }
                let file = "patterns/" + data.name + ".xml";
                if (await Modeler.exists(file)){
                    Session.show_exception("File already exists, will not overwrite <br>" + file);
                    return;
                }
                let pattern = {
                    "att_name": data.name,
                    "att_regex": data.regex
                };
                pattern = {pattern:pattern};
                let tab = session.tab;
                session.tab = "";
                await Modeler.save_model(file,pattern);
                if (data.docs && data.docs != 'documentation'){
                    await Modeler.save_model(file.replace('.xml','.md'),{content:data.docs});
                }
                await sleep(3000);
                session.tab = tab;
            }
}

const colors = {
    "command": "#7BE141",
    "aggregate": "#FB7E81",
    "behavior": "#fca4a6",
    "notifier": "#FFA807",
    "view": "#6E6EFD",
    "query": "#7BE141",
    "projection": "#7BE141",
    "dependency": "#D3D3D3",
    "schedule": "#FFA807"
};

const shapes = {
    "command": "dot",
    "aggregate": "diamond",
    "behavior": "triangle",
    "notifier": "box",
    "view": "triangleDown",
    "query": "square",
    "projection": "box",
    "dependency": "box",
    "schedule": "dot"
};

const domain_colors = [
  "#634C8E",
  "#B1A2D7",
  "#7DA7C4",
  "#A6D9B3",
  "#F18F6D",
  "#E3B78C",
  "#FFD9C4",
  "#5C917A",
  "#8B6699",
  "#FFF17A",
  "#6FCAC4",
  "#B6B6B6"
];
var subdomains = [];
var translations = {};

window.Diagram = {
    nodes: {},
    edges: {},
    draw: async function(file,id,height="300px",selection={}){
        Diagram.nodes = {};
        Diagram.edges = {};
        session.diagram_img = "";
        await Diagram.prepare_translations(file);
        await Diagram.prepare_diagram_data(file);
        let roots = [];
        if (file == "Expressions"){
            let files = await FileSystem.listFiles();
            roots = files.filter(x => x.startsWith("expressions/"));
        } else if (file == "Patterns"){
            let files = await FileSystem.listFiles();
            roots = files.filter(x => x.startsWith("patterns/"));
        } else if (file && file != "README.md"){
            let file_select = file.split(";");
            let files = await FileSystem.listFiles();
            for (let i = 0; i < file_select.length; i++){
                if (file_select[i].endsWith("root.xml")){
                    roots = roots.concat(files.filter(x => x.startsWith(file_select[i].replace("/root.xml","")) && x.endsWith(".xml")));
                } else if (file_select[i].endsWith(".xml") || file_select[i].endsWith(".py")){
                    roots.push(file_select[i]);
                } else {
                    roots = roots.concat(files.filter(x => x.startsWith(file_select[i]) && x.endsWith(".xml")));
                }
            }
            roots = [...new Set(roots)];
        }
        roots = await Promise.all(roots.map(async x => await Diagram.get_name(x)));
        Diagram.execute_draw(id,height,selection,roots);
    },
    get_name: async function(file){
        let model = await Modeler.get(file,true);
        let type = Modeler.determine_type(file);
        if (type == "command"){
            return model.att_name.replace("Requested","");
        } else if (type == "event") {
            return model.att_source;
        } else if (type == "view") {
            return model.att_name;
        } else if (type == "behavior"){
            let path = file.split("/");
            return path[1] + "." + path[2] + "." + model.att_name;
        } else if (type == "notifier"){
            return model.att_name;
        } else if (type == "projection"){
            return model.att_name;
        } else if (type == "pattern"){
            return model.att_name + " (pattern)";
        } else if (type == "expression"){
            return model.att_name + " (expression)";
        } else if (type == "code"){
            return file.split("/").at(1).split(".").at(0) + " (Python)";
        } else {
            return "unknown";
        }
    },
    prepare_translations: async function(file){
        translations = {FileUploaded: ["UploadFile"]};
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.endsWith(".xml"));
        let aggregate = file.split(";").at(0);
        aggregate = !(aggregate.startsWith("domain/") && aggregate.split("/").filter(x => x != '').length > 2);
        for (let i = 0; i < files.length; i++){
            let source = files[i];
            let type = Modeler.determine_type(source);
            if (type == "behavior" && !aggregate){
                let model = await Modeler.get(source,true);
                let path = source.split("/");
                let root = path[1] + "." + path[2];
                let name = root + "." + model.att_name;
                 model.processor.filter(x => x.att_type == 'emit-event').forEach(x => {
                    let event = x.att_ref;
                    Diagram.register_translation(event,name);
                    Diagram.register_translation(root,name);
                });
            } else if (type == "event" && aggregate){
                let model = await Modeler.get(source,true);
                Diagram.register_translation(model.att_name,model.att_source);
                let path = source.split("/");
                let root = path[1] + "." + path[2];
                Diagram.register_translation(root,root);
            }
        }
    },
    prepare_diagram_data: async function(file){
        let files = await FileSystem.listFiles();
        let code = files.filter(x => x.endsWith(".py"));
        for (let i = 0; i < code.length; i++){
            let name = code[i].split("/").at(-1).replace(".py"," (Python)")
            Diagram.add_node(name,"dependency");
            session.all_links[name] = code[i];
        }
        files = files.filter(x => x.endsWith(".xml"));
        let aggregate = file.split(";").at(0);
        aggregate = !(aggregate.startsWith("domain/") && aggregate.split("/").filter(x => x != '').length > 2);
        for (let i = 0; i < files.length; i++){
            let source = files[i];
            try{
            let model = await Modeler.get(source,true);
            let type = Modeler.determine_type(source);
            if (type == "command"){
                let name = model.att_name.replace("Requested","");
                Diagram.register_translation(model.att_name,name);
                Diagram.add_node(name,"command");
                session.all_links[name] = source;
                if (model.att_role && model.att_role.startsWith("#global")){
                    Diagram.add_edge(name,model.att_role.split(".").at(1).split("(").at(0) + " (expression)","",true);
                }
                var patterns = model.field.map(x => x.att_pattern);
                for (var j = 0; j < model[NESTED].length; j++){
                    patterns = patterns.concat(model[NESTED][j].field.map(x => x.att_pattern));
                }
                patterns.forEach(x => {
                    if(!x){return;};
                    var pattern = x.replace("{{","").replace("}}"," (pattern)");
                    Diagram.add_edge(name,pattern,"",true);
                });
            } else if (type == "event" && aggregate){
               Diagram.add_node(model.att_source,"aggregate");
               session.all_links[model.att_source] = source.split("/events/").at(0);
            } else if (type == "view"){
               Diagram.add_node(model.att_name,"view");
               session.all_links[model.att_name] = source;
               model.query.forEach(query => {
                    let name = query["att_graphql-namespace"] + "." + query["att_field-name"];
                    Diagram.add_node(name,"query");
                    session.all_links[name] = source;
                    Diagram.add_edge(name,model.att_name,"",true)
                    if (query.att_role && query.att_role.startsWith("#global")){
                        Diagram.add_edge(name,query.att_role.split(".").at(1).split("(").at(0) + " (expression)","",true);
                    }
               });
               model[SNAPSHOT_HANDLER].forEach(handler => {
                    let name = handler["att_sub-domain"] + "." + handler.att_aggregate;
                    translations[name].forEach(source => {
                        Diagram.add_edge(source,model.att_name);
                    });

               });
               model[CUSTOM_HANDLER].forEach(handler => {
                   let name = handler["att_sub-domain"] + "." + handler.att_aggregate;
                   translations[name].forEach(source => {
                       Diagram.add_edge(source,model.att_name);
                   });
                   if (handler.att_file){
                        let src = handler.att_file.split("/").at(-1).split(".").at(0) + " (Python)";
                        Diagram.add_edge(model.att_name,src,"",true);
                   }
              });
              model.field.filter(x => !view_field_types.includes(x.att_type)).forEach(ref => {
                   Diagram.add_edge(model.att_name,ref.att_ref,ref.att_type,[5,7]);
              });
            } else if (type == "behavior") {
                let name = "";
                let path = source.split("/");
                if (!aggregate){
                    name = path[1] + "." + path[2] + "." + model.att_name;
                    Diagram.add_node(name,"behavior");
                    session.all_links[name] = source;
                } else {
                    name = path[1] + "." + path[2];
                }
                model.trigger.forEach(trigger => {
                    translations[trigger.att_source].forEach(source => {
                        Diagram.add_edge(source,name);
                    });
                    if (trigger["att_key-field"] && trigger["att_key-field"].startsWith("#global")){
                        Diagram.add_edge(name,trigger["att_key-field"].split(".").at(1).split("(").at(0) + " (expression)","",true);
                    }
                });
                model.processor.filter(x => x.att_type == "code").forEach(processor => {
                    if (processor.att_file){
                        let src = processor.att_file.split("/").at(-1).split(".").at(0) + " (Python)";
                        Diagram.add_edge(name,src,"",true);
                   }
                });
            } else if (type == "notifier"){
                model.trigger.forEach(trigger => {
                    Diagram.add_node(model.att_name,"notifier");
                    session.all_links[model.att_name] = source;
                    if (trigger.att_source.startsWith("@")){
                        Diagram.add_node(trigger.att_source,"schedule");
                        Diagram.add_edge(trigger.att_source,model.att_name);
                    } else {
                        translations[trigger.att_source].forEach(source => {
                            Diagram.add_edge(source,model.att_name);
                        });
                    }
                });
                model.activity.filter(x => x.att_type == 'code').forEach(activity => {
                    if (activity["att_python-file"]){
                        let src = activity["att_python-file"].split("/").at(-1).split(".").at(0) + " (Python)";
                        Diagram.add_edge(model.att_name,src,"",true);
                   }
                });
            } else if (type == "projection"){
                Diagram.add_node(model.att_name,"projection");
                session.all_links[model.att_name] = source;
                if (model.att_return){
                    Diagram.add_edge(model.att_name,model.att_return,"return object",[5,7]);
                }
                if (model.att_role && model.att_role.startsWith("#global")){
                    Diagram.add_edge(model.att_name,model.att_role.split(".").at(1).split("(").at(0) + " (expression)","",true);
                }
                let s = model.att_code.replaceAll('"',"'");
                let re = /Query\(\'([A-Z]{1}[a-z]+)+\'\)/g;
                let m;
                do {
                    m = re.exec(s);
                    if (m) {
                        Diagram.add_edge(m[1],model.att_name,"source",[5,7]);
                    }
                } while (m);
                let name = model["att_graphql-namespace"] + "." + model["att_field-name"];
                Diagram.add_node(name,"query");
                Diagram.add_edge(name,model.att_name,"",true)
            } else if (type == "pattern"){
                Diagram.add_node(model.att_name + " (pattern)","dependency");
                session.all_links[model.att_name] = source;
            } else if (type == "expression"){
                Diagram.add_node(model.att_name + " (expression)","dependency");
                session.all_links[model.att_name] = source;
            }

        } catch(err){
            console.log("Could not load diagram data for:",source,err);
        }
        }
    },
    add_node: function(name,type,alpha=1){
        let size =  ["aggregate","projection"].includes(type) ? 15 : 10;
        let node_color;
        if (type == "aggregate" || type == "behavior"){
            let sub = name.split(".").at(0);
            if (!subdomains.includes(sub)){
                subdomains.push(sub);
            }
            node_color = Diagram.hexToRgb(domain_colors[subdomains.indexOf(sub)],alpha);
        } else{
            node_color = Diagram.hexToRgb(colors[type],alpha);
        }
        let font_color = localStorage.theme == 'dark' && shapes[type] != "box"? '#ffffff' : "#343434";
        Diagram.nodes[name] = {
           "id": name,
           "label": name,
           "size": size,
           "shape": shapes[type],
           "color": node_color,
           "type": type,
           "font": {
            "color": font_color
           }
       }
    },
    add_edge: function(from,to,label="",dashes=false){
        var key = from + to;
        Diagram.edges[key] = {
            "from": from,
            "to": to,
            "label": label,
            "dashes" : dashes,
            "font": {
                "size" : 10
            }
        };
        if (dashes == true){
            Diagram.edges[key]["color"] = {"inherit":"to"};
        } else {
            Diagram.edges[key]["arrows"] = "to";
        }
    },
    hexToRgb: function(hex,alpha) {
        // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function(m, r, g, b) {
          return r + r + g + g + b + b;
        });

        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${alpha})`: hex;
    },
    execute_draw: function(id,height="300px",selection={},roots=[]){
        let nodes = Object.values(Diagram.nodes).filter(x => x.id != '');
        let edges = Object.values(Diagram.edges);
        if (Object.keys(selection).length != 0){
            nodes = nodes.filter(x => selection[x.type]);
        }
        if (roots.length != 0){
            let eligible_nodes = [];
            edges.filter(x => roots.includes(x.from) || roots.includes(x.to)).forEach(x => {
                eligible_nodes.push(x.from);
                eligible_nodes.push(x.to);
            });
            nodes = nodes.filter(x => eligible_nodes.includes(x.id));
        }
        var data = {
          nodes: new vis.DataSet(nodes),
          edges: new vis.DataSet(edges)
        };
        var container = document.getElementById(id);
        let directed_diagram = false;//nodes.length < 20;
        var options = {
            width: "100%",
            height: height,
            layout: {
                improvedLayout: true,
                hierarchical : {
                    enabled: directed_diagram,
                    direction: "LR",
                    parentCentralization: true,
                    sortMethod: "directed",
                }
            }
        };
        let network = new vis.Network(container, data, options);
        session.selected_node = "";
        network.on("click", function (params) {
            session.selected_node = params.nodes.at(0);
        });
        network.on("afterDrawing", function (ctx) {
            var dataURL = ctx.canvas.toDataURL();
            session.diagram_img = dataURL;
          });
    },
    export: function(){

    },
    register_translation: function(key,value){
        try{
            translations[key].push(value);
        } catch {
            translations[key] = [value];
        }
    }
}

window.Notifier = {
    prepare: function(notifier){
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
    },
    add_trigger: async function(model,event){
            let trigger = {mapping: []};
            model.trigger.push(trigger);
            await Notifier.update_trigger(trigger,event);
        },
    update_trigger: async function(trigger, event){
        trigger.att_source = event;
        if (event.startsWith("@")){
           if (trigger.mapping.length == 0){
            trigger.mapping.push({
                att_target: "dummy",
                att_value: "#'dummy value'"
            });
           }
        } else {
            let event_model = await Modeler.get_by_name(event,true );
            trigger.mapping = event_model.field.map(x => {return{
                att_target: x.att_name,
                att_value: x.att_name
            }});
            event_model["nested-object"].forEach(x => {
                trigger.mapping.push({
                     att_target: x.att_name,
                     att_value: x.att_name
                 });
            });
        }
        await sleep(100);
        Notifier.balance_triggers();
    },
    balance_triggers: async function(){
        let flow = await Modeler.get(session.tab);
        let fields = [];
        flow.trigger.forEach(trigger => {
                trigger.mapping.forEach(mapping => {
                    if (!fields.includes(mapping.att_target) && mapping.att_value != "#''"){
                        fields.push(mapping.att_target);
                    }
                });
            });
        flow.trigger.forEach(trigger => {
                trigger.mapping = trigger.mapping.filter(x => x.att_value != "#''");
                let mappings = trigger.mapping.map(x => x.att_target);
                fields.filter(x => !mappings.includes(x)).forEach(field => {
                    trigger.mapping.push({
                        att_target: field,
                        att_value: "#''"
                    });
                });
            });
    },
    toggle_code: function(activity){
           console.log(activity);
            if (!activity.att_code){
                delete activity["att_python-file"];
                delete activity.att_handler;
                activity.att_code = "flow.variable = [i for i in ranger(5)]";
            } else {
                delete activity.att_code;
                activity["att_python-file"] = "";
                activity.att_handler = "";
            }
            console.log(activity);
        },
    toggle_query: function(activity){
        if (!activity.att_query){
            delete activity["att_template-file"];
            activity.att_query = `query MyQuery {
    Object {
      method(key: "") {
        value
      }
    }
  }`;
        } else {
            delete activity.att_query;
            activity["att_template-file"] = "";
        }
    },
    toggle_body: function(activity){
            if (!activity.att_query){
                delete activity["att_template-file"];
                activity.att_body = "{}";
            } else {
                delete activity.att_body;
                activity["att_template-file"] = "";
            }
        },
    get_flow_variables: async function(flow=null){
                if (!flow){
                    flow = await Modeler.get(session.tab,true);
                }
                let variables = [];
                flow.trigger.forEach(trigger => {
                    trigger.mapping.forEach(mapping => {
                        if (!variables.includes(mapping.att_target)){
                            variables.push(mapping.att_target);
                        }
                    });
                });
                for (let i =0; i < flow.activity.length; i++) {
                    let activity = flow.activity[i];
                    if (['set-variable','retrieve-email-from-iam','render-template','fetch-property','call-internal-api','HTTP'].includes(activity.att_type)){
                        variables.push(activity.att_name);
                    }
                    if (['get-token','get-systemuser-token'].includes(activity.att_type)){
                        variables.push("token");
                    }
                    if (activity.att_type == 'code'){
                        if (activity.att_code){
                            let content = activity.att_code;
                            content.split("|LB|").filter(line => line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)).forEach(line => {
                                let variable = line.replace("flow.","").split("=").at(0).trim();
                                variables.push(variable);
                            });
                        }else{
                            let content = await Modeler.get(activity["att_python-file"],true);
                            content = content.content;
                            let method_detected = false;
                            content.split("\n").forEach(line => {
                                if (line.startsWith(`def ${activity.att_handler}(flow):`)){
                                    method_detected = true;
                                } else if (line.startsWith("def")){
                                    method_detected = false;
                                }
                                if (method_detected && line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)){
                                    let variable = line.replace("flow.","").split("=").at(0).trim();
                                    variables.push(variable);
                                }
                            });
                        }
                    }
                }
                return variables;
            },
    create: async function(data){
            if (!check_pattern(data.name,pascal_cased)){
                Session.show_exception("Invalid configuration, notifier not created!");
                return;
            }
            let file = "notifiers/" + data.name + ".xml";
            if (await Modeler.exists(file)){
                Session.show_exception("File already exists, will not overwrite <br>" + file);
                return;
            }
            let notifier = {"att_name":data.name};
            notifier = {notifier:notifier};
            await Modeler.save_model(file,notifier);
            await sleep(1000);
            Navigation.open(file);
        }
}

window.Projection = {
    prepare: function(projection){
        projection['input'] = make_sure_is_list(projection['input']);
        return projection;
    },
    rename: async function(model,name,namespace){
        if(!name){name = model.att_name};
        if(!namespace){namespace = model['att_graphql-namespace']};
        if (!check_pattern(name,pascal_cased) || !check_pattern(namespace,graphql_namespace)){
            Session.show_exception("Invalid name!");
            return;
        }
        let file = "projections/" + namespace.replaceAll(".","/") + "/" + name + ".xml";
        if(file == session.tab){return}
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        model.att_name = name;
        model['att_graphql-namespace'] = namespace;
        await sleep(1);
        await Modeler.sync_to_disk();
        await Modeler.rename(session.tab,file);
        await Modeler.rename(session.tab.replace('.xml','.md'),file.replace('.xml','.md'));
        try{
            await Modeler.sync_to_disk();
        }catch{}
        Navigation.rename(session.tab,file);
    },
    create: async function(data){
            if (!check_pattern(data.namespace,graphql_namespace) || !check_pattern(data.name,pascal_cased)){
                Session.show_exception("Invalid configuration, projection not created!");
                return;
            }
            let file = "projections/" + data.namespace.replaceAll(".","/") + "/" + data.name + ".xml";
            if (await Modeler.exists(file)){
                Session.show_exception("File already exists, will not overwrite <br>" + file);
                return;
            }
            let projection = {
                "att_name": data.name,
                "att_graphql-namespace": data.namespace,
                "att_field-name": data.name.charAt(0).toLowerCase() + data.name.slice(1),
                "att_authorization": "authenticated",
                "att_code": projection_code_template
            };
            projection = {projection:projection};
            await Modeler.save_model(file,projection);
            await sleep(1000);
            Navigation.open(file);
        }
}

window.Navigation = {
    soft_reload: function(){
        document.dispatchEvent(new CustomEvent('soft-reload'));
    },
    open: function(file){
        if (session.tab == file){
            Navigation.force_reload();
            return;
        }
        push_to_remote();
        session.tab = file;
        location.hash = file;
        if (!session.tabs.includes(file)){
            session.tabs.push(file);
        }
        Navigation.soft_reload();
    },
    open_diagram: function(file){
        session.tab = "/diagram#" + file;
        session.tabs = session.tabs.filter(x => !x.startsWith("/diagram#"));
        session.tabs.push(session.tab);
    },
    close: function(file){
        session.tabs = session.tabs.filter(x => x != file);
        if (session.tab == file){
            if (session.tabs.length != 0){
                session.tab = session.tabs.at(0);
            } else {
                setTimeout(function(){
                    Navigation.open("README.md");
                    Navigation.soft_reload();
                },1000);
            }
        }
        Navigation.soft_reload();
    },
    get_name: function(path){
        if (path.startsWith("/diagram")){
            return "Domain Diagram";
        }
        let type = Modeler.determine_type(path);
        if (type == "aggregate"){
            return path.split("/").at(2);
        } else if (type == "readme"){
            return "About";
        } else {
            return path.split('/').at(-1).replace('Requested.xml','').replace('.xml','');
        }
    },
    rename: function(oldPath,newPath){
        setTimeout(function(){
            parent.postMessage({type:'rename',oldPath:oldPath,newPath:newPath});
        },1000);
    },
    reload: function(file){
        setTimeout(function(){
            parent.postMessage({type:'reload',file:file});
        },1000);
    },
    force_reload: async function(file){
        let history = session.tab;
        session.tab = "";
        await sleep(1);
        if (file){
            await FileSystem.auto_commit();
        }
        await sleep(1);
        session.tab = file ? file : history;
    }
}

window.addEventListener("message", async function(event) {
    if (event.origin !== location.origin)
        return;
    if (event.data.type == "popout"){
        Navigation.close(event.data.file);
    } else if (event.data.type == "diagram"){
        Navigation.open_diagram(event.data.file);
    } else if (event.data.type == "open"){
        let file = event.data.file;
        if (file.startsWith("domain/") && !file.endsWith(".xml")){
            file += "/root.xml";
        }
        Navigation.open(file);
    } else if (event.data.type == "rename"){
        Navigation.close(event.data.oldPath);
        await FileSystem.auto_commit();
        Navigation.open(event.data.newPath);
        await sleep(2000);
        location.reload();
    } else if (event.data.type == "deleted"){
        Navigation.close(event.data.file);
        await FileSystem.auto_commit();
        await sleep(2000);
        location.reload();
    } else if (event.data.type == "shortcut"){
        Shortcut.open(event.data.shortcut);
    } else if (event.data.type == "reload"){
        Navigation.force_reload(event.data.file);
    } else {
        console.log(event.data);
    }
});

var projects = {};
var context = {};

function get_navigation_item(file){
    return {
       name: file.split("/").at(-1).replace(".xml",""),
       type: "file",
       path: file
   }
}

function get_parent(path){
    let i = path.lastIndexOf("/");
    return path.substring(0, i);
}

var directories = {};
const directory_labels = {
    "commands" : "Commands",
    "domain": "Domain",
    "behavior-flows": "Behavior",
    "events": "Events",
    "notifiers": "Notifiers",
    "views": "Views",
    "projections": "Projections",
    "lib": "Python Modules",
    "templates": "Templates",
    "scenarios": "Scenarios"
};

function get_directory(path,name=""){
    if (path in directories){
        return directories[path];
    } else {
        let items = [];
        let parent = get_directory(get_parent(path));
        name = name ? name : path.split("/").at(-1);
        if (name in directory_labels){
            name = directory_labels[name];
        }
        parent.push({
            name: name,
            type: "directory",
            items: items,
            path: path
        });
        directories[path] = items;
        return items;
    }
}

function repair_path(path){
    ["/write/","/view/","/utils/","/"].forEach(prefix => {
        if (path.startsWith(prefix)){
            path = path.replace(prefix,"");
        }
    });
    return path;
}

function add_file(file, name){
    let directory = get_directory(get_parent(file))
    directory.push({
        name: name ? name : file.split("/").at(-1).split(".").at(0),
        type: "file",
        path: repair_path(file)
    });
}

window.Project = {
    list: function(data){
        context = data.get;
        let project_menu = [];
        context.workspace.forEach(workspace => {
            workspace.projects.forEach(project => {
                let item = {
                    name: project.name,
                    drn: project.drn,
                    workspace: workspace.name
                }
                project_menu.push(item);
                projects[project.drn] = project;
            });
        });
        return project_menu
    },
    open: function(drn){
        let project = projects[drn];
        localStorage.project_drn = drn;
        localStorage.project_name = project.name;
        localStorage.project_repo = project.repositories.filter(x => x.name == "model").at(0).url;
        location.reload(true);
    },
    get: function(){
        return projects[localStorage.project_drn];
    },
    force_open: function(workspace,name,repo){
        localStorage.project_drn = workspace + ":" + name;
        localStorage.project_name = name;
        localStorage.project_repo = repo;
        location.reload(true);
    },
    get_files: async function(){
        if (!("" in directories)){
            directories[""] = [];
        }
        let items = directories[""];

        let files = await FileSystem.listFiles();
        add_file("/README.md","About")

        // Prepare structure
        get_directory("/write","Write Domain");
        get_directory("/view","View Domain");
        get_directory("/view/views");
        get_directory("/view/projections");
        get_directory("/utils","Utils");
        add_file("/utils/Expressions")
        add_file("/utils/Dependencies")
        add_file("/utils/Patterns")
        add_file("/utils/Roles")

        files.forEach(file => {
            if (file.startsWith("commands/") && file.endsWith(".xml")){
                let name = file.split("/").at(-1).replace("Requested.xml","");
                add_file("/write/" + file,name);
            }

            if (file.startsWith("domain/") && file.endsWith(".xml")){
                if (file.endsWith("root.xml")){
                    add_file("/write/" + file,"Root");
                }
                if (file.includes("behavior-flows") && file.endsWith(".xml")){
                    add_file("/write/" + file);
                }
                if (file.includes("/events/") && file.endsWith(".xml")){
                    add_file("/write/" + file);
                }
            }
            if (file.startsWith("notifiers/") && file.endsWith(".xml")){
                add_file("/write/" + file);
            }
            if (file.startsWith("views/") && file.endsWith(".xml")){
                add_file("/view/" + file);
            }
            if (file.startsWith("projections/") && file.endsWith(".xml")){
                add_file("/view/" + file);
            }
            if (file.startsWith("lib/") && file.endsWith(".py")){
                add_file("/utils/" + file);
            }
            if (file.startsWith("templates/")){
                add_file("/utils/" + file);
            }
            if (file.startsWith("scenarios/") && file.endsWith(".xml")){
                add_file("/" + file);
            }
        });
        return items;
    },
    get_attribute_sources: async function(){
        let sources = {
            commands: [],
            aggregates: []
        };

        let files = await FileSystem.listFiles();
        files.forEach(file => {
            if (file.startsWith("commands/") && file.endsWith(".xml")){
                let name = file.split("/").at(-1).replace("Requested.xml","");
                sources["commands"].push({
                    type: 'command',
                    name: name,
                    file: file
                });
            }

            if (file.startsWith("domain/") && file.endsWith(".xml")){
                if (file.endsWith("root.xml")){
                    let name = file.split("/").at(-2);
                    sources["aggregates"].push({
                        type: 'aggregate',
                        name: name + " - root",
                        file: file
                    });
                }
                if (file.includes("entities") && file.endsWith(".xml")){
                    let name = file.split("/").at(-3);
                    let entity = file.split("/").at(-1).replace(".xml","");
                    sources["aggregates"].push({
                        type: 'aggregate',
                        name: name + " - " + entity,
                        file: file
                    });
                }
            }
        });
        return sources;
    },
    create: function(){
        localStorage.project_drn = "";
        localStorage.project_name = "";
        localStorage.project_repo = "";
        sessionStorage.new_project = true;
        location.reload(true);
    }
};


window.Command = {
    prepare: function(command){
        command['field'] = make_sure_is_list(command['field']);
        command['nested-object'] = make_sure_is_list(command['nested-object']);
        command['nested-object'].forEach(entity => {
            entity.field = make_sure_is_list(entity.field);
        });
        return command;
    },
    refactor_field_name: async function(command,oldName,newName){
        if (oldName == newName){return}
        command.field.filter(x => x.att_name == oldName).forEach(x => x.att_name = newName);
        let files = await FileSystem.listFiles();
        files.filter(x => x.includes('/behavior-flows/') || x.startsWith("notifiers/")).filter(x => x.endsWith(".xml")).forEach(async x => {
            let model = await Modeler.get(x);
            model.trigger.forEach(trigger => {
                if (trigger.att_source == command.att_name){
                    trigger.mapping.filter(x => x.att_value == oldName).forEach(x => {
                        x.att_value = newName;
                    })
                }
            });
        });
    },
    rename: async function(command,name,namespace){
        if (!check_pattern(namespace,graphql_namespace) || !check_pattern(name,lower_or_camel_cased)){
            Session.show_exception("Invalid API path, changes not saved!");
            return;
        }
        let oldPath = "commands/" + command['att_graphql-namespace'].replaceAll('.','/') + "/" + command.att_name;
        let eventName = capitalizeFirstLetter(name) + namespace.replaceAll('.','') + "Requested";
        let oldEvent = command.att_name;
        let newPath = "commands/" + namespace.replaceAll('.','/') + "/" + eventName;
        if (oldPath == newPath){
            console.log("Do nothing!");
            return;
        }
        if (await Modeler.exists(newPath + ".xml")){
            Session.show_exception("File already exists, will not overwrite <br>" + newPath + ".xml");
            return;
        }
        Modeler.auto_save = false;
        command['att_graphql-namespace'] = namespace;
        command['att_graphql-name'] = name;
        command.att_name = eventName;
        await Modeler.sync_to_disk();
        await Modeler.rename(oldPath + ".xml", newPath + ".xml");
        await Modeler.rename(oldPath + ".md", newPath + ".md");
        let files = await FileSystem.listFiles();
        files.filter(x => x.includes('/behavior-flows/') || x.startsWith("notifiers/")).filter(x => x.endsWith(".xml")).forEach(async x => {
            let model = await Modeler.get(x);
            model.trigger.forEach(trigger => {
                if (trigger.att_source == oldEvent){
                    trigger.att_source = eventName;
                }
            });
        });
        await sleep(100);
        await Modeler.sync_to_disk();
        Navigation.rename(oldPath + ".xml", newPath + ".xml");
    },
    create: async function(data){
        if (!check_pattern(data.namespace,graphql_namespace) || !check_pattern(data.name,lower_or_camel_cased)){
            Session.show_exception("Invalid API path, command not created!");
            return;
        }
        let eventName = capitalizeFirstLetter(data.name) + data.namespace.replaceAll('.','') + "Requested";
        let file = "commands/" + data.namespace.replaceAll('.','/') + "/" + eventName + ".xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file + ".xml");
            return;
        }
        let command = {};
        command['att_graphql-namespace'] = data.namespace;
        command['att_graphql-name'] = data.name;
        command.att_name = eventName;
        command = Command.prepare(command);
        if (data.copy && data.source){
            let source = await Modeler.get(data.source,true);
            if (data.source.startsWith("command")){
                command.field = deepcopy(source.field);
                command["nested-object"] = deepcopy(source["nested-object"]);
            }
            if (data.source.includes("/entities/")){
                command.field = deepcopy(source.field);
                let root = data.source.split("entities/").at(0) + "root.xml";
                source = await Modeler.get(root,true);
                command.field.unshift({
                    att_name: source["att_business-key"],
                    att_type: "String"
                });
            }
            if (data.source.endsWith("root.xml")){
                command.field = deepcopy(source.field);
                let files = await FileSystem.listFiles();
                files = files.filter(x => x.startsWith(data.source.replace("root.xml","entities/")) && x.endsWith(".xml"));
                for (let i = 0; i < files.length; i++){
                    let source = await Modeler.get(files[i],true);
                    command["nested-object"].push(source);
                }
            }
        }
        command = {event:command};
        await Modeler.save_model(file,command);
        Navigation.open(file);
    }
}
var focus_index = 0;

window.get_index = function(){
    focus_index++;
    return focus_index;
}
window.make_sure_is_list = function(elements,deduplicate=true){
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

window.deduplicate_on_attribute = function(elements,name){
     let array = [];
     let check = [];
     elements.forEach(x =>{
         if (!(check.includes(x[name]))){
             array.push(x);
             check.push(x[name]);
         }
     });
     return array;
}

window.check_pattern = function(value,pattern){
   if (!pattern || value.match(pattern)){
       return true;
   } else {
       return false;
   }
}

window.capitalizeFirstLetter = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
var model_util_cache = {};

window.makeid = function (length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}

window.deepcopy = function(obj){
    return JSON.parse(JSON.stringify(obj));
}

var ace_initialized = false;
window.render_python_editor = async function(id,code){
    await sleep(100);
    if (!ace_initialized){
        ace_initialized = true;
        let langTools = ace.require('ace/ext/language_tools');
//        var customCompleter = {
//          getCompletions: function(editor, session, pos, prefix, callback) {
//                callback(null, [
//                {name: "cp", value: "complete", score: 1, meta: "global"}
//                ]);
//
//          }
//
//         }
//        langTools.addCompleter(customCompleter);
    }
    var editor = ace.edit(id);
    let theme = localStorage.theme == "dark" ? "ace/theme/github_dark" : "ace/theme/github";
    editor.session.setMode('ace/mode/python');
    code = code.replaceAll('|LB|','\n');
    editor.setValue(code,1);
    editor.setTheme(theme);
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: true
    });
    editor.setReadOnly(session.editing_disabled);
    return editor;
}

window.arraymove = function(arr, fromIndex, toIndex) {
   var element = arr[fromIndex];
   arr.splice(fromIndex, 1);
   arr.splice(toIndex, 0, element);
}

window.deduplicate = function(elements,key){
    let array = [];
    let check = [];
    elements.forEach(x =>{
        if (!(check.includes(x[key]))){
            array.push(x);
            check.push(x[key]);
        }
    });
    return array;
}


window.View = {
    prepare: function(view){
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
    },
    list: async function(){
        let files = await FileSystem.listFiles();
        return files.filter(x => x.startsWith("views/") && x.endsWith(".xml")).map(x => x.split('/').at(-1).replace('.xml',''));
    },
    get_eligible_key_fields: async function(handler){
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let model = null;
        if (handler.att_processor == "item"){
            model = await Modeler.get(file,true);
        } else {
            let entities = await Aggregate.get_entities(file);
            model = entities.filter(x => x.att_name == handler.att_dictionary).at(0);
        }
        return model.field.filter(x => x.att_type == "String").map(x => x.att_name);
    },
    get_collections: async function(handler,force=true){
        if (force || handler.att_processor == "dictionary"){
            let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
            let entities = await Aggregate.get_entities(file);
            return entities.map(x => x.att_name);
        }
    },
    get_mapping: function(handler,field){
        let mappings = handler.mapping.filter(x => x.att_target == field.att_name);
        if (mappings.length != 0){
            return mappings.at(0);
        }
        return {};
    },
    get_aggregate_fields: async function(handler){
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let model = null;
        if (handler.att_processor == "item"){
            model = await Modeler.get(file,true);
        } else {
            let entities = await Aggregate.get_entities(file);
            model = entities.filter(x => x.att_name == handler.att_dictionary).at(0);
        }
        return model.field.map(x => x.att_name);
    },
    get_aggregate_entity_fields: async function(handler,mapping){
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let entities = await Aggregate.get_entities(file);
        let model = entities.filter(x => x.att_name == mapping.att_value).at(0);
        return model.field.map(x => x.att_name);
    },
    add_field: function(model,fieldName){
        if (model.field.filter(x => x.att_name == fieldName).length != 0){
            Session.show_exception("Field with name <i>" + fieldName + "</i> already present as field or relation");
            return;
        }
        model.field.push({att_name: fieldName, att_type: "String"});
    },
    add_relation: function(model,fieldName){
          if (model.field.filter(x => x.att_name == fieldName).length != 0){
              Session.show_exception("Field with name <i>" + fieldName + "</i> already present as field or relation");
              return;
          }
          model.field.push({att_name: fieldName, att_type: "ObjectList", att_ref: model.att_name});
      },
    get_default_mapping: async function(model,handler){
        handler.mapping = [];
        let fields = model.field.filter(x => view_field_types.includes(x.att_type) ||x.att_type == "ObjectList" ).map(x => x.att_name);
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let aggregate = await Modeler.get(file,true);
        aggregate.field.filter(x => fields.includes(x.att_name)).forEach(x => {
            handler.mapping.push({
                att_target: x.att_name,
                att_value: x.att_name,
                att_operand: "set"
            });
        });
        let entities = await Aggregate.get_entities(file);
        entities = entities.filter(x => fields.includes(x.att_name));
        for (let i = 0; i < entities.length;  i++) {
            let x = entities[i];
            let mapping = {
                att_target: x.att_name,
                att_value: x.att_name,
                att_operand: "convert_items"
            }
            let template = await View.read_template(model,handler,mapping,{});
            View.save_template(mapping,template);
            handler.mapping.push(mapping);
        }
    },
    read_template: async function(model,handler,mapping,template){
        if (template_read_block){
            return template;
        }
        template_read_block = true;
        try{
            if(mapping.att_template && Object.keys(template).length == 0){
                    mapping.att_template.replace('{','').replace('}','').replaceAll(" ","").replaceAll("\n","").replaceAll('&quot;','').replaceAll('"',"").replaceAll("'","").split(',').forEach(x => {
                        template[x.split(':').at(0)] = x.split(':').at(1).replace("value[","").replace("]","");
                      });
                }
            else {
                    let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
                    let entities = await Aggregate.get_entities(file);
                    let fields = entities.filter(x => x.att_name == mapping.att_value).at(0).field.map(x => x.att_name);
                    let view = model.field.filter(x => x.att_name == mapping.att_target).at(0).att_ref;
                    view = await Modeler.get_view_by_name(view,true);
                    view.field.forEach(x => {
                        if (!Object.keys(template).includes(x.att_name)){
                            template[x.att_name] = fields.includes(x.att_name) ? x.att_name : '';
                        }
                    });
                }
        } finally {
            template_read_block = false;
        }
        return template;
    },
    save_template: function(mapping,template){
        let mapping_template = '{\n';
        Object.keys(template).forEach( k => {
            mapping_template += `"${k}": value["${template[k]}"],\n`;
        });
        mapping_template += '}';
        mapping.att_template = mapping_template;
    },
    get_initial_inline_code: async function(model,handler){
        let file = "domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml";
        let aggregate = await Modeler.get(file,true);
        let view_key = aggregate["att_business-key"];
        let code = "#Your custom logic, you have access to:\n#  The 'event' object\n#  The 'snapshot' object\n#  And the EntityManager\n";
        code += `entity = EntityManager.get(type="${model.att_name}", key=snapshot.${view_key})\n`;
        let values = aggregate.field.map(x => x.att_name);
        model.field.filter(x => values.includes(x.att_name)).forEach(x =>{
            code += `entity.${x.att_name} = snapshot.${x.att_name}\n`;
        });

        let fields = model.field.filter(x => x.att_type == "ObjectList" );
        let entities = await Aggregate.get_entities(file);
        for (let i = 0; i < fields.length;  i++) {
            if (!entities.map(x => x.att_name).includes(fields[i].att_name)){continue}
            let entity = entities.filter(x => x.att_name == fields[i].att_name).at(0);
            code += `entity.${entity.att_name} = [{`;

            let view = await Modeler.get_view_by_name(fields[i].att_ref,true);
            view.field.filter(x => entity.field.map(x => x.att_name).includes(x.att_name)).forEach(x => {
                code += `\n\t\t"${x.att_name}": value["${x.att_name}"],`;
            });
            code = code.slice(0,-1);
            code += `\n\t}\n\tfor value in snapshot.${entity.att_name}.values()]\n`
        }

        code += "if snapshot.isDeleted != '':\n    entity.mark_for_deletion = True";
        return code;
    },
    rename: async function(file,oldNamespace,newNamespace){
        if (oldNamespace == newNamespace){return}
        let newPath = file.replace("views/" + oldNamespace.replaceAll(".","/"), "views/" + newNamespace.replaceAll(".","/"));
        await Modeler.rename(file,newPath);
        await Modeler.rename(file.replace('.xml','.md'),newPath.replace('.xml','.md'));
        try{
            await Modeler.sync_to_disk();
        }catch{}
        Navigation.rename(file,newPath);
    },
    add_query: async function(file,model,type,name){
        let namespace = file.replace('views/','').split('/').filter(x => !x.includes('.xml')).join('.');
        let path = namespace + "." + name;
        let views = await View.list();
        let paths = [];
        model.query.forEach( q => {
            paths.push(q['att_graphql-namespace'] + "." + q["att_field-name"]);
        });
        if (paths.includes(path)){
            Session.show_exception("Method " + name + " already registered in namespace " + namespace);
            return;
        }
        for(let i = 0; i < views.length; i++){
            let view = await Modeler.get_view_by_name(views[i],true);
            view.query.forEach( q => {
                paths.push(q['att_graphql-namespace'] + "." + q["att_field-name"]);
            });
            if (paths.includes(path)){
                Session.show_exception("Method " + name + " already registered in namespace " + namespace);
                return;
            }
        }
        model.query.push({
          "att_graphql-namespace": namespace,
          "att_field-name": name,
          "att_type": type,
          "att_authorization": "authenticated",
          "att_use-canonical-search": "false",
          "filter-clause": []
        });
    },
    create: async function(data){
        if (!check_pattern(data.namespace,graphql_namespace) || !check_pattern(data.name,pascal_cased)){
            Session.show_exception("Invalid configuration, view not created!");
            return;
        }
        let file = "views/" + data.namespace.replaceAll(".","/") + "/" + data.name + ".xml";
        let files = await FileSystem.listFiles();
        if (files.filter(x => x.startsWith("views/") && x.endsWith(data.name + ".xml")).length != 0){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let view = {
            "att_name":data.name,
            "att_data-retention-days" : -1,
            "att_exclude-notification": "false"
        };
        view = {view:view};
        await Modeler.save_model(file,view);
        await sleep(1000);
        Navigation.open(file);
    },
    copy_attributes: async function(model,file){
        let source = await Modeler.get(file,true);
        let fields = model.field.map(x => x.att_name);
        source.field.filter(x => !fields.includes(x.att_name)).forEach(x => {
            model.field.push({
                att_name: x.att_name,
                att_type: x.att_type
            });
        });
    }
}

var template_read_block = false;

var label = {};
window.Language = {
    get: function(key){
        if (key in label){
            return label[key];
        } else {
            return key;
        }
    }
}
async function load_labels(){
    var i18n_data = await fetch('/assets/language.properties');
    i18n_data = await i18n_data.text();

    i18n_data.split("\n").filter(x => x != "").forEach(x => {
        var element = x.split("=");
        label[element[0]] = element[1];
    });
}
load_labels();
let scenario_cache = {};
window.Scenario = {
    prepare: function(scenario){
        scenario.activity = make_sure_is_list(scenario.activity);
        scenario.activity = scenario.activity.map(activity => Scenario.prepare_activity(activity));
        return scenario;
    },
    prepare_activity: function(activity){
        activity.input = make_sure_is_list(activity.input);
        activity['expected-trace'] = make_sure_is_list(activity['expected-trace']);
        activity["extract-value"] = make_sure_is_list(activity["extract-value"]);
        activity["expect-value"] = make_sure_is_list(activity["expect-value"]);
        return activity;
    },
    get_components: async function(){
        let files = await FileSystem.listFiles();
        let components = [];
        files.filter(x => x.includes("/behavior-flows/") && x.endsWith(".xml")).forEach(x => {
            let path = x.split("/");
            components.push(`${path[1]}.${path[2]}.${path[4].replace('.xml','')}`);
        });
        files.filter(x => x.startsWith("notifiers/") && x.endsWith(".xml")).forEach(x => {
            components.push(`${x.replace("notifiers/","").replace(".xml","")}-Notifier`)
        });
        return components;
    },
    get_commands: async function(){
        let files = await FileSystem.listFiles();
        files = files.filter(x => x.startsWith("commands/") && x.endsWith(".xml"));
        let commands = [];
        for (let i = 0; i < files.length; i++){
            let command = await Modeler.get(files[i],true);
            let key = `${command["att_graphql-namespace"]}.${command["att_graphql-name"]}`;
            commands.push(key);
            scenario_cache[key] = command;
        }
        return commands;
    },
    get_queries: async function(){
        let files = await FileSystem.listFiles();
        files = files.filter(x => (x.startsWith("views/") || x.startsWith('projections/')) && x.endsWith(".xml"));
        let queries = {};
        for (let i = 0; i < files.length; i++){
            let model = await Modeler.get(files[i],true);
            let type = Modeler.determine_type(files[i]);
            if (type == "view"){
                model.query.forEach(x => {
                    queries[`${x["att_graphql-namespace"]}.${x["att_field-name"]}`] = {name:model.att_name,type:'View'};
                });
            }
            if (type == "projection"){
                queries[`${model["att_graphql-namespace"]}.${model["att_field-name"]}`] = {name:model.att_return,type:'Projection'};
            }
        }
        return queries;
    },
    get_flowvars: function(scenario,index){
        let flow_vars = [];
        scenario.activity.forEach((activity,i) => {
            if ( i < index){
                if (activity.att_type == "set-variables"){
                    activity.input.forEach(input => {
                        flow_vars.push(`#${input.att_name}#`);
                    });
                }
                activity["extract-value"].forEach(value => {
                    flow_vars.push(`#${value['att_put-key']}#`);
                });
            }
        });
        flow_vars.push("#user_name#");
        flow_vars.push("#user_number#");
        return flow_vars;
    },
    prepare_nested_input: async function(activity,collection){
        let elements = activity.att_path.split(".");
        let commandName = elements.pop();
        commandName = commandName.charAt(0).toUpperCase() + commandName.slice(1);
        commandName += elements.join("");
        commandName += "Requested";
        let command = await Modeler.get_by_name(commandName,true);
        let retval = {};
        command["nested-object"].filter(x => x.att_name == collection).at(0).field.forEach(x => {
            retval[x.att_name] = x.att_type == "String" ? "string" : x.att_type == "Boolean" ? true : 0;
        });
        return retval;
    },
    last_type: "",
    determine_type: async function(activity,expectation){
        let view = activity.att_view;
        view = await Modeler.get_view_by_name(view,true);
        if (expectation.att_name){
            let path = expectation.att_name.split(".");
            let type = "";
            for (let i = 0; i < path.length; i++){
                let key = path[i];
                if (Number.isInteger(key)){
                    continue;
                }
                let field = view.field.filter( x => x.att_name == key).at(0);
                if (field && field.att_type){
                    type = field.att_type;
                }
            }
            return type;
        } else {
            return ""
        }
    },
    query_path_helper: async function(activity,expectation){
        let view = activity.att_view;
        view = await Modeler.get_view_by_name(view,true);
        if (expectation.att_name){
            let path = expectation.att_name.split(".");
            for (let i = 0; i < path.length; i++){
                let key = path[i];
                if (Number.isInteger(key)){
                    continue;
                }
                let field = view.field.filter( x => x.att_name == key).at(0);
                if (field && field.att_type){
                    Scenario.last_type = field.att_type;
                }
                if (field && field.att_ref){
                    view = await Modeler.get_view_by_name(field.att_ref,true);
                }
            }
            let references = [];
            view.field.forEach(x => {
                references.push({
                    name: x.att_name,
                    type: x.att_type
                });
            });
            return references;
        }
    },
    update_path: function(expectation,field){
        let path = "";
        if (expectation.att_name.includes(".")) {
            path = expectation.att_name;
        }
        if (field_types.includes(Scenario.last_type)){
            let tmp = path.split(".");
            tmp.pop();
            path = tmp.join(".");
        } else if (Scenario.last_type == "StringList"){
            let tmp = path.split(".");
            if (Number.isInteger(tmp.at(-1))){
                tmp.pop();
            }
            tmp.pop();
            path = tmp.join(".");
        }
        if (!path.endsWith(".") && path != ""){
            path += "."
        }
        path += field.name;
        if (["ObjectList", "OneToMany", "ManyToMany"].includes(field.type)){
            path += ".0.";
        }
        if (["StringList"].includes(field.type)){
            path += ".0";
        }
        if (["ManyToOne", "OneToOne"].includes(field.type)){
            path += ".";
        }
        return [path,field.type];
    },
    initialize_expectation: async function(activity){
        let view = activity.att_view;
        view = await Modeler.get_view_by_name(view,true);
        return {
            att_name: view.field.at(0).att_name,
            att_type: view.field.at(0).att_type,
            att_value: "#"
        };
    },
    update_command: function(activity,command){
        activity.att_path = command;
        activity.input = scenario_cache[command]
            .field.filter(x => !x['att_auto-fill'])
            .map(x => {return{att_name: x.att_name, att_type: x.att_type, att_value: ''}});
        scenario_cache[command]["nested-object"].forEach(collection => {
            let obj = {};
            collection.field.forEach(field => {
                obj[field.att_name] = field.att_type == "String" ? "string" : field.att_type == "Boolean" ? true : 0;
            });
            activity.input.push({
                att_name: collection.att_name,
                att_type: "Nested",
                att_value: JSON.stringify([obj])
            });
        });
    },
    update_query: async function(activity,queries,query){
        activity.att_path = query;
        activity.att_view = queries[query].name;
        let view = activity.att_view;
        view = await Modeler.get_view_by_name(view,true);
        let filters = [];
        view.query.filter(x => `${x["att_graphql-namespace"]}.${x["att_field-name"]}` == activity.att_path).forEach(q => {
            console.log(q);
            if (q.att_type == "get"){
                filters.push({
                    att_name: "key",
                    att_type: "String",
                    att_value: "#"
                });
            } else if (q["att_use-canonical-search"] && q["att_use-canonical-search"] == "true"){
                filters.push({
                    att_name: "key_begins_with",
                    att_type: "String",
                    att_value: "#"
                });
            }
            q["filter-clause"].forEach(f => {
                let name = f["att_field-name"];
                filters.push({
                    att_name: name,
                    att_type: view.field.filter(x => x.att_name == name).at(0).att_type,
                    att_value: "#"
                });
            });
        });
        activity.input = filters;
    },
    create: async function(data){
        if (!check_pattern(data.name,pascal_cased)){
            Session.show_exception("Invalid configuration, scenario not created!");
            return;
        }
        let file = "scenarios/" + data.name + ".xml";
        if (await Modeler.exists(file)){
            Session.show_exception("File already exists, will not overwrite <br>" + file);
            return;
        }
        let scenario = Scenario.prepare({});
        scenario.att_name = data.name;
        scenario = {scenario:scenario};
        await Modeler.save_model(file,scenario);
        if (data.docs && data.docs != 'documentation'){
            await Modeler.save_model(file.replace('.xml','.md'),{content:data.docs});
        }
        await sleep(1000);
        Navigation.open(file);
    }
}
