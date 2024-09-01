import { Context, Element, h } from 'koishi'

import type { Client } from 'koishi-plugin-gradio-service'
import { GradioSpeaker, VitsConfig } from '../../type'
import { VitsAdapter } from '../base'
import * as bertVits from './processor/bert_vits'
import * as gptSovits1 from './processor/gpt_sovits_1'
import { TTLCache } from '../../utils'

export class GradioAdapter extends VitsAdapter {
    type = 'gradio'

    private clients: TTLCache<Client>
    private processors: Record<string, GradioProcessor> = {}

    constructor(ctx: Context) {
        super(ctx)

        this.clients = new TTLCache(ctx, 1000 * 60 * 5)

        this.addProcessor(bertVits.type, bertVits)
        this.addProcessor(gptSovits1.type, gptSovits1)
    }

    async predict(
        input: string,
        config: VitsConfig<'gradio'>,
        options: VitsAdapter.Config
    ): Promise<Element> {
        const client = await this.getGradioClient(config)
        const currentSpeaker = options.speaker as GradioSpeaker

        const payload = await this._generatePayload(
            input,
            client,
            config,
            currentSpeaker,
            options
        )

        this.ctx.logger.debug('payload %s', JSON.stringify(payload))

        const fnIndex = currentSpeaker.fn_index ?? config.config.fn_index

        currentSpeaker.fn_index = fnIndex

        try {
            const response = await client
                .predict(
                    currentSpeaker.fn_index ?? config.config.fn_index,
                    payload
                )
                .then((res) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return res['data'] as any
                })

            let url: string

            if (typeof response[0] === 'string') {
                const finalResponse = response[1]

                if (finalResponse.url) {
                    url = finalResponse.url
                } else if (finalResponse.path || finalResponse.name) {
                    const filePath = finalResponse.path || finalResponse.name
                    url = `${config.url}/file=${filePath}`
                } else {
                    this.ctx.logger.error(
                        'Invalid response:',
                        JSON.stringify(finalResponse)
                    )
                    throw new Error('Invalid response format')
                }
            } else if (
                typeof response[0] === 'object' &&
                response[0].is_file === true
            ) {
                const finalResponse = response[0]

                if (finalResponse.url) {
                    url = finalResponse.url
                } else if (finalResponse.path || finalResponse.name) {
                    const filePath = finalResponse.path || finalResponse.name
                    url = `${config.url}/file=${filePath}`
                }
            }

            if (url == null) {
                this.ctx.logger.error(
                    'Invalid response:',
                    JSON.stringify(response)
                )
                throw new Error('Invalid response format')
            }

            client.close()

            return h.audio(url)
        } catch (error) {
            this.ctx.logger.error(JSON.stringify(error))

            throw error
        }
    }

    async _generatePayload(
        input: string,
        client: Client,
        config: VitsConfig<'gradio'>,
        currentSpeaker: GradioSpeaker,
        options: VitsAdapter.Config
    ) {
        const processor = this.processors[config.config.type]

        return (
            processor?.generatePayload(
                input,
                client,
                config,
                currentSpeaker,
                options
            ) ?? {}
        )
    }

    async getSpeakerList(config: VitsConfig<'gradio'>) {
        if (config.config.auto_pull_speaker !== true) {
            return config.speakers ?? []
        }

        const processor = this.processors[config.config.type]

        const client = await this.getGradioClient(config)

        return (
            processor?.getSpeakerList(client, config) ?? config.speakers ?? []
        )
    }

    async getGradioClient(config: VitsConfig<'gradio'>) {
        const url = config.url

        if (this.clients.get(url)) {
            return this.clients.get(url)
        }

        const client = await this.ctx.gradio.connect(url, {
            hf_token: config.config.hf_token as `hf_${string}`
        })

        this.clients.set(url, client)

        return client
    }

    addProcessor(type: string, processor: GradioProcessor) {
        this.processors[type] = processor
    }
}

export interface GradioProcessor {
    type: string
    getSpeakerList: (
        client: Client,
        config: VitsConfig<'gradio'>
    ) => Promise<GradioSpeaker[]>
    generatePayload: (
        input: string,
        client: Client,
        config: VitsConfig<'gradio'>,
        currentSpeaker: GradioSpeaker,
        options: VitsAdapter.Config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Promise<any>
}
