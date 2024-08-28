import { Element, h } from 'koishi'
import { GradioSpeaker, VitsConfig } from '../type'
import { VitsAdapter } from './base'
import type { Client } from 'koishi-plugin-gradio-service'
import { selectProperty } from '../utils'

export class GradioAdapter extends VitsAdapter {
    type = 'gradio'

    private client: Client

    async predict(
        input: string,
        config: VitsConfig<'gradio'>,
        options: VitsAdapter.Config
    ): Promise<Element> {
        const currentSpeaker = options.speaker as GradioSpeaker

        const payload = await this._generatePayload(
            input,
            config,
            currentSpeaker,
            options
        )

        const response = await this.client
            .predict(currentSpeaker.fn_index ?? config.config.fn_index, payload)
            .then((res) => {
                console.log(res)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return res['data'] as any
            })

        if (typeof response[0] === 'string') {
            const finalResponse = response[1]

            const url =
                finalResponse.url ?? config.url + '/' + finalResponse.path

            return h.audio(url)
        }
    }

    async _generatePayload(
        input: string,
        config: VitsConfig<'gradio'>,
        currentSpeaker: GradioSpeaker,
        options: VitsAdapter.Config
    ) {
        switch (config.config.type) {
            case 'bert-vits2':
                return this._generateBertVits2Payload(
                    input,
                    config,
                    currentSpeaker,
                    options
                )
            default:
                return []
        }
    }

    async _generateBertVits2Payload(
        input: string,
        config: VitsConfig<'gradio'>,
        speaker: GradioSpeaker,
        options: VitsAdapter.Config
    ) {
        const payload: Record<string, boolean | number | string> = {
            text: input,
            language: options.language,
            speaker: speaker.name
        }

        const baseConfig = selectProperty(speaker, [
            'noise',
            'noise_w',
            'sdp_radio',
            'length_scale',
            'text_prompt'
        ])

        const additionalConfig = selectProperty(options, [
            'noise',
            'noise_w',
            'segment_size',
            'emotion',
            'text_prompt',
            'length_scale'
        ])

        return Object.assign(
            {
                sdp_ratio: 0.5,
                noise_scale: 0.5,
                noise_scale_w: 0.9,
                length_scale: 1,
                language: 'ZH',
                emotion: 'Happy',
                prompt_mode: 'Text prompt'
            },
            baseConfig,
            additionalConfig,
            payload
        )
    }

    async getSpeakerList(config: VitsConfig<'gradio'>) {
        if (!config.config.auto_pull_speaker) {
            return []
        }

        switch (config.config.type) {
            case 'bert-vits2':
                return this.getBertVits2SpeakerList(config)
            default:
                return []
        }
    }

    async getBertVits2SpeakerList(config: VitsConfig<'gradio'>) {
        const app = await this.getGradioClient(config)

        this.client = app

        const apiInfo = await app.viewApi()

        const fnIndex = config.config.fn_index ?? 'tts_fn'

        const fnInfo = apiInfo.named_endpoints[fnIndex]

        const speakerComponent = fnInfo.parameters.find(
            (p) =>
                p.parameter_name === 'speaker' ||
                (p.label.includes('选择说话人') && p.component === 'Dropdown')
        )

        const languageComponent = fnInfo.parameters.find(
            (p) =>
                p.parameter_name === 'language' ||
                (p.label.includes('选择语言') && p.component === 'Dropdown')
        )

        const languageEnums = languageComponent?.type as unknown as {
            enum: string[]
            type: string
        }

        if (languageEnums) {
            config.config.languages = languageEnums.enum
                .filter((value) => value.includes('mix'))
                .map((value) => value.toLocaleUpperCase())
        }

        if (!speakerComponent) {
            return []
        }

        const enums = speakerComponent.type as unknown as {
            enum: string[]
            type: string
        }

        return (
            enums?.enum?.map(
                (value) =>
                    ({
                        name: value,
                        fn_index: fnIndex
                    }) satisfies GradioSpeaker
            ) ?? []
        )
    }

    async getGradioClient(config: VitsConfig<'gradio'>) {
        return await this.ctx.gradio.connect(config.url, {
            hf_token: config.config.hf_token as `hf_${string}`
        })
    }
}
