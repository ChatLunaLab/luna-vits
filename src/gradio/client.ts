/* eslint-disable @typescript-eslint/naming-convention */
import { Context } from 'koishi'
import {
    ApiInfo,
    client_return,
    ClientOptions,
    Config,
    GradioEvent,
    JsApiData,
    PostResponse,
    PredictReturn,
    Status,
    SubmitIterable
} from './types'
import { processEndpoint } from './helpers/api_info'
import { API_INFO_ERROR_MSG, CONFIG_ERROR_MSG } from './constants'
import {
    mapNamesToIds,
    parseAndSetCookies,
    resolveConfig,
    resolveCookies
} from './helpers/init_helpers'
import { viewApi } from './utils/view_api'
import { closeStream, openStream, readableStream } from './utils/stream'
import { postData } from './utils/post_data'
import { submit } from './utils/submit'
import { predict } from './utils/predict'

export class GradioClient {
    appReference: string
    options: ClientOptions

    config: Config | undefined
    apiInfo: ApiInfo<JsApiData> | undefined
    apiMap: Record<string, number> = {}
    session_hash: string = Math.random().toString(36).substring(2)
    jwt: string | false = false
    lastStatus: Record<string, Status['stage']> = {}

    private cookies: string | null = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private resolveConfig: (url: string) => Promise<any>
    private resolveCookie: () => Promise<void>
    private viewApi: () => Promise<ApiInfo<JsApiData>>
    openStream: () => Promise<void>

    postData: (
        url: string,
        data: unknown,
        headers?: Headers
    ) => Promise<[PostResponse, number]>

    submit: (
        endpoint: string | number,
        data: unknown[] | Record<string, unknown> | undefined,
        event_data?: unknown,
        trigger_id?: number | null,
        all_events?: boolean
    ) => SubmitIterable<GradioEvent>

    predict: (
        endpoint: string | number,
        data: unknown[] | Record<string, unknown> | undefined,
        event_data?: unknown
    ) => Promise<PredictReturn>

    // streaming
    streamStatus = { open: false }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pendingStreamMessages: Record<string, any[][]> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pendingDiffStreams: Record<string, any[][]> = {}
    eventCallbacks: Record<string, (data?: unknown) => Promise<void>> = {}
    unclosedEvents: Set<string> = new Set()

    abortController: AbortController | null = null
    streamInstance: EventSource | null = null

    constructor(
        public ctx: Context,
        appReference: string,
        options: ClientOptions = { events: ['data'] }
    ) {
        this.appReference = appReference
        if (!options.events) {
            options.events = ['data']
        }

        this.options = options

        this.resolveConfig = resolveConfig.bind(this)
        this.resolveCookie = resolveCookies.bind(this)
        this.viewApi = viewApi.bind(this)
        this.openStream = openStream.bind(this)
        this.postData = postData.bind(this)
        this.submit = submit.bind(this)
        this.predict = predict.bind(this)

        ctx.on('dispose', () => {
            this.close()
        })
    }

    async init() {
        if (this.options.auth) {
            await this.resolveCookie()
        }

        await this._resolveConfig()

        this.apiInfo = await this.viewApi()
        this.apiMap = mapNamesToIds(this.config?.dependencies || [])
    }

    private async _resolveConfig() {
        const { http_protocol: protocol, host } = await processEndpoint(
            this.appReference,
            this.options.hf_token
        )
        // REMOVE SPACE CHECK

        const { status_callback: statusCallback } = this.options

        /*
        if (space_id && status_callback) {
             await check_and_wake_space(space_id, status_callback)
        } */

        let config: Config | undefined

        try {
            config = await this.resolveConfig(`${protocol}//${host}`)

            if (!config) {
                throw new Error(CONFIG_ERROR_MSG)
            }

            return this._configSuccess(config)
        } catch (e: unknown) {
            if (statusCallback)
                statusCallback({
                    status: 'error',
                    message: 'Could not load this space.',
                    load_status: 'error',
                    detail: 'NOT_FOUND'
                })
            throw e
        }
    }

    private async _configSuccess(
        _config: Config
    ): Promise<Config | client_return> {
        this.config = _config

        if (this.config.auth_required) {
            return this.prepareReturnObj()
        }

        try {
            this.apiInfo = await this.viewApi()
        } catch (e) {
            this.ctx.logger.error(API_INFO_ERROR_MSG + (e as Error).message)
        }

        return this.prepareReturnObj()
    }

    stream(url: URL): EventSource {
        const headers = new Headers()
        if (this && this.cookies) {
            headers.append('Cookie', this.cookies)
        }

        this.abortController = new AbortController()

        this.streamInstance = readableStream(this.ctx, url.toString(), {
            credentials: 'include',
            headers,
            signal: this.abortController.signal
        })

        return this.streamInstance
    }

    private prepareReturnObj(): client_return {
        return {
            config: this.config,
            predict: this.predict,
            submit: this.submit,
            viewApi: this.viewApi
        }
    }

    public setCookies(cookies: string): void {
        this.cookies = parseAndSetCookies(cookies).join('; ')
    }

    static async connect(ctx: Context, url: string, options?: ClientOptions) {
        const client = new GradioClient(ctx, url, options)

        await client.init()

        return client
    }

    close(): void {
        closeStream(this.streamStatus, this.abortController)
    }
}
