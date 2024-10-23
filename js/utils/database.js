class Database {
  static worker = null;

  static async open(collectionName) {
    if (!Database.worker) {
      Database.worker = new Worker('/js/webworkers/dbWorker.js');
      Database.dbReady = new Promise((resolve, reject) => {
        Database.worker.onmessage = (event) => {
          if (event.data.type === 'dbReady') {
            resolve();
          } else {
            reject(new Error('Error initializing database'));
          }
        };
      });
      Database.worker.postMessage({ action: 'initializeDB', collectionName });
    } else {
      Database.worker.postMessage({ action: 'createCollection', collectionName });
    }
    await Database.dbReady; // Wacht tot de database klaar is
    return new Collection(collectionName);
  }
}

class Collection {
  constructor(collectionName) {
    this.collectionName = collectionName;
  }

  addIndex(field, unique = false) {
    return this._sendMessage({ action: 'addIndex', collectionName: this.collectionName, field, unique });
  }

  add(record) {
    return this._sendMessage({ action: 'add', collectionName: this.collectionName, record });
  }

  get(key) {
    return this._sendMessage({ action: 'get', collectionName: this.collectionName, key });
  }

  getAll() {
    return this._sendMessage({ action: 'getAll', collectionName: this.collectionName });
  }

  findBy(key, value) {
    let criteria = {};
    criteria[key] = value;
    return this._sendMessage({ action: 'findBy', collectionName: this.collectionName, criteria });
  }

  update(key, updatedRecord) {
    return this._sendMessage({ action: 'update', collectionName: this.collectionName, key, updatedRecord });
  }

  remove(key=null,criteria=null) {
    return this._sendMessage({ action: 'remove', collectionName: this.collectionName, key, criteria});
  }

  _sendMessage(message) {
    return new Promise((resolve, reject) => {
      Database.worker.onmessage = (event) => {
        if (event.data && event.data.result !== undefined) {
          resolve(event.data.result);
        } else {
          reject(new Error('Error in worker operation'));
        }
      };
      Database.worker.postMessage(message);
    });
  }
}