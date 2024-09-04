import type {
    Client,
    Dependency,
    EndpointInfo,
    JsApiData
} from 'koishi-plugin-gradio-service'
import { GradioSpeaker, VitsConfig } from '../../../type'
import { VitsAdapter } from '../../base'
import { isNumeric, selectProperty } from '../../../utils'

// ??? webui version
export const type = 'gpt-sovits2-v1'

export async function getSpeakerList(
    app: Client,
    config: VitsConfig<'gradio'>
) {
    const speakers = config.speakers

    if (speakers.length === 0) {
        throw new Error(
            'The speakers list is empty. Please specify the speaker manually.'
        )
    }

    const apiInfo = await app.viewApi()

    const appConfig = await app.resolveConfig()

    let fnInfo: EndpointInfo<JsApiData> | undefined
    let fnIndex: number | string | undefined

    const findEndpoint = (
        endpoints: Record<string, EndpointInfo<JsApiData>>,
        componentType: string
    ) => {
        for (const [key, value] of Object.entries(endpoints)) {
            if (
                value.returns.length === 1 &&
                value.returns[0].label.includes('输出的语音') &&
                value.returns[0].component.toLowerCase() === componentType
            ) {
                return {
                    fnInfo: value,
                    fnIndex: isNumeric(key) ? parseInt(key) : key
                }
            }
        }
    }

    const findComponent = (
        fnInfo: EndpointInfo<JsApiData>,
        labels: string[]
    ) => {
        for (const [key, value] of Object.entries(fnInfo.parameters)) {
            if (labels.some((label) => value.label.includes(label))) {
                return { componentInfo: value, componentIndex: parseInt(key) }
            }
        }
    }

    const getAppComponent = (dependency: Dependency, id: number) => {
        return appConfig.components.find(
            (component) => component.id === dependency.inputs[id]
        )
    }

    // eslint-disable-next-line prefer-const
    ;({ fnInfo, fnIndex } =
        findEndpoint(apiInfo.named_endpoints, 'audio') ||
        findEndpoint(apiInfo.unnamed_endpoints, 'audio') ||
        {})

    if (!fnInfo || fnIndex === undefined) {
        throw new Error('No valid endpoint found')
    }

    const pureFnIndex =
        typeof fnIndex === 'string' ? fnIndex.replace(/^\//, '') : ''

    const dependency = appConfig.dependencies.find(
        (dep) =>
            dep.id === fnIndex ||
            dep.id === app.apiMap[pureFnIndex.replace(/^\//, '')] ||
            dep.api_name === pureFnIndex.replace(/^\//, '')
    )

    const referenceAudioInfo = findComponent(fnInfo, ['选择参考音频'])
    const languageInfo = findComponent(fnInfo, ['合成的语种'])
    const referenceAudioLanguage = findComponent(fnInfo, ['参考音频的语种'])

    if (!referenceAudioInfo) {
        throw new Error('No reference audio parameter found')
    }

    const referenceAudioComponent = getAppComponent(
        dependency,
        referenceAudioInfo.componentIndex
    )
    const languageComponent = getAppComponent(
        dependency,
        languageInfo.componentIndex
    )

    const referenceAudioChoices = referenceAudioComponent.props['choices'] as [
        string,
        string
    ][]

    const languageChoices = (
        languageComponent.props['choices'] as [string, string][]
    ).map(([value]) => value)

    config.config['referenceAudio'] =
        referenceAudioInfo.componentInfo.enum ??
        referenceAudioChoices.map(([, value]) => value)

    config.config['referenceAudioLanguage'] =
        languagesMap[
            referenceAudioLanguage.componentInfo.parameter_default ?? '中文'
        ]

    config.config['languages'] = languageChoices
        .map((value) => languagesMap[value])
        .filter((value) => value != null)

    return config.speakers.map((speaker) => ({
        ...speaker,
        fn_index: fnIndex
    }))
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
        prompt_text: randomPromptText(config),
        prompt_lang: config.config['referenceAudioLanguage'] as string,
        text_split_method: '按标点符号切',
        speed: 1,
        temperature: 1,
        top_p: 0.9,
        top_k: 15,
        if_freeze: false
    }

    const baseConfig = selectProperty(speaker, [
        'text_split_method',
        'language',
        'prompt_text',
        'prompt_lang',
        'temperature',
        'top_p',
        'speed',
        'top_k'
    ])

    const additionalConfig = selectProperty(options, [
        'text_split_method',
        'language',
        'prompt_text',
        'prompt_lang',
        'temperature',
        'top_p',
        'speed',
        'top_k'
    ])

    const mix = Object.assign(
        {
            prompt_text: randomPromptText(config),
            prompt_lang: config.config['referenceAudioLanguage'] as string
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
        if (p.parameter_name === 'text' || p.label === '需要合成的文本') {
            return mix.text
        }

        if (p.label.includes('需要合成的语种')) {
            return languagesKeyMap[mix.language.toLocaleLowerCase()]
        }

        if (p.label.includes('怎么切')) {
            return mix.text_split_method
        }

        if (
            p.label.includes('选择参考音频') ||
            p.label.includes('参考音频文本')
        ) {
            return mix.prompt_text
        }

        if (
            p.label.includes('参考音频语种') ||
            p.label.includes('参考音频的语种')
        ) {
            return (
                languagesKeyMap[mix.prompt_lang.toLocaleLowerCase()] ??
                mix.prompt_lang
            )
        }

        if (p.label.includes('top_k')) {
            return mix.top_k
        }

        if (p.label.includes('top_p')) {
            return mix.top_p
        }

        if (p.label.includes('temperature')) {
            return mix.temperature
        }

        if (p.label.includes('语速')) {
            return mix.speed
        }

        if (p.label.includes('是否直接对上次合成结果调整语速和音色')) {
            return mix.if_freeze
        }
    })
}

function randomPromptText(config: VitsConfig<'gradio'>) {
    const texts = config.config['referenceAudio'] as string[]

    return texts[Math.floor(Math.random() * texts.length)]
}

const languagesMap = {
    中文: 'zh',
    英文: 'en',
    韩文: 'ko',
    日英混合: 'ja',
    多语种混合: 'auto'
}

const languagesKeyMap = Object.fromEntries(
    Object.entries(languagesMap).map(([key, value]) => [value, key])
)
