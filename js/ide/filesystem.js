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
        await git.clone({
            fs,
            http,
            dir,
            url: localStorage.project_repo,
            corsProxy: proxy,
            singleBranch: true,
            depth: 1,
            ref: 'main'
             });

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
            await commit_files_locally();
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
    setTimeout(async () => {
        let files = await FileSystem.listFiles();
        await window.ModelValidator.validateModel(files);
    }, 200);
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
var file_list_cache = null;

window.FileSystem = {
    force_pull: async function(){
        if (confirm("All unpublished changes will be lost. Do you want to continue?")){
            await FileSystem.generate_zip();
            await sleep(1000);
            let repo = sessionStorage.checkout;
            sessionStorage.removeItem("modified_files");
            sessionStorage.removeItem("checkout");
            indexedDB.deleteDatabase(repo);
            location.reload();
        }
    },
    generate_zip: async function() {
        const zip = new JSZip();
        const files = await FileSystem.listFiles();

        for (const file of files) {
          const content = await FileSystem.read(file);
          zip.file(file, content);
        }

        // Generate the zip file and trigger the download
        zip.generateAsync({ type: 'blob' }).then((content) => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(content);
          link.download = localStorage.project_name + '-model-'+ generateBuildId().replaceAll("-","").replace("T","").replace(":","") +'.zip';
          link.click();
        });
      },
    listFiles: async function(){
        if (file_list_cache == null){
            file_list_cache = await git.listFiles({ fs, dir: dir, ref: 'HEAD' });
            setTimeout(function(){file_list_cache = null},10000);
        }
        return [...file_list_cache];
    },
    read: async function(filepath){
        await sleep(Math.floor(Math.random() * 5 ));
        try{
            return await fs.promises.readFile(dir + "/" + filepath, "utf8");
        } catch {
            if (filepath.endsWith(".md")){
                return "documentation";
            } else {
                try{
                    await sleep(Math.floor(Math.random() * 5 ));
                    return await fs.promises.readFile(dir + "/" + filepath, "utf8");
                } catch {
                    return "file not found";
                }
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
        if (!sessionStorage.getItem("commit-message")) {
            sessionStorage.setItem("commit-message",prompt("What are you working on?"));
        }
        await FileSystem.commit(sessionStorage.getItem("commit-message"));
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
    },
    checkForUnpushedCommits: async function() {
      try {
        // Haal de lokale HEAD commit hash op
        const localCommit = await git.resolveRef({ fs, dir, ref: branch });

        // Haal de remote HEAD commit hash op
        const remoteCommit = await git.resolveRef({
          fs,
          dir,
          ref: `origin/${branch}`,
        });

        // Als de hashes niet overeenkomen, zoek naar niet-gepushte bestanden
        if (localCommit !== remoteCommit) {
          let modifiedFiles = {};

          // Vergelijk de laatste lokale commit met de remote HEAD om de niet-gepushte wijzigingen te vinden
          await git.walk({
            fs,
            dir,
            trees: [
              git.TREE({ ref: localCommit }),  // laatste lokale commit
              git.TREE({ ref: remoteCommit })  // remote HEAD
            ],
            map: async (filepath, [A, B]) => {
              if (filepath == "." || !filepath.includes(".")) {
                //pass
              } else if (A && B && (await A.oid()) !== (await B.oid())) {
                modifiedFiles[filepath] = "changed"; // Alleen gewijzigde bestanden toevoegen
              } else if (A && !B) {
                modifiedFiles[filepath] = "added"; // Toegevoegde bestanden toevoegen
              } else if (!A && B) {
                modifiedFiles[filepath] = "removed"; // Verwijderde bestanden toevoegen
              }
            }
          });

          session.unsaved_files = true;
          let pending = Object.keys(modifiedFiles).length; // Aantal unieke gewijzigde bestanden
          if (session.pending_commits != pending && pending != 0 && session.issues.length == 0){
            playAlert(JSON.parse(localStorage["_x_ready_sound"]));
          }
          session.pending_commits = pending;
          session.modified_files = modifiedFiles;
          sessionStorage.modified_files = JSON.stringify(modifiedFiles);
        } else {
          session.unsaved_files = false;
          session.pending_commits = 0;
          session.modified_files = null;
        }
      } catch (err) {
        console.error('Fout tijdens het controleren op niet-gepushte bestanden:', err);
      }
    },
    push: async function() {
            try {
              // Attempt to push changes
              await FileSystem.pull();
              let pushResult = await git.push({
                fs,
                http,
                dir: dir,
                remote: 'origin',
                force: true,
                ref: branch,
                corsProxy: proxy
              });
              console.log('Push successful:', pushResult);
              sessionStorage.removeItem("commit-message");
              // Pull after a successful push
              await FileSystem.pull();
              console.log('Pull successful after push');
            } catch (err) {
              // Log any errors that occur during the push or pull process
              console.error('Error during push or pull operation:', err);
            }
          },
    pull: async function(){
          localStorage.pulling = true;
          try {
            await git.fetch({ fs, dir, http });
            await git.pull({ fs, http, dir });
          } catch (err) {
            console.error('Error during pull operation:', err);

            // If there is a merge conflict error, resolve it by forcing local changes
            if (err.message.includes('Merge conflict')) {
              await forceLocalMerge();
            }
          } finally {
            session.last_pull = getCurrentTime();
            await sleep(100);
            localStorage.pulling = false;
          }
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
async function commit_files_locally(){
    try{
        if (!filesystemInitialized){return;};
        if(await FileSystem.staged_files()){
            if (push_lock){return};
            push_lock = true;
            try{
                let prev = session.issues.length;
                let errors = await validate_and_repair_model();
                if (errors.length > prev){
                    playAlert(JSON.parse(localStorage["_x_issue_sound"]));
                }
                if (session.pending_commits != 0 &&
                    prev != 0 && errors.length == 0){
                    playAlert(JSON.parse(localStorage["_x_ready_sound"]));
                }
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
            }finally{
                push_lock = false;
            }
        }
        else {
            session.saving = false;
            FileSystem.checkForUnpushedCommits();
            pull_countdown -= 1;
            if (pull_countdown == 0){
                pull_countdown = 60;
                await FileSystem.pull();
                Navigation.soft_reload();
            }
        }
    } finally {
        setTimeout(commit_files_locally,1000);
    }
}
if (location.pathname == "/"){
    setTimeout(commit_files_locally,1000);
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

async function forceLocalMerge() {
  try {
    console.log("Force merging local changes...");

    // Fetch the latest changes from the remote repository
    await git.fetch({ fs, http, dir });

    // Merge, forcing local changes to overwrite conflicts
    let mergeResult = await git.merge({
      fs,
      dir,
      ours: branch,
      theirs: `origin/${branch}`,
    });

    // Check if the merge failed (i.e., conflicts exist)
    if (mergeResult.failed) {
      console.log('Conflicts found, forcing local changes...');

      // Get the list of conflicting files and forcefully add them to the index
      const statusMatrix = await git.statusMatrix({ fs, dir });

      for (let [filepath, , workdirStatus, stageStatus] of statusMatrix) {
        if (workdirStatus === 2 && stageStatus === 3) {
          // File with conflict: stage the local version to resolve the conflict
          await git.add({ fs, dir, filepath });
        }
      }

      // Commit the resolved conflicts with a message
      await git.commit({
        fs,
        dir,
        author: {
          name: context.fullName,
          email: context.username + '@example.com',
        },
        message: 'Forcefully resolved merge conflicts by keeping local changes',
      });

      console.log('Merge conflicts resolved by keeping local changes.');
    } else {
      console.log('Merge successful with no conflicts.');
    }
  } catch (err) {
    console.error('An error occurred during the force merge:', err);
  }
}
