import { Context, h } from 'koishi'
import { VitsConfig } from '../type'

export abstract class VitsAdapter {
    abstract type: string

    constructor(
        private ctx: Context,
        private config: VitsConfig
    ) {}

    abstract predict(input: string, options: VitsAdapter.Config): Promise<h>
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace VitsAdapter {
    export interface Config
        extends Record<string, string | boolean | number | string[]> {
        speaker: string
        language?: string
    }
}
