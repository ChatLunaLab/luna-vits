/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable max-len */
import { Context } from 'koishi'
import { Config } from './config'
import { LunaVitsService } from './service'
import { SpeakerKeyMap } from './constants'

export function apply(ctx: Context, config: Config) {
    ctx.plugin(LunaVitsService)

    ctx.inject(['vits'], async (ctx) => {
        const lunaVits = ctx.vits as LunaVitsService

        // lunaVits.addAdapter(new GPTSoVITS2Adpater(ctx, config))
    })
    ctx.command('lunavits <text:text>', 'AIbetavits语音合成帮助')
        .option('speaker', '-s [speaker:string] 语音合成的讲者', {
            fallback: config.defaultSpeaker
        })
        .action(async ({ session, options }, text) => {
            if (!text) {
                await session.execute('betavits -h')
                return null
            }

            const finalSpeaker = options.speaker

            const version =
                SpeakerKeyMap[finalSpeaker] ??
                SpeakerKeyMap[finalSpeaker + '_ZH']
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
}

export * from './config'
