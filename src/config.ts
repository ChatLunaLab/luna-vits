import { Schema } from 'koishi'

export const Config = Schema.intersect([
    Schema.object({
        /* Schema.union(
            Object.values(SpeakerKeyIdMap).map((s) => s[1])
        ) */
        defaultSpeaker: Schema.dynamic('speaker')
            .description('全局默认的讲者。')
            .required()
    }).description('全局配置')
])

export const inject = {
    optional: ['translator']
}

export interface Config {
    defaultSpeaker: string
}

export const name = 'luna-vits'
