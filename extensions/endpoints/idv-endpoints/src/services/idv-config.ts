/**
 * IDV Configs service.
 * Reads XpressID process configurations from the `idv_configs` Directus collection.
 */

import type { IdvEndpointContext } from '../types.js';
import { HttpError } from './xpressid.js';

// Simple in-memory config cache (keyed by slug, 60s TTL)
const configCache = new Map<string, { config: Record<string, unknown>; expiresAt: number }>();
const CONFIG_CACHE_TTL_MS = 60_000;

export async function loadIdvConfig(
    context: IdvEndpointContext,
    configSlug: string,
): Promise<Record<string, unknown>> {
    // Return from cache if still valid
    const cached = configCache.get(configSlug);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.config;
    }

    const schema = await context.getSchema?.();
    const ItemsService = context.services?.ItemsService;

    if (!schema || !ItemsService) {
        throw new HttpError('idv_config_service_unavailable', 503, {
            message: 'Directus ItemsService not available',
        });
    }

    if (!schema?.collections?.idv_configs) {
        throw new HttpError('idv_configs_collection_missing', 500, {
            message: 'The idv_configs collection does not exist. Run the IDV migration first.',
        });
    }

    const svc = new ItemsService('idv_configs', {
        schema,
        accountability: { admin: true },
    });

    const results = await svc.readByQuery({
        filter: {
            slug: { _eq: configSlug },
            status: { _eq: 'published' },
        },
        limit: 1,
        fields: ['id', 'slug', 'name', 'xpressid_config'],
    });

    if (!Array.isArray(results) || !results[0]) {
        throw new HttpError('idv_config_not_found', 404, {
            message: `No published IDV config found for slug: ${configSlug}`,
            configSlug,
        });
    }

    const rawConfig = results[0].xpressid_config;
    if (!rawConfig || typeof rawConfig !== 'object') {
        throw new HttpError('idv_config_invalid', 500, {
            message: `IDV config for slug '${configSlug}' has no valid xpressid_config JSON`,
            configSlug,
        });
    }

    const config = rawConfig as Record<string, unknown>;
    configCache.set(configSlug, { config, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
    return config;
}

export function evictConfigCache(configSlug?: string): void {
    if (configSlug) {
        configCache.delete(configSlug);
    } else {
        configCache.clear();
    }
}
