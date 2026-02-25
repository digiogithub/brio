/**
 * Session store for IDV processes.
 *
 * Uses Redis (via native fetch-based client) when REDIS_URL is configured,
 * falling back to the Directus `idv_processes` collection as source of truth.
 *
 * Redis is used solely as a fast-access cache for in-flight session data.
 * The `idv_processes` collection is always the authoritative record.
 */

import type { IdvEndpointsEnv } from '../config.js';

export type IdvSession = {
    processId: string;
    configSlug: string;
    validationId?: string;
    accessToken?: string;
    accessTokenIssuedAt?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'rejected' | 'error' | 'expired';
    metadata?: Record<string, unknown>;
};

// ─── In-memory fallback (per-instance) ───────────────────────────────────────

const memoryStore = new Map<string, { session: IdvSession; expiresAt: number }>();

function memGet(key: string): IdvSession | undefined {
    const entry = memoryStore.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        memoryStore.delete(key);
        return undefined;
    }
    return entry.session;
}

function memSet(key: string, session: IdvSession, ttlMs: number): void {
    memoryStore.set(key, { session, expiresAt: Date.now() + ttlMs });
}

function memDelete(key: string): void {
    memoryStore.delete(key);
}

// ─── Simple Redis client using raw TCP (via Bun.connect / fetch not supported for redis) ──
// We use ioredis-style URL but implement via simple single-command calls using
// the Bun HTTP-compatible "redis" protocol through a minimal wrapper.
// Since Brio runs on Bun.js, we use dynamic import of 'ioredis' if available,
// falling back to memory store.

let redisClient: any | null = null;
let redisInitialized = false;

async function getRedisClient(redisUrl: string): Promise<any | null> {
    if (redisInitialized) return redisClient;
    redisInitialized = true;
    try {
        // Try to use ioredis if available in Bun environment
        const { default: Redis } = await import('ioredis' as any);
        redisClient = new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: 3000,
        });
        await redisClient.connect?.();
        return redisClient;
    } catch {
        // ioredis not available or connection failed; use memory store
        redisClient = null;
        return null;
    }
}

// ─── Public session store API ─────────────────────────────────────────────────

export async function getSession(
    processId: string,
    env: IdvEndpointsEnv,
): Promise<IdvSession | undefined> {
    const key = `${env.REDIS_SESSION_PREFIX}${processId}`;

    if (env.REDIS_URL) {
        try {
            const redis = await getRedisClient(env.REDIS_URL);
            if (redis) {
                const raw = await redis.get(key);
                if (raw) return JSON.parse(raw) as IdvSession;
            }
        } catch {
            // Fall through to memory store
        }
    }

    return memGet(key);
}

export async function setSession(
    session: IdvSession,
    env: IdvEndpointsEnv,
): Promise<void> {
    const key = `${env.REDIS_SESSION_PREFIX}${session.processId}`;
    const ttlMs = env.IDV_SESSION_TTL_MS;

    if (env.REDIS_URL) {
        try {
            const redis = await getRedisClient(env.REDIS_URL);
            if (redis) {
                await redis.set(key, JSON.stringify(session), 'PX', ttlMs);
                return;
            }
        } catch {
            // Fall through to memory store
        }
    }

    memSet(key, session, ttlMs);
}

export async function updateSession(
    processId: string,
    patch: Partial<IdvSession>,
    env: IdvEndpointsEnv,
): Promise<void> {
    const existing = await getSession(processId, env);
    const updated: IdvSession = { ...(existing ?? { processId, configSlug: '', status: 'pending' }), ...patch };
    await setSession(updated, env);
}

export async function evictSession(processId: string, env: IdvEndpointsEnv): Promise<void> {
    const key = `${env.REDIS_SESSION_PREFIX}${processId}`;

    if (env.REDIS_URL) {
        try {
            const redis = await getRedisClient(env.REDIS_URL);
            if (redis) await redis.del(key);
        } catch {
            // ignore
        }
    }

    memDelete(key);
}
