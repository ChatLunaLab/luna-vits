import { Context } from 'koishi'

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
export async function runWithRetry<T>(
    func: () => Promise<T>,
    retry: number,
    interval: number
): Promise<T> {
    while (retry > 0) {
        try {
            return await func()
        } catch (error) {
            if (--retry === 0) throw error
            await new Promise((resolve) => setTimeout(resolve, interval))
        }
    }
    throw new Error('Retry count exceeded')
}

export class TTLCache<T> {
    private _cache: Map<string, CacheItem<T>> = new Map()

    constructor(
        ctx: Context,
        private _ttlTime: number = 1000 * 60 * 20
    ) {
        ctx.setInterval(() => {
            const now = Date.now()
            for (const [key, value] of this._cache.entries()) {
                if (value.expire < now) {
                    this._cache.delete(key)
                }
            }
        }, _ttlTime)
    }

    get(key: string) {
        const item = this._cache.get(key)
        if (item) {
            return item.value
        }
    }

    set(key: string, value: T) {
        const item: CacheItem<T> = {
            value,
            expire: Date.now() + this._ttlTime
        }
        this._cache.set(key, item)
    }

    delete(key: string) {
        this._cache.delete(key)
    }

    clear() {
        this._cache.clear()
    }
}

interface CacheItem<T> {
    value: T
    expire: number
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

export function getSpeaker(
    ctx: Context,
    speakerKeyMap: Awaited<
        ReturnType<typeof ctx.console.services.luna_vits_data.getSpeakerKeyMap>
    >,
    speaker: string
) {
    for (const key of [speaker, speaker + '_AUTO', speaker + '_ZH']) {
        if (speakerKeyMap[key]) {
            return [speakerKeyMap[key], key]
        }
    }

    return [null, null]
}

export function isNumeric(str: string) {
    return !isNaN(parseFloat(str))
}
