/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable max-len */
import { Context } from 'koishi'
import { Config } from './config'
import { LunaVitsService } from './service'
import { GPTSoVITS2Adapter } from './adapters'
import { resolve } from 'path'
import {} from '@koishijs/plugin-console'
import { LunaVitsProvider } from './constants'

export function apply(ctx: Context, config: Config) {
    ctx.inject(['console'], (ctx) => {
        ctx.console.addEntry({
            dev: resolve(__dirname, '../client/index.ts'),
            prod: resolve(__dirname, '../dist')
        })
    })

    ctx.plugin(LunaVitsService)
    ctx.plugin(LunaVitsProvider)

    ctx.inject(['vits', 'luna_vits_data'], async (ctx) => {
        const lunaVits = ctx.vits as LunaVitsService

        lunaVits.addAdapter(new GPTSoVITS2Adapter(ctx))

        ctx.luna_vits_data.refresh()

        ctx.command('lunavits <text:text>', 'lunavits 语音合成帮助')
            .option('speaker', '-s [speaker:string] 语音合成的讲者', {
                fallback: config.defaultSpeaker
            })
            .action(async ({ session, options }, text) => {
                if (!text) {
                    await session.execute('betavits -h')
                    return null
                }

                const speakerKeyMap =
                    await ctx.luna_vits_data.getSpeakerKeyMap()

                const finalSpeaker = options.speaker ?? config.defaultSpeaker

                const version =
                    speakerKeyMap[finalSpeaker] ??
                    speakerKeyMap[finalSpeaker + '_AUTO'] ??
                    speakerKeyMap[finalSpeaker + '_ZH']
                if (!version) {
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
    })
}

export * from './config'
