export function removeProperty<T extends object, K extends keyof T>(
    value: T,
    properties: K[]
): Omit<T, K> {
    const propertySet = new Set(properties)
    const result = {}

    for (const [key, val] of Object.entries(value)) {
        if (!propertySet.has(key as K)) {
            result[key] = val
        }
    }

    return result as Omit<T, K>
}

export class PromiseLock {
    private _lock = false

    constructor(lock: boolean = false) {
        this._lock = lock
    }

    async lock() {
        if (this._lock) {
            while (this._lock) {
                await new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(null)
                    }, 100)
                })
            }
        }

        this._lock = true
    }

    async runLocked<T>(callback: () => Promise<T> | T) {
        await this.lock()

        const result = await callback()

        this.unlock()

        return result
    }

    unlock() {
        this._lock = false
    }
}
