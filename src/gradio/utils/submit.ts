/* eslint-disable complexity */
import type {
    ApiInfo,
    Config,
    Dependency,
    EndpointInfo,
    GradioEvent,
    JsApiData,
    Payload,
    Status,
    SubmitIterable
} from '../types'

import semiver from 'semiver'
import { GradioClient } from '../client'
import { BROKEN_CONNECTION_MSG, QUEUE_FULL_MSG } from '../constants'
import {
    handleMessage,
    mapDataToParams,
    processEndpoint
} from '../helpers/api_info'
import { handlePayload, skipQueue } from '../helpers/data'
import { resolveRoot } from '../helpers/init_helpers'
import { applyDiffStream, closeStream } from './stream'

export function submit(
    this: GradioClient,
    endpoint: string | number,
    data: unknown[] | Record<string, unknown> = {},
    eventData?: unknown,
    triggerId?: number | null,
    allEvents?: boolean
): SubmitIterable<GradioEvent> {
    try {
        let done = false
        const values: (IteratorResult<GradioEvent> | PromiseLike<never>)[] = []
        const resolvers: ((
            value: IteratorResult<GradioEvent> | PromiseLike<never>
        ) => void)[] = []

        const { hf_token } = this.options
        const {
            appReference,
            config,
            session_hash,
            apiInfo,
            apiMap,
            streamStatus,
            pendingStreamMessages,
            pendingDiffStreams,
            eventCallbacks,
            unclosedEvents,
            options
        } = this

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this

        if (!apiInfo) throw new Error('No API found')
        if (!config) throw new Error('Could not resolve app config')

        const { fn_index, endpoint_info, dependency } = getEndPointInfo(
            apiInfo,
            endpoint,
            apiMap,
            config
        )

        const resolvedData = mapDataToParams(data, endpoint_info)

        let websocket: WebSocket
        let stream: EventSource | null
        const protocol = config.protocol ?? 'ws'

        const _endpoint = typeof endpoint === 'number' ? '/predict' : endpoint
        let payload: Payload
        let eventId: string | null = null
        let complete: Status | undefined | false = false
        const lastStatus: Record<string, Status['stage']> = {}
        const urlParams =
            typeof window !== 'undefined' && typeof document !== 'undefined'
                ? new URLSearchParams(window.location.search).toString()
                : ''

        const eventsToPublish =
            options?.events?.reduce(
                (acc, event) => {
                    acc[event] = true
                    return acc
                },
                {} as Record<string, boolean>
            ) || {}

        // event subscription methods
        function fireEvent(event: GradioEvent): void {
            if (allEvents || eventsToPublish[event.type]) {
                pushEvent(event)
            }
        }

        async function cancel(): Promise<void> {
            const _status: Status = {
                stage: 'complete',
                queue: false,
                time: new Date()
            }
            complete = _status
            fireEvent({
                ..._status,
                type: 'status',
                endpoint: _endpoint,
                fn_index
            })

            let resetRequest = {}
            let cancelRequest = {}
            if (protocol === 'ws') {
                if (websocket && websocket.readyState === 0) {
                    websocket.addEventListener('open', () => {
                        websocket.close()
                    })
                } else {
                    websocket.close()
                }
                resetRequest = { fn_index, session_hash }
            } else {
                closeStream(streamStatus, that.abortController)
                close()
                resetRequest = { event_id: eventId }
                cancelRequest = { event_id: eventId, session_hash, fn_index }
            }

            try {
                if (!config) {
                    throw new Error('Could not resolve app config')
                }

                if ('event_id' in cancelRequest) {
                    await fetch(`${config.root}/cancel`, {
                        headers: { 'Content-Type': 'application/json' },
                        method: 'POST',
                        body: JSON.stringify(cancelRequest)
                    })
                }

                await fetch(`${config.root}/reset`, {
                    headers: { 'Content-Type': 'application/json' },
                    method: 'POST',
                    body: JSON.stringify(resetRequest)
                })
            } catch (e) {
                that.ctx.logger.warn(
                    'The `/reset` endpoint could not be called. Subsequent endpoint results may be unreliable.'
                )
            }
        }

        ;(async () => {
            const inputData = handlePayload(
                resolvedData,
                dependency,
                config.components,
                'input',
                true
            )
            payload = {
                data: inputData || [],
                event_data: eventData,
                fn_index,
                trigger_id: triggerId
            }

            if (skipQueue(fn_index, config)) {
                fireEvent({
                    type: 'status',
                    endpoint: _endpoint,
                    stage: 'pending',
                    queue: false,
                    fn_index,
                    time: new Date()
                })

                this.postData(
                    `${config.root}/run${
                        _endpoint.startsWith('/') ? _endpoint : `/${_endpoint}`
                    }${urlParams ? '?' + urlParams : ''}`,
                    {
                        ...payload,
                        session_hash
                    }
                )
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .then(([output, statusCode]: any) => {
                        const data = output.data
                        if (statusCode === 200) {
                            fireEvent({
                                type: 'data',
                                endpoint: _endpoint,
                                fn_index,
                                data: handlePayload(
                                    data,
                                    dependency,
                                    config.components,
                                    'output',
                                    options.with_null_state
                                ),
                                time: new Date(),
                                event_data: eventData,
                                trigger_id: triggerId
                            })

                            fireEvent({
                                type: 'status',
                                endpoint: _endpoint,
                                fn_index,
                                stage: 'complete',
                                eta: output.average_duration,
                                queue: false,
                                time: new Date()
                            })
                        } else {
                            fireEvent({
                                type: 'status',
                                stage: 'error',
                                endpoint: _endpoint,
                                fn_index,
                                message: output.error,
                                queue: false,
                                time: new Date()
                            })
                        }
                    })
                    .catch((e) => {
                        fireEvent({
                            type: 'status',
                            stage: 'error',
                            message: e.message,
                            endpoint: _endpoint,
                            fn_index,
                            queue: false,
                            time: new Date()
                        })
                    })
            } else if (protocol === 'ws') {
                const { ws_protocol, host } = await processEndpoint(
                    appReference,
                    hf_token
                )

                fireEvent({
                    type: 'status',
                    stage: 'pending',
                    queue: true,
                    endpoint: _endpoint,
                    fn_index,
                    time: new Date()
                })

                const url = new URL(
                    `${ws_protocol}://${resolveRoot(
                        host,
                        config.path as string,
                        true
                    )}/queue/join${urlParams ? '?' + urlParams : ''}`
                )

                if (this.jwt) {
                    url.searchParams.set('__sign', this.jwt)
                }

                websocket = this.ctx.http.ws(url)

                websocket.onclose = (evt) => {
                    if (!evt.wasClean) {
                        fireEvent({
                            type: 'status',
                            stage: 'error',
                            broken: true,
                            message: BROKEN_CONNECTION_MSG,
                            queue: true,
                            endpoint: _endpoint,
                            fn_index,
                            time: new Date()
                        })
                    }
                }

                websocket.onmessage = function (event) {
                    const _data = JSON.parse(event.data)
                    const { type, status, data } = handleMessage(
                        _data,
                        lastStatus[fn_index]
                    )

                    if (type === 'update' && status && !complete) {
                        // call 'status' listeners
                        fireEvent({
                            type: 'status',
                            endpoint: _endpoint,
                            fn_index,
                            time: new Date(),
                            ...status
                        })
                        if (status.stage === 'error') {
                            websocket.close()
                        }
                    } else if (type === 'hash') {
                        websocket.send(
                            JSON.stringify({ fn_index, session_hash })
                        )
                        return
                    } else if (type === 'data') {
                        websocket.send(
                            JSON.stringify({ ...payload, session_hash })
                        )
                    } else if (type === 'complete') {
                        complete = status
                    } else if (type === 'log') {
                        fireEvent({
                            type: 'log',
                            log: data.log,
                            level: data.level,
                            endpoint: _endpoint,
                            duration: data.duration,
                            visible: data.visible,
                            fn_index
                        })
                    } else if (type === 'generating') {
                        fireEvent({
                            type: 'status',
                            time: new Date(),
                            ...status,
                            stage: status?.stage,
                            queue: true,
                            endpoint: _endpoint,
                            fn_index
                        })
                    }
                    if (data) {
                        fireEvent({
                            type: 'data',
                            time: new Date(),
                            data: handlePayload(
                                data.data,
                                dependency,
                                config.components,
                                'output',
                                options.with_null_state
                            ),
                            endpoint: _endpoint,
                            fn_index,
                            event_data: eventData,
                            trigger_id: triggerId
                        })

                        if (complete) {
                            fireEvent({
                                type: 'status',
                                time: new Date(),
                                ...complete,
                                stage: status?.stage,
                                queue: true,
                                endpoint: _endpoint,
                                fn_index
                            })
                            websocket.close()
                        }
                    }
                }

                // different ws contract for gradio versions older than 3.6.0

                if (semiver(config.version || '2.0.0', '3.6') < 0) {
                    addEventListener('open', () =>
                        websocket.send(JSON.stringify({ hash: session_hash }))
                    )
                }
            } else if (protocol === 'sse') {
                fireEvent({
                    type: 'status',
                    stage: 'pending',
                    queue: true,
                    endpoint: _endpoint,
                    fn_index,
                    time: new Date()
                })
                const params = new URLSearchParams({
                    fn_index: fn_index.toString(),
                    session_hash
                }).toString()
                const url = new URL(
                    `${config.root}/queue/join?${
                        urlParams ? urlParams + '&' : ''
                    }${params}`
                )

                if (this.jwt) {
                    url.searchParams.set('__sign', this.jwt)
                }

                stream = this.stream(url)

                if (!stream) {
                    return Promise.reject(
                        new Error(
                            'Cannot connect to SSE endpoint: ' + url.toString()
                        )
                    )
                }

                stream.onmessage = async function (event: MessageEvent) {
                    const _data = JSON.parse(event.data)
                    const { type, status, data } = handleMessage(
                        _data,
                        lastStatus[fn_index]
                    )

                    if (type === 'update' && status && !complete) {
                        // call 'status' listeners
                        fireEvent({
                            type: 'status',
                            endpoint: _endpoint,
                            fn_index,
                            time: new Date(),
                            ...status
                        })
                        if (status.stage === 'error') {
                            stream?.close()
                            close()
                        }
                    } else if (type === 'data') {
                        eventId = _data.event_id as string

                        const [, status] = await that.postData(
                            `${config.root}/queue/data`,
                            {
                                ...payload,
                                session_hash,
                                event_id: eventId
                            }
                        )

                        if (status !== 200) {
                            fireEvent({
                                type: 'status',
                                stage: 'error',
                                message: BROKEN_CONNECTION_MSG,
                                queue: true,
                                endpoint: _endpoint,
                                fn_index,
                                time: new Date()
                            })
                            stream?.close()
                            close()
                        }
                    } else if (type === 'complete') {
                        complete = status
                    } else if (type === 'log') {
                        fireEvent({
                            type: 'log',
                            log: data.log,
                            level: data.level,
                            endpoint: _endpoint,
                            duration: data.duration,
                            visible: data.visible,
                            fn_index
                        })
                    } else if (type === 'generating') {
                        fireEvent({
                            type: 'status',
                            time: new Date(),
                            ...status,
                            stage: status?.stage,
                            queue: true,
                            endpoint: _endpoint,
                            fn_index
                        })
                    }
                    if (data) {
                        fireEvent({
                            type: 'data',
                            time: new Date(),
                            data: handlePayload(
                                data.data,
                                dependency,
                                config.components,
                                'output',
                                options.with_null_state
                            ),
                            endpoint: _endpoint,
                            fn_index,
                            event_data: eventData,
                            trigger_id: triggerId
                        })

                        if (complete) {
                            fireEvent({
                                type: 'status',
                                time: new Date(),
                                ...complete,
                                stage: status?.stage,
                                queue: true,
                                endpoint: _endpoint,
                                fn_index
                            })
                            stream?.close()
                            close()
                        }
                    }
                }
            } else if (
                protocol === 'sse_v1' ||
                protocol === 'sse_v2' ||
                protocol === 'sse_v2.1' ||
                protocol === 'sse_v3'
            ) {
                // latest API format. v2 introduces sending diffs for intermediate outputs in generative functions, which makes payloads lighter.
                // v3 only closes the stream when the backend sends the close stream message.
                fireEvent({
                    type: 'status',
                    stage: 'pending',
                    queue: true,
                    endpoint: _endpoint,
                    fn_index,
                    time: new Date()
                })

                const postDataPromise = that.postData(
                    `${config.root}/queue/join?${urlParams}`,
                    {
                        ...payload,
                        session_hash
                    }
                )

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                postDataPromise.then(async ([response, status]: any) => {
                    if (status === 503) {
                        fireEvent({
                            type: 'status',
                            stage: 'error',
                            message: QUEUE_FULL_MSG,
                            queue: true,
                            endpoint: _endpoint,
                            fn_index,
                            time: new Date()
                        })
                    } else if (status !== 200) {
                        fireEvent({
                            type: 'status',
                            stage: 'error',
                            message: BROKEN_CONNECTION_MSG,
                            queue: true,
                            endpoint: _endpoint,
                            fn_index,
                            time: new Date()
                        })
                    } else {
                        eventId = response.event_id as string
                        const callback = async function (
                            _data: object
                        ): Promise<void> {
                            try {
                                const { type, status, data } = handleMessage(
                                    _data,
                                    lastStatus[fn_index]
                                )

                                if (type === 'heartbeat') {
                                    return
                                }

                                if (type === 'update' && status && !complete) {
                                    // call 'status' listeners
                                    fireEvent({
                                        type: 'status',
                                        endpoint: _endpoint,
                                        fn_index,
                                        time: new Date(),
                                        ...status
                                    })
                                } else if (type === 'complete') {
                                    complete = status
                                } else if (type === 'unexpected_error') {
                                    that.ctx.logger.error(
                                        'Unexpected error',
                                        status?.message
                                    )
                                    fireEvent({
                                        type: 'status',
                                        stage: 'error',
                                        message:
                                            status?.message ||
                                            'An Unexpected Error Occurred!',
                                        queue: true,
                                        endpoint: _endpoint,
                                        fn_index,
                                        time: new Date()
                                    })
                                } else if (type === 'log') {
                                    fireEvent({
                                        type: 'log',
                                        log: data.log,
                                        level: data.level,
                                        endpoint: _endpoint,
                                        duration: data.duration,
                                        visible: data.visible,
                                        fn_index
                                    })
                                    return
                                } else if (type === 'generating') {
                                    fireEvent({
                                        type: 'status',
                                        time: new Date(),
                                        ...status,
                                        stage: status?.stage,
                                        queue: true,
                                        endpoint: _endpoint,
                                        fn_index
                                    })
                                    if (
                                        data &&
                                        [
                                            'sse_v2',
                                            'sse_v2.1',
                                            'sse_v3'
                                        ].includes(protocol)
                                    ) {
                                        applyDiffStream(
                                            pendingDiffStreams,
                                            eventId!,
                                            data
                                        )
                                    }
                                }
                                if (data) {
                                    fireEvent({
                                        type: 'data',
                                        time: new Date(),
                                        data: handlePayload(
                                            data.data,
                                            dependency,
                                            config.components,
                                            'output',
                                            options.with_null_state
                                        ),
                                        endpoint: _endpoint,
                                        fn_index
                                    })

                                    if (complete) {
                                        fireEvent({
                                            type: 'status',
                                            time: new Date(),
                                            ...complete,
                                            stage: status?.stage,
                                            queue: true,
                                            endpoint: _endpoint,
                                            fn_index
                                        })

                                        close()
                                    }
                                }

                                if (
                                    status?.stage === 'complete' ||
                                    status?.stage === 'error'
                                ) {
                                    if (eventCallbacks[eventId!]) {
                                        delete eventCallbacks[eventId!]
                                    }
                                    if (eventId! in pendingDiffStreams) {
                                        delete pendingDiffStreams[eventId!]
                                    }
                                }
                            } catch (e) {
                                that.ctx.logger.error(
                                    'Unexpected client exception',
                                    e
                                )
                                fireEvent({
                                    type: 'status',
                                    stage: 'error',
                                    message: 'An Unexpected Error Occurred!',
                                    queue: true,
                                    endpoint: _endpoint,
                                    fn_index,
                                    time: new Date()
                                })
                                if (
                                    ['sse_v2', 'sse_v2.1', 'sse_v3'].includes(
                                        protocol
                                    )
                                ) {
                                    closeStream(
                                        streamStatus,
                                        that.abortController
                                    )
                                    streamStatus.open = false
                                    close()
                                }
                            }
                        }

                        if (eventId in pendingStreamMessages) {
                            pendingStreamMessages[eventId].forEach((msg) =>
                                callback(msg)
                            )
                            delete pendingStreamMessages[eventId]
                        }
                        eventCallbacks[eventId] = callback
                        unclosedEvents.add(eventId)
                        if (!streamStatus.open) {
                            await this.openStream()
                        }
                    }
                })
            }
        })()

        function close(): void {
            done = true
            while (resolvers.length > 0)
                (resolvers.shift() as (typeof resolvers)[0])({
                    value: undefined,
                    done: true
                })
        }

        function push(
            data: { value: GradioEvent; done: boolean } | PromiseLike<never>
        ): void {
            if (done) return
            if (resolvers.length > 0) {
                ;(resolvers.shift() as (typeof resolvers)[0])(data)
            } else {
                values.push(data)
            }
        }

        function pushError(error: unknown): void {
            push(thenableReject(error))
            close()
        }

        function pushEvent(event: GradioEvent): void {
            push({ value: event, done: false })
        }

        function next(): Promise<IteratorResult<GradioEvent, unknown>> {
            if (values.length > 0)
                return Promise.resolve(values.shift() as (typeof values)[0])
            if (done) return Promise.resolve({ value: undefined, done: true })
            return new Promise((resolve) => resolvers.push(resolve))
        }

        const iterator = {
            [Symbol.asyncIterator]: () => iterator,
            next,
            throw: async (value: unknown) => {
                pushError(value)
                return next()
            },
            return: async () => {
                close()
                return next()
            },
            cancel
        }

        return iterator
    } catch (error) {
        this.ctx.logger.error('Submit function encountered an error:', error)
        throw error
    }
}

function thenableReject<T>(error: T): PromiseLike<never> {
    return {
        then: (
            resolve: (value: never) => PromiseLike<never>,
            reject: (error: T) => PromiseLike<never>
        ) => reject(error)
    }
}

function getEndPointInfo(
    apiInfo: ApiInfo<JsApiData>,
    endpoint: string | number,
    apiMap: Record<string, number>,
    config: Config
): {
    fn_index: number
    endpoint_info: EndpointInfo<JsApiData>
    dependency: Dependency
} {
    let fnIndex: number
    let endpointInfo: EndpointInfo<JsApiData>
    let dependency: Dependency

    if (typeof endpoint === 'number') {
        fnIndex = endpoint
        endpointInfo = apiInfo.unnamed_endpoints[fnIndex]
        dependency = config.dependencies.find((dep) => dep.id === endpoint)!
    } else {
        const trimmedEndpoint = endpoint.replace(/^\//, '')

        fnIndex = apiMap[trimmedEndpoint]
        endpointInfo = apiInfo.named_endpoints[endpoint.trim()]
        dependency = config.dependencies.find(
            (dep) => dep.id === apiMap[trimmedEndpoint]
        )!
    }

    if (typeof fnIndex !== 'number') {
        throw new Error(
            'There is no endpoint matching that name of fn_index matching that number.'
        )
    }
    return { fn_index: fnIndex, endpoint_info: endpointInfo, dependency }
}
