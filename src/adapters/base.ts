import { Context, h } from 'koishi'
import { BaseSpeaker, VitsConfig } from '../type'

export abstract class VitsAdapter {
    abstract type: string

    constructor(public ctx: Context) {}

    abstract predict(
        input: string,
        config: VitsConfig,
        options: VitsAdapter.Config
    ): Promise<h>
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
