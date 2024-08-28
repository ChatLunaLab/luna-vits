import { HTTP } from 'koishi'
import { GradioClient } from '../client'
import {
    API_INFO_URL,
    BROKEN_CONNECTION_MSG,
    SPACE_FETCHER_URL
} from '../constants'
import { joinUrls, transformAPIInfo } from '../helpers/api_info'
import type { ApiInfo, ApiData } from '../types'
import semiver from 'semiver'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function viewApi(this: GradioClient): Promise<any> {
    if (this.apiInfo) return this.apiInfo

    const { hf_token } = this.options
    const { config } = this

    const headers: {
        Authorization?: string
        'Content-Type': 'application/json'
    } = { 'Content-Type': 'application/json' }

    if (hf_token) {
        headers.Authorization = `Bearer ${hf_token}`
    }

    if (!config) {
        return
    }

    try {
        let response: HTTP.Response
        let apiInfo: ApiInfo<ApiData> | { api: ApiInfo<ApiData> }

        if (semiver(config?.version || '2.0.0', '3.30') < 0) {
            response = await this.ctx.http(SPACE_FETCHER_URL, {
                method: 'POST',
                data: JSON.stringify({
                    serialize: false,
                    config: JSON.stringify(config)
                }),
                headers
            })
        } else {
            const url = joinUrls(config.root, API_INFO_URL)
            response = await this.ctx.http(url, {
                method: 'GET',
                headers
            })
        }

        if (response.status !== 200) {
            throw new Error(BROKEN_CONNECTION_MSG)
        }

        apiInfo = response.data

        if ('api' in apiInfo) {
            apiInfo = apiInfo.api
        }

        if (
            apiInfo.named_endpoints['/predict'] &&
            !apiInfo.unnamed_endpoints['0']
        ) {
            apiInfo.unnamed_endpoints[0] = apiInfo.named_endpoints['/predict']
        }

        return transformAPIInfo(apiInfo, config, this.apiMap)
    } catch (e) {
        throw new Error('Could not get API info. ' + (e as Error).message)
    }
}
