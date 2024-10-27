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
    let staged = await this.checkForStagedChanges();
    if (!staged){
        await isogit.fetch({fs,dir: dir,http: http});
        await isogit.pull({fs,http,dir: dir});
        this.last_pull = Date.now();
    } else {
        this.commit_diff = await getCommitsDifference();
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

// Fetch remote changes
async function fetchRemoteChanges(repoUrl) {
  await isogit.fetch({
    fs,
    http,
    dir,
    corsProxy: proxy,
    url: repoUrl,
    ref: 'main',
    singleBranch: true
  });
}

// Merge remote changes without overwriting local changes
async function mergeRemoteChanges() {
  const mergeResult = await isogit.merge({
    fs,
    dir,
    ours: 'main',
    theirs: 'origin/main',
    fastForwardOnly: false
  });
  if (!mergeResult.alreadyMerged && !mergeResult.fastForward && !mergeResult.clean) {
    console.log('Merge conflicts detected. Local changes preserved.');
  } else {
    console.log('Merge successful.');
  }
}

// Stage local changes
async function stageLocalChanges() {
  const status = await isogit.statusMatrix({ fs, dir });
  for (let [filepath, , workdirStatus, stageStatus] of status) {
    if (workdirStatus !== stageStatus) {
      await isogit.add({ fs, dir, filepath });
    }
  }
}

// Bestandsbeheer functies
async function listFiles() {
  //return await isogit.listFiles({ fs, dir: dir, ref: 'HEAD' });
  // Haal de status van alle bestanden op en filter deze om alleen de bestaande bestanden te tonen
    const statusMatrix = await isogit.statusMatrix({ fs, dir });

    // Filter de bestanden die daadwerkelijk in de index staan en zijn bijgewerkt
    const fileList = statusMatrix
      .filter(([filepath, headStatus, workdirStatus, stageStatus]) => {
        console.log(filepath, headStatus, workdirStatus, stageStatus);
        return headStatus > 0 || workdirStatus > 0 || stageStatus > 0;
      })
      .map(([filepath]) => filepath);

    return fileList;
}

async function readFile(filePath) {
  return await pfs.readFile(`${dir}/${filePath}`, 'utf8');
}

async function writeFile(filePath, content) {
  await pfs.writeFile(`${dir}/${filePath}`, content, 'utf8');
  await isogit.add({ fs, dir, filepath: filePath });
}

async function deleteFile(filePath) {
  await pfs.unlink(`${dir}/${filePath}`);
  await isogit.remove({ fs, dir, filepath: filePath });
}

// https://isomorphic-git.org/docs/en/statusMatrix
var remoteStatuses = { remoteStatuses: {}, hasDiverged: false };

async function status(diff = false) {
  const statuses = await isogit.statusMatrix({ fs, dir });

  // Alleen remote statuses ophalen als 'diff' waar is
  this.remoteStatuses = diff ? await getRemoteStatuses() : this.remoteStatuses;

  const statusResults = await Promise.all(statuses.map(async ([filepath, headStatus, workdirStatus, stageStatus]) => {
      let status = 'unmodified';
      let hasConflict = false;

      // Nieuw bestand, niet gestaged (untracked)
      if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
        status = 'untracked';
      }
      // Nieuw bestand, volledig gestaged (added)
      else if (headStatus === 0 && stageStatus === 2) {
        status = 'added';
      }
      // Bestand bestaat in HEAD, gewijzigd in werkdirectory en niet gestaged (modified, unstaged)
      else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 1) {
        status = 'modified (unstaged)';
      }
      // Bestand bestaat in HEAD, volledig gestaged en werkdirectory komt overeen met staging (modified, staged)
      else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 2) {
        status = 'modified (staged)';
      }
      // Bestand is verwijderd (deleted), maar nog niet gestaged
      else if (headStatus === 1 && workdirStatus === 0 && stageStatus === 1) {
        status = 'deleted (unstaged)';
      }
      // Bestand is verwijderd (deleted) en gestaged voor commit
      else if (headStatus === 1 && workdirStatus === 0 && stageStatus === 0) {
        status = 'deleted (staged)';
      }

      // Check voor conflicts door te kijken naar de delta van de remote en lokale commit-geschiedenis
      const remoteStatus = this.remoteStatuses.remoteStatuses[filepath];
      if (this.remoteStatuses.hasDiverged && remoteStatus && (workdirStatus === 2 || stageStatus === 2)) {
        const hasRemoteChanges = await checkForRemoteChanges(filepath);
        hasConflict = hasRemoteChanges;
        if (hasConflict) status += ' (conflict)';
      }

      return {
        filePath: filepath,
        status: status,
        hasConflict: hasConflict,  // Voeg een veld toe om aan te geven of er een conflict is
      };
    }));

    return statusResults;
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

// Controleer of een bestand remote gewijzigd is sinds de laatste lokale commit
async function checkForRemoteChanges(filepath) {
  // Haal de logs van de lokale en remote branch op voor het specifieke bestand
  const localLogs = await isogit.log({ fs, dir, ref: 'HEAD', filepaths: [filepath] });
  const remoteLogs = await isogit.log({ fs, dir, ref: 'origin/main', filepaths: [filepath] });

  // Vergelijk de laatste commit van lokaal en remote
  const localCommit = localLogs[0] ? localLogs[0].oid : null;
  const remoteCommit = remoteLogs[0] ? remoteLogs[0].oid : null;

  // Als de remote commit verschilt van de lokale commit, is het bestand remote gewijzigd
  return localCommit !== remoteCommit;
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

async function commitChanges(message,repoUrl) {
  await stageLocalChanges();
  await fetchRemoteChanges(repoUrl);
  await mergeRemoteChanges();
  await isogit.commit({
    fs,
    dir,
    author: { name: 'User', email: 'user@example.com' },
    message
  });
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
  await isogit.push({
    fs,
    http,
    dir,
    corsProxy: proxy
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
