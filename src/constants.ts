import path from 'path'
import fs, { watch } from 'fs'
import { GradioConfig, GradioSpeaker, Speaker, VitsConfig } from './type'
import { load } from 'js-yaml'
import { DataService } from '@koishijs/plugin-console'
import { Awaitable, Context, Schema } from 'koishi'
import { PromiseLock } from './utils'

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

        return load(
            await fs.promises.readFile(this.resolveConfigPath(), 'utf-8')
        ) as VitsConfig[]
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

        let debounceTimeout: NodeJS.Timeout | null = null
        watch(
            path.resolve('data/luna-vits/config.yml'),
            {
                signal: this.abortController.signal
            },
            async (event, filename) => {
                if (debounceTimeout) {
                    clearTimeout(debounceTimeout)
                }
                debounceTimeout = setTimeout(() => {
                    this.ctx.logger.info('config changed, refreshing')
                    this.refresh()
                }, 300) // Adjust the debounce delay as needed
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

            for (const language of ['ZH', 'EN', 'JP', 'KO', 'YUO', 'AUTO']) {
                result.push([config, `${speaker.name}_${language}`, speaker])
            }
        } else if (config.type === 'gradio') {
            const requestConfig = config.config as GradioConfig
            speaker = speaker as GradioSpeaker

            const languages = requestConfig.languages as string[]
            if (languages) {
                for (const language of languages) {
                    result.push([
                        config,
                        `${speaker.name}_${language}`,
                        speaker
                    ])
                }
            }
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
            .sort((a, b) => (a < b ? 1 : -1))
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
                .map(([k, v]) => [v[2].name, k])
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
}

let baseSpeakId = 114514

declare module 'koishi' {
    interface Context {
        luna_vits_data: LunaVitsProvider
    }
}

declare module '@koishijs/plugin-console' {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Console {
        interface Services {
            luna_vits_data: LunaVitsProvider
        }
    }
}
