/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable max-len */
import { Context } from 'koishi'
import { Config } from './config'
import { LunaVitsService } from './service'
import {
    GPTSoVITS2Adapter,
    VitsSimpleAPIAdapter,
    GradioAdapter
} from './adapters'
import { resolve } from 'path'
import type {} from '@koishijs/plugin-console'
import { LunaVitsProvider } from './constants'
import * as eventStream from '@dingyi222666/event-stream'

export function apply(ctx: Context, config: Config) {
    ctx.plugin(eventStream)

    ctx.inject(['console'], (ctx) => {
        ctx.console.addEntry({
            dev: resolve(__dirname, '../client/index.ts'),
            prod: resolve(__dirname, '../dist')
        })
    })

    ctx.plugin(LunaVitsService)
    ctx.plugin(LunaVitsProvider)

    ctx.inject(
        {
            vits: {
                required: true
            },
            console: {
                required: true
            },
            'console.services.luna_vits_data': {
                required: true
            },
            gradio: {
                required: false
            }
        },
        async (ctx) => {
            const lunaVits = ctx.vits as LunaVitsService

            lunaVits.addAdapter(new GPTSoVITS2Adapter(lunaVits.ctx))
            lunaVits.addAdapter(new VitsSimpleAPIAdapter(lunaVits.ctx))
            ctx.inject(['gradio'], async () => {
                lunaVits.addAdapter(new GradioAdapter(lunaVits.ctx))

                await ctx.console.services.luna_vits_data.refresh()
            })

            function getSpeaker(
                speakerKeyMap: Awaited<
                    ReturnType<
                        typeof ctx.console.services.luna_vits_data.getSpeakerKeyMap
                    >
                >,
                speaker: string
            ) {
                for (const key of [
                    speaker,
                    speaker + '_AUTO',
                    speaker + '_ZH'
                ]) {
                    if (speakerKeyMap[key]) {
                        return [speakerKeyMap[key], key]
                    }
                }

                return [null, null]
            }

            ctx.command('lunavits <text:text>', 'lunavits 语音合成')
                .option('speaker', '-s [speaker:string] 语音合成的讲者', {
                    fallback: config.defaultSpeaker
                })
                .action(async ({ session, options }, text) => {
                    if (!text) {
                        await session.execute('lunavits -h')
                        return null
                    }

                    const speakerKeyMap =
                        await ctx.console.services.luna_vits_data.getSpeakerKeyMap()

                    const [speakerConfig, finalSpeaker] = getSpeaker(
                        speakerKeyMap,
                        options.speaker ?? config.defaultSpeaker
                    )

                    if (!speakerConfig) {
                        return `找不到这个 ${finalSpeaker} 讲者，请检查你的输入。`
                    }

                    const lunaVits = ctx.vits as LunaVitsService

                    return await lunaVits.predict(
                        text,
                        Object.assign(options, {
                            speaker: finalSpeaker
                        })
                    )
                })

            await ctx.console.services.luna_vits_data.refresh()
        }
    )
}

export * from './config'
