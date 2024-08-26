import { Schema } from 'koishi'

export const Config = Schema.intersect([
    Schema.object({
        defaultSpeaker:
            Schema.dynamic('speaker').description('全局默认的讲者。'),
        maxLength: Schema.number()
            .description('最大能转换的文字长度。超出后自动报错')
            .min(10)
            .max(500)
            .default(100)
    }).description('全局配置')
])

export const inject = {
    optional: ['translator']
}

export interface Config {
    defaultSpeaker: string
    maxLength: number
}

export const name = 'luna-vits'
