/**
 * Veridas XpressID + ValiDas API client.
 *
 * Uses the native `fetch()` available in Bun.js.
 * All calls authenticate via VERIDAS_API_KEY header.
 */

import type { IdvEndpointsEnv } from '../config.js';
import type { XpressIdTokenResponse, ValiDasValidationResponse } from '../types.js';

export class HttpError extends Error {
    constructor(
        public readonly code: string,
        public readonly status: number,
        public readonly details?: unknown,
    ) {
        super(code);
        this.name = 'HttpError';
    }
}

async function veridasFetch<T>(
    url: string,
    env: IdvEndpointsEnv,
    options: RequestInit,
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.VERIDAS_HTTP_TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                apikey: env.VERIDAS_API_KEY,
                ...(options.headers ?? {}),
            },
        });
    } catch (err: any) {
        clearTimeout(timer);
        if (err?.name === 'AbortError') {
            throw new HttpError('veridas_timeout', 504, { url, timeoutMs: env.VERIDAS_HTTP_TIMEOUT_MS });
        }
        throw new HttpError('veridas_network_error', 502, { url, cause: err?.message });
    }
    clearTimeout(timer);

    if (!response.ok) {
        let body: unknown;
        try { body = await response.json(); } catch { body = await response.text().catch(() => null); }
        throw new HttpError('veridas_http_error', response.status, { url, status: response.status, body });
    }

    return response.json() as Promise<T>;
}

/**
 * Call XpressID /token endpoint to obtain an access_token + validation_id.
 * The `config` object is the full XpressID JSON config (deep-cloned from DB).
 */
export async function requestXpressIdToken(
    env: IdvEndpointsEnv,
    config: Record<string, unknown>,
    processId: string,
): Promise<XpressIdTokenResponse> {
    // Inject contextualData for Veridas analytics
    const configForSession = JSON.parse(JSON.stringify(config)) as Record<string, any>;
    configForSession.flowSetup = configForSession.flowSetup ?? {};
    configForSession.flowSetup.core = configForSession.flowSetup.core ?? {};
    configForSession.flowSetup.core.contextualData = {
        ...(configForSession.flowSetup.core.contextualData ?? {}),
        stats_userid: processId,
        stats_usecase: 'brio_idv',
    };

    return veridasFetch<XpressIdTokenResponse>(
        `${env.VERIDAS_XPRESS_BASE_URL}/token`,
        env,
        {
            method: 'POST',
            body: JSON.stringify({ data: configForSession }),
        },
    );
}

/**
 * Call ValiDas /validation/{id} to retrieve the current IDV state + results.
 */
export async function getValiDasValidation(
    env: IdvEndpointsEnv,
    validationId: string,
): Promise<ValiDasValidationResponse> {
    return veridasFetch<ValiDasValidationResponse>(
        `${env.VERIDAS_VALIDATION_BASE_URL}/validation/${encodeURIComponent(validationId)}`,
        env,
        { method: 'GET' },
    );
}
