/**
 * Structured event logger.
 * Writes to the `idv_logs` collection (best-effort) and to the Directus logger.
 */

import type { IdvEndpointContext } from '../types.js';

export type LogLevel = 'info' | 'warn' | 'error';

export function logIdvEvent(
    level: LogLevel,
    event: string,
    payload: Record<string, unknown>,
    context: IdvEndpointContext,
): void {
    const logFn = context.logger?.[level] ?? context.logger?.info;
    logFn?.({ event, ...payload }, `idv-endpoints: ${event}`);

    // Best-effort: persist to idv_logs collection
    void persistLog({ level, event, payload, context }).catch(() => {
        // Logging failures must never crash the request
    });
}

export function logIdvError(
    event: string,
    error: unknown,
    extra: Record<string, unknown> = {},
    context: IdvEndpointContext,
): void {
    const message = error instanceof Error ? error.message : String(error);
    context.logger?.error?.({ event, error: message, ...extra }, `idv-endpoints: ${event}`);

    void persistLog({
        level: 'error',
        event,
        payload: { error: message, ...extra },
        context,
    }).catch(() => { });
}

async function persistLog(params: {
    level: LogLevel;
    event: string;
    payload: Record<string, unknown>;
    context: IdvEndpointContext;
}): Promise<void> {
    const { level, event, payload, context } = params;

    const schema = await context.getSchema?.();
    const ItemsService = context.services?.ItemsService;
    if (!schema || !ItemsService) return;

    // Only persist if idv_logs collection exists in schema
    if (!schema?.collections?.idv_logs) return;

    try {
        const logsService = new ItemsService('idv_logs', {
            schema,
            accountability: { admin: true },
        });
        await logsService.createOne({
            level,
            event,
            process_id: (payload.processId as string) ?? null,
            payload,
        });
    } catch {
        // Never throw from logger
    }
}
