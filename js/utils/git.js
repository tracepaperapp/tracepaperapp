class GitRepository {
  static worker = null;
  static url = null;
  static callbacks = {};
  static last_pull = 0;
  static commit_diff = {};

  // Open de repository en initialiseer de worker
  static async open(repoUrl) {
    if (!GitRepository.worker) {
      GitRepository.worker = new Worker('/js/webworkers/gitWorker.js');
      GitRepository.worker.onmessage = (event) => {
        GitRepository.callbacks[event.data.request_id](event);
        delete GitRepository.callbacks[event.data.request_id];
      };
    }
    let repo = new GitRepository(repoUrl);
    if (!GitRepository.url){
        GitRepository.url = repoUrl;
        await repo._sendMessage({
          action: 'initialize',
          pullInterval: 60000, // Standaard pull-interval
        });
    } else if (GitRepository.url != repoUrl){
        throw new Error(`The GIT worker is already initialized on repo [${GitRepository.url}] if you want to connect to [${repoUrl}] you have to execute the reset function first!`);
    }
    return repo;
  }

  static reset(){
    GitRepository.worker.terminate();
    GitRepository.worker = null;
    GitRepository.url = null;
    GitRepository.callbacks = {};
  }
  constructor(repoUrl) {
    this.repoUrl = repoUrl;
  }

  // Bestandslijst
  async list() {
    return this._sendMessage({ action: 'list' });
  }

  // Bestandsinhoud lezen
  async read(filePath) {
    return this._sendMessage({ action: 'read', filePath });
  }

  // Schrijven naar een bestand
  async write(filePath, content) {
    return this._sendMessage({
      action: 'write',
      filePath,
      content,
    });
  }

  // Bestand verwijderen
  async delete(filePath) {
    return this._sendMessage({
      action: 'delete',
      filePath,
    });
  }

  // Geef de status van gestagede wijzigingen
  async status(diff=false) {
    return this._sendMessage({ action: 'status', diff });
  }

  // Revert de wijzigingen van een bestand
  async revert(filePath) {
    return this._sendMessage({
      action: 'revert',
      filePath,
    });
  }

  async fetchRemoteFile(filePath){
    return this._sendMessage({
      action: 'fetchRemoteFile',
      filePath,
    });
  }

  // Commit gestagede wijzigingen
  async commit(message) {
    return this._sendMessage({
      action: 'commit',
      message,
    });
  }

  async hasUnpushedChanges() {
    return this._sendMessage({ action: 'checkUnpushedChanges' });
  }

  // Push de wijzigingen naar de remote repository
  async push() {
    return this._sendMessage({ action: 'push' });
  }

  // Algemene methode om berichten naar de worker te sturen en resultaten te verwerken
  _sendMessage(message) {
    message.request_id = Draftsman.uuidv4();
    message.token = sessionStorage.proxyToken;
    message.repoUrl = GitRepository.url;
    return new Promise((resolve, reject) => {
      GitRepository.callbacks[message.request_id] = function(event){
        if (event.data && event.data.result) {
          resolve(event.data.result);
          GitRepository.last_pull = event.data.last_pull;
          GitRepository.commit_diff = event.data.commit_diff;
        } else if (event.data.error) {
          reject(new Error(event.data.error));
        }
      };
      GitRepository.worker.postMessage(message);
    });
  }
}