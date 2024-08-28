import {
    HOST_URL,
    INVALID_URL_MSG,
    QUEUE_FULL_MSG,
    SPACE_METADATA_ERROR_MSG
} from '../constants'
import {
    ApiInfo,
    ApiData,
    JsApiData,
    Config,
    EndpointInfo,
    Status
} from '../types'
import { determineProtocol } from './init_helpers'

export const RE_SPACE_NAME = /^[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+$/
export const RE_SPACE_DOMAIN = /.*hf\.space\/{0,1}$/

export async function processEndpoint(
    appReference: string,
    hfToken?: `hf_${string}`
): Promise<{
    space_id: string | false
    host: string
    ws_protocol: 'ws' | 'wss'
    http_protocol: 'http:' | 'https:'
}> {
    const headers: { Authorization?: string } = {}
    if (hfToken) {
        headers.Authorization = `Bearer ${hfToken}`
    }

    const _appReference = appReference.trim().replace(/\/$/, '')

    if (RE_SPACE_NAME.test(_appReference)) {
        // app_reference is a HF space name
        try {
            const res = await fetch(
                `https://huggingface.co/api/spaces/${_appReference}/${HOST_URL}`,
                { headers }
            )

            const _host = (await res.json()).host

            return {
                space_id: appReference,
                ...determineProtocol(_host)
            }
        } catch (e) {
            throw new Error(SPACE_METADATA_ERROR_MSG)
        }
    }

    if (RE_SPACE_DOMAIN.test(_appReference)) {
        // app_reference is a direct HF space domain
        const { ws_protocol, http_protocol, host } =
            determineProtocol(_appReference)

        return {
            space_id: host.replace('.hf.space', ''),
            ws_protocol,
            http_protocol,
            host
        }
    }

    return {
        space_id: false,
        ...determineProtocol(appReference)
    }
}

export const joinUrls = (...urls: string[]): string => {
    try {
        return urls.reduce((baseUrl: string, part: string) => {
            baseUrl = baseUrl.replace(/\/+$/, '')
            part = part.replace(/^\/+/, '')
            return new URL(part, baseUrl + '/').toString()
        })
    } catch (e) {
        throw new Error(INVALID_URL_MSG)
    }
}

export function transformAPIInfo(
    apiInfo: ApiInfo<ApiData>,
    config: Config,
    apiMap: Record<string, number>
): ApiInfo<JsApiData> {
    const transformedInfo: ApiInfo<JsApiData> = {
        named_endpoints: {},
        unnamed_endpoints: {}
    }

    Object.keys(apiInfo).forEach((category) => {
        if (
            category === 'named_endpoints' ||
            category === 'unnamed_endpoints'
        ) {
            transformedInfo[category] = {}

            Object.entries(apiInfo[category]).forEach(
                ([endpoint, { parameters, returns }]) => {
                    const dependencyIndex =
                        config.dependencies.find(
                            (dep) =>
                                dep.api_name === endpoint ||
                                dep.api_name === endpoint.replace('/', '')
                        )?.id ||
                        apiMap[endpoint.replace('/', '')] ||
                        -1

                    const dependencyTypes =
                        dependencyIndex !== -1
                            ? config.dependencies.find(
                                  (dep) => dep.id === dependencyIndex
                              )?.types
                            : { generator: false, cancel: false }

                    if (
                        dependencyIndex !== -1 &&
                        config.dependencies.find(
                            (dep) => dep.id === dependencyIndex
                        )?.inputs?.length !== parameters.length
                    ) {
                        const components = config.dependencies
                            .find((dep) => dep.id === dependencyIndex)!
                            .inputs.map(
                                (input) =>
                                    config.components.find(
                                        (c) => c.id === input
                                    )?.type
                            )

                        try {
                            components.forEach((comp, idx) => {
                                if (comp === 'state') {
                                    const newParam = {
                                        component: 'state',
                                        example: null,
                                        parameter_default: null,
                                        parameter_has_default: true,
                                        parameter_name: null,
                                        hidden: true
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    } as any

                                    parameters.splice(idx, 0, newParam)
                                }
                            })
                        } catch (e) {
                            console.error(e)
                        }
                    }

                    const transformType = (
                        data: ApiData,
                        component: string,
                        serializer: string,
                        signatureType: 'return' | 'parameter'
                    ): JsApiData => ({
                        ...data,
                        description: getDescription(data?.type, serializer),
                        type:
                            getType(
                                data?.type,
                                component,
                                serializer,
                                signatureType
                            ) || ''
                    })

                    transformedInfo[category][endpoint] = {
                        parameters: parameters.map((p: ApiData) =>
                            transformType(
                                p,
                                p?.component,
                                p?.serializer,
                                'parameter'
                            )
                        ),
                        returns: returns.map((r: ApiData) =>
                            transformType(
                                r,
                                r?.component,
                                r?.serializer,
                                'return'
                            )
                        ),
                        type: dependencyTypes
                    }
                }
            )
        }
    })

    return transformedInfo
}

export function getType(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: { type: any; description: string },
    component: string,
    serializer: string,
    signatureType: 'return' | 'parameter'
): string | undefined {
    switch (type?.type) {
        case 'string':
            return 'string'
        case 'boolean':
            return 'boolean'
        case 'number':
            return 'number'
    }

    if (
        serializer === 'JSONSerializable' ||
        serializer === 'StringSerializable'
    ) {
        return 'any'
    } else if (serializer === 'ListStringSerializable') {
        return 'string[]'
    } else if (component === 'Image') {
        return signatureType === 'parameter' ? 'Blob | File | Buffer' : 'string'
    } else if (serializer === 'FileSerializable') {
        if (type?.type === 'array') {
            return signatureType === 'parameter'
                ? '(Blob | File | Buffer)[]'
                : `{ name: string; data: string; size?: number; is_file?: boolean; orig_name?: string}[]`
        }
        return signatureType === 'parameter'
            ? 'Blob | File | Buffer'
            : `{ name: string; data: string; size?: number; is_file?: boolean; orig_name?: string}`
    } else if (serializer === 'GallerySerializable') {
        return signatureType === 'parameter'
            ? '[(Blob | File | Buffer), (string | null)][]'
            : `[{ name: string; data: string; size?: number; is_file?: boolean; orig_name?: string}, (string | null))][]`
    }
}

export function getDescription(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: { type: any; description: string },
    serializer: string
): string {
    if (serializer === 'GallerySerializable') {
        return 'array of [file, label] tuples'
    } else if (serializer === 'ListStringSerializable') {
        return 'array of strings'
    } else if (serializer === 'FileSerializable') {
        return 'array of files or single file'
    }
    return type?.description
}

/* eslint-disable complexity */
export function handleMessage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    lastStatus: Status['stage']
): {
    type:
        | 'hash'
        | 'data'
        | 'update'
        | 'complete'
        | 'generating'
        | 'log'
        | 'none'
        | 'heartbeat'
        | 'unexpected_error'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any
    status?: Status
} {
    const queue = true
    switch (data.msg) {
        case 'send_data':
            return { type: 'data' }
        case 'send_hash':
            return { type: 'hash' }
        case 'queue_full':
            return {
                type: 'update',
                status: {
                    queue,
                    message: QUEUE_FULL_MSG,
                    stage: 'error',
                    code: data.code,
                    success: data.success
                }
            }
        case 'heartbeat':
            return {
                type: 'heartbeat'
            }
        case 'unexpected_error':
            return {
                type: 'unexpected_error',
                status: {
                    queue,
                    message: data.message,
                    stage: 'error',
                    success: false
                }
            }
        case 'estimation':
            return {
                type: 'update',
                status: {
                    queue,
                    stage: lastStatus || 'pending',
                    code: data.code,
                    size: data.queue_size,
                    position: data.rank,
                    eta: data.rank_eta,
                    success: data.success
                }
            }
        case 'progress':
            return {
                type: 'update',
                status: {
                    queue,
                    stage: 'pending',
                    code: data.code,
                    progress_data: data.progress_data,
                    success: data.success
                }
            }
        case 'log':
            return { type: 'log', data }
        case 'process_generating':
            return {
                type: 'generating',
                status: {
                    queue,
                    message: !data.success ? data.output.error : null,
                    stage: data.success ? 'generating' : 'error',
                    code: data.code,
                    progress_data: data.progress_data,
                    eta: data.average_duration
                },
                data: data.success ? data.output : null
            }
        case 'process_completed':
            if ('error' in data.output) {
                return {
                    type: 'update',
                    status: {
                        queue,
                        message: data.output.error as string,
                        visible: data.output.visible as boolean,
                        duration: data.output.duration as number,
                        stage: 'error',
                        code: data.code,
                        success: data.success
                    }
                }
            }
            return {
                type: 'complete',
                status: {
                    queue,
                    message: !data.success ? data.output.error : undefined,
                    stage: data.success ? 'complete' : 'error',
                    code: data.code,
                    progress_data: data.progress_data,
                    changed_state_ids: data.success
                        ? data.output.changed_state_ids
                        : undefined
                },
                data: data.success ? data.output : null
            }

        case 'process_starts':
            return {
                type: 'update',
                status: {
                    queue,
                    stage: 'pending',
                    code: data.code,
                    size: data.rank,
                    position: 0,
                    success: data.success,
                    eta: data.eta
                }
            }
    }

    return { type: 'none', status: { stage: 'error', queue } }
}
/* eslint-enable complexity */

/**
 * Maps the provided `data` to the parameters defined by the `/info` endpoint response.
 * This allows us to support both positional and keyword arguments passed to the client
 * and ensures that all parameters are either directly provided or have default values assigned.
 *
 * @param {unknown[] | Record<string, unknown>} data - The input data for the function,
 *        which can be either an array of values for positional arguments or an object
 *        with key-value pairs for keyword arguments.
 * @param {JsApiData[]} parameters - Array of parameter descriptions retrieved from the
 *        `/info` endpoint.
 *
 * @returns {unknown[]} - Returns an array of resolved data where each element corresponds
 *         to the expected parameter from the API. The `parameter_default` value is used where
 *         a value is not provided for a parameter, and optional parameters without defaults are
 * 		   set to `undefined`.
 *
 * @throws {Error} - Throws an error:
 *         - If more arguments are provided than are defined in the parameters.
 *  *      - If no parameter value is provided for a required parameter and no default value is defined.
 *         - If an argument is provided that does not match any defined parameter.
 */

export const mapDataToParams = (
    // eslint-disable-next-line @typescript-eslint/default-param-last
    data: unknown[] | Record<string, unknown> = [],
    endpointInfo: EndpointInfo<JsApiData | ApiData>
): unknown[] => {
    // Workaround for the case where the endpoint_info is undefined
    // See https://github.com/gradio-app/gradio/pull/8820#issuecomment-2237381761
    const parameters = endpointInfo ? endpointInfo.parameters : []

    if (Array.isArray(data)) {
        if (data.length > parameters.length) {
            console.warn('Too many arguments provided for the endpoint.')
        }
        return data
    }

    const resolvedData: unknown[] = []
    const providedKeys = Object.keys(data)

    parameters.forEach((param, index) => {
        // eslint-disable-next-line no-prototype-builtins
        if (data.hasOwnProperty(param.parameter_name)) {
            resolvedData[index] = data[param.parameter_name]
        } else if (param.parameter_has_default) {
            resolvedData[index] = param.parameter_default
        } else {
            throw new Error(
                `No value provided for required parameter: ${param.parameter_name}`
            )
        }
    })

    providedKeys.forEach((key) => {
        if (!parameters.some((param) => param.parameter_name === key)) {
            throw new Error(
                `Parameter \`${key}\` is not a valid keyword argument. Please refer to the API for usage.`
            )
        }
    })

    resolvedData.forEach((value, idx) => {
        if (value === undefined && !parameters[idx].parameter_has_default) {
            throw new Error(
                `No value provided for required parameter: ${parameters[idx].parameter_name}`
            )
        }
    })

    return resolvedData
}
