importScripts('/js/tp/minisearch.js');

let indexes = {}; // Beheer meerdere indexen
let db = null;

// Open IndexedDB voor opslag van de indexen
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MiniSearchDB', 1);

    request.onupgradeneeded = function (event) {
      db = event.target.result;
      db.createObjectStore('indexes', { keyPath: 'id' });
    };

    request.onsuccess = function (event) {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = function () {
      reject('Failed to open IndexedDB');
    };
  });
}

// Sla de index op in IndexedDB
function saveIndex(indexName, index) {
  return openIndexedDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['indexes'], 'readwrite');
      const store = transaction.objectStore('indexes');
      const request = store.put({ id: indexName, index });

      request.onsuccess = function () {
        resolve('Index saved');
      };

      request.onerror = function () {
        reject('Failed to save index');
      };
    });
  });
}

// Laad de index uit IndexedDB
function loadIndex(indexName) {
  return openIndexedDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['indexes'], 'readonly');
      const store = transaction.objectStore('indexes');
      const request = store.get(indexName);

      request.onsuccess = function (event) {
        const data = event.target.result;
        if (data) {
          resolve(data.index);
        } else {
          reject('No index found');
        }
      };

      request.onerror = function () {
        reject('Failed to load index');
      };
    });
  });
}

self.onmessage = async function (event) {
  const { action, indexName, documents, query, options } = event.data;

  switch (action) {
    case 'initialize':
      try {
        const loadedIndex = await loadIndex(indexName);
        indexes[indexName] = MiniSearch.loadJSON(JSON.stringify(loadedIndex), options); // Laad de bestaande index
        postMessage({ result: `Index ${indexName} loaded from IndexedDB` });
      } catch (error) {
        indexes[indexName] = new MiniSearch(options); // Maak een nieuwe index als er geen bestaat
        postMessage({ result: `New MiniSearch index ${indexName} initialized` });
      }
      break;

    case 'addDocuments':
      if (indexes[indexName]) {
        indexes[indexName].addAll(documents);
        await saveIndex(indexName, indexes[indexName].toJSON()); // Sla de index op na het toevoegen van documenten
        postMessage({ result: `Documents added and index ${indexName} saved` });
      } else {
        postMessage({ error: `Index ${indexName} is not initialized` });
      }
      break;

    case 'removeDocuments':
        if (indexes[indexName]) {
            if (Array.isArray(documents)) {
                indexes[indexName].removeAll(documents);
            } else {
                indexes[indexName].remove(documents);
            }
            await saveIndex(indexName, indexes[indexName].toJSON()); // Sla de index op na het toevoegen van documenten
            postMessage({ result: `Documents removed and index ${indexName} saved` });
          } else {
            postMessage({ error: `Index ${indexName} is not initialized` });
          }
        break;

    case 'search':
      if (indexes[indexName]) {
        const results = indexes[indexName].search(query,{prefix: true});
        postMessage({ result: results });
      } else {
        postMessage({ error: `Index ${indexName} is not initialized` });
      }
      break;

    default:
      postMessage({ error: 'Unknown action' });
  }
};
