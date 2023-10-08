
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
            alert(err);
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
    if (Object.keys(model).length == 0 || Object.keys(documentation).length == 0){
        console.error("Model is empty, nothing to save.");
        return;
    }
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
                file => file != "meta.json" && !(file in documentation) && !(file in model) && !(file in code) && !(file in logs)
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
    }catch(err){
        console.error(err);
    }
    save_model_to_disk_block = false;
}

async function load_file(file){
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
    else if(file.endsWith(".md")){
        documentation[file] = {content:content};
    }else if(file.endsWith(".log")){
        logs[file] = content;
    }
    else {
        console.log(file,content);
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