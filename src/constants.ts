import path from 'path'
import fs from 'fs'
import { GradioConfig, VitsConfig } from './type'
import { load } from 'js-yaml'

export const VitsConfigList: VitsConfig[] = (function () {
    const dir = path.resolve('data/luna-vits')
    const file = path.resolve(dir, 'config.yml')

    if (!fs.existsSync(file)) {
        const defaultPath = path.join(__dirname, '../resources/config.yml')

        try {
            fs.mkdirSync(dir)
        } catch (e) {
            //
        }
        fs.copyFileSync(defaultPath, file)
    }

    return load(fs.readFileSync(file, 'utf-8')) as VitsConfig[]
})()

let baseSpeakId = 114514

// as { [key: number]: [config,name] }
export const SpeakerKeyIdMap = VitsConfigList.flatMap((config) => {
    const result: [VitsConfig, string][] = []

    for (const speaker of config.speakers) {
        if (config.type === 'GPT-SoVITS2') {
            // five languages
            for (const language of ['ZH', 'EN', 'JA', 'KO', 'YUO']) {
                result.push([config, `${speaker.name}_${language}`])
            }
        } else if (config.type === 'gradio') {
            const requestConfig = config.config as GradioConfig

            if (requestConfig.langauges) {
                result.push([config, `${speaker.name}_${requestConfig}`])
            }
        }
    }

    return result
})
    .sort((a, b) => (a < b ? 1 : -1))
    .map((k, index) => [k, baseSpeakId++])
    .reduce(
        (acc, [k, v]) => {
            acc[v as number] = k as [VitsConfig, string]
            return acc
        },
        {} as Record<number, [VitsConfig, string]>
    )

// reverse SpeakerKeyIdMap
export const SpeakerKeyMap = Object.fromEntries(
    Object.entries(SpeakerKeyIdMap).map(([k, v]) => [v, k])
)
