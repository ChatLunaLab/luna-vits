import { Context, Element, h } from 'koishi'

import type { Client } from 'koishi-plugin-gradio-service'
import { GradioSpeaker, VitsConfig } from '../../type'
import { VitsAdapter } from '../base'
import * as bertVits from './processor/bert_vits'

export class GradioAdapter extends VitsAdapter {
    type = 'gradio'

    private clients: Record<string, Client> = {}
    private processors: Record<string, GradioProcessor> = {}

    constructor(ctx: Context) {
        super(ctx)

        this.addProcessor(bertVits.type, bertVits)
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

            if (typeof response[0] === 'string') {
                const finalResponse = response[1]

                let url: string

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

                client.close()

                return h.audio(url)
            }
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

        return processor?.getSpeakerList(config) ?? config.speakers ?? []
    }

    async getGradioClient(config: VitsConfig<'gradio'>) {
        const url = config.url

        if (this.clients[url]) {
            return this.clients[url]
        }

        const client = await this.ctx.gradio.connect(url, {
            hf_token: config.config.hf_token as `hf_${string}`
        })

        this.clients[url] = client

        return client
    }

    addProcessor(type: string, processor: GradioProcessor) {
        this.processors[type] = processor
    }
}

export interface GradioProcessor {
    type: string
    getSpeakerList: (config: VitsConfig<'gradio'>) => Promise<GradioSpeaker[]>
    generatePayload: (
        input: string,
        client: Client,
        config: VitsConfig<'gradio'>,
        currentSpeaker: GradioSpeaker,
        options: VitsAdapter.Config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Promise<any>
}
