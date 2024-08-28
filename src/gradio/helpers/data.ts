import {
    type ApiData,
    type BlobRef,
    type Config,
    type EndpointInfo,
    type JsApiData,
    type DataType,
    Command,
    type Dependency,
    type ComponentMeta
} from '../types'

export function updateObject(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    object: { [x: string]: any },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newValue: any,
    stack: (string | number)[]
): void {
    while (stack.length > 1) {
        const key = stack.shift()
        if (typeof key === 'string' || typeof key === 'number') {
            object = object[key]
        } else {
            throw new Error('Invalid key type')
        }
    }

    const key = stack.shift()
    if (typeof key === 'string' || typeof key === 'number') {
        object[key] = newValue
    } else {
        throw new Error('Invalid key type')
    }
}

export async function walkAndStoreBlobs(
    data: DataType,
    type: string | undefined = undefined,
    path: string[] = [],
    root = false,
    endpointInfo: EndpointInfo<ApiData | JsApiData> | undefined = undefined
): Promise<BlobRef[]> {
    if (Array.isArray(data)) {
        let blobRefs: BlobRef[] = []

        await Promise.all(
            data.map(async (_, index) => {
                const newPath = path.slice()
                newPath.push(String(index))

                const arrayRefs = await walkAndStoreBlobs(
                    data[index],
                    root
                        ? endpointInfo?.parameters[index]?.component ||
                              undefined
                        : type,
                    newPath,
                    false,
                    endpointInfo
                )

                blobRefs = blobRefs.concat(arrayRefs)
            })
        )

        return blobRefs
    } else if (
        (globalThis.Buffer && data instanceof globalThis.Buffer) ||
        data instanceof Blob
    ) {
        return [
            {
                path,
                blob: new Blob([data]),
                type
            }
        ]
    } else if (typeof data === 'object' && data !== null) {
        let blobRefs: BlobRef[] = []
        for (const key of Object.keys(data) as (keyof typeof data)[]) {
            const newPath = [...path, key]
            const value = data[key]

            blobRefs = blobRefs.concat(
                await walkAndStoreBlobs(
                    value,
                    undefined,
                    newPath,
                    false,
                    endpointInfo
                )
            )
        }

        return blobRefs
    }

    return []
}

export function skipQueue(id: number, config: Config): boolean {
    const fnQueue = config?.dependencies?.find((dep) => dep.id === id)?.queue
    if (fnQueue != null) {
        return !fnQueue
    }
    return !config.enable_queue
}

// todo: add jsdoc for this function

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function postMessage<Res = any>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: any,
    origin: string
): Promise<Res> {
    return new Promise((resolve, reject) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = (({ data }) => {
            channel.port1.close()
            resolve(data)
        }) as (ev: MessageEvent<Res>) => void
        window.parent.postMessage(message, origin, [channel.port2])
    })
}

export function handleFile(
    file: File | string | Blob | Buffer
): FileData | Blob | Command {
    if (typeof file === 'string') {
        if (file.startsWith('http://') || file.startsWith('https://')) {
            return {
                path: file,
                url: file,
                orig_name: file.split('/').pop() ?? 'unknown',
                meta: { _type: 'gradio.FileData' }
            }
        }

        // Handle local file paths
        return new Command('upload_file', {
            path: file,
            name: file,
            orig_path: file
        })
    } else if (typeof File !== 'undefined' && file instanceof File) {
        return new Blob([file])
    } else if (file instanceof Buffer) {
        return new Blob([file])
    } else if (file instanceof Blob) {
        return file
    }
    throw new Error(
        'Invalid input: must be a URL, File, Blob, or Buffer object.'
    )
}

/**
 * Handles the payload by filtering out state inputs and returning an array of resolved payload values.
 * We send null values for state inputs to the server, but we don't want to include them in the resolved payload.
 *
 * @param resolvedPayload - The resolved payload values received from the client or the server
 * @param dependency - The dependency object.
 * @param components - The array of component metadata.
 * @param withNullState - Optional. Specifies whether to include null values for state inputs. Default is false.
 * @returns An array of resolved payload values, filtered based on the dependency and component metadata.
 */
export function handlePayload(
    resolvedPayload: unknown[],
    dependency: Dependency,
    components: ComponentMeta[],
    type: 'input' | 'output',
    withNullState = false
): unknown[] {
    if (type === 'input' && !withNullState) {
        throw new Error(
            'Invalid code path. Cannot skip state inputs for input.'
        )
    }
    // data comes from the server with null state values so we skip
    if (type === 'output' && withNullState) {
        return resolvedPayload
    }

    const updatedPayload: unknown[] = []
    let payloadIndex = 0
    const deps = type === 'input' ? dependency.inputs : dependency.outputs
    for (let i = 0; i < deps.length; i++) {
        const inputId = deps[i]
        const component = components.find((c) => c.id === inputId)

        if (component?.type === 'state') {
            // input + with_null_state needs us to fill state with null values
            if (withNullState) {
                if (resolvedPayload.length === deps.length) {
                    const value = resolvedPayload[payloadIndex]
                    updatedPayload.push(value)
                    payloadIndex++
                } else {
                    updatedPayload.push(null)
                }
            } else {
                // this is output & !with_null_state, we skip state inputs
                // the server payload always comes with null state values so we move along the payload index
                payloadIndex++
                continue
            }
            // input & !with_null_state isn't a case we care about, server needs null
            continue
        } else {
            const value = resolvedPayload[payloadIndex]
            updatedPayload.push(value)
            payloadIndex++
        }
    }

    return updatedPayload
}

export class FileData {
    path: string
    url?: string
    orig_name?: string
    size?: number
    blob?: File
    is_stream?: boolean
    mime_type?: string
    alt_text?: string
    readonly meta = { _type: 'gradio.FileData' }

    constructor({
        path,
        url,
        orig_name,
        size,
        blob,
        is_stream,
        mime_type,
        alt_text
    }: {
        path: string
        url?: string
        orig_name?: string
        size?: number
        blob?: File
        is_stream?: boolean
        mime_type?: string
        alt_text?: string
    }) {
        this.path = path
        this.url = url
        this.orig_name = orig_name
        this.size = size
        this.blob = url ? undefined : blob
        this.is_stream = is_stream
        this.mime_type = mime_type
        this.alt_text = alt_text
    }
}
