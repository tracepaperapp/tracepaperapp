class Draftsman {
    static taskMap = new Map();
    static loopRunning = false;

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

    static unregisterTask(f) {
        Draftsman.taskMap.delete(f);
    }
}