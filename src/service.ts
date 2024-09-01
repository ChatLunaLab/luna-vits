import { Context, h } from 'koishi'
import { Config } from './config'
import Vits from '@initencounter/vits'
import { VitsAdapter } from './adapters/base'
import { VitsConfig } from './type'
import type {} from '@koishijs/translator'

export class LunaVitsService extends Vits {
    private _adapters: Record<string, VitsAdapter> = {}

    constructor(
        public ctx: Context,
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

        let lang = (options.speaker as string)?.split('_')?.pop()

        if (!lang) {
            lang = 'ZH'
        }

        const speakerKeyMap =
            await this.ctx.console.services.luna_vits_data.getSpeakerKeyMap()

        if (this.config.autoTranslate) {
            input = await this.checkLanguage(input, lang)
        }

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

    private async checkLanguage(input: string, lang: string): Promise<string> {
        try {
            const franc = await importFranc()

            const sourceLanguage =
                francLanguageMapping[franc.franc(input)] ?? lang

            if (sourceLanguage === lang || !this.config.autoTranslate) {
                return input
            }

            return this.ctx.translator.translate({
                input,
                source: sourceLanguage.toLocaleLowerCase(),
                target: lang.toLocaleLowerCase()
            })
        } catch (error) {
            return input
        }
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

    static inject = {
        console: {
            required: true
        },
        gradio: {
            required: false
        }
    }
}

async function importFranc() {
    try {
        return await import('franc-min')
    } catch (e) {
        throw new Error(
            'Please install franc-min as a dependency with, e.g. `npm install -S franc-min`'
        )
    }
}

const francLanguageMapping: Record<string, string> = {
    jpn: 'jp',
    zho: 'zh',
    eng: 'en',
    spa: 'es',
    fra: 'fr',
    deu: 'de',
    ita: 'it',
    por: 'pt',
    rus: 'ru',
    kor: 'ko',
    ara: 'ar',
    heb: 'he',
    hin: 'hi',
    tur: 'tr',
    vie: 'vi',
    cmn: 'zh',
    ell: 'el'
}
