import type {
    Client,
    Dependency,
    EndpointInfo,
    JsApiData
} from 'koishi-plugin-gradio-service'
import { GradioSpeaker, VitsConfig } from '../../../type'
import { VitsAdapter } from '../../base'
import { selectProperty } from '../../../utils'

// xzjosh webui version
export const type = 'gpt-sovits-xzjosh'

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
                return { fnInfo: value, fnIndex: parseInt(key) }
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

    const dependency =
        typeof fnIndex === 'number'
            ? appConfig.dependencies.find((dep) => dep.id === fnIndex)!
            : appConfig.dependencies.find(
                  (dep) =>
                      dep.id ===
                      app.apiMap[(fnIndex as string).replace(/^\//, '')]
              )

    const referenceAudioInfo = findComponent(fnInfo, ['选择参考音频'])
    const languageInfo = findComponent(fnInfo, ['合成的语种'])

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

    config.config['referenceAudio'] = referenceAudioChoices.map(
        ([, value]) => value
    )

    config.config['languages'] = languageChoices.map(
        (value) => languagesMap[value]
    )

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
        // ?，不是中文在说
        prompt_lang: 'zh',
        text_split_method: '凑五句一切'
    }

    const baseConfig = selectProperty(speaker, [
        'text_split_method',
        'language',
        'prompt_text',
        'prompt_lang'
    ])

    const additionalConfig = selectProperty(options, [
        'text_split_method',
        'language',
        'prompt_text',
        'prompt_lang'
    ])

    const mix = Object.assign(
        {
            prompt_text: randomPromptText(config),
            // ?，不是中文在说
            prompt_lang: 'zh'
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

        if (p.label.includes('自动切分')) {
            return mix.text_split_method
        }

        if (
            p.label.includes('选择参考音频') ||
            p.label.includes('参考音频文本')
        ) {
            return mix.prompt_text
        }

        if (p.label.includes('参考音频语种')) {
            return languagesKeyMap[mix.prompt_lang.toLocaleLowerCase()]
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
    日文: 'ja'
}

const languagesKeyMap = Object.fromEntries(
    Object.entries(languagesMap).map(([key, value]) => [value, key])
)
