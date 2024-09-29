import http from '/js/http.js';

const dir = '/project';
const proxy = "https://git.draftsman.io";
var fs = null;
var branch = "main";
var CHANGES = false;
var filesystemInitialized = false;

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
    // TODO check if not interferes with delete function
    const files = await FileSystem.listFiles(); // Haal alle bestanden op in het model
    window.ModelValidator.validateModel(files);
    setTimeout(async function(){
        console.log("Checkout branch", localStorage.project_drn + ":" + branch);
        try{
            await FileSystem.checkout_branch(branch);
        }catch(exception){
            console.error("checkout failed -->",exception);
        }
        filesystemInitialized = true;
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
        if (["config.xml","meta.json"].includes(filepath)){
            console.log("Skip deletion of " + filepath + " because it is delete protected");
            return;
        }
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
    if (!filesystemInitialized){return;};
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