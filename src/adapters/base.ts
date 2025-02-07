import { Context, h, Session } from 'koishi'
import { BaseSpeaker, VitsConfig } from '../type'

export abstract class VitsAdapter<
    T extends
        | 'GPT-SoVITS2'
        | 'vits-simple-api'
        | 'gradio'
        | 'fish-audio'
        | 'qq-voice' =
        | 'GPT-SoVITS2'
        | 'vits-simple-api'
        | 'gradio'
        | 'fish-audio'
        | 'qq-voice'
> {
    abstract type: T

    constructor(public ctx: Context) {}

    abstract predict(
        input: string,
        config: VitsConfig<T>,
        options: VitsAdapter.Config,
        session?: Session
    ): Promise<h>

    async getSpeakerList(config: VitsConfig<T>) {
        return config.speakers
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace VitsAdapter {
    export interface Config
        extends Record<
            string,
            string | boolean | number | string[] | BaseSpeaker
        > {
        speaker: BaseSpeaker | string
        language?: string
    }
}
