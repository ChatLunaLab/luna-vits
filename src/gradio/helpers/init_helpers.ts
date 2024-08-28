/* eslint-disable max-len */
import { Context } from 'koishi'
import {
    CONFIG_ERROR_MSG,
    CONFIG_URL,
    INVALID_CREDENTIALS_MSG,
    LOGIN_URL,
    MISSING_CREDENTIALS_MSG,
    SPACE_METADATA_ERROR_MSG,
    UNAUTHORIZED_MSG
} from '../constants'
import { Config } from '../types'
import { GradioClient } from '../client'
import { joinUrls, processEndpoint } from './api_info'

export async function getJwt(
    ctx: Context,
    space: string,
    token: `hf_${string}`,
    cookies?: string | null
): Promise<string | false> {
    try {
        const r = await ctx.http.get(
            `https://huggingface.co/api/spaces/${space}/jwt`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(cookies ? { Cookie: cookies } : {})
                }
            }
        )

        const jwt = r?.token

        return jwt || false
    } catch (e) {
        return false
    }
}

export function determineProtocol(endpoint: string): {
    ws_protocol: 'ws' | 'wss'
    http_protocol: 'http:' | 'https:'
    host: string
} {
    if (endpoint.startsWith('http')) {
        const { protocol, host, pathname } = new URL(endpoint)

        if (host.endsWith('hf.space')) {
            return {
                ws_protocol: 'wss',
                host,
                http_protocol: protocol as 'http:' | 'https:'
            }
        }
        return {
            ws_protocol: protocol === 'https:' ? 'wss' : 'ws',
            http_protocol: protocol as 'http:' | 'https:',
            host: host + (pathname !== '/' ? pathname : '')
        }
    } else if (endpoint.startsWith('file:')) {
        // This case is only expected to be used for the Wasm mode (Gradio-lite),
        // where users can create a local HTML file using it and open the page in a browser directly via the `file:` protocol.
        return {
            ws_protocol: 'ws',
            http_protocol: 'http:',
            host: 'lite.local'
            // Special fake hostname only used for this case. This matches the hostname allowed in `is_self_host()` in `js/wasm/network/host.ts`.
        }
    }

    // default to secure if no protocol is provided
    return {
        ws_protocol: 'wss',
        http_protocol: 'https:',
        host: endpoint
    }
}

export const parseAndSetCookies = (cookieHeader: string): string[] => {
    const cookies: string[] = []
    const parts = cookieHeader.split(/,(?=\s*[^\s=;]+=[^\s=;]+)/)
    parts.forEach((cookie) => {
        const [name, value] = cookie.split(';')[0].split('=')
        if (name && value) {
            cookies.push(`${name.trim()}=${value.trim()}`)
        }
    })
    return cookies
}

// separating this from client-bound resolve_cookies so that it can be used in duplicate
export async function getCookieHeader(
    httpProtocol: string,
    host: string,
    auth: [string, string],
    ctx: Context,
    hfToken?: `hf_${string}`
): Promise<string | null> {
    const formData = new FormData()
    formData.append('username', auth?.[0])
    formData.append('password', auth?.[1])

    const headers: { Authorization?: string } = {}

    if (hfToken) {
        headers.Authorization = `Bearer ${hfToken}`
    }

    const res = await ctx.http.post(`${httpProtocol}//${host}/${LOGIN_URL}`, {
        headers,
        method: 'POST',
        body: formData,
        credentials: 'include'
    })

    if (res.status === 200) {
        return res.headers.get('set-cookie')
    } else if (res.status === 401) {
        throw new Error(INVALID_CREDENTIALS_MSG)
    } else {
        throw new Error(SPACE_METADATA_ERROR_MSG)
    }
}

export async function resolveConfig(
    this: GradioClient,
    endpoint: string
): Promise<Config | undefined> {
    const headers: Record<string, string> = this.options.hf_token
        ? { Authorization: `Bearer ${this.options.hf_token}` }
        : {}

    headers['Content-Type'] = 'application/json'

    if (endpoint) {
        const configUrl = joinUrls(endpoint, CONFIG_URL)
        const response = await this.ctx.http(configUrl, {
            headers,
            method: 'GET'
        })

        if (response?.status === 401 && !this.options.auth) {
            throw new Error(MISSING_CREDENTIALS_MSG)
        } else if (response?.status === 401 && this.options.auth) {
            throw new Error(INVALID_CREDENTIALS_MSG)
        }
        if (response?.status === 200) {
            const config = await response.data
            config.path = config.path ?? ''
            config.root = endpoint
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config.dependencies?.forEach((dep: any, i: number) => {
                if (dep.id === undefined) {
                    dep.id = i
                }
            })
            return config
        } else if (response?.status === 401) {
            throw new Error(UNAUTHORIZED_MSG)
        }
        throw new Error(CONFIG_ERROR_MSG)
    }

    throw new Error(CONFIG_ERROR_MSG)
}

export async function resolveCookies(this: GradioClient): Promise<void> {
    const { http_protocol, host } = await processEndpoint(
        this.appReference,
        this.options.hf_token
    )

    try {
        if (this.options.auth) {
            const cookie_header = await getCookieHeader(
                http_protocol,
                host,
                this.options.auth,
                this.ctx,
                this.options.hf_token
            )

            if (cookie_header) this.setCookies(cookie_header)
        }
    } catch (e: unknown) {
        throw Error((e as Error).message)
    }
}

export function mapNamesToIds(
    fns: Config['dependencies']
): Record<string, number> {
    const apis: Record<string, number> = {}

    fns.forEach(({ api_name, id }) => {
        if (api_name) apis[api_name] = id
    })
    return apis
}

/**
 * This function is used to resolve the URL for making requests when the app has a root path.
 * The root path could be a path suffix like "/app" which is appended to the end of the base URL. Or
 * it could be a full URL like "https://abidlabs-test-client-replica--gqf2x.hf.space" which is used when hosting
 * Gradio apps on Hugging Face Spaces.
 * @param {string} base_url The base URL at which the Gradio server is hosted
 * @param {string} root_path The root path, which could be a path suffix (e.g. mounted in FastAPI app) or a full URL (e.g. hosted on Hugging Face Spaces)
 * @param {boolean} prioritize_base Whether to prioritize the base URL over the root path. This is used when both the base path and root paths are full URLs. For example, for fetching files the root path should be prioritized, but for making requests, the base URL should be prioritized.
 * @returns {string} the resolved URL
 */
export function resolveRoot(
    baseUrl: string,
    rootPath: string,
    prioritizeBase: boolean
): string {
    if (rootPath.startsWith('http://') || rootPath.startsWith('https://')) {
        return prioritizeBase ? baseUrl : rootPath
    }
    return baseUrl + rootPath
}
