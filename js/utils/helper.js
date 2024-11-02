class Draftsman {
    static taskMap = new Map();
    static loopRunning = false;
    static debounceTimers = new Map();
    static listeners = new Map();

    static debounce(taskKey, func, delayInMs=250) {
        if (Draftsman.debounceTimers.has(taskKey)) {
            clearTimeout(Draftsman.debounceTimers.get(taskKey));
        }
        const timer = setTimeout(async () => {
            try {
                await func();
            } catch (error) {
                console.error("Error in debounced task:", error);
            } finally {
                Draftsman.debounceTimers.delete(taskKey);
            }
        }, delayInMs);
        Draftsman.debounceTimers.set(taskKey, timer); // Sla de nieuwe timer op met de taskKey
    }

    static async waitFor(predicate, interval = 100) {
        let check = await predicate();
        while (!check) {
            await Draftsman.sleep(interval);
        }
    }

    static splitOnLastDot(str) {
        const lastDotIndex = str.lastIndexOf('.');
        if (lastDotIndex === -1) return [str]; // Geen punt gevonden

        const beforeDot = str.slice(0, lastDotIndex);
        const afterDot = str.slice(lastDotIndex + 1);

        return [beforeDot, afterDot];
    }

    static capitalizeFirstLetter(str) {
        if (!str) return str; // Controleer op een lege string
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    static filterKeys(arrayOfObjects, keys) {
      return arrayOfObjects.map(obj => {
        let filteredObj = {};
        keys.forEach(key => {
          if (obj.hasOwnProperty(key)) {
            filteredObj[key] = obj[key];
          }
        });
        return filteredObj;
      });
    }

    static generateRandomCamelCaseString() {
      const words = [
        "alpha", "beta", "gamma", "delta", "epsilon",
        "zeta", "eta", "theta", "iota", "kappa",
        "lambda", "mu", "nu", "xi", "omicron",
        "pi", "rho", "sigma", "tau", "upsilon",
        "phi", "chi", "psi", "omega"
      ];

      // Genereer 2 tot 4 willekeurige woorden
      const numberOfWords = Math.floor(Math.random() * 3) + 2;
      let camelCaseString = words[Math.floor(Math.random() * words.length)];

      for (let i = 1; i < numberOfWords; i++) {
        const word = words[Math.floor(Math.random() * words.length)];
        camelCaseString += word.charAt(0).toUpperCase() + word.slice(1);
      }

      return camelCaseString;
    }

    static registerTask(f, delayInSeconds = 1, taskKey) {
        const delayInMs = delayInSeconds * 1000;

        if (Draftsman.taskMap.has(taskKey)) {
            // Update de bestaande taak met de nieuwe delay, maar behoud de originele lastRun
            const task = Draftsman.taskMap.get(taskKey);
            task.f = f;
            task.delay = delayInMs;
        } else {
            // Voeg de nieuwe taak toe aan de map met een unieke taskKey
            const lastRun = 0;
            Draftsman.taskMap.set(taskKey, { f, delay: delayInMs, lastRun });
        }

        // Start de loop als deze nog niet draait
        if (!Draftsman.loopRunning) {
            Draftsman.startLoop();
        }
    }

    static async startLoop() {
        Draftsman.loopRunning = true;

        while (Draftsman.taskMap.size > 0) {
            const now = Date.now(); // Huidige tijd

            for (let [taskKey, { f, delay, lastRun }] of Draftsman.taskMap.entries()) {
                if (now - lastRun >= delay) {
                    try {
                        await f(); // Voer de taak uit
                    } catch (error) {
                        console.error("Error in background task:", error);
                    }
                    // Update de lastRun tijd
                    Draftsman.taskMap.set(taskKey, { f, delay, lastRun: now });
                }
            }

            await Draftsman.sleep(100);
        }
        Draftsman.loopRunning = false;
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    static makeid(length) {
       let result = '';
       const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
       const charactersLength = characters.length;
       let counter = 0;
       while (counter < length) {
         result += characters.charAt(Math.floor(Math.random() * charactersLength));
         counter += 1;
       }
       return result;
   }

    static unregisterTask(f) {
        Draftsman.taskMap.delete(f);
    }

    static async publishMessage(type, message) {
        await Draftsman.sleep(100);
        const event = new CustomEvent(type, { detail: message });
        window.dispatchEvent(event);
    }

    static registerListener(type, callback) {
        const listenerId = Draftsman.uuidv4();
        const listener = async (event) => {
            try {
                await callback(event.detail);
            } catch (error) {
                console.trace("Error in listener callback:", error);
            }
        };
        window.addEventListener(type, listener);
        Draftsman.listeners.set(listenerId, { type, listener });
        return listenerId;
    }

    static deregisterListener(listenerId) {
        if (Draftsman.listeners.has(listenerId)) {
            const { type, listener } = Draftsman.listeners.get(listenerId);
            window.removeEventListener(type, listener);
            Draftsman.listeners.delete(listenerId);
        } else {
            console.warn("Listener not found:", listenerId);
        }
    }

    static signOut(){
        let logout_uri = `${localStorage["aws-congnito-ui"]}/logout?client_id=${localStorage["aws-congnito-app-id"]}&logout_uri=${window.location.origin}`;
        sessionStorage.clear();
        location = logout_uri;
    }
}