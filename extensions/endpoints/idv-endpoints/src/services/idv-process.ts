/**
 * IDV Process persistence service.
 * Manages CRUD on the `idv_processes` Directus collection.
 */

import type { IdvEndpointContext } from '../types.js';

export type IdvProcessStatus = 'pending' | 'in_progress' | 'completed' | 'rejected' | 'error' | 'expired';

async function getItemsService(context: IdvEndpointContext, collection: string): Promise<any | null> {
    const schema = await context.getSchema?.();
    const ItemsService = context.services?.ItemsService;
    if (!schema || !ItemsService) return null;

    // Guard: only use if collection exists
    if (!schema?.collections?.[collection]) return null;

    return new ItemsService(collection, {
        schema,
        accountability: { admin: true },
    });
}

export async function createIdvProcess(params: {
    context: IdvEndpointContext;
    processId: string;
    configSlug: string;
    validationId: string;
    accessToken: string;
    accessTokenIssuedAt: string;
    metadata?: Record<string, unknown>;
}): Promise<void> {
    const { context, processId, configSlug, validationId, accessToken, accessTokenIssuedAt, metadata } = params;
    const svc = await getItemsService(context, 'idv_processes');
    if (!svc) {
        context.logger?.warn?.('idv-endpoints: idv_processes collection unavailable; skipping persistence');
        return;
    }

    try {
        // Upsert by process_id + validation_id
        const existing = await svc.readByQuery({
            filter: { process_id: { _eq: processId } },
            limit: 1,
            fields: ['id', 'status'],
        });

        const existingId = Array.isArray(existing) && existing[0]?.id ? String(existing[0].id) : undefined;
        const payload = {
            process_id: processId,
            config_slug: configSlug,
            validation_id: validationId,
            xpress_access_token: accessToken,
            xpress_token_issued_at: accessTokenIssuedAt,
            metadata: metadata ?? null,
        };

        if (existingId) {
            await svc.updateOne(existingId, payload);
        } else {
            await svc.createOne({ ...payload, status: 'pending' });
        }
    } catch (error) {
        context.logger?.warn?.(
            { error: error instanceof Error ? error.message : 'unknown' },
            'idv-endpoints: failed to persist idv_processes start',
        );
    }
}

export async function updateIdvProcessResult(params: {
    context: IdvEndpointContext;
    processId: string;
    status: IdvProcessStatus;
    reason?: string;
    scores?: Record<string, unknown>;
    ocrData?: Record<string, unknown>;
}): Promise<void> {
    const { context, processId, status, reason, scores, ocrData } = params;
    const svc = await getItemsService(context, 'idv_processes');
    if (!svc) return;

    try {
        const existing = await svc.readByQuery({
            filter: { process_id: { _eq: processId } },
            limit: 1,
            fields: ['id'],
        });

        const existingId = Array.isArray(existing) && existing[0]?.id ? String(existing[0].id) : undefined;
        const patch: Record<string, unknown> = {
            status,
            ...(reason !== undefined ? { decision_reason: reason } : {}),
            ...(scores !== undefined ? { scores } : {}),
            ...(ocrData !== undefined ? { ocr_data: ocrData } : {}),
        };

        if (existingId) {
            await svc.updateOne(existingId, patch);
        } else {
            context.logger?.warn?.({ processId }, 'idv-endpoints: idv_processes record not found on result update');
        }
    } catch (error) {
        context.logger?.warn?.(
            { error: error instanceof Error ? error.message : 'unknown' },
            'idv-endpoints: failed to update idv_processes result',
        );
    }
}

export async function getIdvProcess(
    context: IdvEndpointContext,
    processId: string,
): Promise<Record<string, unknown> | null> {
    const svc = await getItemsService(context, 'idv_processes');
    if (!svc) return null;

    try {
        const results = await svc.readByQuery({
            filter: { process_id: { _eq: processId } },
            limit: 1,
        });
        return Array.isArray(results) && results[0] ? results[0] : null;
    } catch {
        return null;
    }
}
