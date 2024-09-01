import { VitsAdapter } from './base'
import { Context, h } from 'koishi'
import {
    GPTSoVITS2Config,
    GPTSoVITS2Request,
    GPTSoVITS2Speaker,
    VitsConfig
} from '../type'

import { removeProperty } from '../utils'

export class GPTSoVITS2Adapter extends VitsAdapter {
    type = 'GPT-SoVITS2'

    private _configWeights: Record<string, ConfigWeights> = {}

    constructor(ctx: Context) {
        super(ctx)
    }

    async predict(
        input: string,
        config: VitsConfig,
        options: VitsAdapter.Config
    ): Promise<h> {
        const speaker = options.speaker as GPTSoVITS2Speaker

        if (speaker.sovits_weights) {
            await this._updateSovitsWeights(config, speaker.sovits_weights)
        }

        if (speaker.gpt_weights) {
            await this._updateGPTWeights(config, speaker.gpt_weights)
        }

        const payload = this._generatePayload(
            input,
            config.config as GPTSoVITS2Config,
            options
        )

        this.ctx.logger.debug('payload, %s', JSON.stringify(payload))

        try {
            const response = await this.ctx.http.post(
                `${config.url}/tts`,
                payload,
                {
                    responseType: 'arraybuffer'
                }
            )

            return h.audio(response, payload.media_type ?? 'wav')
        } catch (e) {
            this.ctx.logger.error(e.response)
            return h.text('语音合成失败')
        }
    }

    private async _updateSovitsWeights(config: VitsConfig, weights: string) {
        const configWeight: ConfigWeights = this._configWeights?.[
            config.name
        ] ?? {
            sovits_weights: '',
            gpt_weights: ''
        }

        if (configWeight.sovits_weights === weights) {
            return
        }

        const response = await this.ctx.http.get(
            `${config.url}/set_sovits_weights?weights_path=${weights}`
        )

        if (response.message !== 'success') {
            throw new Error(JSON.stringify(response))
        }

        this._configWeights[config.name] = Object.assign(configWeight, {
            sovits_weights: weights
        })
    }

    private async _updateGPTWeights(config: VitsConfig, weights: string) {
        const configWeight: ConfigWeights = this._configWeights?.[
            config.name
        ] ?? {
            sovits_weights: '',
            gpt_weights: ''
        }

        if (configWeight.gpt_weights === weights) {
            return
        }

        const response = await this.ctx.http.get(
            `${config.url}/set_gpt_weights?weights_path=${weights}`
        )

        if (response.message !== 'success') {
            throw new Error(JSON.stringify(response))
        }

        this._configWeights[config.name] = Object.assign(configWeight, {
            gpt_weights: weights
        })
    }

    private _generatePayload(
        input: string,
        config: GPTSoVITS2Config,
        options: VitsAdapter.Config
    ): GPTSoVITS2Request {
        // override by speaker

        const base = Object.assign(
            {},
            config,
            removeProperty(options.speaker as GPTSoVITS2Speaker, [
                'name',
                'gpt_weights',
                'sovits_weights'
            ]),
            {
                text: input,
                text_lang: options.language?.toLocaleLowerCase() ?? 'zh',
                streaming_mode: false
            }
        ) as GPTSoVITS2Request

        base.prompt_lang = mappingLanguageToGPTSoVits(base.prompt_lang)
        base.text_lang = mappingLanguageToGPTSoVits(base.text_lang)
        return base
    }
}

export function mappingLanguageToGPTSoVits(lang: string) {
    switch (lang.toLocaleLowerCase()) {
        case 'zh':
            return 'zh'
        case 'en':
            return 'en'
        case 'jp':
        case 'ja':
            return 'ja'
        default:
            return lang.toLocaleLowerCase()
    }
}

interface ConfigWeights {
    sovits_weights: string
    gpt_weights: string
}
