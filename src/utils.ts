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

export function selectProperty<T extends object, K extends keyof T>(
    value: T,
    properties: K[]
): Pick<T, K> {
    const result: Partial<T> = {}

    for (const property of properties) {
        if (property in value) {
            result[property] = value[property]
        }
    }

    return result as Pick<T, K>
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

export function getAudioFileExtension(filePath: string) {
    switch (filePath) {
        case 'wav':
            return 'audio/wav'
        case 'mp3':
            return 'audio/mp3'
        case 'flac':
            return 'audio/flac'
        case 'slik':
            return 'audio/slik'
        default:
            return 'audio/wav'
    }
}
