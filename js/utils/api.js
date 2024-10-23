class API {
  static worker = null;
  static cache_enabled = true;
  static callbacks = {};

  static async initialize(authenticated=false,cache_ttl = "60M") {
    if (!API.worker) {
      API.worker = new Worker('/js/webworkers/apiWorker.js');
      API.worker.onmessage = (event) => {
        API.callbacks[event["data"]["subscriptionId"]](event);
      }
    }
    let api = new API(api_url, api_ws, api_key, API.cache_enabled, cache_ttl,authenticated);
    if (authenticated){
        api.checkAuthentication();
    }
    return api;
  }

  constructor(endpoint, websocket, api_key, cache_enabled, cache_ttl,authenticated) {
    this.endpoint = endpoint;
    this.websocket = websocket;
    this.api_key = api_key;
    this.cache_enabled = cache_enabled;
    this.cache_ttl = this.convertTTLtoSeconds(cache_ttl);
    this.authenticated = authenticated;
  }

  /**
   * Helper method to convert time-to-live (TTL) format (like '60M', '1H') to seconds.
   */
  convertTTLtoSeconds(ttl) {
    const ttlValue = parseInt(ttl);
    if (ttl.endsWith('M')) return ttlValue * 60;  // Convert minutes to seconds
    if (ttl.endsWith('H')) return ttlValue * 3600;  // Convert hours to seconds
    return ttlValue;
  }

  /**
   * Redirect to /auth if the token is missing in sessionStorage.
   */
  checkAuthentication() {
    const token = sessionStorage.getItem('token');
    if (!token || parseInt(sessionStorage.getItem('token_expiration')) < Date.now()) {;
      window.location.href = 'auth'; // Redirect to /auth if no token is found
      return false; // Return false to stop further execution
    }
    return true; // Token is present
  }

  /**
   * Perform a GraphQL query.
   */
  async query(queryFilePath, variables = {}, ignore_cache = false, authenticated = false) {
    if ((this.authenticated || authenticated) && !this.checkAuthentication()) return;
    variables = JSON.parse(JSON.stringify(variables));
    return await this._sendMessage({
      action: 'query',
      queryFilePath,
      variables,
      endpoint: this.endpoint,
      api_key: this.api_key,
      cache_ttl: this.cache_enabled ? this.cache_ttl : 0,
      ignore_cache,
      authenticated: this.authenticated || authenticated,
    });
  }

  /**
   * Perform a GraphQL mutation.
   */
  async mutation(queryFilePath, variables = {}, ignore_cache = true, authenticated=false) {
    if ((this.authenticated || authenticated) && !this.checkAuthentication()) return;
    variables = JSON.parse(JSON.stringify(variables));
    let data = await this._sendMessage({
      action: 'mutation',
      queryFilePath,
      variables,
      endpoint: this.endpoint,
      api_key: this.api_key,
      cache_ttl: this.cache_enabled ? this.cache_ttl : 0,
      ignore_cache,
      authenticated: this.authenticated || authenticated,
    });
    return findCorrelationId(data);
  }

  /**
   * Perform a GraphQL subscription using WebSockets.
   */
  async subscription(queryFilePath, variables = {},callback=console.trace,authenticated = false) {
    if ((this.authenticated || authenticated) && !this.checkAuthentication()) return;
    let subscriptionId = Draftsman.uuidv4();
    variables = JSON.parse(JSON.stringify(variables));
    API.worker.postMessage({
                                 action: 'subscribe',
                                 token: sessionStorage.token,
                                 queryFilePath,
                                 variables,
                                 websocket: this.websocket,
                                 api_key: this.api_key,
                                 authenticated: this.authenticated || authenticated,
                                 subscriptionId: subscriptionId
                               });
    API.callbacks[subscriptionId] = function(event){
        if (event["data"]["subscriptionId"] == subscriptionId && event["data"]["payload"]){
            callback(event["data"]["payload"]);
        }
    }
    return subscriptionId;
  }

  async unsubscribe(subscriptionId) {
    API.worker.postMessage({
      action: 'unsubscribe',
      subscriptionId: subscriptionId
    });
    delete API.callbacks[subscriptionId];
  }

  /**
   * Clear the entire cache.
   */
  async clear_cache() {
    this._sendMessage({ action: 'clearCache' }, () => {});
  }

  /**
   * Invalidate a specific cache entry.
   */
  async invalidate_cache_entry(queryString, variables = {}) {
    this._sendMessage({
      action: 'invalidateCache',
      queryString,
      variables,
    }, () => {});
  }

  /**
   * Send a message to the worker and handle the response.
   */
  _sendMessage(message) {
    message.subscriptionId = Draftsman.uuidv4();
    message.token = sessionStorage.token;
    return new Promise((resolve, reject) => {
      API.callbacks[message.subscriptionId] = function(event){
        if (event.data && event.data.result) {
          resolve(event.data.result);
          delete API.callbacks[message.subscriptionId];
        } else if (event.data.error) {
          reject(new Error(event.data.error));
          delete API.callbacks[message.subscriptionId];
        }
      }
      API.worker.postMessage(message);
    });
  }
}

function findCorrelationId(obj) {
  // Check if the object is indeed an object or an array
  if (typeof obj !== 'object' || obj === null) {
    return null;
  }

  // Loop over the object keys
  for (const key in obj) {
    // Check if the current key is 'correlationId', return its value if found
    if (key === 'correlationId') {
      return obj[key];
    }

    // If the current value is another object, call the function recursively
    if (typeof obj[key] === 'object') {
      const correlationId = findCorrelationId(obj[key]);
      if (correlationId !== null) {
        return correlationId; // Return the correlationId once it's found
      }
    }
  }

  // If no 'correlationId' was found, return null
  return null;
}