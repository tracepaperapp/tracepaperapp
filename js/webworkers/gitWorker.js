/*console.trace = function(){};
console.log = function(){};
console.warning = function(){};
console.error = function(){};//*/

importScripts('/js/tp/isomorphic-git.js');
importScripts('/js/tp/lightning-fs.js');
importScripts('/js/tp/http.js');

const isogit = self.git;
const root_http = self.GitHttp || self.http;
const http = deepCloneWithMethods(root_http);
var token = "";
var last_pull = 0;
var commit_diff = {};

// Pas custom headers toe
http["request"] = async function(options) {
  options.headers["x-proxy-token"] = token;
  return root_http.request(options);
};

var fs = null;
var pfs = null;
let dir = '/';
let proxy = 'https://git.draftsman.io';

self.onmessage = async (event) => {
  const { action, repoUrl, filePath, content, message, request_id, token, pullInterval = 60000, diff = false } = event.data;
  this.token = token;
  try {
    switch (action) {
      case 'initialize':
        await initializeRepo(repoUrl, pullInterval);
        postMessage({ result: 'Repository initialized', request_id, last_pull, commit_diff });
        break;

      case 'list':
        const fileList = await listFiles();
        postMessage({ result: fileList, request_id, last_pull, commit_diff });
        break;

      case 'read':
        const fileContent = await readFile(filePath);
        postMessage({ result: fileContent, request_id, last_pull, commit_diff });
        break;

      case 'write':
        await writeFile(filePath, content);
        postMessage({ result: `File ${filePath} written and staged`, request_id, last_pull, commit_diff });
        break;

      case 'rename':
        await renameFile(event.data.oldName, event.data.newName, event.data.force);
        postMessage({ result: `File renamed from ${event.data.oldName} to ${event.data.newName}`, request_id, last_pull, commit_diff });
        break;

      case 'delete':
        await deleteFile(filePath);
        postMessage({ result: `File ${filePath} deleted and staged`, request_id, last_pull, commit_diff });
        break;

      case 'deleteDirectory':
        await deleteDirectoryRecursively(filePath);
        postMessage({ result: `Directory ${filePath} deleted and staged`, request_id, last_pull, commit_diff });
        break;

      case 'moveDirectory':
        await moveDirectoryRecursively(event.data.sourcePath, event.data.targetPath);
        postMessage({ result: `Directory moved from ${event.data.sourcePath} to ${event.data.targetPath}`, request_id });
        break;

      case 'status':
        const statusList = await status(diff);
        postMessage({ result: statusList, request_id, last_pull, commit_diff });
        break;

      case 'revert':
        await revertFile(filePath);
        postMessage({ result: `File ${filePath} reverted`, request_id, last_pull, commit_diff });
        break;

      case 'commit':
        await commitChanges(message,repoUrl);
        postMessage({ result: `Changes committed: ${message}`, request_id, last_pull, commit_diff });
        break;

      case 'checkUnpushedChanges':
        const unpushed = await hasUnpushedChanges(repoUrl);
        postMessage({ result: unpushed, request_id, last_pull, commit_diff });
        break;

      case 'push':
        await pushChanges();
        postMessage({ result: 'Changes pushed to remote', request_id, last_pull, commit_diff });
        break;

      case 'fetchRemoteFile':
        const remoteContent = await fetchRemoteFile(filePath);
        postMessage({ result: remoteContent, request_id, last_pull, commit_diff });
        break;

      default:
        postMessage({ error: 'Unknown action', request_id, last_pull, commit_diff });
    }
  } catch (error) {
    console.log(event);
    console.log(error);
    console.error(error.stack);
    postMessage({ error: error.message, request_id, last_pull });
  }
};

// Initialiseer de repository
async function initializeRepo(repoUrl, pullInterval, author = "j.doe") {
  if (!fs) {
    fs = new LightningFS(repoUrl.replace("https://github.com/", ""));
    pfs = fs.promises;
  } else {
    throw new Error("Git worker already attached to a repository!");
  }

  const dirExists = await pfs.readdir(dir).catch(() => false);

  if (dirExists.length === 0) {
    await cloneRepo(repoUrl, author);
    this.last_pull = Date.now();
  } else {
    let staged = await this.checkForStagedChanges();
    if (!staged){
        await isogit.fetch({fs,dir: dir,http: http});
        await isogit.pull({fs,http,dir: dir});
        this.last_pull = Date.now();
    } else {
        this.commit_diff = await getCommitsDifference();
    }
  }

  // Zet een interval voor het pullen van wijzigingen
  setInterval(async () => {
    try{
        let staged = await this.checkForStagedChanges();
        if (!staged){
            await isogit.fetch({fs,dir: dir,http: http});
            await isogit.pull({fs,http,dir: dir});
            this.last_pull = Date.now();
        } else {
            this.commit_diff = await getCommitsDifference();
        }
    }catch{
        console.log("Issue with auto pull...");
    }
  }, pullInterval);
}

async function checkForStagedChanges() {
  const statuses = await isogit.statusMatrix({ fs, dir });
  return statuses.some(([filepath, headStatus, workdirStatus, stageStatus]) => stageStatus > 1);
}

// Kloon de repository
async function cloneRepo(repoUrl, author) {
  await isogit.clone({
    fs,
    http,
    dir,
    url: repoUrl,
    corsProxy: proxy,
    singleBranch: true,
    depth: 1,
    ref: 'main'
  });

  await isogit.setConfig({
    fs,
    dir,
    path: 'user.name',
    value: author
  });
}

async function fetchRemoteChanges({ fs, dir, http }) {
  await isogit.fetch({
    fs,
    http,
    dir,
    ref: 'main',
    singleBranch: true,
  });
  console.log('Fetched latest remote changes.');
}

async function decideFileVersion(filepath) {
  const statuses = await isogit.statusMatrix({ fs, dir });

  // Vind de status van het specifieke bestand
  const fileStatus = statuses.find(([file]) => file === filepath);

  if (!fileStatus) {
    throw new Error(`File not found in the repository: ${filepath}`);
  }

  const [, headStatus, workdirStatus, stageStatus] = fileStatus;

  // Regels voor beslissingen
  if (stageStatus > 0) {
    // Er zijn gestagede wijzigingen: gebruik de lokale versie
    console.log(`File ${filepath} has staged changes. Using local version.`);
    return 'local';
  } else if (workdirStatus > 0) {
    // Alleen niet-gestagede wijzigingen: vraag gebruiker om handmatige actie
    console.warn(`File ${filepath} has unstaged changes. Please stage or discard them.`);
    throw new Error(`Unstaged changes detected in ${filepath}.`);
  } else {
    // Geen lokale wijzigingen: gebruik de remote versie
    console.log(`File ${filepath} has no local changes. Using remote version.`);
    return 'remote';
  }
}

async function applyFileVersion(filepath, decision) {
  if (decision === 'local') {
    console.log(`Keeping local version of ${filepath}`);
    // Zorg ervoor dat het bestand in de staging area blijft
    await isogit.add({ fs, dir, filepath });
  } else if (decision === 'remote') {
    console.log(`Using remote version of ${filepath}`);
    // Reset het bestand naar de remote versie
    await isogit.checkout({
      fs,
      dir,
      filepaths: [filepath],
      force: true // Forceer reset naar remote versie
    });
  }
}

async function mergeRemoteChanges() {
  const mergeResult = await isogit.merge({
    fs,
    dir,
    ours: 'main',
    theirs: 'origin/main',
    fastForwardOnly: true, // Forceer fast-forward merge
  });
  console.log(mergeResult);
  if (mergeResult.fastForward) {
    console.log('Fast-forward merge completed.');
  } else if (!mergeResult.clean) {
    console.warn('Conflicts detected. Resolving conflicts...');
    const statuses = await isogit.statusMatrix({ fs, dir });
    for (const [filepath, , , stageStatus] of statuses) {
      if (stageStatus === 3) { // Conflict
        console.log(`Resolving conflict in file: ${filepath}`);
        await isogit.checkout({ fs, dir, filepaths: [filepath], force: true });
      }
    }
    console.log('Conflicts resolved.');
  }
}

async function stageLocalChanges({ fs, dir }) {
  const statuses = await isogit.statusMatrix({ fs, dir });

  for (const [filepath, headStatus, workdirStatus, stageStatus] of statuses) {
    if (workdirStatus !== stageStatus) {
      console.log(`Staging file: ${filepath}`);
      await isogit.add({ fs, dir, filepath });
    }
  }
}


// Bestandsbeheer functies
async function listFiles() {
  //return await isogit.listFiles({ fs, dir: dir, ref: 'HEAD' });
  let all_files = await this.status();
  return all_files.filter(x => !x.status.startsWith("deleted")).map(x => x.filePath);
}

async function readFile(filePath) {
  return await pfs.readFile(`${dir}/${filePath}`, 'utf8');
}

async function writeFile(filePath, content) {
  await createDirectory(filePath);
  await pfs.writeFile(`${dir}/${filePath}`, content, 'utf8');
  await isogit.add({ fs, dir, filepath: filePath });
}

async function createDirectory(filePath){
    var subdir = dir;
    for (const sub of filePath.split('/')){
        if (!sub || sub.includes(".")){
            continue;
        }
        subdir += '/' + sub;
        try{
            await pfs.mkdir(subdir);
        } catch{}
    }
}

async function deleteFile(filePath) {
  await pfs.unlink(`${dir}/${filePath}`);
  await isogit.remove({ fs, dir, filepath: filePath });
}

async function deleteDirectoryRecursively(path) {
  try {
    const entries = await pfs.readdir(dir + path);
    for (const entry of entries) {
      const fullPath = `${dir}${path}/${entry}`;
      const stats = await pfs.stat(fullPath);
      if (stats.isDirectory()) {
        // Recursief de submap verwijderen en stage-en
        await deleteDirectoryRecursively(fullPath);
      } else {
        // Bestand verwijderen en stage-en
        await pfs.unlink(fullPath);
        await isogit.remove({ fs, dir, filepath: fullPath.replace(`${dir}/`, '') });
      }
    }

    // Map verwijderen en stage-en
    await pfs.rmdir(path);
    await isogit.remove({ fs, dir, filepath: path.replace(`${dir}/`, '') });
  } catch (error) {
    console.error(`Error while deleting directory ${path}:`, error);
    throw error;
  }
}

async function moveDirectoryRecursively(sourcePath, targetPath) {
  try {
    const entries = await pfs.readdir(dir + sourcePath);
    for (const entry of entries) {
      const stats = await pfs.stat(`${dir}${sourcePath}/${entry}`);
      let source = sourcePath + '/' + entry;
      let target = targetPath + '/' + entry;

      source = source.replaceAll("//","/");
      target = target.replaceAll("//","/");

      console.log(source, "-->", target, stats.isDirectory());
      if (stats.isDirectory()) {
        await moveDirectoryRecursively(source, target);
      } else {
        await renameFile(source, target, force = true)
      }
    }
  } catch (error) {
    console.error(`Error while moving from ${sourcePath} to ${targetPath}:`, error);
    throw error;
  }
}

// https://isomorphic-git.org/docs/en/statusMatrix
var remoteStatuses = { remoteStatuses: {}, hasDiverged: false };

async function status(diff = false) {
  const statuses = await isogit.statusMatrix({ fs, dir });

  // Alleen remote statuses ophalen als 'diff' waar is
  if (diff) {
    this.remoteStatuses = await getRemoteStatuses();
  }

  const statusResults = await Promise.all(
    statuses.map(([filepath, headStatus, workdirStatus, stageStatus]) =>
      processFileStatus(filepath, headStatus, workdirStatus, stageStatus, this.remoteStatuses)
    )
  );

  return statusResults;
}

async function processFileStatus(filepath, headStatus, workdirStatus, stageStatus, remoteStatuses) {
  let status = getFileStatus(headStatus, workdirStatus, stageStatus);
  let hasConflict = false;

  // Controleer op conflicten
  const remoteStatus = remoteStatuses.remoteStatuses[filepath];
  if (remoteStatuses.hasDiverged && remoteStatus && (workdirStatus === 2 || stageStatus === 2)) {
    const hasRemoteChanges = await checkForRemoteChanges(filepath);
    hasConflict = hasRemoteChanges;
    if (hasConflict) status += ' (conflict)';
  }

  return {
    filePath: filepath,
    status: status,
    hasConflict: hasConflict,
  };
}

function getFileStatus(headStatus, workdirStatus, stageStatus) {
  if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
    return 'untracked';
  } else if (headStatus === 0 && stageStatus === 2) {
    return 'added';
  } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 1) {
    return 'modified (unstaged)';
  } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 2) {
    return 'modified (staged)';
  } else if (headStatus === 1 && workdirStatus === 0 && stageStatus === 1) {
    return 'deleted (unstaged)';
  } else if (headStatus === 1 && workdirStatus === 0 && stageStatus === 0) {
    return 'deleted (staged)';
  }
  return 'unmodified';
}

// Helperfunctie om remote status op te halen
async function getRemoteStatuses() {
  // Fetch remote changes
  await isogit.fetch({
    fs,
    http,
    dir,
    corsProxy: proxy,
    ref: 'main',
    singleBranch: true
  });

  // Haal de laatste commits van de lokale HEAD en de remote origin/main op
  const localCommits = await isogit.log({ fs, dir, ref: 'HEAD', depth: 1 });
  const remoteCommits = await isogit.log({ fs, dir, ref: 'origin/main', depth: 1 });

  const localCommit = localCommits[0] ? localCommits[0].oid : null;
  const remoteCommit = remoteCommits[0] ? remoteCommits[0].oid : null;

  // Vergelijk of de lokale commit gelijk is aan de remote commit
  const hasDiverged = localCommit !== remoteCommit;

  const statuses = await isogit.statusMatrix({
    fs,
    dir,
    ref: 'origin/main'  // Vergelijk met remote branch
  });

  const remoteStatuses = {};
  statuses.forEach(([filepath, headStatus, workdirStatus, stageStatus]) => {
    remoteStatuses[filepath] = { headStatus, workdirStatus, stageStatus };
  });

  return { remoteStatuses, hasDiverged };
}

async function checkForRemoteChanges(filepath) {
  try {
    // Haal de inhoud van het bestand uit de lokale HEAD
    const localContent = await isogit.readBlob({
      fs,
      dir,
      oid: await isogit.resolveRef({ fs, dir, ref: 'HEAD' }),
      filepath,
    });

    // Haal de inhoud van het bestand uit de remote branch
    const remoteContent = await isogit.readBlob({
      fs,
      dir,
      oid: await isogit.resolveRef({ fs, dir, ref: 'origin/main' }),
      filepath,
    });

    // Vergelijk de inhoud
    return localContent.blob.toString('utf8') !== remoteContent.blob.toString('utf8');
  } catch (error) {
    // Als het bestand niet bestaat in een van de branches, markeer het als gewijzigd
    if (error.code === 'NotFoundError') {
      return true;
    }
    throw error;
  }
}

async function fetchRemoteFile(filePath){
    await isogit.fetch({
      fs,
      http,
      dir,
      corsProxy: proxy,
      ref: 'main',
      singleBranch: true
    });
    const remoteCommit = await isogit.resolveRef({
        fs,
        dir,
        ref: 'origin/main' // Gebruik de remote branch referentie
    });
    const remoteFileContent = await isogit.readBlob({
        fs,
        dir,
        oid: remoteCommit,  // Commit oid van de remote branch
        filepath: filePath
    });
    return new TextDecoder("utf-8").decode(remoteFileContent.blob);
}

async function revertFile(filePath) {

  // Reset het bestand alleen in de staging area
  await isogit.resetIndex({ fs, dir, filepath: filePath });

  // Vervolgens de wijzigingen in het bestand "unstagen" door het te verwijderen uit de staging area
  // Dit zorgt ervoor dat het bestand niet meer gestaged is maar de lokale wijzigingen blijven behouden
  await isogit.remove({ fs, dir, filepath: filePath });

  // Als je de lokale werkdirectory ook wilt resetten naar de versie in de HEAD-commit, gebruik dan `checkout`
  await isogit.checkout({
    fs,
    dir,
    filepaths: [filePath],
    force: true // Forceer geen overschrijven van lokale wijzigingen
  });

}

async function pullLatestChanges() {
  try {
    console.log('Pulling latest changes...');
    await isogit.pull({
      fs,
      http,
      dir,
      singleBranch: true,
      ref: 'main',
    });
    console.log('Pull completed.');
    this.last_pull = Date.now();
  } catch (error) {
    console.error('Error during pull:', error.message);
    throw error;
  }
}

async function commitChanges(message,repoUrl,author) {
  try {
    // 1. Fetch remote changes
    console.log('Fetching remote changes...');
    await isogit.fetch({ fs, dir, http, ref: 'main' });

    // 2. Merge remote changes
    console.log('Merging remote changes...');
    await mergeRemoteChanges({ fs, dir });

    // 3. Stage local changes
    console.log('Staging local changes...');
    await stageLocalChanges({ fs, dir });

    const statuses = await isogit.statusMatrix({ fs, dir });

      // Maak een stash van gestagede bestanden
      const stash = {};
      for (const status of statuses) {
        if (status[2] > 0) {
          stash[status[0]] = await readFile(status[0]);
        }
      }

      // 2. Pull wijzigingen van de remote repository
      await pullLatestChanges();

      // 3. Herstel de gestagede bestanden
      console.log("Restoring stashed files...");
      for (const item of Object.entries(stash)) {
        await writeFile(item[0], item[1]);
      }

    // 4. Commit staged changes
    console.log('Committing changes...');
    await isogit.commit({
      fs,
      dir,
      author: author || { name: 'User', email: 'user@example.com' },
      message,
    });

    console.log('Synchronization complete!');
  } catch (error) {
    console.log(error);
    console.error('Error during synchronization:', error.message);
    throw error;
  }
}

async function hasUnpushedChanges(repoUrl) {
  // Fetch remote changes first
  await isogit.fetch({
    fs,
    http,
    dir,
    corsProxy: proxy,
    url: repoUrl,
    ref: 'main',
    singleBranch: true
  });

  // Get local commits log
  const localCommits = await isogit.log({ fs, dir, ref: 'main' });

  // Get remote commits log
  const remoteCommits = await isogit.log({ fs, dir, ref: 'origin/main' });

  // Compare local and remote commits to detect unpushed changes
  const unpushedCommits = localCommits.filter(
    localCommit => !remoteCommits.some(remoteCommit => remoteCommit.oid === localCommit.oid)
  );

  return unpushedCommits.length;
}

async function pushChanges() {
  console.log("PUSH");
  await pullLatestChanges();
  await isogit.push({
    fs,
    http,
    dir,
    corsProxy: proxy,
    ref: 'main',
    force: false
  });
}

async function getCommitsDifference() {
  // Fetch de laatste wijzigingen van de remote branch
  await isogit.fetch({
    fs,
    dir,
    http,
    corsProxy: proxy,
    ref: 'main',
    singleBranch: true
  });

  // Haal de commit logs van de lokale branch en de remote branch op
  const localCommits = await isogit.log({ fs, dir, ref: 'main' });
  const remoteCommits = await isogit.log({ fs, dir, ref: 'origin/main' });

  // Zoek naar de eerste gemeenschappelijke commit (matchende oid)
  const commonCommitIndex = localCommits.findIndex(localCommit =>
    remoteCommits.some(remoteCommit => remoteCommit.oid === localCommit.oid)
  );

  // Bereken het aantal commits sinds de gemeenschappelijke commit voor zowel de lokale als remote branch
  const localAhead = commonCommitIndex >= 0 ? commonCommitIndex : localCommits.length;
  const remoteAhead = commonCommitIndex >= 0
    ? remoteCommits.findIndex(remoteCommit => remoteCommit.oid === localCommits[commonCommitIndex].oid)
    : remoteCommits.length;

  return {
    localAhead: localAhead,
    remoteAhead: remoteAhead
  };
}

async function renameFile(oldName, newName, force = false) {
  try {
    await pfs.stat(`${dir}/${oldName}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    } else {
      throw error;
    }
  }
  try {
    await pfs.stat(`${dir}/${newName}`);
    if (!force) {
      throw new Error(`File ${newName} already exists. Use force to overwrite.`);
    } else {
      await deleteFile(newName);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  await createDirectory(newName);
  await pfs.rename(`${dir}/${oldName}`, `${dir}/${newName}`);
  await isogit.remove({ fs, dir, filepath: oldName });
  await isogit.add({ fs, dir, filepath: newName });
}

// Deep clone met behoud van methodes
function deepCloneWithMethods(obj) {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) return obj.map(item => deepCloneWithMethods(item));

  if (obj instanceof Date) return new Date(obj.getTime());

  if (typeof obj === 'function') return obj;

  const clonedObj = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepCloneWithMethods(obj[key]);
    }
  }

  return clonedObj;
}
