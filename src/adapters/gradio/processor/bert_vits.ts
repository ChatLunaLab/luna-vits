import type {
    Client,
    EndpointInfo,
    JsApiData
} from 'koishi-plugin-gradio-service'
import { GradioSpeaker, VitsConfig } from '../../../type'
import { VitsAdapter } from '../../base'
import { isNumeric, selectProperty } from '../../../utils'

export const type = 'bert-vits2'

export async function getSpeakerList(
    app: Client,
    config: VitsConfig<'gradio'>
) {
    const apiInfo = await app.viewApi()

    let fnIndex = config.config.fn_index ?? 'tts_fn'
    if (typeof fnIndex === 'string' && !fnIndex.startsWith('/')) {
        fnIndex = `/${fnIndex}`
    }

    let fnInfo =
        apiInfo.named_endpoints[fnIndex] || apiInfo.unnamed_endpoints[fnIndex]

    if (!fnInfo) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const findEndpoint = (
            endpoints: Record<string, EndpointInfo<JsApiData>>
        ) => {
            for (const key in endpoints) {
                const endpoint = endpoints[key]
                if (
                    endpoint.parameters.some(
                        (p) =>
                            p.parameter_name === 'speaker' ||
                            p.label.includes('选择说话人') ||
                            p.label.includes('Speaker')
                    ) &&
                    !endpoint.parameters.some((p) =>
                        p.label.includes('按句切分')
                    )
                ) {
                    fnInfo = endpoint
                    fnIndex = isNumeric(key) ? parseInt(key) : key

                    return true
                }
            }
            return false
        }

        findEndpoint(apiInfo.named_endpoints) ||
            findEndpoint(apiInfo.unnamed_endpoints)
    }

    config.config.fn_index = fnIndex

    const getComponent = (name: string, labels: string[]) =>
        fnInfo.parameters.find(
            (p) =>
                p.parameter_name === name ||
                labels.some((label) => p.label.includes(label))
        )

    const speakerComponent = getComponent('speaker', ['选择说话人', 'Speaker'])
    const languageComponent = getComponent('language', ['选择语言', 'Language'])

    let languageType = languageComponent?.enum as string[] | undefined

    if (!languageType) {
        const match = languageComponent?.description?.match(
            /Option from: \[(.*?)\]/
        )
        if (match) {
            languageType = Array.from(
                new Set(
                    match[1]
                        .match(/'([^']+)'/g)
                        ?.map((value) => value.replace(/'/g, '').trim()) || []
                )
            )
        }
    }

    if (languageType) {
        config.config.languages = languageType
            .filter((value) => !value.includes('mix'))
            .map((value) => value.toLocaleUpperCase())
    }

    if (!speakerComponent) {
        return []
    }

    let enums = speakerComponent?.enum as string[] | undefined

    if (!enums) {
        const match = speakerComponent.description.match(
            /Option from: \[(.*?)\]/
        )
        if (match) {
            enums = Array.from(
                new Set(
                    match[1]
                        .match(/'([^']+)'/g)
                        ?.map((value) => value.replace(/'/g, '').trim()) || []
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
                }) as GradioSpeaker
        ) ?? []
    )
}

export async function generatePayload(
    input: string,
    client: Client,
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
            sdp_ratio: 0.3,
            noise_scale: 0.4,
            noise_scale_w: 0.8,
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
        if (
            p.parameter_name === 'text' ||
            p.label === '输入文本内容' ||
            p.label.toLocaleLowerCase() === 'text'
        ) {
            return mix.text
        }

        if (
            p.parameter_name === 'speaker' ||
            p.label === '选择说话人' ||
            p.label === 'Speaker'
        ) {
            return mix.speaker
        }

        if (
            p.parameter_name === 'sdp_ratio' ||
            p.label === 'SDP Ratio' ||
            p.label.includes('DP混合比')
        ) {
            return mix.sdp_ratio
        }

        if (
            p.parameter_name === 'noise' ||
            p.label === 'Noise' ||
            p.label.includes('感情')
        ) {
            return mix.noise ?? mix.noise_scale
        }

        if (
            p.parameter_name === 'noise_scale' ||
            p.label === 'Noise_W' ||
            p.label.includes('音素长度')
        ) {
            return mix.noise_w ?? mix.noise_scale_w
        }

        if (
            p.parameter_name === 'length' ||
            p.label === 'Length' ||
            p.parameter_name === 'length_scale' ||
            p.label.includes('语速') ||
            p.label.includes('生成长度')
        ) {
            return mix.length ?? mix.length_scale
        }

        if (
            p.parameter_name === 'language' ||
            p.label === 'Language' ||
            p.label.includes('选择语言')
        ) {
            return mix.language
        }

        if (p.parameter_name === 'emotion' || p.label === 'Emotion') {
            return mix.emotion
        }

        if (p.parameter_name === 'prompt_mode' || p.label === 'Prompt Mode') {
            return mix.prompt_mode ?? 'Text prompt'
        }

        if (p.parameter_name === 'text_prompt' || p.label === 'Text prompt') {
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
    })
}
