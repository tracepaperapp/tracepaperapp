let db;

self.onmessage = async function (event) {
  const { action, collectionName, field, unique, record, key, criteria, updatedRecord } = event.data;

  switch (action) {
    case 'initializeDB':
      await initializeDB(collectionName);
      postMessage({ type: 'dbReady' });
      break;
    case 'createCollection':
      await createCollection(collectionName);
      postMessage({ result: `Collection ${collectionName} created` });
      break;
    case 'addIndex':
      await addIndex(collectionName, field, unique);
      postMessage({ result: 'Index added' });
      break;
    case 'add':
      await addRecord(collectionName, record);
      postMessage({ result: 'Record added' });
      break;
    case 'getAll':
      const allRecords = await getAllRecords(collectionName);
      postMessage({ result: allRecords });
      break;
    case 'get':
      const singleRecord = await getRecord(collectionName, key);
      postMessage({ result: singleRecord });
      break;
    case 'findBy':
      const foundRecords = await findRecordsByCriteria(collectionName, criteria);
      postMessage({ result: foundRecords });
      break;
    case 'update':
      const updateResult = await updateRecord(collectionName, key, updatedRecord);
      postMessage({ result: updateResult });
      break;
    case 'remove':
      await removeRecord(collectionName, key || criteria);
      postMessage({ result: 'Record(s) removed' });
      break;
    default:
      postMessage({ result: 'Unknown action' });
  }
};

// Initialiseer of upgrade de database
async function initializeDB(collectionName) {
  const request = indexedDB.open('DocumentDatabase', 1);

  return new Promise((resolve, reject) => {
    request.onupgradeneeded = function (event) {
      db = event.target.result;
      if (!db.objectStoreNames.contains(collectionName)) {
        db.createObjectStore(collectionName, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = function (event) {
      db = event.target.result;
      resolve();
    };

    request.onerror = function (event) {
      reject(new Error('Error opening database: ' + event.target.error));
    };
  });
}

// Creëer een nieuwe collectie (object store)
async function createCollection(collectionName) {
  if (!db) throw new Error('Database is not initialized');

  const version = db.version + 1;
  db.close();

  const request = indexedDB.open('DocumentDatabase', version);

  return new Promise((resolve, reject) => {
    request.onupgradeneeded = function (event) {
      db = event.target.result;
      if (!db.objectStoreNames.contains(collectionName)) {
        db.createObjectStore(collectionName, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = function (event) {
      db = event.target.result;
      resolve();
    };

    request.onerror = function (event) {
      reject(new Error('Error creating collection: ' + event.target.error));
    };
  });
}

// Voeg een index toe aan een collectie
async function addIndex(collectionName, field, unique) {
  if (!db) throw new Error('Database is not initialized');

  const transaction = db.transaction(collectionName, 'versionchange');
  const store = transaction.objectStore(collectionName);
  store.createIndex(field, field, { unique });
}

// Voeg een record toe aan een collectie
async function addRecord(collectionName, record) {
  if (!db) throw new Error('Database is not initialized');

  const transaction = db.transaction(collectionName, 'readwrite');
  const store = transaction.objectStore(collectionName);
  store.add(record);
}

// Haal een record op met de primary key
async function getRecord(collectionName, key) {
  if (!db) throw new Error('Database is not initialized');

  const transaction = db.transaction(collectionName, 'readonly');
  const store = transaction.objectStore(collectionName);
  const request = store.get(key);

  return new Promise((resolve, reject) => {
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function (event) {
      reject(new Error('Error getting record: ' + event.target.error));
    };
  });
}

// Haal alle records uit een collectie op
async function getAllRecords(collectionName) {
  if (!db) throw new Error('Database is not initialized');

  const transaction = db.transaction(collectionName, 'readonly');
  const store = transaction.objectStore(collectionName);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function (event) {
      reject(new Error('Error getting all records: ' + event.target.error));
    };
  });
}

// Vind records op basis van criteria (bijv. een veldwaarde)
async function findRecordsByCriteria(collectionName, criteria) {
  if (!db) throw new Error('Database is not initialized');

  const transaction = db.transaction(collectionName, 'readonly');
  const store = transaction.objectStore(collectionName);
  const field = Object.keys(criteria)[0];
  const value = Object.values(criteria)[0];
  const index = store.index(field);
  const request = index.getAll(value);

  return new Promise((resolve, reject) => {
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function (event) {
      reject(new Error('Error finding records: ' + event.target.error));
    };
  });
}

// Update een record op basis van de primary key
async function updateRecord(collectionName, key, updatedRecord) {
  if (!db) throw new Error('Database is not initialized');

  const transaction = db.transaction(collectionName, 'readwrite');
  const store = transaction.objectStore(collectionName);

  const request = store.get(key);

  return new Promise((resolve, reject) => {
    request.onsuccess = function (event) {
      const existingRecord = request.result;

      if (existingRecord) {
        // Werk de velden van het bestaande record bij met de nieuwe waarden
        const updated = { ...existingRecord, ...updatedRecord };

        // Update het record in de store
        const updateRequest = store.put(updated);

        updateRequest.onsuccess = function () {
          resolve('Record updated');
        };
        updateRequest.onerror = function (event) {
          reject(new Error('Error updating record: ' + event.target.error));
        };
      } else {
        reject(new Error('Record not found'));
      }
    };

    request.onerror = function (event) {
      reject(new Error('Error finding record: ' + event.target.error));
    };
  });
}

// Verwijder een record op basis van de primary key of criteria
async function removeRecord(collectionName, keyOrCriteria) {
  if (!db) throw new Error('Database is not initialized');

  const transaction = db.transaction(collectionName, 'readwrite');
  const store = transaction.objectStore(collectionName);

  if (typeof keyOrCriteria === 'object') {
    const field = Object.keys(keyOrCriteria)[0];
    const value = Object.values(keyOrCriteria)[0];
    const index = store.index(field);
    const request = index.getAll(value);

    request.onsuccess = function () {
      const records = request.result;
      records.forEach((record) => store.delete(record.id));
    };
  } else {
    store.delete(keyOrCriteria);
  }
}