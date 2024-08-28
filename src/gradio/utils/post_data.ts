import { HTTP } from 'koishi'
import { GradioClient } from '../client'
import { BROKEN_CONNECTION_MSG } from '../constants'
import type { PostResponse } from '../types'

export async function postData(
    this: GradioClient,
    url: string,
    body: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additionalHeaders?: any
): Promise<[PostResponse, number]> {
    const headers: {
        Authorization?: string
        'Content-Type': 'application/json'
    } = { 'Content-Type': 'application/json' }
    if (this.options.hf_token) {
        headers.Authorization = `Bearer ${this.options.hf_token}`
    }
    let response: HTTP.Response
    try {
        response = await this.ctx.http(url, {
            method: 'POST' as HTTP.Method,
            data: JSON.stringify(body),
            headers: { ...headers, ...additionalHeaders }
        })
    } catch (e) {
        return [{ error: BROKEN_CONNECTION_MSG }, 500]
    }
    let output: PostResponse
    let status: number
    try {
        output = response.data
        status = response.status
    } catch (e) {
        output = { error: `Could not parse server response: ${e}` }
        status = 500
    }
    return [output, status]
}
