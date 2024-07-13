
import http from '/js/http.js'

const dir = '/project';
const proxy = "https://git.draftsman.io";
var auto_save = null;
var sync_interval = null;
var fs = null;

var branch = "main";
var checked_out_repository = "";
var file_check = {};

const options = {
    ignoreAttributes : false,
    format: true,
    attributeNamePrefix : "att_"
};

var parser = null;
var builder = null;

document.addEventListener('tracepaper:context:changed', async () => {
    if (!parser || !builder){
        parser = new XMLParser(options);
        builder = new XMLBuilder(options);
    }
    if (context.repository && context.repository != checked_out_repository){
        clearInterval(auto_save);
        clearInterval(sync_interval);
        checked_out_repository = context.repository;
        try{
            await connect_repository();
        }catch(err){
            console.error(err);
        }
        await load_model();
        auto_save = setInterval(save_model_to_disk,1000);
        sync_interval = setInterval(sync_model,5*60*1000);
        await sleep(500);
        session.initialized = true;
        block = false;
    }
});

window.clear_storage = async function(force=false){
    clearInterval(auto_save);
    clearInterval(sync_interval);
    clearInterval(save_session_interval);
    var databases = await indexedDB.databases();
    for (var r of databases){
        indexedDB.deleteDatabase(r.name);
    }
    Draftsman.sign_out();
}

async function reload_model(){
    clearInterval(auto_save);
    while (save_model_to_disk_block){
        await sleep(10);
    }
    await load_model();
    auto_save = setInterval(save_model_to_disk,1000);
}

async function sync_model(){
    await pull_model();
    await reload_model();
}

var save_model_to_disk_block = false;

async function write_model_element(file,content){
      let placeholder = "placeholder-6a3eacfc-85ff-4414-938d-511785c46536";
      let json = JSON.stringify(content);
      json = json.replaceAll('"true"','"' + placeholder + '"');
      json = JSON.parse(json);
      let xml = builder.build(json);
      xml = xml.replaceAll(placeholder,"true");
      await FileSystem.write(file,xml);
}

async function save_model_to_disk(){
    if (save_model_to_disk_block){return}else{save_model_to_disk_block = true}
    try{
        for (var member in report) delete report[member];
        hard_deletes = [];
        hard_writes = {};
        document.dispatchEvent(new CustomEvent('tracepaper:model:prepare-save'));
        await sleep(100);
        let isRefactored = false;
        if (meta && meta.roles){
            await FileSystem.write("meta.json",JSON.stringify(meta,null,2));
        }
        await Object.entries(documentation).forEach(async entry => {
            await FileSystem.write(entry[0],entry[1].content);
        });
        await Object.entries(model).forEach(async entry => {
              let element = entry[1][Object.keys(entry[1]).at(0)];
              if (element && "att_mark_for_deletion" in element && element["att_mark_for_deletion"]){
                  await FileSystem.delete(entry[0]);
                  delete model[entry[0]];
                  let doc = entry[0].replace(".xml",".md");
                  if (doc in documentation){
                    await FileSystem.delete(doc);
                    delete documentation[doc];
                  }
                  isRefactored = true;
              } else{
                  if (element){
                    delete element.att_mark_for_deletion;
                    delete element.att_file_path;
                  }
                  await write_model_element(entry[0],entry[1]);
              }
        });
        await Object.entries(code).forEach(async entry => {
            await FileSystem.write(entry[0],entry[1].content);
        });

        //Cleanup
        let files = await FileSystem.listFiles();
        await files.filter(
                file => file != "meta.json"
                    && file != ".gitignore"
                    && !(file in documentation)
                    && !(file in model)
                    && !(file in code)
                    && !(file in logs)
                    && !(file in templates)
            ).forEach(async file => {
            isRefactored = true;
            await FileSystem.delete(file);
        });
        await hard_deletes.forEach(async file => {
            await FileSystem.delete(file);
        });
        await Object.keys(hard_writes).forEach(async file => {
            await write_model_element(file,hard_writes[file]);
        });
        let status = await get_status_matrix();
        session.staged_files = deduplicate(status.map(x => x[0]));
        if (isRefactored){
            await sleep(1000);
            document.dispatchEvent(new CustomEvent('tracepaper:model:loaded'));
        }
        if (JSON.stringify(session.staged_files) != stage_history){
            Diagram.draw();
            stage_history = JSON.stringify(session.staged_files);
        }
    }catch(err){
        console.error(err);
    }
    save_model_to_disk_block = false;
}
var stage_history = "";

async function load_file(file){
    try{
        let content = await FileSystem.read(file);
            file_check[file] = content;
            if (file == "meta.json"){
                let data = JSON.parse(content);
                Object.assign(meta,data);
                meta.roles = make_sure_is_list(meta.roles);
            }
            else if (file.endsWith(".xml")){
                content = parser.parse(content);
                model[file] = content;
            }
            else if (file.endsWith(".py")){
                code[file] = {content:content};
            }
            else if(file.startsWith("templates/")){
                templates[file] = {content:content};
            }
            else if(file.endsWith(".md")){
                documentation[file] = {content:content};
            }else if(file.endsWith(".log")){
                logs[file] = content;
                localStorage[file] = content;
            }
            else {
                console.log(file,content);
            }
    }catch(err){
        console.log("Could not load file:",file,err);
    }
}

async function load_model(){
    clear_model();
    let files = await FileSystem.listFiles();
    await files.forEach(async file => {
        await load_file(file);
    });
    await sleep(500);
    document.dispatchEvent(new CustomEvent('tracepaper:model:loaded'));
}

function extract_file_name(path){
    return path.split('/').at(-1).split('.').at(0);
}

function clear_model(){
    for (var member in model) delete model[member];
    for (var member in meta) delete meta[member];
    for (var member in documentation) delete documentation[member];
}

async function connect_repository(){
        fs = new LightningFS(localStorage.project);
        if (await FileSystem.read("README.md") == "file not found"){
            console.log("clone");
            await git.clone({ fs, http, dir, url: checked_out_repository, corsProxy: proxy });

            console.log("set author");
            await git.setConfig({
              fs,
              dir: dir,
              path: 'user.name',
              value: context.fullName
            })
        }
        await pull_model();
}

async function pull_model(){
    if (!await FileSystem.staged_files()){
      console.log("checkout: " + branch);
      await FileSystem.checkout_branch(branch);
      prepare_folder_structure();
      const currentDate = new Date();
      session.last_pulled = currentDate.getTime();
    }
}

var hard_deletes = [];
var hard_writes = {};

const trigger_build = `
mutation TriggerBuild($buildId: String = "", $drn: String = "") {
  Project {
    build(input: {drn: $drn, buildId: $buildId}) {
      correlationId
    }
  }
}
`;

window.FileSystem = {
    sync_model: sync_model,
    hardWrite: function(path,content){
        hard_writes[path] = content;
    },
    hardDelete: function(path){
        hard_deletes.push(path);
    },
    clean_and_pull: function(){
        session.editing_disabled = false;
        delete session.exception;
        indexedDB.deleteDatabase(localStorage.project);
        localStorage[localStorage.project] = JSON.stringify(session);
        setTimeout(function(){location.reload()},500);
    },
    listFiles: async function(){
        return await git.listFiles({ fs, dir: dir, ref: 'HEAD' });
    },
    staged_files: async function(){
        let status = await get_status_matrix();
        return status.length != 0;
    },
    read: async function(filepath){
        try{
            return await fs.promises.readFile(dir + "/" + filepath, "utf8");
        } catch {
            return "file not found";
        }
    },
    write: async function(filepath,content){
        if (!content || file_check[filepath] == content){
            return;
        }
        file_check[filepath] = content;
        await FileSystem.create_dir(filepath);
        await fs.promises.writeFile(dir + "/" + filepath, content,"utf8");
        await git.add({ fs, dir: dir, filepath: filepath });
    },
    delete: async function(filepath){
        try{
            await git.remove({ fs, dir: dir, filepath: filepath });
            await fs.promises.unlink(dir + "/" + filepath);
        }catch{}
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
    commit: async function(message){
        clearInterval(auto_save);
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
        await reload_model();
        await sleep(100);
        Navigation.hard_reload_tab();
        if (session.trigger_build_after_commit){
            let buildId = moment().format("YYYY-MM-DD[T]hh:mm")
            let data = await Draftsman.query(trigger_build,{drn:localStorage.project,buildId:buildId});
            console.log(data);
            Navigation.execute_open_tab("build/" + localStorage.project + ":" +buildId);
        }
    },
    get_history: async function(){
        return await git.log({fs,dir:dir});
    },
    pull: async function(){
        await git.fetch({fs,dir: dir,http: http});
        await git.pull({fs,http,dir: dir});
    },
    checkout_branch: async function(branch){
        await git.fetch({
          fs,
          dir: dir,
          http: http
        })
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
    checkout_commit: async function(commit){
        await git.checkout({
          fs,
          dir: dir,
          ref: commit.oid
        });
        Navigation.execute_open_tab("README.md");
        await reload_model();

        let message = "Revision [";
        let id = crc32(commit.oid);
        message += id;
        message += "] is read-only. Reload this page to return back to the last revision.";
        message += ' <button type="button" class="btn btn-outline-danger" @click="FileSystem.revert_to(';
        message += "'"+ id +"'";
        message += ')">Revert to revision '+ id +'</button>';
        message += '<br><br><button type="button" class="btn btn-outline-danger" @click="FileSystem.clean_and_pull()">Cancel</button>';
        session.exception = message;
        session.editing_disabled = true;
    },
    revert_to: async function(id){
        let file_stash = {};
        var files = await git.listFiles({ fs, dir: dir, ref: 'HEAD' })
        for (const file of files) {
            file_stash[file] = await FileSystem.read(file);
        }
        await FileSystem.checkout_branch(branch);
        await cleanup_git_directory();
        for (const [path, content] of Object.entries(file_stash)) {
          await FileSystem.write(path,content);
        }
        session.editing_disabled = false;
        delete session.exception;
        Navigation.execute_open_tab("README.md");
        await reload_model();
    },
    file_status: async function(path){
        let status = await git.status({ fs, dir: dir, filepath: path });
        return status;
    },
    remove_from_staging: async function(path,noreload=false){
        clearInterval(auto_save);
        let file_status = await FileSystem.file_status(path);
        await git.resetIndex({ fs, dir: dir, filepath: path });
        await git.checkout({
          fs,
          dir: dir,
          ref: branch,
          force: true,
          filepaths: [path]
        });
        if (!noreload && file_status != "added"){
            await load_file(path);
        }
        if (!noreload && file_status == "added"){
            await FileSystem.delete(path);
        }
        if (!noreload){
            document.dispatchEvent(new CustomEvent('tracepaper:model:loaded'));
            await sleep(100);
            Navigation.hard_reload_tab();
        }
        let status = await get_status_matrix();
        session.staged_files = deduplicate(status.map(x => x[0]));
        clearInterval(auto_save);
        auto_save = setInterval(save_model_to_disk,1000);
    }
}


async function prepare_folder_structure(){
    await [   "/commands",
        "/domain",
        "/lib",
        "/notifiers",
        "/patterns",
        "/expressions",
        "/scenarios",
        "/views"].forEach(async path => {
        try{await fs.promises.mkdir(dir + path);} catch{}
    });
}

var makeCRCTable = function(){
    var c;
    var crcTable = [];
    for(var n =0; n < 256; n++){
        c = n;
        for(var k =0; k < 8; k++){
            c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    return crcTable;
}

window.crc32 = function(str) {
    var crcTable = window.crcTable || (window.crcTable = makeCRCTable());
    var crc = 0 ^ (-1);

    for (var i = 0; i < str.length; i++ ) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
    }

    return (crc ^ (-1)) >>> 0;
};

async function cleanup_git_directory(){
        var files = await git.listFiles({ fs, dir: dir, ref: 'HEAD' })
        for (const file of files) {
            await git.remove({ fs, dir: dir, filepath: file });
            await fs.promises.unlink(dir + "/" + file);
        }
        await prepare_folder_structure();
    }

async function get_status_matrix(){
        let status = await git.statusMatrix({fs,dir: dir});
        return status.filter(x => !(x[1] == 1 && x[3] == 1));
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

window.create_pipeline = function(region){
    let url = 'https://' + region.code + '.console.aws.amazon.com/cloudformation/home?region='
        + region.code + '#/stacks/create/review?templateURL=https://s3.eu-central-1.amazonaws.com/templates.draftsman.io/draftsman-application-pipeline-v5.yml&stackName='
        + session.projectName.toLowerCase() + '-main-pipeline&param_GithubWorkspace='
        + context.code_repo.split('/').at(-2).toLowerCase() + '&param_RepositoryName='
        + context.code_repo.split('/').at(-1).toLowerCase() + '&param_RepositoryBranch=main&param_ProjectName='
        + session.projectName.toLowerCase() + '&param_DRN='
        + localStorage.project + '&param_GraphQL=' + api_url + '&param_APIKEY=' + api_key;
    window.open(url, '_blank');
}
var XMLBuilder;(()=>{var t={784:(t,e,i)=>{"use strict";var r=i(687),s={attributeNamePrefix:"@_",attributesGroupName:!1,textNodeName:"#text",ignoreAttributes:!0,cdataPropName:!1,format:!1,indentBy:"  ",suppressEmptyNode:!1,suppressUnpairedNode:!0,suppressBooleanAttributes:!0,tagValueProcessor:function(t,e){return e},attributeValueProcessor:function(t,e){return e},preserveOrder:!1,commentPropName:!1,unpairedTags:[],entities:[{regex:new RegExp("&","g"),val:"&amp;"},{regex:new RegExp(">","g"),val:"&gt;"},{regex:new RegExp("<","g"),val:"&lt;"},{regex:new RegExp("'","g"),val:"&apos;"},{regex:new RegExp('"',"g"),val:"&quot;"}],processEntities:!0,stopNodes:[],oneListGroup:!1};function n(t){this.options=Object.assign({},s,t),this.options.ignoreAttributes||this.options.attributesGroupName?this.isAttribute=function(){return!1}:(this.attrPrefixLen=this.options.attributeNamePrefix.length,this.isAttribute=h),this.processTextOrObjNode=o,this.options.format?(this.indentate=a,this.tagEndChar=">\n",this.newLine="\n"):(this.indentate=function(){return""},this.tagEndChar=">",this.newLine="")}function o(t,e,i){var r=this.j2x(t,i+1);return void 0!==t[this.options.textNodeName]&&1===Object.keys(t).length?this.buildTextValNode(t[this.options.textNodeName],e,r.attrStr,i):this.buildObjectNode(r.val,e,r.attrStr,i)}function a(t){return this.options.indentBy.repeat(t)}function h(t){return!!t.startsWith(this.options.attributeNamePrefix)&&t.substr(this.attrPrefixLen)}n.prototype.build=function(t){return this.options.preserveOrder?r(t,this.options):(Array.isArray(t)&&this.options.arrayNodeName&&this.options.arrayNodeName.length>1&&((e={})[this.options.arrayNodeName]=t,t=e),this.j2x(t,0).val);var e},n.prototype.j2x=function(t,e){var i="",r="";for(var s in t)if(void 0===t[s]);else if(null===t[s])"?"===s[0]?r+=this.indentate(e)+"<"+s+"?"+this.tagEndChar:r+=this.indentate(e)+"<"+s+"/"+this.tagEndChar;else if(t[s]instanceof Date)r+=this.buildTextValNode(t[s],s,"",e);else if("object"!=typeof t[s]){var n=this.isAttribute(s);if(n)i+=this.buildAttrPairStr(n,""+t[s]);else if(s===this.options.textNodeName){var o=this.options.tagValueProcessor(s,""+t[s]);r+=this.replaceEntitiesValue(o)}else r+=this.buildTextValNode(t[s],s,"",e)}else if(Array.isArray(t[s])){for(var a=t[s].length,h="",p=0;p<a;p++){var u=t[s][p];void 0===u||(null===u?"?"===s[0]?r+=this.indentate(e)+"<"+s+"?"+this.tagEndChar:r+=this.indentate(e)+"<"+s+"/"+this.tagEndChar:"object"==typeof u?this.options.oneListGroup?h+=this.j2x(u,e+1).val:h+=this.processTextOrObjNode(u,s,e):h+=this.buildTextValNode(u,s,"",e))}this.options.oneListGroup&&(h=this.buildObjectNode(h,s,"",e)),r+=h}else if(this.options.attributesGroupName&&s===this.options.attributesGroupName)for(var d=Object.keys(t[s]),l=d.length,c=0;c<l;c++)i+=this.buildAttrPairStr(d[c],""+t[s][d[c]]);else r+=this.processTextOrObjNode(t[s],s,e);return{attrStr:i,val:r}},n.prototype.buildAttrPairStr=function(t,e){return e=this.options.attributeValueProcessor(t,""+e),e=this.replaceEntitiesValue(e),this.options.suppressBooleanAttributes&&"true"===e?" "+t:" "+t+'="'+e+'"'},n.prototype.buildObjectNode=function(t,e,i,r){if(""===t)return"?"===e[0]?this.indentate(r)+"<"+e+i+"?"+this.tagEndChar:this.indentate(r)+"<"+e+i+this.closeTag(e)+this.tagEndChar;var s="</"+e+this.tagEndChar,n="";return"?"===e[0]&&(n="?",s=""),i&&-1===t.indexOf("<")?this.indentate(r)+"<"+e+i+n+">"+t+s:!1!==this.options.commentPropName&&e===this.options.commentPropName&&0===n.length?this.indentate(r)+"\x3c!--"+t+"--\x3e"+this.newLine:this.indentate(r)+"<"+e+i+n+this.tagEndChar+t+this.indentate(r)+s},n.prototype.closeTag=function(t){var e="";return-1!==this.options.unpairedTags.indexOf(t)?this.options.suppressUnpairedNode||(e="/"):e=this.options.suppressEmptyNode?"/":"></"+t,e},n.prototype.buildTextValNode=function(t,e,i,r){if(!1!==this.options.cdataPropName&&e===this.options.cdataPropName)return this.indentate(r)+"<![CDATA["+t+"]]>"+this.newLine;if(!1!==this.options.commentPropName&&e===this.options.commentPropName)return this.indentate(r)+"\x3c!--"+t+"--\x3e"+this.newLine;if("?"===e[0])return this.indentate(r)+"<"+e+i+"?"+this.tagEndChar;var s=this.options.tagValueProcessor(e,t);return""===(s=this.replaceEntitiesValue(s))?this.indentate(r)+"<"+e+i+this.closeTag(e)+this.tagEndChar:this.indentate(r)+"<"+e+i+">"+s+"</"+e+this.tagEndChar},n.prototype.replaceEntitiesValue=function(t){if(t&&t.length>0&&this.options.processEntities)for(var e=0;e<this.options.entities.length;e++){var i=this.options.entities[e];t=t.replace(i.regex,i.val)}return t},t.exports=n},687:t=>{function e(t,o,a,h){for(var p="",u=!1,d=0;d<t.length;d++){var l,c=t[d],f=i(c);if(l=0===a.length?f:a+"."+f,f!==o.textNodeName)if(f!==o.cdataPropName)if(f!==o.commentPropName)if("?"!==f[0]){var g=h;""!==g&&(g+=o.indentBy);var N=h+"<"+f+r(c[":@"],o),x=e(c[f],o,l,g);-1!==o.unpairedTags.indexOf(f)?o.suppressUnpairedNode?p+=N+">":p+=N+"/>":x&&0!==x.length||!o.suppressEmptyNode?x&&x.endsWith(">")?p+=N+">"+x+h+"</"+f+">":(p+=N+">",x&&""!==h&&(x.includes("/>")||x.includes("</"))?p+=h+o.indentBy+x+h:p+=x,p+="</"+f+">"):p+=N+"/>",u=!0}else{var v=r(c[":@"],o),m="?xml"===f?"":h,b=c[f][0][o.textNodeName];p+=m+"<"+f+(b=0!==b.length?" "+b:"")+v+"?>",u=!0}else p+=h+"\x3c!--"+c[f][0][o.textNodeName]+"--\x3e",u=!0;else u&&(p+=h),p+="<![CDATA["+c[f][0][o.textNodeName]+"]]>",u=!1;else{var E=c[f];s(l,o)||(E=n(E=o.tagValueProcessor(f,E),o)),u&&(p+=h),p+=E,u=!1}}return p}function i(t){for(var e=Object.keys(t),i=0;i<e.length;i++){var r=e[i];if(":@"!==r)return r}}function r(t,e){var i="";if(t&&!e.ignoreAttributes)for(var r in t){var s=e.attributeValueProcessor(r,t[r]);!0===(s=n(s,e))&&e.suppressBooleanAttributes?i+=" "+r.substr(e.attributeNamePrefix.length):i+=" "+r.substr(e.attributeNamePrefix.length)+'="'+s+'"'}return i}function s(t,e){var i=(t=t.substr(0,t.length-e.textNodeName.length-1)).substr(t.lastIndexOf(".")+1);for(var r in e.stopNodes)if(e.stopNodes[r]===t||e.stopNodes[r]==="*."+i)return!0;return!1}function n(t,e){if(t&&t.length>0&&e.processEntities)for(var i=0;i<e.entities.length;i++){var r=e.entities[i];t=t.replace(r.regex,r.val)}return t}t.exports=function(t,i){var r="";return i.format&&i.indentBy.length>0&&(r="\n"),e(t,i,"",r)}}},e={},i=function i(r){var s=e[r];if(void 0!==s)return s.exports;var n=e[r]={exports:{}};return t[r](n,n.exports,i),n.exports}(784);XMLBuilder=i})();


var clear_exception_timer = null;
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
        start_save_session_interval();
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
        session.hide_edit_button = true;
    },
    enable_editing: function(){
        session.hide_edit_button = false;
    }
};

document.addEventListener('tracepaper:session:initialized', async () => {
    Session.reload_from_disk(localStorage.project);
});

var save_session_interval = null;
function start_save_session_interval(){
    setInterval(function(){
    if (localStorage.project){
        localStorage[localStorage.project] = JSON.stringify(session);
    }
    },1000);
}

if (localStorage.project){
    Session.reload_from_disk(localStorage.project);
}


window.Documentation = {
    subject_index: async function(subject){
        let meta = await fetch('/docs/' + subject + '/index.json');
        try{
            return JSON.parse(await meta.text());
        } catch {
            return [];
        }
    },
    get_html: async function(path){
        let content = await fetch(path);
        content = await content.text();
        return convertMarkdownToHtml(content);
    },
    open: async function(subject,key=""){
        Navigation.execute_open_tab("documentation/" + subject);
        await sleep(100);
        await Documentation.fetch_data(subject,key);
    },
    load: function(file){
        Documentation.fetch_data(file.split("/").at(-1));
    },
    fetch_data: async function(subject,key=""){
        session.type = "documentation";
        tab_state.files = await Documentation.subject_index(subject);
        try{
            tab_state.index = files.map(x => x.path.endsWith(key + ".md")).indexOf(true);
        }catch{
            tab_state.index = tab_state.index <= tab_state.files.length ? tab_state.index : 0;
        }
    }
}

var directed_diagram = false;

var colors = {
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

var shapes = {
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


var draw_diagram_block = false;
var draw_inactivity = null;
window.Diagram = {
    isPresent: function(){
        return session.tab == "README.md" ||
        session.tab.startsWith("commands/") ||
        (session.tab.startsWith("domain/") && !session.tab.includes("#")) ||
        session.tab.startsWith("views/") ||
        session.tab.startsWith("projections/") ||
        session.tab.startsWith("notifiers/") ||
        session.tab.startsWith("lib/");
    },
    draw: function(){
        if (draw_diagram_block){return}else{draw_diagram_block=true}
        Diagram.execute_draw();
        setTimeout(function(){draw_diagram_block = false;},100);
    },
    execute_draw: function(){
        try{
        DiagramData.reset();
        if(session.tab == "README.md"){
            Object.keys(model).filter(x => !x.includes("/behavior-flows/")).forEach(x => DiagramData.add_element(x));
        } else if (session.tab.startsWith("domain/") && session.tab.endsWith("/README.md")){
            Object.keys(model)
                .filter(x => x.startsWith(session.tab.replace("README.md","")) && x.endsWith("root.xml"))
                .forEach(x => {
                    try{
                        DiagramData.add_aggregate(x,false);
                    }catch(err){
                        console.error(err);
                    }
                });
            DiagramData.add_view_edges();
        } else {
            DiagramData.add_element(session.tab,true);
        }
        draw_diagram();
        }catch{}
    }
}

var DiagramData = {
    nodes: {},
    edges: {},
    links: [],
    reset: function(){
        DiagramData.nodes = {};
        DiagramData.edges = {};
        DiagramData.links = [];
    },
    add_element: function(path,detailed=false){
        try{
            if (path.startsWith("commands/")){
                DiagramData.add_command(path,true);
            } else if (path.startsWith("domain/") && path.endsWith("/root.xml")){
                DiagramData.add_aggregate(path,detailed)
            } else if (path.startsWith("domain/") && path.includes("/behavior-flows/")){
                DiagramData.add_behavior(path);
            } else if (path.startsWith("views/")){
                DiagramData.add_view(path);
            } else if (path.startsWith("projections/")){
                DiagramData.add_projection(path);
            } else if (path.startsWith("notifiers/")){
                DiagramData.add_notifier(path);
            } else if (path.startsWith("lib/")){
                DiagramData.add_module(path);
            }
        }catch(err){
            console.trace(err);
        }
    },
    add_command: function(path,standalone=false){
        DiagramData.links.push(path)
        let command = Commands.get(path);
        let name = command.att_name.replace("Requested","");
        DiagramData.add_node(name,"command");
        var patterns = command.field.map(x => x.att_pattern);
        for (var i = 0; i < command[NESTED].length; i++){
            patterns = patterns.concat(command[NESTED][i].field.map(x => x.att_pattern));
        }
        patterns.forEach(x => {
            if (!x){
                return;
            }
            var pattern = x.replace("{{","").replace("}}"," (pattern)");
            DiagramData.add_node(pattern,"dependency");
            DiagramData.add_edge(name,pattern,"",true);
            DiagramData.links.push("patterns/" + pattern.replace(" (pattern)","") + ".xml");
        });
        if (standalone){
            DiagramData.add_event_subscribers(name,command.att_name);
        }
    },
    add_aggregate: function(path,detailed=false){
        let aggregate = Aggregates.get(path);
        if (detailed){
            aggregate.flows.forEach(flow => {
                DiagramData.add_node(flow.att_name,"behavior");
                DiagramData.add_behavior_trigger(flow.att_name,flow);
                DiagramData.add_behavior_dependency(flow.att_name,flow);
                DiagramData.add_behavior_subscribers(flow.att_name,flow);
                DiagramData.add_behavior_view_listners(flow.att_name,aggregate.subdomain,aggregate.root.att_name);
            });
        }else{
            DiagramData.links.push(path)
            let reference = aggregate.subdomain + "." + aggregate.root.att_name;
            DiagramData.add_node(reference,"aggregate");
            aggregate.flows.forEach(flow => {
                DiagramData.add_behavior_trigger(reference,flow);
                DiagramData.add_behavior_dependency(reference,flow);
                DiagramData.add_behavior_subscribers(reference,flow);
                DiagramData.add_behavior_view_listners(reference,aggregate.subdomain,aggregate.root.att_name);
            });
        }
        DiagramData.add_view_edges();
    },

    add_behavior: function(path){
        let flow = Behavior.get(path);
        DiagramData.add_node(flow.att_name,"behavior");
        DiagramData.add_behavior_trigger(flow.att_name,flow);
        DiagramData.add_behavior_dependency(flow.att_name,flow);
        DiagramData.add_behavior_subscribers(flow.att_name,flow);
        DiagramData.add_behavior_view_listners(flow.att_name,path.split("/").at(1),path.split("/").at(2));
        DiagramData.add_view_edges();
    },
    add_behavior_trigger: function(reference,flow){
        let events = Events.list();
        flow.trigger.forEach(trigger => {
            if (trigger.att_source.endsWith("Requested") || trigger.att_source == "FileUploaded"){
                let source = trigger.att_source.replace("Requested","");
                source = source.replace("FileUploaded","UploadAPI")
                DiagramData.add_node(source,"command");
                DiagramData.add_edge(source,reference,trigger.att_source);
                DiagramData.links.push("commands/" + trigger.att_source + ".xml");
            } else {
                let event = events.filter(x => x.att_name == trigger.att_source).at(0);
                if (!(event.att_source in DiagramData.nodes)){
                    DiagramData.add_node(event.att_source,"aggregate",0.5);
                }
                DiagramData.add_edge(event.att_source,reference,trigger.att_source);
                DiagramData.links.push("domain/" + event.att_source.replace(".","/") + "/root.xml");
            }
        });
    },
    add_behavior_dependency: function(reference,flow){
        flow.processor.filter(x => x.att_type == "code").forEach(x => {
            var module = x.att_file.replace("lib/","").replace(".py"," (Python)");
            DiagramData.add_node(module,"dependency");
            DiagramData.add_edge(reference,module,"",true);
            DiagramData.links.push(x.att_file);
        })
    },
    add_behavior_subscribers: function(reference,flow){
        flow.processor.filter(x => x.att_type == "emit-event").forEach(event => {
                  var eventName = event.att_ref;
                  DiagramData.add_event_subscribers(reference,eventName);
              });
    },
    add_behavior_view_listners: function(reference,subdomain,aggregate){
        Views.list().forEach(view => {
            function add_view(view,handler){
                 if (handler["att_sub-domain"] == subdomain && handler.att_aggregate == aggregate){
                    DiagramData.links.push(`views/${view.att_name}.xml`);
                    DiagramData.add_node(view.att_name,"view");
                    DiagramData.add_edge(reference,view.att_name,"",true);
                }
            }
            view[CUSTOM_HANDLER].forEach(handler => {
               add_view(view,handler);
            });
            view[SNAPSHOT_HANDLER].forEach(handler => {
               add_view(view,handler);
            });
        });
    },
    add_event_subscribers: function(reference,eventName){
        Aggregates.list().forEach(aggregate => {
            aggregate.flows.forEach(flow => {
                flow.trigger.forEach(trigger => {
                   if (trigger.att_source == eventName){
                       let aggregateId = aggregate.subdomain + "." + aggregate.root.att_name;
                       if (!(aggregateId in DiagramData.nodes)){
                           DiagramData.add_node(aggregateId,"aggregate",0.5);
                       }
                       DiagramData.add_edge(reference,aggregateId,eventName);
                       DiagramData.links.push("domain/" + aggregate.subdomain + "/" + aggregate.root.att_name + "/root.xml");
                   }
                });
            });
        });
        Notifiers.list().forEach(notifier => {
            notifier.trigger.forEach(trigger => {
                if (trigger.att_source == eventName){
                    DiagramData.add_node(notifier.att_name,"notifier");
                    DiagramData.add_edge(reference,notifier.att_name,eventName);
                    DiagramData.links.push("notifiers/" + notifier.att_name + ".xml")
                }
            });
        });
    },
    add_view_edges: function(){
        Views.list().forEach(view => {
            view.field.filter(x => !view_field_types.includes(x.att_type)).forEach(ref => {
                DiagramData.add_edge(view.att_name,ref.att_ref,ref.att_type,[5,7]);
            });
        });
    },
    add_view: function(path){
        let view = Views.get(path);
        DiagramData.add_node(view.att_name,"view");
        DiagramData.links.push(path);
        view.field.filter(x => !view_field_types.includes(x.att_type)).forEach(ref => {
            DiagramData.add_node(ref.att_ref,"view");
            DiagramData.add_edge(view.att_name,ref.att_ref,ref.att_type,[5,7]);
            DiagramData.links.push("views/" + ref.att_ref + ".xml");
        });
        Views.list().forEach(ref => {
            ref.field.filter(x => x.att_ref == view.att_name).forEach(field => {
                DiagramData.add_node(ref.att_name,"view");
                DiagramData.add_edge(ref.att_name, view.att_name,field.att_type,[5,7]);
                DiagramData.links.push("views/" + ref.att_name + ".xml");
            });
        });
        view[SNAPSHOT_HANDLER].forEach(handler => {
            let aggregate = handler["att_sub-domain"] + "." + handler.att_aggregate;
            DiagramData.add_node(aggregate,"aggregate");
            DiagramData.add_edge(aggregate,view.att_name);
            DiagramData.links.push("domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml");
        });
        view[CUSTOM_HANDLER].forEach(handler => {
            let aggregate = handler["att_sub-domain"] + "." + handler.att_aggregate;
            DiagramData.add_node(aggregate,"aggregate");
            DiagramData.add_edge(aggregate,view.att_name);
            DiagramData.links.push("domain/" + handler["att_sub-domain"] + "/" + handler.att_aggregate + "/root.xml");
        });
        view[CUSTOM_HANDLER].filter(x => "att_python-file" in x).forEach(x =>{
            var module = x["att_python-file"].replace("lib/","").replace(".py"," (Python)");
            DiagramData.add_node(module,"dependency");
            DiagramData.add_edge(view.att_name,module,"",true);
            DiagramData.links.push(x["att_python-file"]);
        });
        view.query.forEach(query => {
            let id = `${query["att_graphql-namespace"]}.${query["att_field-name"]}`;
            DiagramData.add_node(id,"query");
            DiagramData.add_edge(id,view.att_name,"",true);
        });
    },
    add_projection: function(path){
        let projection = Projections.get(path);
        DiagramData.add_node(projection.att_name,"projection");
        DiagramData.links.push(path);
        if (projection.att_return){
            DiagramData.add_node(projection.att_return,"view");
            DiagramData.add_edge(projection.att_name,projection.att_return,"return object",[5,7]);
            DiagramData.links.push("views/" + projection.att_return + ".xml");
        }
        let s = projection.att_code;
        let re = /Query\(\'([A-Z]{1}[a-z]+)+\'\)/g;
        let m;
        do {
            m = re.exec(s);
            if (m) {
                DiagramData.add_node(m[1],"view");
                DiagramData.add_edge(m[1],projection.att_name,"source",[5,7]);
                DiagramData.links.push("views/" + m[1] + ".xml");
            }
        } while (m);
    },
    add_notifier: function(path){
        let notifier = Notifiers.get(path);
        DiagramData.add_node(notifier.att_name,"notifier");
        DiagramData.add_notifier_trigger(notifier.att_name,notifier);
        DiagramData.links.push(path);
        function connect_to_code(x){
            try {
            var module = x["att_python-file"].replace("lib/","").replace(".py"," (Python)");
            DiagramData.add_node(module,"dependency");
            DiagramData.add_edge(notifier.att_name,module,"",true);
            DiagramData.links.push(x["att_python-file"]);}catch(err){console.error(err,x)}
        }
        notifier.activity.filter(x => x.att_type == "code").forEach(connect_to_code);
        notifier.activity.filter(x => x.att_type == "loop").forEach(x => {
          x.activity.filter(x => x.att_type == "code").forEach(connect_to_code);
        });

        function connect_to_api(x){
            try{
            let attributes = x.att_query.split("|LB|").map(x => x.replaceAll("{","").replaceAll("}","").trim());
            let type = attributes[0].startsWith("mutation") ? "command" : "query";
            attributes.shift();
            let name = "";
            if (type == "command"){
                let tmp = attributes.join(".").split("(").at(0).split(".");
                let method = tmp.pop();
                method = method.charAt(0).toUpperCase() + method.slice(1);
                tmp.unshift(method);
                name = tmp.join("");
            }else{
              name = attributes.join(".").split("(").at(0);
            }
            console.log(type,name);
            DiagramData.add_node(name,type);
            DiagramData.add_edge(notifier.att_name,name,"",true);
            }catch(err){console.error(err,x)}
        }
        notifier.activity.filter(x => x.att_type == "call-internal-api").forEach(connect_to_api);
        notifier.activity.filter(x => x.att_type == "loop").forEach(x => {
          x.activity.filter(x => x.att_type == "call-internal-api").forEach(connect_to_api);
        });
    },
    add_notifier_trigger: function(reference,flow){
        flow.trigger.forEach(trigger => {
            if (trigger.att_source.startsWith("@")){
                DiagramData.add_node(trigger.att_source,"schedule");
                DiagramData.add_edge(trigger.att_source,reference);
            } else {
                let event = Events.list().filter(x => x.att_name == trigger.att_source).at(0);
                if (event.att_type == "DomainEvent"){
                    DiagramData.add_node(event.att_source,"aggregate");
                    DiagramData.add_edge(event.att_source,reference,trigger.att_source);
                    DiagramData.links.push("domain/" + event.att_source.replace(".","/") + "/root.xml");
                } else if (event.att_type == "ActorEvent"){
                    let command = event.att_name.replace("Requested","");
                    DiagramData.add_node(command,"command");
                    DiagramData.add_edge(command,reference,event.att_name);
                    DiagramData.links.push("commands/" + event.att_name + ".xml");
                }
            }
        });
    },

    add_module: function(path){
        let name = path.replace("lib/","").replace(".py","");
        DiagramData.add_node(name,"dependency");
        DiagramData.links.push(path);

        Aggregates.list().forEach(aggregate => {
            aggregate.flows.forEach(flow => {
                flow.processor.forEach(processor => {
                    if (processor.att_type == "code" && processor.att_file == path){
                        DiagramData.links.push(`domain/${aggregate.subdomain}/${aggregate.root.att_name}/root.xml`);
                        let reference = aggregate.subdomain + "." + aggregate.root.att_name;
                        DiagramData.add_node(reference,"aggregate");
                        DiagramData.add_edge(reference,name,"",true);
                    }
                });
            });
        });

        Notifiers.list().forEach(notifier => {
            notifier.activity.forEach(activity => {
                if (activity.att_type == "code" && activity["att_python-file"] == path){
                    DiagramData.links.push(`notifiers/${notifier.att_name}.xml`);
                    DiagramData.add_node(notifier.att_name,"notifier");
                    DiagramData.add_edge(notifier.att_name,name,"",true);
                }
            });
        });

        Views.list().forEach(view => {
            view[CUSTOM_HANDLER].forEach(handler => {
                if (handler["att_python-file"] == path){
                    DiagramData.links.push(`views/${view.att_name}.xml`);
                    DiagramData.add_node(view.att_name,"view");
                    DiagramData.add_edge(view.att_name,name,"",true);
                }
            });
        });
    },

    add_node: function(name,type,alpha=1){
        let size =  ["aggregate","projection"].includes(type) ? 15 : 10;
        DiagramData.nodes[name] = {
           "id": name,
           "label": name,
           "size": size,
           "shape": shapes[type],
           "color": DiagramData.hexToRgb(colors[type],alpha)
       }
    },
    add_edge: function(from,to,label="",dashes=false){
        var key = from + to;
        DiagramData.edges[key] = {
            "from": from,
            "to": to,
            "label": label,
            "dashes" : dashes,
            "font": {
                "size" : 10
            }
        };
        if (dashes == true){
            DiagramData.edges[key]["color"] = {"inherit":"to"};
        } else {
            DiagramData.edges[key]["arrows"] = "to";
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
    }
}

var diagram_history = "";
window.draw_diagram = function(force=false){
    var data = {
      nodes: new vis.DataSet(Object.values(DiagramData.nodes).filter(x => x.id != '')),
      edges: new vis.DataSet(Object.values(DiagramData.edges))
    };
    let fingerprint = btoa(JSON.stringify(Object.keys(DiagramData.nodes).concat(Object.keys(DiagramData.edges)),true));
    if (!force && fingerprint == diagram_history){
        return;
    } else {
        diagram_history = fingerprint;
    }
    var container = document.getElementById("project-diagram");
    var options = {
        width: "100%",
        height: "300px",
        layout: {
            hierarchical : {
                enabled: directed_diagram,
                direction: "LR",
                parentCentralization: true,
                sortMethod: "directed"
            }
        }
    };
    new vis.Network(container, data, options);
    session.diagram_links = deduplicate(DiagramData.links);
}

window.draw_modal = function(){
    var modal = document.getElementById("project-diagram-modal");
    var data = {
          nodes: new vis.DataSet(Object.values(DiagramData.nodes).filter(x => x.id != '')),
          edges: new vis.DataSet(Object.values(DiagramData.edges))
        };
    var options = {
        width: "100%",
        height: `${window.innerHeight *0.8}px`,
        layout: {
            hierarchical : {
                enabled: false,
                blockShifting: true,
                edgeMinimization: true,
                parentCentralization: true
            }
        }
    };
    var network = new vis.Network(modal, data, options);
    setTimeout(function(){
        network.fit();
    },500)
    session.diagram_links = deduplicate(DiagramData.links);
}



var navigation_block = false;
setInterval(function(){
    navigation_block = false;
    if (Object.keys(tab_state).length > 1){
        localStorage[session.tab] = JSON.stringify(tab_state);
    }
},1000);

window.addEventListener(
  "hashchange",
  async () => {
    await sleep(100);
    if (window.location.hash.startsWith("#tab:")){
        let path = window.location.hash.replace("#tab:","");
        if(session.tab != path){
            Navigation.execute_open_tab(path);
        }
    }
  },
  false,
);

window.Navigation = {
    filter_tabs: function(search){
        return Object.keys(model)
            .filter(x => x.toLowerCase().includes(search.toLowerCase()))
            .filter(x => {
                if (x.startsWith("commands/")){
                    return true;
                } else if (x.startsWith("notifiers/")){
                   return true;
               }else if (x.startsWith("views/")){
                   return true;
               }else if (x.startsWith("projections/")){
                                   return true;
               }else if (x.startsWith("scenarios/")){
                   return true;
               }else if (x.startsWith("domain/") && x.endsWith("root.xml")){
                   return true;
               }else if (x.startsWith("domain/") && x.includes("/behavior-flows/")){
                   return true;
               }else{
                    return false;
               }
            });
    },
    toggle: function(section){
        if(navigation_block){return}else{navigation_block=true}
        if (session.navigation[section]){
            session.navigation[section] = false;
        } else {
            session.navigation[section] = true;
        }
    },
    toggle_document: function(){
        if(navigation_block){return}else{navigation_block=true}
        tab_state.document_mode = tab_state.document_mode == 'table' ? 'json' : 'table';
    },
    open_tab: function(event){
        let file = get_attribute(event,"file");
        Navigation.execute_open_tab(file);
    },
    execute_open_tab: function(file){
        Navigation.load_tab(file);
        if (!session.tabs.includes(file)){
            session.tabs.push(file);
        }
        session.tab_history = session.tab_history.filter(x => x != file);
        session.tab_history.unshift(file);
        setTimeout(function(){
            window.location.hash = "tab:" + file;
        },100);
    },
    close_tab: function(event){
        let file = get_attribute(event,"file");
        Navigation.execute_close_tab(file);
    },
    close_tabs_left: function(tab){
        let tabs = [];
        let detected = false;
        session.tabs.forEach(x=>{
            if (detected || x == tab){
                tabs.push(x);
                detected = true;
            }
        });
        session.tabs = tabs;
    },
    close_other: function(tab){
        session.tabs = session.tabs.filter(x => x == tab);
    },
    close_tabs_right: function(tab){
        let tabs = [];
        let detected = true;
        session.tabs.forEach(x=>{
            if (detected){
                tabs.push(x);
            }
            if (x == tab){
                detected = false;
            }
        });
        session.tabs = tabs;
    },
    execute_close_tab: function(file){
        let index = session.tabs.indexOf(file);
        session.tabs = session.tabs.filter(x => x != file);
        if (session.tabs.at(index)){
            Navigation.execute_open_tab(session.tabs.at(index));
        }
        else if (session.tabs.length == 0){
            Navigation.execute_open_tab("README.md");
        }
        else {
            Navigation.execute_open_tab(session.tabs.at(-1));
        }
    },
    get_tabname: function(file){
        if (file == "README.md"){
                return "About";
        } else if (file.startsWith("commands/")){
            return file.replace("commands/","").replace("Requested.xml","");
        } else if (file.startsWith("domain/") && file.endsWith("README.md")){
            return file.split("/").at(1);
        } else if (file.startsWith("domain/") && file.endsWith("root.xml")){
            return file.split("/").at(2);
        } else if (file.startsWith("domain/") && file.includes("/behavior-flows/") && !file.includes("#")){
            let path = file.replace(".xml","").split("/");
            return path.at(-3) + ": " + path.at(-1);
        } else if (file.startsWith("domain/") && file.includes("/behavior-flows/") && file.includes("#")){
            let path = file.replace(".xml","").split("/");
            return path.at(-3) + ": " + path.at(-1).replace("#",": ");
        } else if (file.startsWith("documentation")){
            return "Docs: " + file.split("/").at(-1);
        } else if (file.startsWith("views/")){
            return file.replace("views/","").replace(".xml","");
        } else if (file.startsWith("projections/")){
            return file.replace("projections/","").replace(".xml","");
        } else if (file.startsWith("notifiers/")){
            return file.replace("notifiers/","").replace(".xml","");
        } else if (file.startsWith("lib/")){
            return file.replace("lib/","").replace(".py","");
        } else if (file.startsWith("scenarios/")){
            return file.replace("scenarios/","").replace(".xml","");
        } else if (file.startsWith("build/")){
            return "Build";
        } else if (file.startsWith("api/")){
            return "API overview";
        } else if (file == "patterns/"){
            return "Patterns";
        } else if (file == "expressions/"){
            return "Expressions";
        } else if (file == "roles/"){
            return "Roles";
        } else if (file == "dependencies/"){
            return "Dependencies";
        } else if (file == "deployments/"){
            return "Deployments";
        } else {
            return file.split("/").at(-1);
        }
    },
    load_data_in_tab: function(file){
        if (file == "README.md"){
            Modeler.open_readme();
        } else if (file.startsWith("commands/")){
            Commands.load(file);
        } else if (file.startsWith("domain/") && file.endsWith("README.md")){
            Subdomains.load(file);
        } else if (file.startsWith("domain/") && file.endsWith("root.xml")){
            Aggregates.load(file);
        } else if (file.startsWith("domain/") && file.includes("/behavior-flows/") && !file.includes("#")){
            Behavior.load(file);
        }else if (file.startsWith("domain/") && file.includes("/behavior-flows/") && file.includes("#")){
            Behavior.load_testcase(file);
        } else if (file.startsWith("views/")){
            Views.load(file);
        } else if (file.startsWith("projections/")){
            Projections.load(file);
        } else if (file.startsWith("notifiers/")){
            Notifiers.load(file);
        } else if (file.startsWith("lib/")){
            Code.load(file);
        } else if (file.startsWith("scenarios/")){
            Scenarios.load(file);
        } else if (file.startsWith("build/")){
            Builds.load();
        } else if (file.startsWith("api/")){
            Modeler.load_api_overview();
        } else if (file == "patterns/"){
            Patterns.load();
        } else if (file == "expressions/"){
            Expressions.load();
        } else if (file == "roles/"){
            session.type = "roles";
        } else if (file == "dependencies/"){
            session.type = "dependencies";
        } else if (file == "deployments/"){
            session.type = "deployments";
        } else if (file.startsWith("documentation")){
            Documentation.load(file);
        }
        if (!("document_selected_entity" in tab_state)){
            tab_state.document_selected_entity = "root";
        }
        if (!("document_mode" in tab_state)){
            //tab_state.document_mode = "table";
        }
        tab_state.document_mode = 'table';
        console.trace("tab state:",tab_state);
        document.dispatchEvent(new CustomEvent('navigated'));
    },
    load_tab: function(file){
            session.type = "";
            let data = {};
            if (localStorage[file]){
                data = JSON.parse(localStorage[file]);
            }

            session.tab = file;
            Object.keys(tab_state).forEach(key => {delete tab_state[key]});
            Object.keys(data).forEach(key => {tab_state[key] = data[key]});
            Navigation.load_data_in_tab(file);
            if(file.startsWith('build/')){
                return;
            }
            setTimeout(function(){
                document.dispatchEvent(new CustomEvent('soft-reload'));
                document.getElementById("main-canvas").scrollTo(0,data.scrollposition);
            },100);
            setTimeout(function(){
                document.dispatchEvent(new CustomEvent('soft-reload'));
                document.getElementById("main-canvas").scrollTo(0,data.scrollposition);
            },500);
        },
    fresh_reload: function(file){
            session.tab = file;
            session.type = "";
            Object.keys(tab_state).forEach(key => {delete tab_state[key]});
            Navigation.load_data_in_tab(file);
        },
    reload_tab: function(){
        localStorage[session.tab] = JSON.stringify(tab_state);
        Navigation.load_tab(session.tab);
        Navigation.soft_reload_tab();
    },
    soft_reload_tab: function(){
        setTimeout(function(){
            document.dispatchEvent(new CustomEvent('soft-reload'));
            document.dispatchEvent(new CustomEvent('navigated'));
        },1000);
    },
    hard_reload_tab: function(){
        localStorage[session.tab] = JSON.stringify(tab_state);
        setTimeout(function(){
            Object.keys(tab_state).forEach(key => {delete tab_state[key]});
            setTimeout(function(){
                Navigation.load_tab(session.tab);
            },1);
        },1);
    }
};

document.addEventListener('tracepaper:model:loaded', async () => {
    try{
        if (window.location.hash.startsWith("#tab:")){
            try{
                Navigation.execute_open_tab(window.location.hash.replace("#tab:",""));
            }catch{}
        }
        if (session.tab){
            Navigation.load_tab(session.tab);
        } else {
            Navigation.execute_open_tab("README.md");
        }
    }catch{}
    let files = await FileSystem.listFiles();
    files = files.concat(Object.keys(model));
    files = files.concat(Object.keys(documentation));
    session.tabs.map(x=> x.split("#").at(0)).filter(x=> !files.includes(x) && !x.startsWith("documentation/") && !x.startsWith("build/") && !x.startsWith("api/") && !["patterns/","expressions/","roles/","deployments/","dependencies/"].includes(x)).forEach(tab=> {
        try{
            console.log("auto close tab:",tab);
            Navigation.execute_close_tab(tab);
        }catch{}
    });
    session.tab_history = session.tab_history.filter(tab => files.includes(tab));
});

window.Validation = {
    must_be_camel_cased: function(path,element,fieldName,key){
        make_sure_is_list(element).forEach(x => {
            if (key){
                x = x[key];
            }
            if (!x.match(camel_cased)){
                Validation.register(path,`${fieldName} ${x} must be camelCased`);
            }
        });
    },
    register: function(file,issue){
        if (!(file in report)){
            report[file] = [];
        }
        report[file].push(issue);
    },
    has_issues: function(){
        session.trigger_build_after_commit = Object.values(report).filter(x => x.length != 0).length == 0;
        return Object.values(report).filter(x => x.length != 0).length != 0;
    }
};

window.Context = {
    reload: async function(){
        await sleep(1000);
        await Draftsman.force_reload_data();
        await sleep(10);
        load_context();
    },
    open_workspace: function(event){
        let workspace = get_attribute(event,"name");
        localStorage.workspace = workspace;
        context.selected_workspace = context.workspace.filter(x => x.name == localStorage.workspace).at(0);
    },
    open_project: function(event){
        Session.reload_from_disk(get_attribute(event,"drn"));
        load_context();
    },
    close_workspace: function(){
        delete context.selected_workspace;
        localStorage.removeItem("workspace");
    },
    close_project: function(){
        delete context.selected_project;
        localStorage.removeItem("project");
        Session.reload_from_disk("");
        checked_out_repository = "";
    }
}

document.addEventListener('draftsman:initialized', async () => {
    load_context();
    if (!context.repository){
        session.initialized = true;
    }
});

function load_context(){
    if (Alpine.store("context").get != null){
        Object.assign(context,Alpine.store("context").get);
    }
    if (localStorage.workspace && context.workspace){
        context.selected_workspace = context.workspace.filter(x => x.name == localStorage.workspace).at(0);
    }
    if (localStorage.project && context.selected_workspace){
        context.selected_project = context.selected_workspace.projects.filter(x => x.drn == localStorage.project).at(0);
    }
    if (context.selected_project){
        reset_proxy_token();
        context.repository = context.selected_project.repositories.filter(x => x.name == "model").at(0).url;
        context.code_repo = context.selected_project.repositories.filter(x => x.name == "code").at(0).url;
    }
    document.dispatchEvent(new CustomEvent('tracepaper:context:changed'));
}

function deduplicate(elements){
    let array = [];
    let check = [];
    elements.forEach(x =>{
        let hash = btoa(JSON.stringify(x,true));
        if (!(check.includes(hash))){
            array.push(x);
            check.push(hash);
        }
    });
    return array;
}

function get_attribute(event,name){
    let value = event.srcElement.getAttribute(name);
    if (!value){
        value = event.srcElement.parentElement.getAttribute(name);
    }
    return value;
}

window.check_pattern = function(value,pattern){
   if (!pattern || value.match(pattern)){
       return true;
   } else {
       return false;
   }
}

window.capitalizeFirstLetter = function(string) {
   return string.charAt(0).toUpperCase() + string.slice(1);
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

var block = false;
window.blockingDecorator = function(wrapped) {
  return function() {
    if(block){return}else{block=true}
    let result = null;
    try{
        result = wrapped.apply(this, arguments);
        Navigation.reload_tab();
    }catch(err){console.error(err)}
    setTimeout(function(){
        block = false;
    },1000);
    return result;
  }
}

window.loadData = function(element){
    setTimeout(function(){
        element.dispatchEvent(new CustomEvent("load"));
    },1);
}

window.convertMarkdownToHtml = function(markdown){
    try{
        var converter = new showdown.Converter();
        var html = converter.makeHtml(markdown);
        html = html.replaceAll('<img','<img style="width:100%;"');
        return html;
    } catch(ex) {
        console.error(ex);
        return markdown;
    }
}

window.arraymove = function(arr, fromIndex, toIndex) {
   var element = arr[fromIndex];
   arr.splice(fromIndex, 1);
   arr.splice(toIndex, 0, element);
}

window.sleep = function(ms) {
    console.trace(`Sleep ${ms} milliseconds`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

window.get_lorem_picsum = function(el){
    return `https://picsum.photos/seed/${el.id}/250`
}


var i18n_data = await fetch('/assets/language.properties');
i18n_data = await i18n_data.text();

i18n_data.split("\n").filter(x => x != "").forEach(x => {
    var element = x.split("=");
    label[element[0]] = element[1];
});

window.Expressions = {
    list: function(){
        return Object.entries(model).filter(x => x[0].startsWith('expressions/')).map(x => x[1]["expression"]);
    },
    load: function(){
        tab_state.expressions = Expressions.list();
        Object.keys(model).filter(key => key.startsWith('expressions/')).forEach(key => {
            let doc = key.replace(".xml",".md");
            if (!(doc in documentation)){
                documentation[doc] = {content:""};
            }
        });
        session.type = "expressions";
    },
    remove: blockingDecorator(function(name){
            let path = "expressions/" + name;
            delete model[path + ".xml"];
            delete documentation[path + ".md"];
            Expressions.load();
        }),
    rename: blockingDecorator(function(old_name,new_name){
        if (!new_name.match(camel_cased)){
            Session.show_exception("Expression reference must be camelCased");
            return;
        }

        let oldPath = "expressions/" + old_name;
        let newPath = "expressions/" + new_name;

        model[newPath + ".xml"] = model[oldPath + ".xml"];
        model[newPath + ".xml"].expression.att_name = new_name;
        delete model[oldPath + ".xml"];
        documentation[newPath + ".md"] = documentation[oldPath + ".md"];
        delete documentation[oldPath + ".md"];
        Expressions.load();
    }),
    create: blockingDecorator(function(name){
        if (!name.match(camel_cased)){
            Session.show_exception("Expression reference must be camelCased");
            return;
        }
        let path = "expressions/" + name + ".xml";
        if (path in model){
            Session.show_exception("There is already a expression defined with name: "+name);
            return;
        }
        Modeler.insert_model(path,{
            expression: {
                att_name: name,
                att_type: "ActorEventRole",
                att_input: "input",
                att_expression: ""
            }
        });
        Expressions.load();
    })
}

window.Behavior = {
    get: function(path){
        let flow = model[path]["command"];
        Behavior.repair(flow);
        return flow;
    },
    repair: function(flow){
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
        });
    },
    create_new: blockingDecorator(function(aggregate){
            let name = "NewFlow";
            let path = "domain/" + aggregate.subdomain + "/" + aggregate.root.att_name + "/behavior-flows/" + name + ".xml";
            let doc = "domain/" + aggregate.subdomain + "/" + aggregate.root.att_name + "/behavior-flows/" + name + ".md";
            let added = Modeler.insert_model(path,{
                "command": {
                    "att_name": name
                }
            });
            Modeler.insert_documentation(doc,"~~Behavior flow model template~~");
            if (added){
                setTimeout(function(){
                    Navigation.execute_open_tab(path);
                },500);
            }
        }),
    load: function(file){
        session.type = "behavior";
        tab_state.flow = Behavior.get(file);
        tab_state.triggers = tab_state.flow.trigger;
        tab_state.aggregate = Aggregates.get(file.split("behavior-flows/").at(0) + "root.xml");
        if(!tab_state.view){tab_state.view = "trigger"};
        Modeler.load_documentation(file.replace(".xml",".md"));
    },
    load_testcase: function(file){
        let path = file.split("#");
        Behavior.load(path.at(0));
        session.type = "testcase";
        tab_state.testcase = tab_state.flow[TEST].filter(x => x.att_name == path.at(1)).at(0);

        //Reconvert trigger to inputs
        let event = Events.get(tab_state.testcase['att_trigger-event']);
        tab_state.testcase.input = TestCase.convert_event_to_inputs(tab_state.testcase,event);
    },
    rename: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Behavior flow must be PascalCased");
            return;
        }
        let oldPath = "domain/" + tab_state.aggregate.subdomain + "/" + tab_state.aggregate.root.att_name + "/behavior-flows/" + tab_state.flow.att_name;
        let newPath = "domain/" + tab_state.aggregate.subdomain + "/" + tab_state.aggregate.root.att_name + "/behavior-flows/" + name;
        tab_state.flow.att_name = name;

        model[newPath + ".xml"] = model[oldPath + ".xml"];
        delete model[oldPath + ".xml"];
        documentation[newPath + ".md"] = documentation[oldPath + ".md"];
        delete documentation[oldPath + ".md"];

        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(newPath + ".xml");
        Modeler.render();
    }),
    remove: blockingDecorator(function(){
        let path = "domain/" + tab_state.aggregate.subdomain + "/" + tab_state.aggregate.root.att_name + "/behavior-flows/" + tab_state.flow.att_name;
        delete model[path + ".xml"];
        delete documentation[path + ".md"];
        Navigation.execute_close_tab(session.tab);
    }),
    update_trigger: blockingDecorator(function(source,update){
        try{
            let event = Events.get(update);
            console.log(event);
            let mappings = {};
            let trigger = tab_state.flow.trigger.filter(x => x.att_source == source).at(0);
            trigger.mapping.forEach(x => {
                mappings[x.att_value] = x;
            });
            trigger.mapping = event.field.map(x => {return {att_target: x.att_name, att_value: x.att_name};});
            Object.keys(mappings).filter(x => x.startsWith('#')).forEach(
                x => trigger.mapping.push(mappings[x])
            );
            trigger.att_source = update;
            Behavior.equalize_trigger_flowvars();
        }catch(err){console.error(err)}

    }),
    add_trigger: blockingDecorator(function(source){
        let event = Events.get(source);
        let trigger = {att_source: source};
        trigger.mapping = event.field.map(x => {return {att_target: x.att_name, att_value: x.att_name};});
        trigger.mapping = trigger.mapping.concat(event[NESTED].map(x => {return {att_target: x.att_name, att_value: x.att_name, att_nested: true};}));
        tab_state.flow.trigger.push(trigger);
        let keys = event.field.filter(x => x.att_name == tab_state.aggregate.root["att_business-key"]);
        trigger["att_key-field"] = keys.length != 0 ? keys.at(0).att_name : event.field.at(0).att_name;
        Behavior.equalize_trigger_flowvars();
    }),
    remove_trigger: blockingDecorator(function(source){
        tab_state.flow.trigger = tab_state.flow.trigger.filter(x => x.att_source != source);
        Behavior.equalize_trigger_flowvars();
    }),
    equalize_trigger_flowvars: function(){
        let flowVars = [];
        let arrays = [];
        tab_state.flow.trigger.forEach(trigger => {
            trigger.mapping.filter(mapping => mapping.att_value != "#''").forEach(mapping => {
               if (!flowVars.includes(mapping.att_target)){
                flowVars.push(mapping.att_target);
               }
               if ('att_nested' in mapping &&  mapping.att_nested){
                arrays.push(mapping.att_target);
               }
            });
        });
        tab_state.flow.trigger = tab_state.flow.trigger.map(trigger => {
            trigger.mapping = flowVars.map(flowVar => {
                let mapping = trigger.mapping.filter(x => x.att_target == flowVar);
                if (mapping.length != 0){
                    return mapping.at(0);
                } else if (arrays.includes(flowVar)) {
                    return {att_target: flowVar, att_value: "#[]"};
                } else {
                    return {att_target: flowVar, att_value: "#''"};
                }
            });
            return trigger;
        });
    },
    get_flow_variables: function(){
        if(!tab_state.flow){return []}
        let flowVars = [""];
        tab_state.flow.trigger.forEach(trigger => {
            trigger.mapping.forEach(mapping => {
               if (!flowVars.includes(mapping.att_target)){
                flowVars.push(mapping.att_target);
               }
            });
        });
        tab_state.flow.processor.forEach(processor => {
            if (processor.att_type == 'set-variable'){
                flowVars.push(processor.att_name);
            }
            if (processor.att_type == 'code'){
                if (processor.att_code){
                    let content = processor.att_code;
                    content.split("|LB|").filter(line => line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)).forEach(line => {
                        let variable = line.replace("flow.","").split("=").at(0).trim();
                        flowVars.push(variable);
                    });
                }else{
                    let content = code[processor.att_file].content;
                    let method_detected = false;
                    content.split("\n").forEach(line => {
                        if (line.startsWith(`def ${processor.att_handler}(flow):`)){
                            method_detected = true;
                        } else if (line.startsWith("def")){
                            method_detected = false;
                        }
                        if (method_detected && line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)){
                            let variable = line.replace("flow.","").split("=").at(0).trim();
                            flowVars.push(variable);
                        }
                    });
                }
            }
        });
        return flowVars;
    },
    change_emit_event: blockingDecorator(function(processor,eventName){
        let event = Events.get(eventName);
        processor.att_ref = eventName;
        let flowVars = Behavior.get_flow_variables();
        processor.mapping = event.field.map(x => {
            return {
                att_target: x.att_name,
                att_value: flowVars.includes(x.att_name) ? "#flow." + x.att_name : ''
            };
        });
        processor.mapping = processor.mapping.concat(event["nested-object"].map(x => {
            return {
               att_target: x.att_name,
               att_value: flowVars.includes(x.att_name) ? "#flow." + x.att_name : ''
           };
        }));
    }),
    add_processor: blockingDecorator(function(type){
        var new_processor = {att_type: type};
        new_processor.att_id = makeid(6);
        if (type == "emit-event"){
            new_processor.att_ref = "";
            new_processor.mapping = [];
        } else if (type == "code") {
            new_processor.att_file = "";
            new_processor.att_handler = "";
        } else if (type == "validator") {
            new_processor.att_condition = "1 == 1";
            new_processor.att_exception = "My log message {flow.requestor}";
        } else if (type == "set-variable") {
            new_processor.att_name = "";
            new_processor.att_expression = "flow.identity.lower()";
        }
        tab_state.flow.processor.push(new_processor);
    }),
    add_test_case: blockingDecorator(function(name){
        let eventName = tab_state.flow.trigger.at(0).att_source;
        let event = Events.get(eventName);
        tab_state.flow[TEST].push({
            "att_name": name,
            'att_trigger-event': eventName,
            "input": TestCase.convert_event_to_inputs({input:[]},event),
            "expected": []
        });
        Navigation.execute_open_tab(session.tab + "#" + name);
    })
}

window.TestCase = {
    rename: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Test case name must be PascalCased");
            return;
        }
        if (tab_state.flow[TEST].map(x => x.att_name).includes(name)){
            Session.show_exception(`There is already a test called "${name}" for this behavior flow`);
            return;
        }
        tab_state.testcase.att_name = name;
        let path = session.tab.split("#");
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(path.at(0) + "#" + name);
    }),
    change_trigger: blockingDecorator(function(eventName){
        console.log(eventName);
        let event = Events.get(eventName);
        tab_state.testcase['att_trigger-event'] = eventName;
        tab_state.testcase.input = TestCase.convert_event_to_inputs(tab_state.testcase,event);
    }),
    convert_event_to_inputs: function(testcase,event){
        let inputs = event.field.map(x => {return {att_name: x.att_name, att_value: TestCase.get_input_value(testcase,x.att_name), att_type: x.att_type};});
        inputs = inputs.concat(event["nested-object"].map(x => {return {att_name: x.att_name, "#text": TestCase.get_input_value(testcase,x.att_name,true,event), att_type:"NestedObject"};}))
        return inputs;
    },
    get_input_value: function(testcase,inputName,nested=false,event=null){
        let input = testcase.input.filter(x => x.att_name == inputName);
        if (input.length != 0 && !nested){
            return input.at(0).att_value;
        } else if(input.length != 0 && nested){
            return input.at(0)["#text"];
        } else if (nested){
            let template = [];
            let nested_object = {};
            event["nested-object"].filter(x => x.att_name == inputName).at(0).field.forEach(field => {
                let key = field.att_name;
                let value = TestCase.get_default_value(field.att_type);
                nested_object[key] = value;
            });
            template.push(nested_object);
            return JSON.stringify(template,null,2);
        } else {
            return "";
        }
    },
    get_aggregate_document: function(){
        let document = {};
        tab_state.aggregate.root.field.forEach(field => {
            document[field.att_name] = TestCase.get_default_value(field.att_type);
        });
        tab_state.aggregate.entities.forEach(obj =>{
            document[obj.att_name] = {};
            let nested_object = {};
            let key = "{{business-key}}"
            obj.field.forEach(field => {
                nested_object[field.att_name] = field.att_name == obj["att_business-key"] ? key : TestCase.get_default_value(field.att_type);
            });
            document[obj.att_name][key] = nested_object;
        });
        return JSON.stringify(document,null,2);
    },
    get_default_value: function(type){
            let value = "";
            if (["Int","Float"].includes(type)){
                value = 0
            } else if (type == "Boolean"){
                value = false;
            }
            return value
        },
    update_expected_event: function(expected_event,eventName){
        if (eventName !== "- reload event variables -"){
            expected_event["att_domain-event"] = eventName;
        }
        eventName = expected_event["att_domain-event"];
        let cached_values = {};
        expected_event.field.forEach(x => {
            cached_values[x.att_name] = x.att_value;
        });
        let template = tab_state.aggregate.events.filter(x => x.att_name == eventName).at(0);
        let checks = [];
        template.field.forEach(x => {
            let check = {};
            if (x.att_name in cached_values){
                check.att_value = cached_values[x.att_name];
            } else {
                check.att_value = TestCase.get_default_value(x.att_type);
            }
            check.att_name = x.att_name;
            check.att_type= x.att_type;
            checks.push(check);
        });
        expected_event.field = checks;
        TestCase.deduplicate_expected_events();
        return expected_event;
    },
    deduplicate_expected_events: function(){
        let keys = [];
        let events = [];
        tab_state.testcase.expected.forEach(x => {
            let key = x['att_domain-event'];
            if (!keys.includes(key)){
                keys.push(key);
                events.push(x);
            }
        });
        tab_state.testcase.expected = events;
    },
    insert_event_assertion: blockingDecorator(function(eventName){
        let check = tab_state.testcase.expected.filter(x => x['att_domain-event'] == eventName);
        if (check.length != 0){
            Session.show_exception(`Assertion for ${eventName} already registered`);
            return;
        }
        let expected_event = {"att_domain-event": eventName, "field": []};
        tab_state.testcase.expected.push(expected_event);
        TestCase.update_expected_event(expected_event, eventName);
    }),
    update_expected_state_key: blockingDecorator(function(key){
        if (!('expected-state' in tab_state.testcase)){
            tab_state.testcase['expected-state'] = {};
        }
        if (key == ""){
            delete tab_state.testcase['expected-state'].att_pk;
        } else {
            tab_state.testcase['expected-state'].att_pk = key;
        }
        if (Object.keys(tab_state.testcase['expected-state']).length === 0){
            delete tab_state.testcase['expected-state'];
        }
    }),
    update_state: function(json){
        if (json == "" || json.replaceAll("\n","").replaceAll(" ","") == "{}"){
            delete tab_state.testcase.state;
        } else {
            tab_state.testcase.state = json;
        }
    },
    update_expected_state: function(json){
            if (!('expected-state' in tab_state.testcase)){
                tab_state.testcase['expected-state'] = {};
            }
            if (json == "" || json.replaceAll("\n","").replaceAll(" ","") == "{}"){
                delete tab_state.testcase['expected-state']["#text"];
            } else {
                tab_state.testcase['expected-state']["#text"] = json;
                if (!tab_state.testcase['expected-state']["att_pk"]){
                    tab_state.testcase['expected-state']["att_pk"] = "functional-key";
                }
            }
            if (Object.keys(tab_state.testcase['expected-state']).length === 0){
                delete tab_state.testcase['expected-state'];
            }
        },
    remove: blockingDecorator(function(){
        tab_state.flow[TEST] = tab_state.flow[TEST].filter(x => x.att_name != tab_state.testcase.att_name);
        Navigation.execute_close_tab(session.tab);
    })
}

document.addEventListener('tracepaper:model:prepare-save', () => {
    Aggregates.list().forEach(aggregate => {
        aggregate.flows.forEach(flow => {
            flow[TEST].forEach(testcase => {
                if(!testcase.state){
                    return;
                }
                let state = testcase.state.replaceAll(" ","").replaceAll("\n","");
                if (state == "" || state == "{}"){
                    delete testcase.state;
                }
            });
        });
    });

    //Validation
    Aggregates.list().forEach(aggregate => {
        aggregate.flows.forEach(flow => {
            try{
                let path = aggregate.path.replace("root.xml","behavior-flows/") + flow.att_name + ".xml";
                if (flow.trigger.length == 0){
                    Validation.register(path,`No trigger configured`);
                }
                flow.trigger.forEach(trigger => {
                    let event = Events.get(trigger.att_source);
                    let fields = event.field.map(x => x.att_name);
                    fields = fields.concat(event[NESTED].map(x => x.att_name));
                    trigger.mapping.forEach(mapping => {
                        if (!mapping.att_value.startsWith("#") && !fields.includes(mapping.att_value)){
                            Validation.register(path,`Trigger ${trigger.att_source} maps a non existing command-field '${mapping.att_value}' to flow variable '${mapping.att_target}'`);
                        }
                     });
                     Validation.must_be_camel_cased(path,trigger.mapping,`Flow variable`,"att_target")
                     if (!trigger["att_key-field"].startsWith("#") && !fields.includes(trigger["att_key-field"])){
                         Validation.register(path,`Trigger ${trigger.att_source} uses a non existing command-field as business key`);
                         trigger["att_key-field"] = "";
                     }
                });
                if (flow.processor.length == 0){
                    Validation.register(path,`No processors configured`);
                }
                flow.processor.forEach(processor => {
                    if (processor.att_type == "emit-event"){
                        processor.mapping.filter(x => x.att_value == "#flow.").forEach(mapping => {
                            Validation.register(path,`Emit event [${processor.att_ref}] must map a flow variable to field [${mapping.att_target}]`);
                        });
                        try{
                            let event = Events.get(processor.att_ref);
                        }catch{
                            Validation.register(path,`Emit event references an undefined event [${processor.att_ref}]`);
                            return;
                        }
                        let fields = event.field.map(x => x.att_name);
                        fields = fields.concat(event[NESTED].map(x => x.att_name));
                        processor.mapping = processor.mapping.filter(x => fields.includes(x.att_target));
                        fields.filter(x => !processor.mapping.map(x => x.att_target).includes(x)).forEach(field => {
                            processor.mapping.push({
                                att_target: field,
                                att_value: "#flow."
                            });
                        });
                        if(event.att_source != aggregate.subdomain + "." + aggregate.root.att_name){
                            Validation.register(path,`Emit event references [${processor.att_ref}] which is mapped to an other aggregate [${event.att_source}]`);
                        }
                    } else if (processor.att_type == "code") {
                        if (!processor.att_file && !processor.att_handler && !processor.att_code){
                            Validation.register(path,"Python code processor must refrence a global module & method, or define inline code");
                        }
                    } else if (processor.att_type == "validator") {
                        if (!processor.att_condition || !processor.att_exception){
                            Validation.register(path,"Validation processor must must have a condition and an exception message configured, exception is triggered if the condition is false");
                        }
                    } else if (processor.att_type == "set-variable") {
                        if (!processor.att_name || !processor.att_expression || !processor.att_name.match(camel_cased)){
                            Validation.register(path,"A set variable processor must have a variable name and expression configured");
                        }
                    }
                });
                if (flow[TEST].length == 0){
                    Validation.register(path,`No test cases defined`);
                }
                flow[TEST].forEach(test => {
                    let test_path = path + "#" + test.att_name;
                    let event = Events.get(test["att_trigger-event"]);
                    test.input = TestCase.convert_event_to_inputs(test,event);
                    test.input.filter(x => !x.att_value && !x["#text"]).forEach(input => {
                        Validation.register(test_path,`Input [${input.att_name}] is not set`);
                    });
                    test.expected.forEach(expected_event => {
                        try{
                            let event = Events.get(expected_event["att_domain-event"]);
                            let fields = event.field.map(x => x.att_name);
                            expected_event.field.filter(field => !fields.includes(field.att_name)).forEach(field => {
                                Validation.register(test_path,`Event assertion [${event.att_name}] references an unknown field [${field.att_name}]`);
                            });
                            expected_event.field.filter(x => !x.att_value).forEach(x => {
                                Validation.register(test_path,`No expected value configured for field [${x.att_name}] in event [${event.att_name}]`);
                            });
                        }catch{}
                    });
                });
            }catch{}
        });
    });
});

window.Events = {
    list: function(){
        let events = Object.keys(model).filter(key => key.includes("/events/")).map(key => model[key]["event"]);
        events = events.concat(Commands.list());
        events = events.concat(make_sure_is_list(model["config.xml"]["draftsman"]["events"]).map(x => {
            let event = x["event"];
            event[NESTED] = make_sure_is_list(event[NESTED]);
            return event;
            }));
        return events;
    },
    get: function(name){
        return Events.list().filter(x => x.att_name == name).at(0);
    }
}

const summary_cache = {};

function  sort_commands( ca, cb ) {
  let a =  ca['att_graphql-namespace'] + '.' + ca['att_graphql-name'];
  let b =  cb['att_graphql-namespace'] + '.' + cb['att_graphql-name'];
  if ( a < b ){
    return -1;
  }
  if ( a > b ){
    return 1;
  }
  return 0;
}

function  sort_queries( ca, cb ) {
  let a =  ca['att_graphql-namespace'] + '.' + ca['att_field-name'];
  let b =  cb['att_graphql-namespace'] + '.' + cb['att_field-name'];
  if ( a < b ){
    return -1;
  }
  if ( a > b ){
    return 1;
  }
  return 0;
}

window.Modeler = {
    initialize: function(){
        session.projectName = model["config.xml"]["draftsman"]["att_project-name"];
    },
    get_dependencies: function(){
        try{
            return make_sure_is_list(model["config.xml"]["draftsman"]["global"]["dependency"]);
        }catch{return []}
    },
    save_dependencies: function(dependencies){
        let packages = {};
        dependencies.forEach(x => {
            packages[x.att_name] = x.att_version;
        });
        if (!("global" in model["config.xml"]["draftsman"])){
            model["config.xml"]["draftsman"]["global"] = {};
        }
        model["config.xml"]["draftsman"]["global"]["dependency"] = [];
        Object.keys(packages).forEach(name => {
            model["config.xml"]["draftsman"]["global"]["dependency"].push({
                att_name: name,
                att_version: packages[name]
            });
        });
        console.log(packages);
    },
    get_summary: function(){
            let summary = {};

            summary["commands"] = session.command_names.length;
            summary["subdomains"] = session.subdomain_names.length;
            let aggregates = Aggregates.list();
            summary["aggregates"] = aggregates.length;
            let domain_events = 0;
            aggregates.forEach(aggregate => {
                domain_events += aggregate.events.length;
            });
            summary["domainEvents"] = domain_events;
            summary["views"] = session.view_names.length;
            summary["notifiers"] =  session.notifier_names.length;
            return summary;
        },
    open_readme: function(){
        tab_state.summary = Modeler.get_summary();
        Modeler.load_documentation("README.md");
        session.type = "readme";
    },
    load_documentation: function(doc){
        if (!(doc in documentation)) {
            documentation[doc] = {content:""};
        }
        session.documentation = documentation[doc];
    },
    load_api_overview: function(){
        session.type = "api";
        let commands = Commands.list();
        commands.sort(sort_commands);
        tab_state.commands = commands;
        let queries = [];
        Views.list().forEach(view => {
            view.query.forEach(query => {
                query = JSON.parse(JSON.stringify(query));
                query.view = view.att_name;
                queries.push(query);
            });
        });
        queries.sort(sort_queries);
        tab_state.queries = queries;
    },
    get_json_schema: function(element){

        try{
            var schema = {
                type: 'object',
                title: element.att_name,
                properties: {}
            };
            element.field.forEach(field => {
                        schema.properties[field.att_name] = {
                            type: field.att_type
                        };
                        if (element["att_business-key"] == field.att_name){
                            schema.properties[field.att_name]["description"] = "This attribute is used as business-key";
                        }
                    });

                    element[NESTED] = make_sure_is_list(element["nested-object"]);
                    element[NESTED].forEach(entity => {
                        var entity_schema = {
                            type: 'object',
                            title: entity.att_name,
                            description: 'A collection within the object.',
                            properties: {
                                "{{entity_key}}": {
                                    type: 'object',
                                    properties: {}
                                }
                            }
                        };
                        make_sure_is_list(entity.field).forEach(field => {
                            entity_schema.properties["{{entity_key}}"].properties[field.att_name] = {
                                type: field.att_type
                            };
                            if (entity["att_business-key"] == field.att_name){
                                entity_schema.properties["{{entity_key}}"].properties[field.att_name]["description"] = "This attribute is used as business-key";
                            }
                        });
                        schema.properties[entity.att_name] = entity_schema;
                    });

                    return schema;
        }catch(err){
            console.error(err);
            return {};
        }

    },
    get_document_entity: function(document_model,nested_documents,selected_entity){
        try{
            if (nested_documents.filter(x => x.att_name == selected_entity).length != 0){
                return nested_documents.filter(x => x.att_name == selected_entity).at(0);
            }
        }catch{}
        if (document_model){
            return document_model;
        }
        return {};
    },
    summary: function(path){
        if (path in summary_cache){
            return summary_cache[path];
        }
        var summary = "";
        if (path in documentation){
            summary = documentation[path].content;
        }
        summary = summary.split("\n").filter(x => !x.startsWith('#')).join("\n");
        if (summary.length > 300){
            summary = summary.substr(0, 300) + "...";
        }
        summary_cache[path] = summary;
        return summary;
    },
    get_child_models: function(path,root,initializer=null){
        return Object.keys(model)
            .filter(key => key.startsWith(path))
            .map(key => {
                let element = model[key][root];
                if (initializer){
                    initializer(element);
                }
                if ("att_name" in model[key][root]){
                    model[key][root]["att_name"] = key.split("/").at(-1).replace(".xml","");
                }
                return element;
            });
    },
    insert_model: function(path,element){
        if (path in model){
            session.exception = "Could not initialize file [" + path + "] because it already exist.";
            return false;
        }
        model[path] = element;
        document.dispatchEvent(new CustomEvent('tracepaper:model:loaded'));
        return true;
    },
    insert_documentation: function(path,content){
        if (path in documentation){
            session.exception = "Could not initialize file [" + path + "] because it already exist.";
            return false;
        }
        documentation[path] = {content:content};
        document.dispatchEvent(new CustomEvent('tracepaper:model:loaded'));
        return true;
    },
    render: function(){
        setTimeout(function(){
            document.dispatchEvent(new CustomEvent('tracepaper:model:loaded'));
        },1000);
    },
    register_role: blockingDecorator(function(name){
            if (!name.match(camel_cased)){
               let message = "Role name must be camel cased";
               Session.show_exception(message);
               return
            }
            if (!('roles' in meta)){
                meta.roles = [];
            }
            if (!(name in meta.roles)){
                meta.roles.push(name);
            }
        })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    try{
        Modeler.initialize();
    }catch{}
});
document.addEventListener('tracepaper:model:prepare-save', () => {
    if (!("config.xml" in model)){
        model["config.xml"] = {
            draftsman: {
                "att_project-name": context.selected_project.name,
                "att_xmlns": "https://tracepaper.draftsman.io",
                "functional-scenarios": {
                    "att_clean-db": "true",
                    "att_clean-iam": "true",
                    "att_minimum-event-coverage": 80,
                    "att_minimum-view-coverage": 80
                },
                "events": [{
                    "event": {
                        att_name: "FileUploaded",
                        att_type: "DomainEvent",
                        att_source: "appsync",
                        field: [
                            {att_name: "bucket", att_type: "String"},
                            {att_name: "uri", att_type: "String"},
                            {att_name: "location", att_type: "String"},
                            {att_name: "username", att_type: "String"}
                        ]
                    }
                }]
            }
        };
    }
});

window.Code = {
    list_modules: function(){
        return Object.keys(code).map(key => key.replace("lib/","").replace(".py","")).concat("");
    },
    get_methods: function(module,filter="(flow):"){
        return code[module].content.split("\n").filter(x => x.startsWith("def ") && x.endsWith(filter))
            .map(x => x.replace("def ","").replace(filter,""));
    },
    create_new: blockingDecorator(function(){
        let path = "lib/NewModule.py";
        if (Object.keys(code).includes(path)){
            Session.show_exception("Module with name 'NewModule' already exists");
            return;
        }
        code[path] = {content:code_template}
        Navigation.execute_open_tab(path);
    }),
    load: function(file){
        tab_state.code = code[file];
        let doc = file.replace('.py','.md')
        Modeler.load_documentation(doc);
        session.type = "code";
    },
    remove: blockingDecorator(function(){
        delete code[session.tab];
        delete documentation[session.tab.replace(".py",".md")];
        Navigation.execute_close_tab(session.tab);
    }),
    rename: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Python module must be PascalCased");
            return;
        }

        let oldPath = session.tab;
        let newPath = "lib/" + name + ".py";

        code[newPath] = code[oldPath];
        delete code[oldPath];
        documentation[newPath.replace(".py",".md")] = documentation[oldPath.replace(".py",".md")];
        delete documentation[oldPath.replace(".py",".md")];

        Navigation.execute_close_tab(oldPath);
        Navigation.execute_open_tab(newPath);
        Modeler.render();
    })
}

const builds_query = `
query GetBuilds($key_begins_with: String = "") {
  Build {
    filter(key_begins_with: $key_begins_with) {
      resultset {
        drn
        lastEvent
        status
      }
    }
  }
}
`

window.Builds = {
    load: function(){
        session.type = "build";
        session.tabs.map(x=> x.split("#").at(0)).filter(x=> x.startsWith("build/") && x != session.tab).forEach(tab=> {
            try{
                console.log("auto close tab:",tab);
                Navigation.execute_close_tab(tab);
            }catch{}
        });
    },
    fetch_builds: async function(){
        let data = await Draftsman.query(builds_query,{key_begins_with:localStorage.project});
        let builds = data.Build.filter.resultset;
        builds.sort((a,b) => b.lastEvent-a.lastEvent);
        tab_state.builds = builds;
        return builds;
    },
    open_build: blockingDecorator(function(drn){
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab("build/" + drn);
    })
}

window.Scenarios = {
    list: function(){
        let resultset = [];
        Object.keys(model).filter(key => key.startsWith('scenarios/') && key.endsWith(".xml")).forEach(key => {
            resultset.push(Scenarios.get(key));
        });
        return resultset;
    },
    load_navigation: function(){
        let scenario_names = [];
        session.scenario_names = scenario_names;
        Object.keys(model).filter(key => key.startsWith('scenarios/')).forEach(key => {
            let name = key.replace("scenarios/","").replace(".xml","");
            scenario_names.push(name);
        });
        session.scenario_names = scenario_names;
    },
    get: function(file){
        let scenario = model[file]["scenario"];
        scenario.activity = make_sure_is_list(scenario.activity);
        scenario.activity.forEach(activity => {
                    activity.input = make_sure_is_list(activity.input);
                    activity["expected-trace"] = make_sure_is_list(activity["expected-trace"]);
                    activity["expect-value"] = make_sure_is_list(activity["expect-value"]);
                    activity["extract-value"] = make_sure_is_list(activity["extract-value"]);
                    activity["data-remediation"] = make_sure_is_list(activity["data-remediation"]);
                    if (!activity.att_id){
                        activity.att_id = makeid(6);
                    }
                });
        return scenario;
    },
    load: function(file){
        tab_state.scenario = Scenarios.get(file);

        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);

        let index = {};
        let reverse_index = {};
        Commands.list().forEach(command => {
            let cmd_name = command.att_name.replace("Requested","");
            let cmd_path = command['att_graphql-namespace'] + "." + command['att_graphql-name'];
            index[cmd_name] = cmd_path;
            reverse_index[cmd_path] = cmd_name;
        });
        tab_state.commands = {index:index,reverse_index:reverse_index};

        tab_state.query_index = Scenarios.get_queries();
        session.type = "scenario";
    },
    create: blockingDecorator(function(){
        let path = "scenarios/NewScenario.xml";
        if (path in model){
            Session.show_exception("There is already a scenario defined with name: "+name);
            return;
        }
        Modeler.insert_model(path,{
            scenario: {
                att_name: "NewScenario",
                activity: []
            }
        });
        Navigation.execute_open_tab(path);
    }),
    remove: blockingDecorator(function(){
        let path = session.tab.replace(".xml","");
        delete model[path + ".xml"];
        delete documentation[path + ".md"];
        Navigation.execute_close_tab(session.tab);
    }),
    rename: blockingDecorator(function(new_name){
        if (!new_name.match(pascal_cased)){
            Session.show_exception("Scenario must be PascalCased");
            return;
        }
        let old_name = tab_state.scenario.att_name;
        let oldPath = "scenarios/" + old_name;
        let newPath = "scenarios/" + new_name;

        model[newPath + ".xml"] = model[oldPath + ".xml"];
        model[newPath + ".xml"].scenario.att_name = new_name;
        delete model[oldPath + ".xml"];
        documentation[newPath + ".md"] = documentation[oldPath + ".md"];
        delete documentation[oldPath + ".md"];
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(newPath + ".xml");
    }),
    add_input: blockingDecorator(function(activity){
        activity.input.push({att_name: 'field-' + makeid(4), att_type: 'String', att_value: ''});
    }),
    change_command: blockingDecorator(function(activity,commandName){
        if (commandName == "upload"){
            activity.input = [
                {
                    att_name: "name",
                    att_type: "String",
                    att_value: "#"
                },
                {
                    att_name: "content",
                    att_type: "String",
                    att_value: ""
                },
                {
                    att_name: "public",
                    att_type: "Boolean",
                    att_value: "false"
                }
            ];
            activity.att_path = "upload";
            return;
        }
        let command = model["commands/" + commandName + "Requested.xml"]["event"];
        activity.att_path = tab_state.commands.index[commandName];
        let inputs = {};
        activity.input.forEach(input => {
            inputs[input.att_name] = input;
        });
        let updated_value = [];

        let variables = Scenarios.get_flow_variables();
        command.field.filter(x => !("att_auto-fill" in x)).forEach(field => {
            if (field.att_name in inputs){
                updated_value.push(inputs[field.att_name]);
            } else {
                let potential_variable = variables.filter(x => `#${field.att_name}#` == x);
                let value = potential_variable.length != 0 ? potential_variable.at(0) : '#';
                updated_value.push({
                    att_name: field.att_name,
                    att_type: field.att_type,
                    att_value: value
                });
            }
        });

        command["nested-object"].forEach(nested => {
            if (nested.att_name in inputs){
                updated_value.push(inputs[nested.att_name]);
            } else {
                let default_value = {};
                nested.field.filter(x => !("att_auto-fill" in x)).forEach(field => {
                    default_value[field.att_name] = field.att_type == "String" ? "" : field.att_type == "Boolean" ? false : 0;
                });
                updated_value.push({
                    att_name: nested.att_name,
                    att_type: "Nested",
                    att_value: JSON.stringify([default_value],null,2)
                });
            }
        });
        activity.input = updated_value;
    }),
    get_flow_variables: function(){
        let flow = [];
        tab_state.scenario.activity.forEach(activity => {
            if (activity.att_type == 'set-variables'){
                activity.input.forEach(input => {
                    flow.push(input.att_name);
                });
            }
            if (activity.att_type == 'query'){
                activity["extract-value"].forEach(extraction => {
                    flow.push(extraction["att_put-key"]);
                });
            }
        });
        flow = flow.concat([
            "user_number",
            "scenario_name",
            "user_name",
            "token",
            "url",
        ]);
        flow = flow.map(x => "#" + x + "#");
        flow.push("#");
        flow.push("");
        return flow;
    },
    get_component_index: function(){
        let flow_index = [];
        Aggregates.list().forEach(aggregate => {
            aggregate.flows.forEach(command => {
                let key = aggregate.subdomain + "." + aggregate.root.att_name + "." + command.att_name;
                flow_index.push(key);
            });
          });
        Notifiers.list().forEach(notifier => {
            let key = notifier.att_name + "-Notifier";
            flow_index.push(key);
        });
        return flow_index;
    },
    append_expectation: blockingDecorator(function(activity){
        let flow_index = Scenarios.get_component_index();
        let traces = activity["expected-trace"].map(x => x.att_command);
        for(let i = 0; i < flow_index.length; i++){
            let trace = flow_index[i];
            if (!traces.includes(trace)){
                activity["expected-trace"].push({
                    att_command: trace,
                    att_status: "success"
                });
                break;
            }
        }
    }),
    get_queries: function(){
        let query_index = {};
        Views.list().forEach(view => {
            view.query.forEach(query => {
                let key = query["att_graphql-namespace"] + "." + query["att_field-name"];
                query_index[key] = view.att_name;
            });
        });
        return query_index;
    },
    change_view: blockingDecorator(function(activity){
        let view = Views.get('views/' + activity.att_view + '.xml');
        let inputs = {};
        activity.input.forEach(input => {
            inputs[input.att_name] = input;
        });
        let updated_value = [];
        activity.input = updated_value;

        let query = view.query.filter(query => query["att_graphql-namespace"] + "." + query["att_field-name"] == activity.att_path).at(0);

        if (query.att_type == "get"){
            updated_value.push({
                att_name: "key",
                att_type: "String",
                att_value: "#"
            });
        }else{
            if ('att_use-canonical-search' in query && query['att_use-canonical-search'] == 'true'){
                updated_value.push({
                    att_name: "key_begins_with",
                    att_type: "String"
                });
            }
            query["filter-clause"].forEach(filter => {
                let name = filter["att_field-name"];
                let type = view.field.filter(x => x.att_name == name).at(0).att_type;
                updated_value.push({
                    att_name: name,
                    att_type: type
                });
            });
        }
        activity.input = updated_value;
    }),
    append_activity: blockingDecorator(function(type){
         tab_state.scenario.activity.push({
            att_type: type,
            att_id: makeid(6),
            input: [],
            "expected-trace": [],
            "expect-value": [],
            "extract-value": []
        });
    }),
    load_variables: blockingDecorator(function(activity,fields){
        let registered = activity.input.map(x => x.att_name);
        fields.forEach(field => {
            if (!registered.includes(field.att_name)){
                activity.input.push({att_name: field.att_name, att_type: 'String', att_value: ''});
            }
        });
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Scenarios.load_navigation();
    setTimeout(Scenarios.load_navigation,1000);
});

document.addEventListener('tracepaper:model:prepare-save', () => {

    Scenarios.list().forEach(scenario => {
        scenario.activity.forEach(activity => {
          let expect = [];
          let checks = [];
          make_sure_is_list(activity["expect-value"]).forEach(assertion => {
            if (assertion["att_name"] != ""
                && !checks.includes(assertion["att_name"])){
                    expect.push(assertion);
                    checks.push(assertion["att_name"]);
                }
          });
          activity["expect-value"] = expect;
        });
    });
});


window.Patterns = {
    list: function(){
        return Object.entries(model).filter(x => x[0].startsWith('patterns/')).map(x => x[1]["pattern"]["att_name"]);
    },
    load: function(){
        tab_state.patterns = Object.entries(model).filter(x => x[0].startsWith('patterns/')).map(x => x[1]["pattern"]);
        Object.keys(model).filter(key => key.startsWith('patterns/')).forEach(key => {
            let doc = key.replace(".xml",".md");
            if (!(doc in documentation)){
                documentation[doc] = {content:""};
            }
        });
        session.type = "patterns";
    },
    remove: blockingDecorator(function(name){
        let path = "patterns/" + name;
        delete model[path + ".xml"];
        delete documentation[path + ".md"];
        Patterns.load();
    }),
    rename: blockingDecorator(function(old_name,new_name){
            if (!new_name.match(pascal_cased)){
                Session.show_exception("Pattern must be PascalCased");
                return;
            }

            let oldPath = "patterns/" + old_name;
            let newPath = "patterns/" + new_name;

            model[newPath + ".xml"] = model[oldPath + ".xml"];
            model[newPath + ".xml"].pattern.att_name = new_name;
            delete model[oldPath + ".xml"];
            documentation[newPath + ".md"] = documentation[oldPath + ".md"];
            delete documentation[oldPath + ".md"];
            Patterns.load();
        }),
    create: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Pattern must be PascalCased");
            return;
        }
        let path = "patterns/" + name + ".xml";
        if (path in model){
            Session.show_exception("There is already a pattern defined with name: "+name);
            return;
        }
        Modeler.insert_model(path,{
            pattern: {
                att_name: name,
                att_regex: '^([A-Z]{1}[a-z]+)+$'
            }
        });
        Patterns.load();
    })
}

window.Notifiers = {
    list: function(){
        let resultset = [];
        Object.keys(model).filter(key => key.startsWith('notifiers/')).forEach(key => {
            resultset.push(Notifiers.get(key));
        });
        return resultset;
    },
    get: function(path){
        let notifier = model[path]["notifier"];
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
        notifier.att_file_path = path;
        return notifier;
    },
    load_navigation: function(){
        let updated = Object.keys(model).filter(key => key.startsWith('notifiers/')).map(key => key.replace("notifiers/","").replace(".xml",""));
        session.notifier_names = updated;
    },
    create_new: blockingDecorator(function(){
            let name = "NewNotifier";
            let path = "notifiers/" + name + ".xml";
            let doc = "notifiers/" + name + ".md";
            let added = Modeler.insert_model(path,{
                "notifier": {
                    "att_name": name
                }
            });
            Modeler.insert_documentation(doc,"~~View model template~~");
            if (added){
                setTimeout(function(){
                    Navigation.execute_open_tab(path);
                },500);
            }
        }),
    load: function(file){
        tab_state.notifier = Notifiers.get(file);
        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);
        tab_state.triggers = tab_state.notifier.trigger;
        session.type = "notifier";
        if(!tab_state.mode){tab_state.mode="flow"};
    },
    remove: blockingDecorator(function(){
            delete model[session.tab];
            delete documentation[session.tab.replace(".xml",".md")];
            Navigation.execute_close_tab(session.tab);
        }),
    rename: blockingDecorator(function(name){
            if (!name.match(pascal_cased)){
                Session.show_exception("Notifier must be PascalCased");
                return;
            }

            let oldPath = session.tab;
            let newPath = "notifiers/" + name + ".xml";

            tab_state.notifier.att_name = name;

            model[newPath] = model[oldPath];
            delete model[oldPath];
            documentation[newPath.replace(".xml",".md")] = documentation[oldPath.replace(".xml",".md")];
            delete documentation[oldPath.replace(".xml",".md")];

            Navigation.execute_close_tab(oldPath);
            Navigation.execute_open_tab(newPath);
            Modeler.render();
        }),
    equalize_trigger_flowvars: function(){
        let flowVars = [];
        let arrays = [];
        tab_state.notifier.trigger.forEach(trigger => {
            trigger.mapping.filter(mapping => mapping.att_value != "#''").forEach(mapping => {
               if (!flowVars.includes(mapping.att_target)){
                flowVars.push(mapping.att_target);
               }
               if ('att_nested' in mapping &&  mapping.att_nested){
                arrays.push(mapping.att_target);
               }
            });
        });
        tab_state.notifier.trigger = tab_state.notifier.trigger.map(trigger => {
            trigger.mapping = flowVars.map(flowVar => {
                let mapping = trigger.mapping.filter(x => x.att_target == flowVar);
                if (mapping.length != 0){
                    return mapping.at(0);
                } else if (arrays.includes(flowVar)) {
                    return {att_target: flowVar, att_value: "#[]"};
                } else {
                    return {att_target: flowVar, att_value: "#''"};
                }
            });
            return trigger;
        });
    },
    update_trigger: blockingDecorator(function(source,update){
        let trigger = tab_state.notifier.trigger.filter(x => x.att_source == source).at(0);
        trigger.att_source = update;
        try{
            let event = Events.get(update);
            let mappings = {};
            trigger.mapping.forEach(x => {
                mappings[x.att_value] = x;
            });
            trigger.mapping = event.field.map(x => {return {att_target: x.att_name, att_value: x.att_name};});
            Object.keys(mappings).filter(x => x.startsWith('#')).forEach(
                x => trigger.mapping.push(mappings[x])
            );
        }catch(err){console.error(err)}
        Notifiers.equalize_trigger_flowvars();
    }),
    add_trigger: blockingDecorator(function(source){
        let trigger = {att_source: source,mapping:[]};
        if (!source.startsWith("@")){
            let event = Events.get(source);
            trigger.mapping = event.field.map(x => {return {att_target: x.att_name, att_value: x.att_name};});
            trigger.mapping = trigger.mapping.concat(event[NESTED].map(x => {return {att_target: x.att_name, att_value: x.att_name, att_nested: true};}));
        }
        tab_state.notifier.trigger.push(trigger);
//        let keys = event.field.filter(x => x.att_name == tab_state.aggregate.root["att_business-key"]);
//        trigger["att_key-field"] = keys.length != 0 ? keys.at(0).att_name : event.field.at(0).att_name;
        Notifiers.equalize_trigger_flowvars();
    }),
    remove_trigger: blockingDecorator(function(source){
        tab_state.notifier.trigger = tab_state.notifier.trigger.filter(x => x.att_source != source);
        Notifiers.equalize_trigger_flowvars();
    }),
    get_flow_variables: function(nested){
        if (!tab_state.notifier){return []}
        let flowVars = [""];
        tab_state.notifier.trigger.forEach(trigger => {
            trigger.mapping.forEach(mapping => {
               if (!flowVars.includes(mapping.att_target)){
                flowVars.push(mapping.att_target);
               }
            });
        });
        function add_variables(activity){
            if (activity.att_type == 'set-variable'){
                flowVars.push(activity.att_name);
            }
            if (activity.att_type == 'code'){
                if ('att_code' in activity){
                    let content = activity.att_code;
                    content.split("|LB|").filter(line => line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)).forEach(line => {
                        let variable = line.replace("flow.","").split("=").at(0).trim();
                        flowVars.push(variable);
                    });
                } else {
                    let content = code[activity["att_python-file"]].content;
                    let method_detected = false;
                    content.split("\n").forEach(line => {
                        if (line.startsWith(`def ${activity.att_handler}(flow):`)){
                            method_detected = true;
                        } else if (line.startsWith("def")){
                            method_detected = false;
                        }
                        if (method_detected && line.replaceAll(" ","").match(/^(flow.[\w]+)={1}/g)){
                            let variable = line.replace("flow.","").split("=").at(0).trim();
                            flowVars.push(variable);
                        }
                    });
                }
            }
        }
        tab_state.notifier.activity.forEach(activity => {
            add_variables(activity);
        });
        if (nested && Object.keys(nested).length != 0){
            nested.activity.forEach(activity => {
               add_variables(activity);
            })
        }
        return flowVars;
    },
    add_activity: blockingDecorator(function(notifier,type){
        var new_activity = {att_type: type};
        new_activity.att_id = makeid(6);
        notifier.activity.push(new_activity);
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Notifiers.load_navigation();
    setTimeout(Notifiers.load_navigation,1000);
});

document.addEventListener('tracepaper:model:prepare-save', () => {
    if (!("notifiers/InitializeSystemUser.xml" in model)){
        model["notifiers/InitializeSystemUser.xml"] = {
            notifier: {
                att_name: "InitializeSystemUser",
                trigger: {
                    att_source: "@afterDeployment",
                    mapping: {
                        att_target: "dummy",
                        att_value: "#''"
                    }
                },
                activity: {
                    att_type: "iam-create-systemuser",
                    "att_fail-silent": "true",
                    att_id:"vMB9LZ"
                }
            }
        }
    }
});

window.Projections = {
    load_projections: function(){
        session.projection_names = [];
        Object.keys(model).filter(key => key.startsWith('projections/')).forEach(key => {
            let name = key.replace("projections/","").replace(".xml","");
            session.projection_names.push(name);
        });
    },
    load: function(file){
        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);
        tab_state.projection = Projections.get(file);
        session.type = "projection";
    },
    list: function(){
        return Object.keys(model).filter(key => key.startsWith("projections/")).map(key => Projections.get(key))
    },
    get: function(path){
        let projection = model[path]["projection"];
        projection['input'] = make_sure_is_list(projection['input']);
        return Alpine.reactive(projection);
    },
    create_new: blockingDecorator(function(){
        let name = "NewProjection";
        let path = "projections/" + name + ".xml";
        let doc = "projections/" + name + ".md";
        let added = Modeler.insert_model(path,{
            "projection": {
                "att_graphql-namespace": "Projection",
                "att_field-name": "new",
                "att_authorization": "authenticated",
                "att_return": "NewFunctionRequested",
                "att_name": "NewProjection",
                "att_code": projection_code_template,
                input: []
            }
        });
        Modeler.insert_documentation(doc,"~~Projection model template~~");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },500);
        }
    }),
    remove: blockingDecorator(function(){
        delete model[session.tab];
        delete documentation[session.tab.replace(".xml",".md")];
        Navigation.execute_close_tab(session.tab);
    }),
    rename: blockingDecorator(function(name){
        if(name == tab_state.projection.att_name){return}
        let oldPath = session.tab;
        let newPath = "projections/" + name + ".xml";

        tab_state.projection.att_name = name;

        model[newPath] = model[oldPath];
        delete model[oldPath];
        documentation[newPath.replace(".xml",".md")] = documentation[oldPath.replace(".xml",".md")];
        delete documentation[oldPath.replace(".xml",".md")];

        Navigation.execute_close_tab(oldPath);
        Navigation.execute_open_tab(newPath);
        Modeler.render();
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Projections.load_projections();
    setTimeout(Projections.load_projections,1000);
});


window.Views = {
    list: function(){
        return Object.keys(model).filter(key => key.startsWith("views/")).map(key => Views.get(key));
    },
    load_navigation: function(){
        let updated = Object.keys(model).filter(key => key.startsWith('views/')).map(key => key.replace("views/","").replace(".xml",""));
        session.view_names = updated;
    },
    create_new: blockingDecorator(function(){
        let name = "NewView";
        let path = "views/" + name + ".xml";
        let doc = "views/" + name + ".md";
        let added = Modeler.insert_model(path,{
            "view": {
                "att_name": "NewView"
            }
        });
        Modeler.insert_documentation(doc,"~~View model template~~");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },500);
        }
    }),
    get: function(path){
        let view = model[path]["view"];
        view.field = make_sure_is_list(view.field);
        view[SNAPSHOT_HANDLER] = make_sure_is_list(view[SNAPSHOT_HANDLER]);
        view[SNAPSHOT_HANDLER].forEach( handler => {
            handler.mapping = make_sure_is_list(handler.mapping);
            handler.delete = make_sure_is_list(handler.delete);
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
        });
        if (!view["att_data-retention-days"]){view["att_data-retention-days"] = -1}
        if (!view["att_exclude-notification"]){view["att_exclude-notification"] = "false"}
        return view;
    },
    load: function(file){
        tab_state.view = Views.get(file);
        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);
        tab_state.has_key = tab_state.view.field.filter(x => 'att_pk' in x && x.att_pk == 'true').length != 0;
        session.type = "view";
        if(!tab_state.mode){tab_state.mode="model"};
    },
    remove: blockingDecorator(function(){
        delete model[session.tab];
        delete documentation[session.tab.replace(".xml",".md")];
        Navigation.execute_close_tab(session.tab);
    }),
    rename: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("View must be PascalCased");
            return;
        }

        let oldPath = session.tab;
        let newPath = "views/" + name + ".xml";

        tab_state.view.att_name = name;

        model[newPath] = model[oldPath];
        delete model[oldPath];
        documentation[newPath.replace(".xml",".md")] = documentation[oldPath.replace(".xml",".md")];
        delete documentation[oldPath.replace(".xml",".md")];

        Navigation.execute_close_tab(oldPath);
        Navigation.execute_open_tab(newPath);
        Modeler.render();
    }),
    change_primary_key: blockingDecorator(function(fieldName){
        tab_state.view.field = tab_state.view.field.map(x => {
            if (x.att_name == fieldName){
                x.att_pk = "true";
            } else {
                delete x.att_pk;
            }
            return x;
        });
    }),
    add_field: blockingDecorator(function(){
        tab_state.view.field.push({att_name: 'field-' + makeid(4), att_type: 'String'})
    }),
    get_aggregate_documents: function(){
        let aggregates = Aggregates.list();
        let templates = [];
        aggregates.forEach(aggregate => {
            templates.push(`${aggregate.subdomain}.${aggregate.root.att_name}.root`);
            aggregate.entities.forEach(entity => {
                templates.push(`${aggregate.subdomain}.${aggregate.root.att_name}.${entity.att_name}`);
            });
        });
        return templates;
    },
    copy_aggregate_document_attributes: blockingDecorator(function(documentId){
            let path = documentId.split(".");
            let aggregate = Aggregates.get(`domain/${path[0]}/${path[1]}/root.xml`);
            let registered_attributes = tab_state.view.field.map(x => x.att_name);
            let entity = aggregate.root;
            if (path[2] != "root"){
                entity = aggregate.entities.filter(x => x.att_name == path[2]).at(0);
            }
            entity = JSON.parse(JSON.stringify(entity));
            entity.field.filter(x => !registered_attributes.includes(x.att_name)).forEach(x => {
                tab_state.view.field.push(x);
            });
        }),
    remove_data_source: blockingDecorator(function(handler){
        tab_state.view["snapshot-handler"] = tab_state.view["snapshot-handler"].filter(x => x != handler);
        tab_state.view["custom-handler"] = tab_state.view["custom-handler"].filter(x => x != handler);
    }),
    update_delete_condition: blockingDecorator(function(handler,delete_condition){
        if (delete_condition && delete_condition != ""){
            handler.delete = [{
                att_condition: delete_condition
            }];
        }else{
            handler.delete = [];
        }
    }),
    change_mapping: blockingDecorator(function(handler,mapping,operand){
        if (operand == "unmapped"){
            handler.mapping = handler.mapping.filter(x => x.att_target != mapping.att_target);
        } else {
            mapping.att_operand = operand;
        }
    }),
    add_mapping: blockingDecorator(function(handler,field,operand,aggregate){
            console.log("--->",handler,field,operand,aggregate)
            let collection = aggregate.root;
            if (handler.att_processor == "dictionary" && handler.att_dictionary){
                collection = aggregate.entities.filter(x => x.att_name == handler.att_dictionary).at(0);
            }
            let value = collection.field.filter(x => x.att_name == field.att_name).length != 0 ? field.att_name : collection.field.at(0).att_name;
            handler.mapping.push({
                att_target: field.att_name,
                att_operand: operand,
                att_value: value
            });
        }),
    add_convert_item_mapping: blockingDecorator(function(handler,field,operand,aggregate){
        let sources = aggregate.entities.filter(x => x.att_name == field.att_name);
        let collection = sources.length != 0 ? sources.at(0) : aggregate.entities.at(0);
        let values = collection.field.map(x => x.att_name);
        let reference = Views.get('views/' + field.att_ref + '.xml');
        let template = Views.create_new_template(reference,values);
        handler.mapping.push({
            att_target: field.att_name,
            att_operand: operand,
            att_value: collection.att_name ,
            att_template: template
        });
    }),
    update_convert_item_mapping: blockingDecorator(function(handler,field,source,aggregate){
        handler.mapping = handler.mapping.filter(x => x.att_target != field.att_name);

        let sources = aggregate.entities.filter(x => x.att_name == source);
        let collection = sources.length != 0 ? sources.at(0) : aggregate.entities.at(0);
        let values = collection.field.map(x => x.att_name);
        let reference = Views.get('views/' + field.att_ref + '.xml');
        let template = Views.create_new_template(reference,values);
        handler.mapping.push({
            att_target: field.att_name,
            att_operand: "convert_items",
            att_value: collection.att_name ,
            att_template: template
        });
    }),
    create_new_template: function(reference,values){
            console.log(reference);
            let template = "{";
            reference.field.filter(x => field_types.includes(x.att_type)).forEach(ref => {
                let value = 'value["' + (values.includes(ref.att_name) ? ref.att_name : values.at(0)) + '"]';
                template += `"${ref.att_name}": ${value},`;
            });
            if (template.endsWith(",")){
                template = template.substring(0,template.length-1);
            }
            template += '}';
            return template;
        },
    update_template: blockingDecorator(function(mapping,template,target,source){
            let update = "{";
            for (const [key, value] of Object.entries(template)) {
              if (key == target && source != ""){
                update += `"${key}": value["${source}"],`;
              } else if (key != target){
                update += `"${key}": value["${value}"],`;
              }
            }
            if (update.endsWith(",")){
                update = update.substring(0,update.length-1);
            }
            update += '}';
            console.log(update);
            mapping.att_template = update;
        }),
    add_data_source: blockingDecorator(function(aggregate){
        let key = Views.get_key_field(aggregate);

        let mapping = [];
        tab_state.view.field.forEach(field => {
            if (field.att_type == 'ObjectList' && aggregate.entities.filter(x => field.att_name == x.att_name).length != 0 ){
                let collection = aggregate.entities.filter(x => x.att_name == field.att_name).at(0);
                let values = collection.field.map(x => x.att_name);
                let reference = Views.get('views/' + field.att_ref + ".xml");
                let template = Views.create_new_template(reference,values);
                mapping.push({
                    att_target: field.att_name,
                    att_operand: "convert_items",
                    att_value: collection.att_name,
                    att_template: template
                });
            } else if (aggregate.root.field.filter(x => field.att_name == x.att_name).length != 0){
                mapping.push({
                    att_target: field.att_name,
                    att_operand: "set",
                    att_value: field.att_name
                });
            }
        });

        tab_state.view["snapshot-handler"].push({
            "att_id": makeid(6),
            "att_sub-domain": aggregate.subdomain,
            "att_aggregate": aggregate.root.att_name,
            "att_key-mapping": key,
            "att_processor": "item",
            "mapping": mapping,
            "delete": [{
                "att_condition": "#snapshot.isDeleted != ''"
            }]
        });
    }),
    add_code_source: blockingDecorator(function(aggregate){
       let code = Views.get_initial_inline_code(aggregate);
       tab_state.view["custom-handler"].push({
           "att_id": makeid(6),
           "att_sub-domain": aggregate.subdomain,
           "att_aggregate": aggregate.root.att_name,
           "#text": code
       });
   }),
    get_key_field: function(aggregate){
        let pk = tab_state.view.field.filter(x => x.att_pk == "true").map(x => x.att_name);
        let keys = aggregate.root.field.filter(x => pk.includes(x.att_name));
        let key = keys.length != 0 ? keys.at(0).att_name : aggregate.root.field.at(0).att_name;
        return key;
    },
    get_initial_inline_code: function(aggregate){
            let view_key = Views.get_key_field(aggregate);
            let code = "#Your custom logic, you have access to:\n#  The 'event' object\n#  The 'snapshot' object\n#  And the EntityManager\n";
            code += `entity = EntityManager.get(type="${tab_state.view.att_name}", key=snapshot.${view_key})\n`;
            let values = aggregate.root.field.map(x => x.att_name);
            tab_state.view.field.filter(x => values.includes(x.att_name)).forEach(x =>{
                code += `entity.${x.att_name} = snapshot.${x.att_name}\n`;
            });
            code += "if snapshot.isDeleted != '':\n    entity.mark_for_deletion = True";
            return code;
        },
    change_handler_type: blockingDecorator(function(handler,type,aggregate){
            if (type == 'Global Module'){
                if (!('att_python-file' in handler)){
                    handler['att_python-file'] = "";
                    handler['att_method'] = "";
                }
                delete handler["#text"];
            } else {
                delete handler['att_python-file'];
                delete handler['att_method'];
                let code = Views.get_initial_inline_code(aggregate);
                handler["#text"] = code;
            }
        }),
    add_relation: blockingDecorator(function(){
        tab_state.view.field.push({
            att_name: 'field-' + makeid(4),
            att_type: 'ObjectList',
            att_ref: tab_state.view.att_name,
            att_authorization: 'authenticated',
            'att_foreign-key': tab_state.view.field.at(0).att_name
        })
        tab_state.mode = "";
        setTimeout(function(){
            tab_state.mode = "relation";
        },1);
    }),
    add_query: blockingDecorator(function(type){
        let name = type == 'query' ? 'method-' + makeid(4) : type;
        let namespace = tab_state.view.query.length != 0 ? tab_state.view.query.at(0)['att_graphql-namespace'] : tab_state.view.att_name;
        tab_state.view.query.push({
            'att_graphql-namespace' : namespace,
            'att_field-name': name,
            'att_type' : type,
            'filter-clause': [],
            'att_authorization': 'authenticated'
        });
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Views.load_navigation();
    setTimeout(Views.load_navigation,1000);
});

document.addEventListener('tracepaper:model:prepare-save', () => {
    // Refactor & Validate
    Views.list().forEach(view => {
        let path = "views/" + view.att_name + ".xml"
        //Fields
        Validation.must_be_camel_cased(path,view.field,"View field","att_name")

        //Check primary key
        if (view.field.filter(x => x.att_pk == "true").length != 0
            && view[SNAPSHOT_HANDLER].length == 0
            && view[CUSTOM_HANDLER].length == 0){
            Validation.register(path, "This view has a primary key configured but no datasource");
        }

        //Relations
        let keys = Object.keys(model);
        view.field.filter(x => view_relations.includes(x.att_type)).forEach(ref => {
            let key = `views/${ref.att_ref}.xml`;
            if (!keys.includes(key)){
                Validation.register(path,`Has a ${ref.att_type} relation configured that references an unknown view ${ref.att_ref}`)
            }
        });

        //Snapshot handler
        view[SNAPSHOT_HANDLER].forEach(handler => {
            try{
                let aggregate = null;
                let fields = view.field.map(x => x.att_name);
                try{
                    aggregate = Aggregates.get(`domain/${handler["att_sub-domain"]}/${handler.att_aggregate}/root.xml`);
                }catch{
                    Validation.register(path,`Datasource refrences a non existing aggregate ${handler['att_sub-domain']}.${handler.att_aggregate}`)
                    return;
                }

                //Remove unknown targets
                handler.mapping = handler.mapping.filter(x => fields.includes(x.att_target));

                let aggregate_fields = aggregate.root.field.map(x => x.att_name);
                if (handler.att_processor == "dictionary" && handler.att_dictionary){
                    aggregate_fields = aggregate.entities.filter(x => x.att_name == handler.att_dictionary).at(0).field.map(x => x.att_name);
                }
                aggregate_fields = aggregate_fields.concat(aggregate.entities.map(x => x.att_name));
                handler.mapping.filter(x => !aggregate_fields.includes(x.att_value)).forEach(mapping=>{
                    Validation.register(path,`Datasource [${aggregate.subdomain}.${aggregate.root.att_name}] maps an unknown document field [${mapping.att_value}] to view field [${mapping.att_target}]`);
                });
                handler.mapping.filter(x => x.att_operand == "convert_items").forEach(mapping => {
                    let source_fields = aggregate.entities.filter(x => x.att_name == mapping.att_value).at(0).field.map(x => x.att_name);
                    let ref = view.field.filter(x => x.att_name == mapping.att_target).at(0).att_ref;
                    ref = Views.get(`views/${ref}.xml`);
                    let target_fields = ref.field.filter(x => view_field_types.concat(["ObjectList"]).includes(x.att_type)).map(x => x.att_name);
                    let nested = JSON.parse(mapping.att_template.replaceAll("value[","").replaceAll("]",""));
                    Object.keys(nested).forEach(target => {
                        if (!target_fields.includes(target)){
                            Validation.register(path,`
                                Datasource [${aggregate.subdomain}.${aggregate.root.att_name}] maps to an unknown nested view field
                                [${mapping.att_target}.${target}]`)
                        }
                        if (!source_fields.includes(nested[target])){
                            Validation.register(path,`
                                Datasource [${aggregate.subdomain}.${aggregate.root.att_name}] maps an unknown document collection field
                                [${mapping.att_value}.${nested[target]}] to [${mapping.att_target}.${target}]`)
                        }
                    });
                });
            }catch{}
        });

        //Custom handler
        view[CUSTOM_HANDLER].forEach(handler => {
            let aggregate = null;
            try{
                aggregate = Aggregates.get(`domain/${handler["att_sub-domain"]}/${handler.att_aggregate}/root.xml`);
            }catch{
                Validation.register(path,`Datasource refrences a non existing aggregate ${handler['att_sub-domain']}.${handler.att_aggregate}`)
                return;
            }
            if(!handler["#text"] && (!handler["att_python-file"] || !handler.att_method)){
                Validation.register(path,`
                    Datasource [${aggregate.subdomain}.${aggregate.root.att_name}] is not correctly configured`);
            }
            if (handler["att_python-file"] && handler.att_method){
                //TODO check if module and method exist
            }
        });
    });
});

window.Commands = {
    get_attribute_sources: function(){
        let sources = [];
        sources = sources.concat(Commands.list());
        sources = sources.concat(Aggregates.list());
        return sources;
    },
    load_commands: function(){
        session.command_names = [];
        Object.keys(model).filter(key => key.startsWith('commands/')).forEach(key => {
            let name = key.replace("commands/","").replace("Requested.xml","");
            session.command_names.push(name);
        });
    },
    load: function(file){
        let doc = file.replace('.xml','.md')
        Modeler.load_documentation(doc);
        tab_state.command = Commands.get(file);
        session.type = "command";
        tab_state.document_model = tab_state.command;
        tab_state.nested_documents = tab_state.command[NESTED]
    },
    add_element_collection: blockingDecorator(function(){
        tab_state.command['nested-object'].push({
            "att_name" : "collection-name-" + makeid(4),
            "field": [{
                "att_name" : "fieldname-" + makeid(4),
                "att_type" : "String"
            }]
        });
        Navigation.reload_tab();
    }),
    remove_element_collection: blockingDecorator(function(name){
        tab_state.command[NESTED] = tab_state.command[NESTED].filter(x => x.att_name != name);
        Navigation.reload_tab();
    }),
    list: function(){
        return Object.keys(model).filter(key => key.startsWith("commands/")).map(key => Commands.get(key))
    },
    get: function(path){
        let command = model[path]["event"];
        command['field'] = make_sure_is_list(command['field']);
        command['nested-object'] = make_sure_is_list(command['nested-object']);
        command['nested-object'].forEach(entity => {
            entity.field = make_sure_is_list(entity.field);
        });
        return Alpine.reactive(command);
    },
    create_new: blockingDecorator(function(){
        let name = "NewFunctionRequested";
        let path = "commands/" + name + ".xml";
        let doc = "commands/" + name + ".md";
        let added = Modeler.insert_model(path,{
            "event": {
                "att_graphql-namespace": "Function",
                "att_graphql-name": "new",
                "att_name": "NewFunctionRequested",
                "att_authorization": "authenticated",
                "att_type": "ActorEvent",
                "field": [],
                NESTED: []
            }
        });
        Modeler.insert_documentation(doc,"~~Command model template~~");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },500);
        }
    }),
    copy_attributes: blockingDecorator(function(source){
        console.log(source);
        if (source.att_name){
            tab_state.command.field = tab_state.command.field.concat(deep_copy(source.field));
            tab_state.command["nested-object"] = tab_state.command["nested-object"].concat(deep_copy(source["nested-object"]));
        } else {
            console.log(source);
            tab_state.command.field = tab_state.command.field.concat(source.root.field.filter(x => field_types.includes(x.att_type)));
            tab_state.command["nested-object"] = tab_state.command["nested-object"].concat(source.entities.map(entity => {
                return {
                    "att_name": entity.att_name,
                    "field": entity.field.filter(x => field_types.includes(x.att_type))
                }
            }));
        }
    }),
    remove: blockingDecorator(function(){
        delete model[session.tab];
        delete documentation[session.tab.replace(".xml",".md")];
    })
}

function deep_copy(data){
    return JSON.parse(JSON.stringify(data));
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Commands.load_commands();
});

document.addEventListener('tracepaper:model:prepare-save', () => {
    // Refactor and validate
    Object.keys(model).filter(key => key.startsWith("commands/")).forEach(key => {
        let command = Commands.get(key);
        let path = key;
        let name = key.replace("commands/","").replace(".xml","");
        if (name != command.att_name){
            // Rename files
            delete model[key];
            path = "commands/" + command.att_name + ".xml";
            model[path] = {event:command};
            let doc = key.replace(".xml",".md");
            documentation["commands/" + command.att_name + ".md"] = documentation[doc];
            delete documentation[doc];

            //Switch tab
            FileSystem.remove_from_staging(key,true);
            FileSystem.remove_from_staging(key.replace(".xml",".md"),true);
            Navigation.execute_close_tab(key);
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },1000);
        }

        // Refactor and validate subscribers
        let fields = command.field.map(x => x.att_name);
        fields = fields.concat(command[NESTED].map(x => x.att_name));
        Aggregates.list().forEach(aggregate => {
            aggregate.flows.forEach(flow => {
                flow.trigger.forEach(trigger => {
                    if (name != command.att_name && trigger.att_source == name){
                        trigger.att_source = command.att_name;
                    }
                });
            });
        });
        Notifiers.list().forEach(notifier => {
            notifier.trigger.forEach(trigger => {
                if (name != command.att_name && trigger.att_source == name){
                    trigger.att_source = command.att_name;
                }

                if (trigger.att_source == command.att_name){
                   trigger.mapping.forEach(mapping => {
                    if (!mapping.att_value.startsWith("#") && !fields.includes(mapping.att_value)){
                        Validation.register(notifier.att_file_path,`Trigger ${trigger.att_source} maps a non existing command-field '${mapping.att_value}' to flow variable '${mapping.att_target}'`);
                    }
                   });
               }
            });
        });

        //Validate command
        command.field.filter(f => !f.att_name.match(camel_cased)).forEach(f => {
            Validation.register(path,`Field ${f.att_name} must be camelCased`);
        });
        command[NESTED].filter(e => !e.att_name.match(camel_cased)).forEach(e => {
            Validation.register(path,`Entity ${e.att_name} must be camelCased`);
        });
        command[NESTED].forEach(e => {
            e.field.filter(f => !f.att_name.match(camel_cased)).forEach(f => {
                Validation.register(path,`Field ${f.att_name} in entity ${e.att_name} must be camelCased`);
            });
        });
    });
    Commands.load_commands();
});

window.Templates = {
    list: function(){
        return Object.keys(templates).map(x => x.replace("templates/",""));
    }
}

window.Subdomains = {
    list: function(){
        let resultset = [];
        Object.keys(documentation).filter(key => key.startsWith('domain/') && key.endsWith("/README.md")).forEach(key => {
           resultset.push(key.split('/').at(1));
        });
        return resultset;
    },
    create_new: blockingDecorator(function(){
        let doc = "domain/NewSubdomain/README.md";
        let added = Modeler.insert_documentation(doc,"New Subdomain");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(doc);
            },500);
        }
    }),
    load: function(file){
        if (!(file in documentation)) {
            documentation[file] = {content:""};
        }
        session.documentation = documentation[file];
        session.type = "subdomain";
    },
    remove: blockingDecorator(function(){
        if (!session.tab.startsWith("domain/") && !session.tab.endsWith("/readme.md")){
            Session.show_exception("Could not remove subdomain: " + session.tab);
            return
        }
        let path = session.tab.replace("README.md","");
        Object.keys(model).filter(key => key.startsWith(path)).forEach(key => {delete model[key]});
        Object.keys(documentation).filter(key => key.startsWith(path)).forEach(key => {delete documentation[key]});
        Navigation.execute_close_tab(session.tab);
        Modeler.render();
    }),
    rename: blockingDecorator(function(name){
        if (!session.tab.startsWith("domain/") && !session.tab.endsWith("/readme.md")){
            Session.show_exception("Could not rename subdomain: " + session.tab);
            return
        }
        if (!name.match(pascal_cased)){
            Session.show_exception("Subdomain name must be PascalCased");
            return;
        }
        let oldPath = session.tab.replace("README.md","");
        let newPath = "domain/" + name + "/";
        Object.keys(model).filter(key => key.startsWith(oldPath)).forEach(key => {
            model[key.replace(oldPath,newPath)] = model[key];
            delete model[key];
        });
        Object.keys(documentation).filter(key => key.startsWith(oldPath)).forEach(key => {
            documentation[key.replace(oldPath,newPath)] = documentation[key];
            delete documentation[key];
        });
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(newPath + "README.md");
        session.subdomain_names = Subdomains.list();
        })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    session.subdomain_names = Subdomains.list();
});

window.Aggregates = {
    list: function(){
        let resultset = [];
        Object.keys(model).filter(key => key.startsWith('domain/') && key.endsWith("/root.xml")).forEach(key => {
            resultset.push(Aggregates.get(key));
        });
        return resultset;
    },
    get: function(path){
        let root = model[path]["aggregate"];
        root.field = make_sure_is_list(root.field);

        let events = Modeler.get_child_models(path.replace("root.xml","events/"),"event",function(event){
            event.field = make_sure_is_list(event.field);
            event[NESTED] = make_sure_is_list(event[NESTED]);
            event[NESTED].forEach(nested => {
                nested.field = make_sure_is_list(nested.field);
            });
        });

        let flows = Modeler.get_child_models(path.replace("root.xml","behavior-flows/"),"command",Behavior.repair);

        let entities = Modeler.get_child_models(path.replace("root.xml","entities/"),NESTED,function(entity){
            entity.field = make_sure_is_list(entity.field);
        });

        let handlers = Modeler.get_child_models(path.replace("root.xml","event-handlers/"),HANDLER,function(handler){
            handler.mapping = make_sure_is_list(handler.mapping);
            handler[NESTED_MAPPING] = make_sure_is_list(handler[NESTED_MAPPING]);
            handler[NESTED_MAPPING].forEach(nested => {
                nested.mapping = make_sure_is_list(nested.mapping);
            });
        });

        if (!root["att_event-ttl"]){root["att_event-ttl"] = -1};
        if (!root["att_snapshot-interval"]){root["att_snapshot-interval"] = 100};
        if (!root["att_backup-interval-days"]){root["att_backup-interval-days"] = 0};
        if(!root["att_backup-ttl-days"]){root["att_backup-ttl-days"] = 0};
        return Alpine.reactive({
            root: root,
            events: events,
            flows: flows,
            entities: entities,
            handlers: handlers,
            subdomain: path.split('/')[1],
            name: path.split('/')[2],
            path: path
        });
    },
    load_navigation: function(){
        session.aggregates = {};
        Aggregates.list().forEach(aggregate => {
            if (aggregate.subdomain in session.aggregates){
                session.aggregates[aggregate.subdomain].push(aggregate);
            } else {
                session.aggregates[aggregate.subdomain] = [aggregate];
            }
        });
    },
    load: function(file){
        session.type = "aggregate";
        tab_state.aggregate = Aggregates.get(file);
        Modeler.load_documentation(file.replace(".xml",".md"));
        if(!tab_state.handler_mode){tab_state.handler_mode = 'table'};
        if(!tab_state.view){tab_state.view = "document"};
        if(!tab_state.handler_selected_entity){tab_state.handler_selected_entity = 'root'};
        if(tab_state.handler_selected_entity == 'root'){tab_state.handler_entity = tab_state.aggregate};
        if(!tab_state.handler_selected_source){tab_state.handler_selected_source = 'root'};
        try{
            Aggregates.load_document_model(tab_state.view);
        }catch{}
        try{
            Aggregates.force_select_event(tab_state.event);
        }catch(err){console.error("--->",err)}
    },
    load_document_model: function(view, selected_event=""){
        let model = ""
        if (tab_state.document_model){
            model = tab_state.document_model.att_name;
        }

        if (view == "document"){
            tab_state.document_model = tab_state.aggregate.root;
            tab_state.nested_documents = tab_state.aggregate.entities;
        } else {
            tab_state.document_model = tab_state.aggregate.events.filter(x => x.att_name == selected_event).at(0);
            tab_state.nested_documents = tab_state.document_model[NESTED];
        }
        if (model != tab_state.document_model.att_name){
            tab_state.document_selected_entity = "root";
        }
    },
    create_new: blockingDecorator(function(subdomain){
        let name = "NewAggregate";
        let path = "domain/" +subdomain + "/" + name + "/root.xml";
        let doc = "domain/" +subdomain + "/" + name + "/root.md";
        let added = Modeler.insert_model(path,{
            "aggregate": {
                "att_name": name,
                "att_business-key": "fieldName",
                "field": [{
                    "att_name": "fieldName",
                    "att_type": "String"
                }]
            }
        });
        Modeler.insert_documentation(doc,"~~Aggregate model template~~");
        if (added){
            setTimeout(function(){
                Navigation.execute_open_tab(path);
            },500);
        }
    }),
    remove: blockingDecorator(function(){
        if (!session.tab.startsWith("domain/") && !session.tab.endsWith("/root.xml")){
            Session.show_exception("Could not remove aggregate: " + session.tab);
            return
        }
        let path = session.tab.replace("","");
        Object.keys(model).filter(key => key.startsWith(path)).forEach(key => {delete model[key]});
        Object.keys(documentation).filter(key => key.startsWith(path)).forEach(key => {delete documentation[key]});
        Navigation.execute_close_tab(session.tab);
        Modeler.render();
    }),
    rename:blockingDecorator(function(name){
        if (!session.tab.startsWith("domain/") && !session.tab.endsWith("/root.xml")){
            Session.show_exception("Could not rename aggregate: " + session.tab);
            return
        }
        if (!name.match(pascal_cased)){
            Session.show_exception("Aggregate name must be PascalCased");
            return;
        }
        let oldPath = "domain/" + tab_state.aggregate.subdomain + "/" + tab_state.aggregate.root.att_name + "/";
        let newPath = "domain/" + tab_state.aggregate.subdomain + "/" + name + "/";
        tab_state.aggregate.root.att_name = name;
        tab_state.aggregate.name = name;
        Object.keys(model).filter(key => key.startsWith(oldPath)).forEach(key => {
            model[key.replace(oldPath,newPath)] = model[key];
            delete model[key];
        });
        Object.keys(documentation).filter(key => key.startsWith(oldPath)).forEach(key => {
            documentation[key.replace(oldPath,newPath)] = documentation[key];
            delete documentation[key];
        });
        Navigation.execute_close_tab(session.tab);
        Navigation.execute_open_tab(newPath + "root.xml");
        Modeler.render();
    }),
    add_element_collection: blockingDecorator(function(){
        let path = session.tab.replace("root.xml","entities/newEntity.xml");
        model[path] = {
            "nested-object": {
                att_name: "newEntity",
                "att_business-key" : "newField",
                field: [{
                    att_name: "newField",
                    att_type: "String"
                }]
            }
        };
        Navigation.reload_tab();
    }),
    remove_element_collection: blockingDecorator(function(name){
        let path = `domain/${tab_state.aggregate.subdomain}/${tab_state.aggregate.root.att_name}/entities/${name}.xml`;
        let doc  = `domain/${tab_state.aggregate.subdomain}/${tab_state.aggregate.root.att_name}/entities/${name}.md`;
        delete model[path];
        delete documentation[path];
        Navigation.reload_tab();
    }),
    rename_collection: blockingDecorator(function(oldName,newName){
        setTimeout(function(){
            let root = session.tab.replace("root.xml","entities/");
            let oldPath = root + oldName;
            let newPath = root + newName;
            console.log(oldPath,newPath);
            model[newPath + ".xml"] = model[oldPath + ".xml"];
            delete model[oldPath + ".xml"];
            documentation[newPath + ".md"] = documentation[oldPath + ".md"];
            delete documentation[oldPath + ".md"];
            Aggregates.load(session.tab);
        },1000);
    }),
    add_collection_to_event: blockingDecorator(function(){
        if (tab_state.nested_documents.filter(x => x.att_name == "newEntity").length != 0){
            return;
        }
        tab_state.nested_documents.push({
            att_name: "newEntity",
            field: [{
                att_name: "newField",
                att_type: "String"
            }]
        });
        Navigation.reload_tab();
    }),
    remove_collection_from_event: blockingDecorator(function(name){
        tab_state.nested_documents = tab_state.nested_documents.filter(x => x.att_name != name);
        tab_state.document_model[NESTED] = tab_state.nested_documents;
        setTimeout(Navigation.reload_tab,100);
    }),
    change_view: blockingDecorator(function(view){
        tab_state.view = "";
        setTimeout(function(){tab_state.view = view},100);
    }),
    force_select_event: function(event){
        if (tab_state.aggregate.events.filter(x => x.att_name == event.att_name).length == 0){
            event = null;
        } else {
            event = tab_state.aggregate.events.filter(x => x.att_name == event.att_name).at(0);
        }
        if (event){
            tab_state.selected_event = event.att_name;
            tab_state.event = event;
        }else{
            tab_state.event = tab_state.aggregate.events.at(0);
            tab_state.selected_event = tab_state.event.att_name;
        }
        let handlers = tab_state.aggregate.handlers.filter(x => x.att_on == tab_state.selected_event);
        if (handlers.length != 0){
            tab_state.handler = handlers.at(0);
        }else{
            let handler = {
                att_on: tab_state.selected_event,
                mapping: [],
                "nested-mapping": []
            };
            let path = tab_state.aggregate.path.replace("root.xml",`event-handlers/${event.att_name}.xml`);
            model[path] = {};
            model[path][HANDLER] = handler;
            tab_state.handler = model[path][HANDLER];
        }
        if(!tab_state.handler_selected_entity){
            tab_state.handler_selected_entity = "root";
            tab_state.handler_entity = tab_state.aggregate.root;
        }
    },
    select_event: blockingDecorator(function(event){
        Aggregates.force_select_event(event);
    }),
    sync_handler: function(){
        let path = tab_state.aggregate.path.replace("root.xml",`event-handlers/${tab_state.event.att_name}.xml`);
        if (!(path in model)){
            model[path] = {};
        }
        model[path][HANDLER] = tab_state.handler;
    },
    switch_handler_type: blockingDecorator(function(){
        if ('att_code' in tab_state.handler){
          delete tab_state.handler.att_code;
        }else{
          tab_state.handler.att_code = '';
          tab_state.handler.mapping = [];
          tab_state.handler[NESTED_MAPPING] = [];
          delete tab_state.handler['att_business-key'];
        };
        tab_state.aggregate.handlers = tab_state.aggregate.handlers.map(x => {
            if (x.att_on == tab_state.handler.att_on){
                return tab_state.handler;
            } else {
                return x;
            }
        });
    }),
    create_new_event: blockingDecorator(function(name){
        if (!name.match(pascal_cased)){
            Session.show_exception("Domain event name must be PascalCased");
            return;
        }
        let events = Events.list().map(x => x.att_name);
        if(events.includes(name)){
            Session.show_exception("This domain already contains an event with the name: " + name);
            return;
        }
        let aggregate = tab_state.aggregate;
        let path = aggregate.path.replace("root.xml",`events/${name}.xml`);
        console.log(aggregate);
        let event = {
          att_name: name,
          att_source: `${aggregate.subdomain}.${aggregate.root.att_name}`,
          att_type: "DomainEvent",
          field: JSON.parse(JSON.stringify(aggregate.root.field.filter(x => field_types.includes(x.att_type)))),
          "nested-object": JSON.parse(JSON.stringify(aggregate.entities))
        }
        event["nested-object"].forEach(nested => {
            nested.field = nested.field.filter(x => field_types.includes(x.att_type));
        });
        model[path] = {event:event};
        Navigation.fresh_reload(aggregate.path);
        tab_state.view = 'events';
        tab_state.selected_event = event.att_name;
        tab_state.event = event;
        tab_state.handler = {
            att_on: name,
            mapping: [],
            "nested-mapping": []
        };
        path = aggregate.path.replace("root.xml",`event-handlers/${name}.xml`);
        model[path] = {};
        model[path][HANDLER] = tab_state.handler;
    }),
    delete_event: blockingDecorator(function(){
        let name = tab_state.selected_event;
        let aggregate = tab_state.aggregate;
        let event_path = aggregate.path.replace("root.xml",`events/${name}.xml`);
        let handler_path = aggregate.path.replace("root.xml",`event-handlers/${name}.xml`);
        delete model[event_path];
        delete model[handler_path];
        Navigation.fresh_reload(aggregate.path);
        tab_state.view = 'events';
    })
}

document.addEventListener('tracepaper:model:loaded', async () => {
    Aggregates.load_navigation();
});

document.addEventListener('tracepaper:model:prepare-save', () => {
    Aggregates.list().forEach(aggregate => {
        aggregate.root.att_name = aggregate.name;
        if (aggregate.root['att_backup-interval-days'] == 0){
            aggregate.root['att_backup-ttl-days'] = 0;
        }
        aggregate.root.field.forEach(field => {
            delete field.att_pk;
        });
        aggregate.entities.forEach(entity => {
            entity.field.forEach(field => {
                delete field.att_pk;
            });
        });
        aggregate.handlers.forEach(handler => {
            try{
            let path = aggregate.path.replace("root.xml",`event-handlers/${handler.att_on}.xml`);
            let check = make_sure_is_list(handler[NESTED_MAPPING]).length;
            handler[NESTED_MAPPING] = make_sure_is_list(handler[NESTED_MAPPING]).filter(x => x.mapping.length != 0);
            if (!handler.att_code && handler[NESTED_MAPPING].length == 0 && handler.mapping.length == 0){
                FileSystem.hardDelete(path);
            } else if (check != make_sure_is_list(handler[NESTED_MAPPING]).length){
                let obj = {};
                obj[HANDLER] = handler;
                FileSystem.hardWrite(path, obj);
            }
            }catch(err){console.error(err)}
        });

        //Validation
        Validation.must_be_camel_cased(aggregate.path,aggregate.root.field,"Document field","att_name")
        aggregate.entities.forEach(entity => {
            Validation.must_be_camel_cased(aggregate.path,entity.field,`Document collection (${entity.att_name}) field`,"att_name")
        });
        aggregate.events.forEach(event=>{
            Validation.must_be_camel_cased(aggregate.path,event.field,`Field in event (${event.att_name})`,"att_name");
            event[NESTED].forEach(nested => {
                Validation.must_be_camel_cased(aggregate.path,nested.field,`Field in event (${event.att_name}) collection (${nested.att_name})`,"att_name");
            });
        })
    });
});
