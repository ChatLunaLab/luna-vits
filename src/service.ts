import { Context, h } from 'koishi'
import { Config } from './config'
import Vits from '@initencounter/vits'
import { VitsAdapter } from './adapters/base'
import { VitsConfig } from './type'

export class LunaVitsService extends Vits {
    private _adapters: Record<string, VitsAdapter> = {}

    constructor(
        ctx: Context,
        public config: Config
    ) {
        super(ctx)
    }

    addAdapter(adapter: VitsAdapter) {
        this._adapters[adapter.type] = adapter
    }

    async predict(input: string, options: VitsAdapter.Config): Promise<h> {
        if (input.length > this.config.maxLength) {
            return h.text('输入的字符串长度不能超过 ' + this.config.maxLength)
        }

        // lang:
        // with regex
        // get last _
        // xx_xx_xxx -> xxx
        // xx_xxx -> xxx

        let lang = (options.speaker as string)?.split('_')?.pop()

        if (!lang) {
            lang = 'ZH'
        }

        const speakerKeyMap =
            await this.ctx.console.services.luna_vits_data.getSpeakerKeyMap()

        // TODO: auto translate

        const currentConfig = speakerKeyMap[options.speaker as string]

        if (!currentConfig) {
            throw new Error('Speaker not found')
        }

        return this._adapters[currentConfig[0].type].predict(
            input,
            currentConfig[0],
            Object.assign(
                {
                    language: lang
                },
                options,
                {
                    speaker: currentConfig[1]
                }
            )
        )
    }

    async say(options: Vits.Result): Promise<h> {
        const speakerKeyIdMap =
            await this.ctx.console.services.luna_vits_data.getSpeakerKeyIdMap()

        return this.predict(options.input, {
            speaker:
                speakerKeyIdMap[options.speaker_id]?.[1] ??
                this.config.defaultSpeaker
        })
    }

    getSpeakerList(config: VitsConfig) {
        return this._adapters[config.type].getSpeakerList(config)
    }

    static inject = ['console']
}
