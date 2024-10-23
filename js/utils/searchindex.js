class SearchIndex {
  static worker = null;

  static async open(indexName, fields) {
    if (!SearchIndex.worker){
        SearchIndex.worker = new Worker('/js/webworkers/miniSearchWorker.js');
    }
    let options = {
      fields: fields,
      storeFields: fields
    };
    let index = new SearchIndex(indexName,SearchIndex.worker);
    await index._sendMessage({
      action: 'initialize',
      indexName: indexName,
      options
    });
    return index;
  }

  constructor(indexName, worker){
    this.indexName = indexName;
    this.worker = worker;
  }

  async addDocuments(documents) {
    return this._sendMessage({
      action: 'addDocuments',
      indexName: this.indexName,
      documents
    });
  }

  async removeDocuments(documents) {
    return this._sendMessage({
        action: 'removeDocuments',
        indexName: this.indexName,
        documents
    });
  }

  async search(query) {
    return this._sendMessage({
      action: 'search',
      indexName: this.indexName,
      query
    });
  }

  _sendMessage(message) {
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (event) => {
        if (event.data && event.data.result) {
          resolve(event.data.result);
        } else if (event.data.error) {
          reject(new Error(event.data.error));
        }
      };
      this.worker.postMessage(message);
    });
  }
}
