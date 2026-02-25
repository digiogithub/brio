/**
 * Environment configuration for idv-endpoints extension.
 *
 * Variables (set in Brio .env):
 *   VERIDAS_API_KEY          — Veridas API key (required)
 *   VERIDAS_BASE_URL         — Base URL without trailing slash, e.g. https://api.veridas.com/products/veridas/1.0.0
 *
 * Optional:
 *   VERIDAS_HTTP_TIMEOUT_MS  — HTTP timeout in ms (default: 30000)
 *   IDV_SKIP_SCORE_VALIDATION — If "true", skip score threshold checks (default: false)
 *   IDV_SESSION_TTL_MS       — Time-to-live for a pending process before marking as expired (default: 1800000 = 30 min)
 *   REDIS_URL                — Redis connection URL, e.g. redis://localhost:6379 (optional; enables Redis session store)
 *   REDIS_SESSION_PREFIX     — Key prefix for Redis session keys (default: "idv:session:")
 */

export type IdvEndpointsEnv = {
    VERIDAS_API_KEY: string;
    VERIDAS_BASE_URL: string;
    /** Derived: ${VERIDAS_BASE_URL}/xpressid */
    VERIDAS_XPRESS_BASE_URL: string;
    /** Derived: ${VERIDAS_BASE_URL}/validas */
    VERIDAS_VALIDATION_BASE_URL: string;
    VERIDAS_HTTP_TIMEOUT_MS: number;
    IDV_SKIP_SCORE_VALIDATION: boolean;
    IDV_SESSION_TTL_MS: number;
    REDIS_URL: string | undefined;
    REDIS_SESSION_PREFIX: string;
};

function readStr(env: Record<string, any> | undefined, key: string, defaultValue?: string): string {
    const val = env?.[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (defaultValue !== undefined) return defaultValue;
    return '';
}

function readInt(env: Record<string, any> | undefined, key: string, defaultMs: number): number {
    const val = env?.[key];
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
    if (typeof val === 'string') {
        const n = parseInt(val, 10);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return defaultMs;
}

function readBool(env: Record<string, any> | undefined, key: string, defaultValue: boolean): boolean {
    const val = env?.[key];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.trim().toLowerCase() === 'true';
    return defaultValue;
}

export function getEnv(env: Record<string, any> | undefined): IdvEndpointsEnv {
    const apiKey = readStr(env, 'VERIDAS_API_KEY');
    const baseUrl = readStr(env, 'VERIDAS_BASE_URL', '').replace(/\/$/, '');

    return {
        VERIDAS_API_KEY: apiKey,
        VERIDAS_BASE_URL: baseUrl,
        VERIDAS_XPRESS_BASE_URL: baseUrl ? `${baseUrl}/xpressid` : '',
        VERIDAS_VALIDATION_BASE_URL: baseUrl ? `${baseUrl}/validas` : '',
        VERIDAS_HTTP_TIMEOUT_MS: readInt(env, 'VERIDAS_HTTP_TIMEOUT_MS', 30_000),
        IDV_SKIP_SCORE_VALIDATION: readBool(env, 'IDV_SKIP_SCORE_VALIDATION', false),
        IDV_SESSION_TTL_MS: readInt(env, 'IDV_SESSION_TTL_MS', 30 * 60 * 1000),
        REDIS_URL: readStr(env, 'REDIS_URL') || undefined,
        REDIS_SESSION_PREFIX: readStr(env, 'REDIS_SESSION_PREFIX', 'idv:session:'),
    };
}

export function assertEnv(env: IdvEndpointsEnv): void {
    if (!env.VERIDAS_API_KEY) {
        throw new Error('idv-endpoints: VERIDAS_API_KEY is required');
    }
    if (!env.VERIDAS_BASE_URL) {
        throw new Error('idv-endpoints: VERIDAS_BASE_URL is required');
    }
}
