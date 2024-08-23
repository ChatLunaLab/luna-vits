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
        let [speaker, lang] = options.speaker.split('_')

        if (!lang) {
            lang = 'ZH'
        }

        const currentConfig = SpeakerKeyMap[speaker]

        if (!currentConfig) {
            throw new Error('Speaker not found')
        }

        return this._adapters[currentConfig.type].predict(
            input,
            Object.assign(
                {
                    language: lang
                },
                options,
                {
                    speaker
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
