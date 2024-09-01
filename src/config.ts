import { Schema } from 'koishi'

export const Config = Schema.intersect([
    Schema.object({
        defaultSpeaker:
            Schema.dynamic('speaker').description('全局默认的讲者。'),
        maxLength: Schema.number()
            .description('最大能转换的文字长度。超出后自动报错')
            .min(10)
            .max(500)
            .default(100),
        autoTranslate: Schema.boolean()
            .default(false)
            .description(
                '自动翻译到目标语言（需要翻译服务，并且确保已安装可选依赖`franc-min`)'
            )
    }).description('全局配置')
])

export const inject = {
    optional: ['translator']
}

export interface Config {
    defaultSpeaker: string
    maxLength: number
    autoTranslate: boolean
}

export const name = 'luna-vits'
