import { VitsAdapter } from './base'
import { Context, h } from 'koishi'

import { removeProperty } from '../utils'
import {
    VitsConfig,
    FishAudioRequest,
    FishAudioConfig,
    FishAudioSpeaker
} from '../type'

export class FishAudioAdapter extends VitsAdapter<'fish-audio'> {
    type = 'fish-audio' as const

    constructor(ctx: Context) {
        super(ctx)
    }

    async predict(
        input: string,
        config: VitsConfig<'fish-audio'>,
        options: VitsAdapter.Config
    ): Promise<h> {
        const payload = this._generatePayload(input, config.config, options)

        this.ctx.logger.debug('payload, %s', JSON.stringify(payload))

        try {
            const response = await this.ctx.http.post(
                `https://api.fish.audio/v1/tts`,
                payload,
                {
                    responseType: 'arraybuffer',
                    headers: {
                        Authorization: `Bearer ${config.config.api_key}`
                    }
                }
            )

            return h.audio(response, payload.format ?? 'wav')
        } catch (e) {
            this.ctx.logger.error(e.response)
            return h.text('语音合成失败')
        }
    }

    private _generatePayload(
        input: string,
        config: FishAudioConfig,
        options: VitsAdapter.Config
    ): FishAudioRequest {
        const base = Object.assign(
            {
                chunk_length: 50,
                normalize: true,
                mp3_bitrate: 64,
                opus_bitrate: -1000,
                latency: 'normal',
                reference_id: (options.speaker as FishAudioSpeaker).reference_id
            },
            removeProperty(
                options.speaker as unknown as FishAudioRequest &
                    FishAudioSpeaker,
                ['languages', 'text', 'name']
            ),
            {
                text: input,
                format: 'wav'
            }
        ) as FishAudioRequest

        return base
    }

    async getSpeakerList(config: VitsConfig<'fish-audio'>) {
        const simpleApiConfig = config as VitsConfig<'fish-audio'>
        const baseList = simpleApiConfig.speakers

        const needFetchList = baseList.filter(
            (speaker) => !speaker.languages || speaker.languages?.length === 0
        )

        for (let i = 0; i < 3; i++) {
            try {
                await this._getSpeakerListLanguage(config, needFetchList)
            } catch (error) {
                this.ctx.logger.error('Failed to fetch speaker list:', error)
            }
        }

        return baseList
    }

    private async _getSpeakerLanguage(
        config: VitsConfig<'fish-audio'>,
        speaker: FishAudioSpeaker
    ) {
        const response = await this.ctx.http.get(
            `https://api.fish.audio/model/${speaker.reference_id}`,
            {
                responseType: 'json',
                headers: {
                    Authorization: `Bearer ${config.config.api_key}`
                }
            }
        )

        speaker.languages = response.languages
    }

    private async _getSpeakerListLanguage(
        config: VitsConfig<'fish-audio'>,
        list: FishAudioSpeaker[]
    ) {
        const tasks = list.map((speaker) =>
            this._getSpeakerLanguage(config, speaker)
        )

        await Promise.race(tasks)
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
