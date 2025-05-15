import { VitsAdapter } from './base'
import { Context, h, Session, sleep } from 'koishi'
import type { OneBotBot } from 'koishi-plugin-adapter-onebot'
import { QQVoiceSpeaker, VitsConfig } from '../type'
import { PromiseLock } from '../utils'

export class QQVoiceAdapter extends VitsAdapter {
    type = 'qq-voice' as const

    private static _accounts = new Set<string>()

    private static _lock = new PromiseLock(false)

    constructor(ctx: Context) {
        super(ctx)
    }

    async predict(
        input: string,
        _: VitsConfig,
        options: VitsAdapter.Config,
        session: Session
    ): Promise<h> {
        if (session == null) {
            return h.text('请提供 session 对象。')
        }
        if (session.platform !== 'onebot' && session.onebot == null) {
            return h.text('AI 声聊仅支持 OneBot 协议。')
        }

        if (session.isDirect) {
            return h.text('AI 声聊仅支持在群聊中使用。')
        }

        const speaker = options.speaker as QQVoiceSpeaker

        if (!speaker) {
            return h.text('请先选择一个角色。')
        }

        const bot = session.onebot!

        await QQVoiceAdapter._lock.runLocked(async () => {
            await bot
                ._request('send_group_ai_record', {
                    group_id: session.guildId!,
                    character: speaker.characterId,
                    text: input
                })
                .then((res) => {
                    return res.data as string
                })

            // wait for 100ms
            await sleep(400)
        })

        return h.text('')
    }

    async getSpeakerList(config: VitsConfig<'qq-voice'>) {
        // random group

        let groupId: string
        let errorCount = 0

        let bot: OneBotBot<Context> | null = null

        while (!groupId && errorCount < 5) {
            bot =
                bot ??
                (this.ctx.bots.find((bot) => {
                    return (
                        bot.platform === 'onebot' &&
                        bot.selfId === config.config.accountId.toString()
                    )
                }) as OneBotBot<Context>)

            if (!bot) {
                this.ctx.logger.error(
                    `Failed to connect onebot: ${bot.selfId}, wait ${(5000 + errorCount * 5000) / 1000}s`
                )
                sleep(5000 + errorCount * 5000)
            }

            QQVoiceAdapter._accounts.add(config.config.accountId)

            try {
                groupId = await bot.getGuildList().then((guilds) => {
                    const data = guilds.data
                    return data[Math.floor(Math.random() * data.length)].id
                })
            } catch (error) {
                errorCount++

                this.ctx.logger.error(
                    `Failed to connect onebot: ${bot.selfId}, wait ${(5000 + errorCount * 5000) / 1000}s`,
                    error
                )
                sleep(5000 + errorCount * 5000)
            }
        }

        if (errorCount >= 5) {
            this.ctx.logger.error(`Failed to connect onebot: ${bot.selfId}`)
            return []
        }

        errorCount = 0
        // call internal api to get voice list

        while (errorCount < 5) {
            try {
                const speakers = await bot.internal
                    ._request('get_ai_characters', {
                        group_id: groupId
                    })
                    .then((res) => {
                        return res.data as {
                            type: string
                            characters: {
                                character_name: string
                                character_id: string
                            }[]
                        }[]
                    })
                    .then((res) => {
                        return res.flatMap((raw) => {
                            return raw.characters.map((character) => {
                                return {
                                    name: character.character_name,
                                    characterId: character.character_id
                                } as QQVoiceSpeaker
                            })
                        })
                    })

                return Array.from(
                    new Map(
                        speakers.map((speaker) => [
                            speaker.characterId,
                            speaker
                        ])
                    ).values()
                )
            } catch (e) {
                errorCount++

                this.ctx.logger.error(
                    `Failed to get voice list from onebot: ${bot.selfId}`,
                    e
                )
                sleep(5000 + errorCount * 5000)
            }
        }
    }
}
