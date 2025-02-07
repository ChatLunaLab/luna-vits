import { VitsAdapter } from './base'
import { Context, h, Session } from 'koishi'
import type { OneBotBot } from 'koishi-plugin-adapter-onebot'
import { QQVoiceSpeaker, VitsConfig } from '../type'

export class QQVoiceAdapter extends VitsAdapter {
    type = 'qq-voice' as const

    private static _accounts = new Set<string>()

    constructor(ctx: Context) {
        super(ctx)
    }

    async predict(
        input: string,
        config: VitsConfig,
        options: VitsAdapter.Config,
        session: Session
    ): Promise<h> {
        if (session.platform !== 'onebot' && session.onebot == null) {
            return h.text('AI 声聊仅支持 OneBot 协议。')
        }

        if (!session.isDirect) {
            return h.text('AI 声聊仅支持在群聊中使用。')
        }

        const speaker = options.speaker as QQVoiceSpeaker

        if (!speaker) {
            return h.text('请先选择一个角色。')
        }

        const bot = session.onebot!

        const voiceUrl = await bot
            ._request('get_ai_voice', {
                group_id: session.guildId!,
                character: speaker.characterId,
                text: input
            })
            .then((res) => {
                return res.data as string
            })

        return h.audio(voiceUrl)
    }

    async getSpeakerList(config: VitsConfig<'qq-voice'>) {
        const bot = this.ctx.bots.find((bot) => {
            return (
                bot.platform === 'onebot' &&
                bot.selfId === config.config.accountId.toString()
            )
        }) as OneBotBot<Context>

        QQVoiceAdapter._accounts.add(config.config.accountId)

        if (!bot) {
            return []
        }

        // random group

        const groupId = await bot.getGuildList().then((guilds) => {
            const data = guilds.data
            return data[Math.floor(Math.random() * data.length)].id
        })

        // call internal api to get voice list

        const speakers = await bot.internal
            ._request('get_ai_characters', {
                group_id: groupId
            })
            .then((res) => {
                console.log(res)
                return res.data as {
                    characters: {
                        character_name: string
                        character_id: string
                    }[]
                }
            })
            .then((res) => {
                return res.characters.map((speaker) => {
                    return {
                        name: speaker.character_name,
                        characterId: speaker.character_id
                    } as QQVoiceSpeaker
                })
            })

        return speakers
    }
}
