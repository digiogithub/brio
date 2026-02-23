import type { Accountability, SchemaOverview } from '@brio/types';
import { sanitizeQuery } from '../../utils/sanitize-query.js';

export async function buildSanitizedQueryFromArgs<T extends { query?: Record<string, any> | undefined }>(
    args: T,
    _schema: SchemaOverview,
    accountability?: Accountability | null,
): Promise<Record<string, any>> {
    if (!args?.query) return {};

    const query = {
        fields: args.query['fields'] ?? '*',
        ...args.query,
    };

    return sanitizeQuery(query, accountability ?? undefined);
}
