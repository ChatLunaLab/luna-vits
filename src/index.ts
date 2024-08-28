/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable max-len */
import { Context } from 'koishi'
import { Config } from './config'
import { LunaVitsService } from './service'
import { GPTSoVITS2Adapter, VitsSimpleAPIAdapter } from './adapters'
import { resolve } from 'path'
import type {} from '@koishijs/plugin-console'
import { LunaVitsProvider } from './constants'
import * as eventStream from '@dingyi222666/event-stream'
import { GradioClient } from './gradio'

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
        ['vits', 'console', 'console.services.luna_vits_data'],
        async (ctx) => {
            const lunaVits = ctx.vits as LunaVitsService

            lunaVits.addAdapter(new GPTSoVITS2Adapter(ctx))
            lunaVits.addAdapter(new VitsSimpleAPIAdapter(ctx))

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

            const app = await GradioClient.connect(
                ctx,
                'https://xzjosh-azuma-bert-vits2-0-2.hf.space/--replicas/lyypv/'
            )
            const result = await app.predict('/tts_fn', [
                'Hello!!', // string  in '输入文本内容' Textbox component
                '东雪莲', // string  in '选择说话人' Dropdown component
                0, // number (numeric value between 0 and 1) in 'SDP/DP混合比' Slider component
                0.1, // number (numeric value between 0.1 and 2) in '感情' Slider component
                0.1, // number (numeric value between 0.1 and 2) in '音素长度' Slider component
                0.1, // number (numeric value between 0.1 and 2) in '语速' Slider component
                'ZH' // string  in '选择语言' Dropdown component
            ])

            console.log(result)
        }
    )
}

export * from './config'
