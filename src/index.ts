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
import { getSpeaker } from './utils'
import { FishAudioAdapter } from './adapters/fish_audio'
import { QQVoiceAdapter } from './adapters/qq_voice'

export function apply(ctx: Context, config: Config) {
    ctx.inject(['console'], (ctx) => {
        ctx.console.addEntry({
            dev: resolve(__dirname, '../client/index.ts'),
            prod: resolve(__dirname, '../dist')
        })
    })

    ctx.plugin(LunaVitsService, config)
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
            lunaVits.addAdapter(new FishAudioAdapter(lunaVits.ctx))
            lunaVits.addAdapter(new QQVoiceAdapter(lunaVits.ctx))

            ctx.inject(['gradio'], async () => {
                lunaVits.addAdapter(new GradioAdapter(lunaVits.ctx))

                await ctx.console.services.luna_vits_data.refresh()
            })

            ctx.command('lunavits <text:text>', 'lunavits 语音合成')
                .option('speaker', '-s [speaker:string] 语音合成的讲者', {
                    fallback: config.defaultSpeaker
                })
                .option(
                    'sdp_ratio',
                    '-sr [sdp_ratio:nubmer] 语音合成的SDP/DP混合比'
                )
                .option('noise', '-n [noise:number] 语音合成的感情强度')
                .option('noisew', '-nw [noisew:number] 语音合成的音素长度')
                .option('length', '-l [length:number] 语音合成语速')
                .option(
                    'weight',
                    '-w [weight:number] 主文本和辅助文本的混合比率'
                )
                .option(
                    'temperature',
                    '-t [temperature:number] 合成的温度（GPT-SOVITS-ONLY）'
                )
                .option(
                    'text_split_method',
                    '-ts [text_split_method:string] 语音合成的文本分割方法（GPT-SOVITS-ONLY）'
                )
                .option(
                    'speed',
                    '-sp [speed:number] 语音合成的语速（GPT-SOVITS-ONLY）'
                )
                .action(async ({ session, options }, text) => {
                    if (!text) {
                        await session.execute('lunavits -h')
                        return null
                    }

                    const speakerKeyMap =
                        await ctx.console.services.luna_vits_data.getSpeakerKeyMap()

                    const [speakerConfig, finalSpeaker] = getSpeaker(
                        ctx,
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
