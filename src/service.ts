import { Context, h } from 'koishi'
import { Config } from './config'
import Vits from '@initencounter/vits'
import { VitsAdapter } from './adapters/base'
import { SpeakerKeyIdMap, SpeakerKeyMap } from './constants'

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

    predict(input: string, options: VitsAdapter.Config): Promise<h> {
        let [, lang] = (options.speaker as string).split('_')

        if (!lang) {
            lang = 'ZH'
        }

        // TODO: auto translate

        const currentConfig = SpeakerKeyMap[options.speaker as string]

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

    say(options: Vits.Result): Promise<h> {
        return this.predict(options.input, {
            speaker: SpeakerKeyIdMap[options.speaker_id][1]
        })
    }
}
