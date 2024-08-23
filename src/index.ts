/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable max-len */
import { Context, Schema } from 'koishi'

export function apply(ctx: Context, config: Config) {}

export const Config = Schema.object({})

export const inject = {
    optional: ['translator']
}

export interface Config {}

export const name = 'luna-vits'
