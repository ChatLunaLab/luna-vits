import path from 'path'
import fs, { watch } from 'fs'
import {
    FishAudioSpeaker,
    GradioConfig,
    GradioSpeaker,
    QQVoiceSpeaker,
    Speaker,
    VitsConfig,
    VitsSimpleApiSpeaker
} from './type'
import { load } from 'js-yaml'
import { DataService } from '@koishijs/plugin-console'
import { Awaitable, Context, Schema } from 'koishi'
import { PromiseLock } from './utils'
import { LunaVitsService } from './service'

export class LunaVitsProvider extends DataService<string> {
    private vitsConfig: VitsConfig[] = []

    private speakerKeyIdMap: Record<number, [VitsConfig, string, Speaker]> = {}

    private speakerKeyMap: Record<string, [VitsConfig, Speaker]> = {}

    private abortController = new AbortController()

    lock = new PromiseLock()

    constructor(ctx: Context) {
        super(ctx, 'luna_vits_data')
    }

    async refresh() {
        await this.lock.lock()

        this.vitsConfig = await this.loadConfig()
        this.speakerKeyIdMap = this.mapSpeakers()
        this.speakerKeyMap = this.mapSpeakerKey()

        this.lock.unlock()

        this.ctx.schema.set(
            'speaker',
            Schema.union(Object.values(this.speakerKeyIdMap).map((s) => s[1]))
        )

        this.watchConfig()
    }

    stop(): Awaitable<void> {
        this.abortController.abort()
    }

    async loadConfig() {
        try {
            await fs.promises.access(this.resolveConfigPath())
        } catch {
            const defaultPath = path.join(__dirname, '../resources/config.yml')

            try {
                await fs.promises.mkdir(this.resolveConfigDir(), {
                    recursive: true
                })
            } catch (e) {
                //
            }
            await fs.promises.copyFile(defaultPath, this.resolveConfigPath())
        }

        const configs = load(
            await fs.promises.readFile(this.resolveConfigPath(), 'utf-8')
        ) as VitsConfig[]

        const filteredConfigs = configs
            .filter((c) => c.enabled === true || c.enabled == null)
            .map(async (config) => {
                const speakerList = await (
                    this.ctx.vits as LunaVitsService
                ).getSpeakerList(config)

                config.speakers = speakerList

                return config
            })

        return await Promise.all(filteredConfigs)
    }

    resolveConfigDir() {
        return path.resolve(this.ctx.baseDir, 'data/luna-vits')
    }

    resolveConfigPath() {
        return path.resolve(this.resolveConfigDir(), 'config.yml')
    }

    watchConfig() {
        if (this.abortController) {
            this.abortController.abort()
        }

        this.abortController = new AbortController()

        const debounceFn = this.ctx.debounce(async () => {
            this.ctx.logger.info('Configuration changed, refreshing')
            await this.refresh()
            this.ctx.logger.info(
                `Successfully loaded ${Object.keys(this.speakerKeyIdMap).length} speakers`
            )
        }, 300) // Adjust the debounce delay as needed

        watch(
            path.resolve('data/luna-vits/config.yml'),
            {
                signal: this.abortController.signal
            },
            async (event, filename) => {
                await debounceFn()
            }
        )
    }

    processSpeaker(
        speaker: Speaker,
        config: VitsConfig,
        result: [VitsConfig, string, Speaker][]
    ) {
        if (config.type === 'GPT-SoVITS2') {
            // five languages

            for (const language of ['ZH', 'EN', 'JA', 'KO', 'YUO', 'AUTO']) {
                result.push([config, `${speaker.name}_${language}`, speaker])
            }
        } else if (config.type === 'gradio') {
            const requestConfig = config.config as GradioConfig
            speaker = speaker as GradioSpeaker

            const languages = (requestConfig.languages as string[]) ?? [
                'ZH',
                'EN',
                'JA',
                'AUTO'
            ]
            if (languages) {
                for (const language of languages) {
                    result.push([
                        config,
                        `${speaker.name}_${language.toUpperCase()}`,
                        speaker
                    ])
                }
            }
        } else if (config.type === 'vits-simple-api') {
            speaker = speaker as VitsSimpleApiSpeaker

            const languages = speaker.languages
            if (languages) {
                for (const language of languages) {
                    result.push([
                        config,
                        `${speaker.name}_${language.toUpperCase()}`,
                        speaker
                    ])
                }
            }
            result.push([config, `${speaker.name}_AUTO`, speaker])
        } else if (config.type === 'qq-voice') {
            speaker = speaker as QQVoiceSpeaker

            result.push([config, `QQ_${speaker.name}_AUTO`, speaker])
        } else if (config.type === 'fish-audio') {
            speaker = speaker as FishAudioSpeaker

            const languages = speaker.languages
            if (languages) {
                for (const language of languages) {
                    result.push([
                        config,
                        `${speaker.name}_${language.toUpperCase()}`,
                        speaker
                    ])
                }
            }
            result.push([config, `${speaker.name}_AUTO`, speaker])
        }
    }

    mapSpeakers() {
        return this.vitsConfig
            .flatMap((config) => {
                const result: [VitsConfig, string, Speaker][] = []

                for (const speaker of config.speakers) {
                    this.processSpeaker(speaker, config, result)
                }

                return result
            })
            .sort((a, b) => (a[1] < b[1] ? 1 : -1))
            .map((k, index) => [k, baseSpeakId++])
            .reduce(
                (acc, [k, v]) => {
                    acc[v as number] = k as [VitsConfig, string, Speaker]
                    return acc
                },
                {} as Record<number, [VitsConfig, string, Speaker]>
            )
    }

    mapSpeakerKey() {
        return Object.fromEntries(
            Object.entries(this.speakerKeyIdMap).map(([k, v]) => [
                v[1],
                [v[0], v[2]] as [VitsConfig, Speaker]
            ])
        )
    }

    // format as markdown table item list [speaker_name, speaker_id]
    get() {
        return this.lock.runLocked(async () => {
            const speakers = Object.entries(this.speakerKeyIdMap)
                .map(([k, v]) => [v[1], k])
                .map(([speaker, id]) => `| ${speaker} | ${id} |`)
                .join('\n')

            const usage = await fs.promises.readFile(
                path.resolve(__dirname, '../resources/usage.md'),
                'utf-8'
            )

            return usage.replace('{speakers}', speakers)
        })
    }

    async getVitsConfig() {
        return this.lock.runLocked(() => this.vitsConfig)
    }

    async getSpeakerKeyIdMap() {
        return this.lock.runLocked(() => this.speakerKeyIdMap)
    }

    async getSpeakerKeyMap() {
        return this.lock.runLocked(() => this.speakerKeyMap)
    }

    static name = 'luna-vits-config'

    static inject = {
        console: {
            required: true
        },
        vits: {
            required: true
        },
        gradio: {
            required: false
        }
    } as unknown as string[]
}

let baseSpeakId = 114514

declare module '@koishijs/plugin-console' {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Console {
        interface Services {
            luna_vits_data: LunaVitsProvider
        }
    }
}
