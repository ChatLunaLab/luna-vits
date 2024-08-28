/* eslint-disable max-len */
import { Context, HTTP } from 'koishi'
import { BROKEN_CONNECTION_MSG } from '../constants'
import type {} from '@dingyi222666/event-stream'
import { GradioClient } from '../client'

export async function openStream(this: GradioClient): Promise<void> {
    const {
        eventCallbacks,
        unclosedEvents,
        pendingStreamMessages,
        streamStatus,
        config,
        jwt
    } = this

    if (!config) {
        throw new Error('Could not resolve app config')
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this

    streamStatus.open = true

    let stream: EventSource | null = null
    const params = new URLSearchParams({
        session_hash: this.session_hash
    }).toString()

    const url = new URL(`${config.root}/queue/data?${params}`)

    if (jwt) {
        url.searchParams.set('__sign', jwt)
    }

    stream = this.stream(url)

    if (!stream) {
        console.warn('Cannot connect to SSE endpoint: ' + url.toString())
        return
    }

    stream.onmessage = async function (event: MessageEvent) {
        const _data = JSON.parse(event.data)
        if (_data.msg === 'close_stream') {
            closeStream(streamStatus, that.abortController)
            return
        }
        const eventId = _data.event_id
        if (!eventId) {
            await Promise.all(
                Object.keys(eventCallbacks).map((eventId) =>
                    eventCallbacks[eventId](_data)
                )
            )
        } else if (eventCallbacks[eventId] && config) {
            if (
                _data.msg === 'process_completed' &&
                ['sse', 'sse_v1', 'sse_v2', 'sse_v2.1', 'sse_v3'].includes(
                    config.protocol
                )
            ) {
                unclosedEvents.delete(eventId)
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn: (data: any) => void = eventCallbacks[eventId]

            fn(_data)
        } else {
            if (!pendingStreamMessages[eventId]) {
                pendingStreamMessages[eventId] = []
            }
            pendingStreamMessages[eventId].push(_data)
        }
    }
    stream.onerror = async function () {
        await Promise.all(
            Object.keys(eventCallbacks).map((eventId) =>
                eventCallbacks[eventId]({
                    msg: 'unexpected_error',
                    message: BROKEN_CONNECTION_MSG
                })
            )
        )
    }
}

export function closeStream(
    streamStatus: { open: boolean },
    abortController: AbortController | null
): void {
    if (streamStatus) {
        streamStatus.open = false
        abortController?.abort()
    }
}

export function applyDiffStream(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pendingDiffStreams: Record<string, any[][]>,
    eventId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any
): void {
    const isFirstGeneration = !pendingDiffStreams[eventId]
    if (isFirstGeneration) {
        pendingDiffStreams[eventId] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.data.forEach((value: any, i: number) => {
            pendingDiffStreams[eventId][i] = value
        })
    } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.data.forEach((value: any, i: number) => {
            const newData = applyDiff(pendingDiffStreams[eventId][i], value)
            pendingDiffStreams[eventId][i] = newData
            data.data[i] = newData
        })
    }
}

export function applyDiff(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    obj: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    diff: [string, (number | string)[], any][]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    diff.forEach(([action, path, value]) => {
        obj = applyEdit(obj, path, action, value)
    })

    return obj
}

function applyEdit(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target: any,
    path: (number | string)[],
    action: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    if (path.length === 0) {
        if (action === 'replace') {
            return value
        } else if (action === 'append') {
            return target + value
        }
        throw new Error(`Unsupported action: ${action}`)
    }

    let current = target
    for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]]
    }

    const lastPath = path[path.length - 1]
    switch (action) {
        case 'replace':
            current[lastPath] = value
            break
        case 'append':
            current[lastPath] += value
            break
        case 'add':
            if (Array.isArray(current)) {
                current.splice(Number(lastPath), 0, value)
            } else {
                current[lastPath] = value
            }
            break
        case 'delete':
            if (Array.isArray(current)) {
                current.splice(Number(lastPath), 1)
            } else {
                delete current[lastPath]
            }
            break
        default:
            throw new Error(`Unknown action: ${action}`)
    }
    return target
}

export function readableStream(
    ctx: Context,
    input: string,
    init: RequestInit = {}
): EventSource {
    const instance: EventSource & { readyState: number } = {
        close: () => {
            // console.warn('Method not implemented.')
        },
        onerror: null,
        onmessage: null,
        onopen: null,
        readyState: 0,
        url: input.toString(),
        withCredentials: false,
        CONNECTING: 0,
        OPEN: 1,
        CLOSED: 2,
        addEventListener: () => {
            throw new Error('Method not implemented.')
        },
        dispatchEvent: () => {
            throw new Error('Method not implemented.')
        },
        removeEventListener: () => {
            throw new Error('Method not implemented.')
        }
    }

    if (init.headers instanceof Headers) {
        init.headers = Object.fromEntries(init.headers.entries())
    }

    ctx.http(input, {
        method: (init?.method || 'GET') as HTTP.Method,
        headers: init?.headers || {},
        data: init?.body || undefined,
        signal: init?.signal || undefined,
        responseType: 'event-stream'
    })
        .then(async (res) => {
            instance.readyState = instance.OPEN
            try {
                for await (const chunk of res.data) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    instance.onmessage && instance.onmessage(chunk as any)
                }
                instance.readyState = instance.CLOSED
            } catch (e) {
                instance.onerror && instance.onerror(e as Event)
                instance.readyState = instance.CLOSED
            }
        })
        .catch((e) => {
            ctx.logger.error(e)
            instance.onerror && instance.onerror(e as Event)
            instance.readyState = instance.CLOSED
        })

    return instance as EventSource
}
