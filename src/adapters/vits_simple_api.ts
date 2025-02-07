import { Element, h } from 'koishi'
import { BaseSpeaker, VitsConfig, VitsSimpleApiSpeaker } from '../type'
import { VitsAdapter } from './base'
import fs from 'fs'
import path from 'path'
import { getAudioFileExtension, selectProperty } from '../utils'
import { mappingLanguageToGPTSoVits } from './gpt_sovits2_api'

export class VitsSimpleAPIAdapter extends VitsAdapter {
    type = 'vits-simple-api' as const

    async predict(
        input: string,
        config: VitsConfig<'vits-simple-api'>,
        options: VitsAdapter.Config
    ): Promise<Element> {
        const currentSpeaker = options.speaker as VitsSimpleApiSpeaker

        const [payload, url, headers] = this._generatePayload(
            input,
            config,
            currentSpeaker,
            options
        )

        this.ctx.logger.debug('payload, %s', JSON.stringify(payload))

        // pack payload
        const formData = new FormData()

        for (const [key, value] of Object.entries(payload)) {
            if (key === 'reference_audio') {
                // load file to blob
                const filePath = value as string
                const file = fs.readFileSync(filePath)
                const blob = new Blob([file], {
                    type: getAudioFileExtension(path.extname(filePath))
                })
                formData.append(key, blob, path.basename(filePath))
                continue
            }
            formData.append(key, value.toString())
        }

        const response = await this.ctx.http.post(url, formData, {
            headers,
            responseType: 'arraybuffer'
        })

        return h.audio(response, payload['format'] ?? 'wav')
    }

    private _generatePayload(
        input: string,
        config: VitsConfig<'vits-simple-api'>,
        speaker: VitsSimpleApiSpeaker,
        options: VitsAdapter.Config
    ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: [Record<string, any>, string, Record<string, string>] = [
            {},
            config.url,
            Object.assign({}, config.headers ?? {})
        ]
        if (speaker.type === 'VITS') {
            payload[0] = this._generateVitsPayload(input, speaker, options)
            payload[1] = `${config.url}/voice/vits`
        } else if (speaker.type === 'W2V2-VITS') {
            payload[0] = this._generateW2V2VitsPayload(
                input,

                speaker,
                options
            )
            payload[1] = `${config.url}/voice/w2v2-vits`
        } else if (speaker.type === 'BERT-VITS2') {
            payload[0] = this._generateBertVits2Payload(input, speaker, options)
            payload[1] = `${config.url}/voice/bert-vits2`
        } else if (speaker.type === 'GPT-SOVITS') {
            payload[0] = this._generateGPTSoVitsPayload(input, speaker, options)
            payload[1] = `${config.url}/voice/gpt-sovits`
        }

        payload[2] = {}

        if (config.config.api_key) {
            payload[2]['X-API-KEY'] = config.config.api_key
        }

        for (const key of ['lang', 'prompt_lang']) {
            if (payload[0][key]) {
                payload[0][key] = mappingLanguageToGPTSoVits(payload[0][key])
            }
        }

        return payload
    }

    private _generateVitsPayload(
        input: string,
        speaker: VitsSimpleApiSpeaker,
        options: VitsAdapter.Config
    ) {
        const payload: Record<string, boolean | number | string> = {
            text: input,
            id: speaker.id,
            lang: options.language
        }

        const baseConfig = selectProperty(speaker, [
            'length',
            'noise',
            'format',
            'noise_w',
            'segment_size'
        ])

        const additionalConfig = selectProperty(options, [
            'length',
            'noise',
            'noise_w',
            'segment_size'
        ])

        return Object.assign({}, baseConfig, additionalConfig, payload)
    }

    private _generateW2V2VitsPayload(
        input: string,
        speaker: VitsSimpleApiSpeaker,
        options: VitsAdapter.Config
    ) {
        const payload: Record<string, boolean | number | string> = {
            text: input,
            id: speaker.id,
            lang: options.language
        }

        const baseConfig = selectProperty(speaker, [
            'length',
            'noise',
            'format',
            'noise_w',
            'segment_size',
            'emotion'
        ])

        const additionalConfig = selectProperty(options, [
            'length',
            'noise',
            'noise_w',
            'segment_size',
            'emotion'
        ])

        return Object.assign({}, baseConfig, additionalConfig, payload)
    }

    private _generateBertVits2Payload(
        input: string,
        speaker: VitsSimpleApiSpeaker,
        options: VitsAdapter.Config
    ) {
        const payload: Record<string, boolean | number | string> = {
            text: input,
            id: speaker.id,
            lang: options.language
        }

        const baseConfig = selectProperty(speaker, [
            'length',
            'noise',
            'noise_w',
            'segment_size',
            'sdp_radio',
            'format',
            'text_prompt'
        ])

        const additionalConfig = selectProperty(options, [
            'length',
            'noise',
            'noise_w',
            'segment_size',
            'emotion',
            'text_prompt'
        ])

        return Object.assign({}, baseConfig, additionalConfig, payload)
    }

    private _generateGPTSoVitsPayload(
        input: string,
        speaker: VitsSimpleApiSpeaker,
        options: VitsAdapter.Config
    ) {
        const payload: Record<string, boolean | number | string> = {
            text: input,
            id: speaker.id,
            lang: options.language
        }

        const baseConfig = selectProperty(speaker, [
            'segment_size',
            'batch_size',
            'temperature',
            'top_p',
            'speed',
            'top_k',
            'preset',
            'prompt_text',
            'prompt_lang',
            'reference_audio'
        ])

        const additionalConfig = selectProperty(options, [
            'segment_size',
            'batch_size',
            'temperature',
            'top_p',
            'speed',
            'top_k',
            'preset'
        ])

        return Object.assign({}, baseConfig, additionalConfig, payload)
    }

    async getSpeakerList(config: VitsConfig) {
        const simpleApiConfig = config as VitsConfig<'vits-simple-api'>
        const baseList = simpleApiConfig.speakers

        if (!simpleApiConfig.config.auto_pull_speaker) {
            return baseList
        }

        const additionalList = await this._fetchSpeakerList(simpleApiConfig)

        return baseList.concat(additionalList)
    }

    private async _fetchSpeakerList(config: VitsConfig<'vits-simple-api'>) {
        try {
            const result: VitsSimpleApiSpeaker[] = []
            const speakerMap = (await this.ctx.http.get(
                `${config.url}/voice/speakers`,
                {
                    headers: Object.assign(
                        {
                            'Content-Type': 'application/json'
                        },
                        config.headers ?? {}
                    )
                }
            )) as Record<string, Speakers[]>

            for (const [key, value] of Object.entries(speakerMap)) {
                if (key === 'HUBERT-VITS') {
                    continue
                }

                for (const speaker of value) {
                    result.push({
                        name: speaker.name,
                        id: speaker.id,
                        languages: speaker.lang,
                        type: key as VitsSimpleApiSpeaker['type']
                    })
                }
            }

            return result
        } catch (error) {
            this.ctx.logger.error('Failed to fetch speaker list:', error)
            return []
        }
    }
}

declare module './base' {
    export interface Config
        extends Record<
            string,
            string | boolean | number | string[] | BaseSpeaker
        > {
        // GPT-SoVITS 的配置
        segment_size?: number
        batch_size?: number
        temperature?: number
        top_p?: number
        speed?: number
        top_k?: number

        // BERT-VITS2 / VITS / W2V2-VITS 的配置
        noise?: number
        noise_w?: number
        sdp_ratio?: number
        text_prompt?: string

        // W2V2-VITS 的配置
        emotion?: number
    }
}

interface Speakers {
    id: number
    lang: string[]
    name: string
}
