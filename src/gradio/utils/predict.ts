import { GradioClient } from '../client'
import type { PredictReturn } from '../types'

export async function predict(
    this: GradioClient,
    endpoint: string | number,
    data: unknown[] | Record<string, unknown> = {}
): Promise<PredictReturn> {
    let dataReturned = false
    let statusComplete = false
    /* let dependency: Dependency */

    if (!this.config) {
        throw new Error('Could not resolve app config')
    }

    /*  if (typeof endpoint === 'number') {
        dependency = this.config.dependencies.find(
            (dep) => dep.id === endpoint
        )!
    } else {
        const trimmedEndpoint = endpoint.replace(/^\//, '')
        dependency = this.config.dependencies.find(
            (dep) => dep.id === this.api_map[trimmedEndpoint]
        )
    } */

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        const app = this.submit(endpoint, data, null, null, true)
        let result: unknown

        for await (const message of app) {
            if (message.type === 'data') {
                if (statusComplete) {
                    resolve(result as PredictReturn)
                }
                dataReturned = true
                result = message
            }

            if (message.type === 'status') {
                if (message.stage === 'error') reject(message)
                if (message.stage === 'complete') {
                    statusComplete = true
                    // if complete message comes after data, resolve here
                    if (dataReturned) {
                        resolve(result as PredictReturn)
                    }
                }
            }
        }
    })
}
