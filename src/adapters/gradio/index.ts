import { Element, h } from 'koishi'

import type { Client } from 'koishi-plugin-gradio-service'
import { VitsConfig, GradioSpeaker } from '../../type'
import { selectProperty } from '../../utils'
import { VitsAdapter } from '../base'

export class GradioAdapter extends VitsAdapter {
    type = 'gradio'

    private clients: Record<string, Client> = {}

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

                if (typeof finalResponse.url === 'string') {
                    url = finalResponse.url
                } else if (typeof finalResponse.path === 'string') {
                    // ?
                    url = config.url + finalResponse.path
                } else if (typeof finalResponse.name === 'string') {
                    url = config.url + '/file=' + finalResponse.name
                } else {
                    this.ctx.logger.error(JSON.stringify(finalResponse))
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
        switch (config.config.type) {
            case 'bert-vits2':
                return this._generateBertVits2Payload(
                    input,
                    client,
                    currentSpeaker,
                    options
                )
            default:
                return []
        }
    }

    async _generateBertVits2Payload(
        input: string,
        client: Client,
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
            'length',
            'text_prompt',
            'style_text',
            'style_weight',
            'emotion',
            'prompt_mode',
            'language'
        ])

        const additionalConfig = selectProperty(options, [
            'noise',
            'noise_w',
            'sdp_radio',
            'length_scale',
            'length',
            'text_prompt',
            'style_text',
            'style_weight',
            'emotion',
            'prompt_mode',
            'language'
        ])

        const mix = Object.assign(
            {
                sdp_ratio: 0.5,
                noise_scale: 0.5,
                noise_scale_w: 0.9,
                length_scale: 1,
                language: 'ZH',
                emotion: 'Happy',
                prompt_mode: 'Text prompt',
                reference_audio: null,
                style_text: 'Hello!!',
                style_weight: 0
            },
            baseConfig,
            additionalConfig,
            payload
        )

        const apiInfo = await client.viewApi()

        const apiData =
            apiInfo.unnamed_endpoints[speaker.fn_index] ??
            apiInfo.named_endpoints[speaker.fn_index]

        return apiData.parameters.map((p) => {
            if (p.parameter_name === 'text' || p.label === '输入文本内容') {
                return mix.text
            }

            if (
                p.parameter_name === 'speaker' ||
                p.label === '选择说话人' ||
                p.label === 'Speaker'
            ) {
                return mix.speaker
            }

            if (p.parameter_name === 'sdr_ratio' || p.label === 'SDP Ratio') {
                return mix.sdp_ratio
            }

            if (p.parameter_name === 'noise' || p.label === 'Noise') {
                return mix.noise ?? mix.noise_scale
            }

            if (p.parameter_name === 'noise_scale' || p.label === 'Noise_W') {
                return mix.noise_w ?? mix.noise_scale_w
            }

            if (p.parameter_name === 'length' || p.label === 'Length') {
                return mix.length ?? mix.length_scale
            }

            if (p.parameter_name === 'language' || p.label === 'Language') {
                return mix.language
            }

            if (p.parameter_name === 'emotion' || p.label === 'Emotion') {
                return mix.emotion
            }

            if (
                p.parameter_name === 'prompt_mode' ||
                p.label === 'Prompt Mode'
            ) {
                return mix.prompt_mode ?? 'Text prompt'
            }

            if (
                p.parameter_name === 'text_prompt' ||
                p.label === 'Text prompt'
            ) {
                return mix.text_prompt ?? 'Happy'
            }

            if (p.label === '辅助文本') {
                return ''
            }

            if (p.parameter_name === 'style_text' || p.label === 'Style Text') {
                return mix.style_text
            }

            if (p.parameter_name === 'style_weight' || p.label === 'Weight') {
                return mix.style_weight
            }

            if (
                p.parameter_name === 'reference_audio' ||
                p.label === 'Audio prompt'
            ) {
                return null
            }

            return mix[p.parameter_name]
        })
    }

    async getSpeakerList(config: VitsConfig<'gradio'>) {
        if (config.config.auto_pull_speaker !== true) {
            return config.speakers ?? []
        }

        switch (config.config.type) {
            case 'bert-vits2':
                return this.getBertVits2SpeakerList(config)
            default:
                return config.speakers ?? []
        }
    }

    async getBertVits2SpeakerList(config: VitsConfig<'gradio'>) {
        const app = await this.getGradioClient(config)

        const apiInfo = await app.viewApi()

        let fnIndex = config.config.fn_index ?? 'tts_fn'

        if (typeof fnIndex === 'string' && !fnIndex.startsWith('/')) {
            fnIndex = `/${fnIndex}`
        }

        let fnInfo = apiInfo.named_endpoints[fnIndex]

        if (!fnInfo) {
            fnInfo = apiInfo.unnamed_endpoints[fnIndex]
        }

        if (!fnInfo) {
            for (const key in apiInfo.named_endpoints) {
                if (
                    apiInfo.named_endpoints[key].parameters.some(
                        (p) =>
                            p.parameter_name === 'speaker' ||
                            (p.label.includes('选择说话人') &&
                                p.component === 'Dropdown')
                    )
                ) {
                    fnInfo = apiInfo.named_endpoints[key]
                    fnIndex = key
                }
            }
        }

        if (!fnInfo) {
            for (const key in apiInfo.unnamed_endpoints) {
                if (
                    apiInfo.unnamed_endpoints[key].parameters.some(
                        (p) =>
                            p.parameter_name === 'speaker' ||
                            p.label.includes('选择说话人') ||
                            p.label.includes('Speaker')
                    ) &&
                    !apiInfo.unnamed_endpoints[key].parameters.some((p) =>
                        p.label.includes('按句切分')
                    )
                ) {
                    fnInfo = apiInfo.unnamed_endpoints[key]
                    fnIndex = parseInt(key)
                }
            }
        }

        config.config.fn_index = fnIndex

        const speakerComponent = fnInfo.parameters.find(
            (p) =>
                p.parameter_name === 'speaker' ||
                p.label.includes('选择说话人') ||
                p.label.includes('Speaker')
        )

        const languageComponent = fnInfo.parameters.find(
            (p) =>
                p.parameter_name === 'language' ||
                p.label.includes('选择语言') ||
                p.label.includes('Language')
        )

        let languageType = languageComponent?.enum

        if (!languageType) {
            // Match description and extract language options
            // Option from: [('ZH', 'ZH'), ('JP', 'JP'), ('EN', 'EN'), ('auto', 'auto'), ('mix', 'mix')]
            // => ['ZH', 'JP', 'EN', 'auto', 'mix']
            const match = languageComponent?.description?.match(
                /Option from: \[(.*?)\]/
            )
            if (match) {
                languageType = Array.from(
                    new Set(
                        match[1]
                            .match(/'([^']+)'/g)
                            ?.map((value) => value.replace(/'/g, '').trim()) ||
                            []
                    )
                )
            }
        }

        if (languageType != null && languageType.length > 0) {
            config.config.languages = languageType
                .filter((value) => !value.includes('mix'))
                .map((value) => value.toLocaleUpperCase())
        }

        if (!speakerComponent) {
            return []
        }

        let enums = speakerComponent?.enum

        if (enums === undefined) {
            // Match description Option from: [('永雏塔菲', '永雏塔菲')]
            // => array ['永雏塔菲']
            const match = speakerComponent.description.match(
                /Option from: \[(.*?)\]/
            )
            if (match) {
                enums = Array.from(
                    new Set(
                        match[1]
                            .match(/'([^']+)'/g)
                            ?.map((value) => value.replace(/'/g, '').trim()) ||
                            []
                    )
                )
            }
        }

        return (
            enums?.map(
                (value) =>
                    ({
                        name: value,
                        fn_index: fnIndex
                    }) satisfies GradioSpeaker
            ) ?? []
        )
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
}
