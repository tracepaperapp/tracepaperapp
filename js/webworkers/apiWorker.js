console.trace = function(){}
const CACHE_DB_NAME = 'graphql-cache';
const CACHE_STORE_NAME = 'graphql-queries';
let cacheDB = null;
let activeSocket = null;  // Houd de actieve WebSocket bij
let subscriptionMap = {}; // Houdt subscripties bij met hun ID's
let reconnectTimeout = null;  // Voor reconnecting met backoff

// Open IndexedDB voor caching
async function openCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      cacheDB = event.target.result;
      resolve(cacheDB);
    };

    request.onerror = (event) => {
      reject(`Failed to open IndexedDB: ${event.target.errorCode}`);
    };
  });
}

// Sla een query of mutation response op in IndexedDB
async function cacheResponse(id, response, ttl) {
  await openCache();
  const expiry = Date.now() + ttl * 1000; // TTL in seconden
  const transaction = cacheDB.transaction([CACHE_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(CACHE_STORE_NAME);
  store.put({ id, response, expiry });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => reject(`Failed to cache response: ${event.target.errorCode}`);
  });
}

// Haal een cached response op uit IndexedDB
async function getCachedResponse(id) {
  await openCache();
  const transaction = cacheDB.transaction([CACHE_STORE_NAME], 'readonly');
  const store = transaction.objectStore(CACHE_STORE_NAME);
  const request = store.get(id);

  return new Promise((resolve, reject) => {
    request.onsuccess = (event) => {
      const entry = event.target.result;
      if (entry && entry.expiry > Date.now()) {
        resolve(entry.response); // Cache geldig
      } else {
        resolve(null); // Cache verlopen of niet gevonden
      }
    };

    request.onerror = (event) => {
      reject(`Failed to retrieve cached response: ${event.target.errorCode}`);
    };
  });
}

// Verwijder specifieke cache entry
async function invalidateCache(id) {
  await openCache();
  const transaction = cacheDB.transaction([CACHE_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(CACHE_STORE_NAME);
  store.delete(id);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => reject(`Failed to delete cache: ${event.target.errorCode}`);
  });
}

// Leeg de cache
async function clearCache() {
  await openCache();
  const transaction = cacheDB.transaction([CACHE_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(CACHE_STORE_NAME);
  store.clear();

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => reject(`Failed to clear cache: ${event.target.errorCode}`);
  });
}

// Laad de .gql-bestandsinhoud als een string
async function loadGraphQLFile(filePath) {
  return new Promise((resolve, reject) => {
    fetch(filePath)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load GraphQL file: ${response.statusText}`);
        return response.text();
      })
      .then((text) => resolve(text))
      .catch((error) => reject(error));
  });
}

self.onmessage = async function (event) {
  const { action, queryFilePath, variables, endpoint, api_key, cache_ttl, ignore_cache, authenticated, websocket, token, subscriptionId } = event.data;

  try {
    let queryString = "";
    switch (action) {
      case 'query':
      case 'mutation':
        // Haal het .gql-bestand op en gebruik de inhoud als query
        queryString = await loadGraphQLFile(queryFilePath);
        const cacheKey = JSON.stringify({ queryFilePath, variables });
        if (!ignore_cache) {
          const cachedResponse = await getCachedResponse(cacheKey);
          if (cachedResponse) {
            postMessage({ result: cachedResponse, subscriptionId });
            return;
          }
        }

        const headers = authenticated
          ? { 'Authorization': `Bearer ${token}` }
          : { 'x-api-key': api_key };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ query: queryString, variables }),
        });
        const result = await response.json();

        if (cache_ttl) {
          await cacheResponse(cacheKey, result, cache_ttl);
        }

        postMessage({ result, subscriptionId });
        break;

      case 'subscribe':
        queryString = await loadGraphQLFile(queryFilePath);
        subscribeToWebSocket(queryString, variables, websocket, api_key, subscriptionId);
        break;

      case 'unsubscribe':
        unsubscribeFromWebSocket(subscriptionId);
        break;

      case 'clearCache':
        await clearCache();
        postMessage({ result: 'Cache cleared', subscriptionId });
        break;

      case 'invalidateCache':
        const invalidateKey = JSON.stringify({ queryFilePath, variables });
        await invalidateCache(invalidateKey);
        postMessage({ result: 'Cache entry invalidated', subscriptionId });
        break;

      default:
        postMessage({ error: 'Unknown action', subscriptionId });
    }
  } catch (error) {
    console.trace(error);
    postMessage({ error: error.message, subscriptionId });
  }
};

// Functie om te subscriben op een WebSocket en te reconnecten bij onverwacht sluiten
function subscribeToWebSocket(queryString, variables, websocket, api_key, subscriptionId) {
  if (!activeSocket) {
    const header = {
      "host": websocket.replace("wss://", "").replace("-realtime-", "-").replace("/graphql", ""),
      "x-api-key": api_key
    };

    let ws = `${websocket}?header=${btoa(JSON.stringify(header))}&payload=e30=`;
    activeSocket = new WebSocket(ws, "graphql-ws");

    activeSocket.onopen = function () {
      console.trace("[WebSocket] Connection established");
      sendSubscribeMessage(subscriptionId,queryString, variables, websocket, api_key);
    };

    activeSocket.onmessage = function (event) {
      let data = JSON.parse(event.data);
      const subscriptionId = data.id;
      const payload = data.payload;

      // Check if we have a subscription with this ID
      if (subscriptionMap[subscriptionId]) {
        // Stuur een bericht terug naar de hoofdthread met het subscriptionId en de payload
        postMessage({
          subscriptionId: subscriptionId,
          payload: payload
        });
      }
    };

    activeSocket.onclose = function (event) {
      if (event.wasClean) {
        console.trace(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
      } else {
        // On unexpected close, attempt to reconnect
        console.trace(`[close] Unexpected connection close, attempting to reconnect...`);
        reconnectSubscriptions(websocket, api_key);
      }
    };

    activeSocket.onerror = function (error) {
      console.trace(`[error] WebSocket error: ${error.message}`);
    };
  } else {
    sendSubscribeMessage(subscriptionId,queryString, variables, websocket, api_key)
  }
}

function sendSubscribeMessage(subscriptionId,queryString, variables, websocket, api_key){
  // Start de subscriptie
  const message = {
    "id": subscriptionId,
    "payload": {
      "data": JSON.stringify({ query: queryString, variables: variables }),
      "extensions": {
        "authorization": {
          "host": websocket.replace("wss://", "").replace("-realtime-", "-").replace("/graphql", ""),
          "x-api-key": api_key
        }
      }
    },
    "type": "start"
  };

  activeSocket.send(JSON.stringify(message));
  console.trace(`[WebSocket] Subscribed with ID: ${subscriptionId}`);

  // Bewaar de subscriptie-ID en callback
  subscriptionMap[subscriptionId] = { queryString, variables, websocket, api_key };
}

// Functie om een subscriptie te beëindigen
function unsubscribeFromWebSocket(subscriptionId) {
  if (activeSocket && subscriptionMap[subscriptionId]) {
    // Stuur een stop-bericht voor de subscriptie naar de server
    const message = {
      "id": subscriptionId,
      "type": "stop"
    };
    activeSocket.send(JSON.stringify(message));
    console.trace(`[WebSocket] Unsubscribed with ID: ${subscriptionId}`);

    // Verwijder de subscriptie uit de map
    delete subscriptionMap[subscriptionId];

    // Controleer of er nog actieve subscripties zijn
    if (Object.keys(subscriptionMap).length === 0) {
      // Geen actieve subscripties meer, sluit de WebSocket-verbinding
      activeSocket.close();
      activeSocket = null;
      console.trace("[WebSocket] No more active subscriptions, socket closed.");
    }
  }
}

// Herconnectie voor alle actieve subscripties bij onverwachte sluiting
function reconnectSubscriptions(websocket, api_key) {
  setTimeout(function () {
    console.trace("[WebSocket] Attempting to reconnect...");

    // Heropen de WebSocket-verbinding en herstart alle actieve subscripties
    for (const subscriptionId in subscriptionMap) {
      const sub = subscriptionMap[subscriptionId];
      subscribeToWebSocket(sub.queryString, sub.variables, websocket, api_key, subscriptionId);
    }
  }, 5000); // Reconnect after 5 seconds
}
