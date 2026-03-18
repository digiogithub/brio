import { ForbiddenException, InvalidPayloadException } from '../../../exceptions/index.js';
import type { PrimaryKey } from '../../../types/index.js';
import { ItemsService } from '../../../services/items.js';
import { defineTool } from '../define-tool.js';
import {
    ItemInputSchema,
    ItemValidateSchema,
    PrimaryKeyInputSchema,
    PrimaryKeyValidateSchema,
    QueryInputSchema,
    QueryValidateSchema,
} from '../schema.js';
import { buildSanitizedQueryFromArgs } from '../utils.js';
import { toArray } from '@brio/utils';
import { z } from 'zod';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

const PartialItemInputSchema = z.strictObject({
    collection: z.string(),
});

const ItemsValidateSchema = z.discriminatedUnion('action', [
    PartialItemInputSchema.extend({
        action: z.literal('create'),
        data: z.union([z.array(ItemValidateSchema), ItemValidateSchema]),
        query: QueryValidateSchema.optional(),
    }),
    PartialItemInputSchema.extend({
        action: z.literal('read'),
        keys: z.array(PrimaryKeyValidateSchema).optional(),
        query: QueryValidateSchema.optional(),
    }),
    PartialItemInputSchema.extend({
        action: z.literal('update'),
        data: z.union([z.array(ItemValidateSchema), ItemValidateSchema]),
        keys: z.array(PrimaryKeyValidateSchema).optional(),
        query: QueryValidateSchema.optional(),
    }),
    PartialItemInputSchema.extend({
        action: z.literal('delete'),
        keys: z.array(PrimaryKeyValidateSchema),
    }),
]);

const ItemsInputSchema = z.object({
    action: z.enum(['create', 'read', 'update', 'delete']).describe('The operation to perform'),
    collection: z.string().describe('The name of the collection'),
    query: QueryInputSchema.optional(),
    keys: z.array(PrimaryKeyInputSchema).optional(),
    data: z
        .union([z.array(ItemInputSchema), ItemInputSchema])
        .optional()
        .describe('Object when using keys, array with PKs for batch updates'),
});

export const items = defineTool<z.infer<typeof ItemsValidateSchema>>({
    name: 'items',
    description: 'CRUD operations for content items.',
    annotations: {
        title: 'Brio - Items',
    },
    inputSchema: ItemsInputSchema,
    validateSchema: ItemsValidateSchema,
    endpoint({ input, data }) {
        if (!isRecord(data) || !('id' in data)) return;
        return ['content', input.collection, String(data['id'])];
    },
    async handler({ args, schema, accountability }) {
        if (args.collection.startsWith('brio_')) {
            throw new InvalidPayloadException('Cannot provide a core collection');
        }

        if (!(args.collection in schema.collections)) {
            throw new ForbiddenException();
        }

        const isSingleton = schema.collections[args.collection]?.singleton ?? false;

        const itemsService = new ItemsService(args.collection, {
            schema,
            accountability,
        });

        if (args.action === 'create') {
            const sanitizedQuery = await buildSanitizedQueryFromArgs(args, schema, accountability);
            const data = toArray(args.data);

            if (isSingleton) {
                if (Array.isArray(args.data)) {
                    throw new InvalidPayloadException('Invalid data payload, object expected');
                }

                await itemsService.upsertSingleton(args.data);
                const item = await itemsService.readSingleton(sanitizedQuery);
                return { type: 'text', data: item || null };
            }

            const savedKeys = await itemsService.createMany(data);
            const result = await itemsService.readMany(savedKeys, sanitizedQuery);
            return { type: 'text', data: result || null };
        }

        if (args.action === 'read') {
            const sanitizedQuery = await buildSanitizedQueryFromArgs(args, schema, accountability);
            let result = null;

            if (isSingleton) result = await itemsService.readSingleton(sanitizedQuery);
            else if (args.keys) result = await itemsService.readMany(args.keys, sanitizedQuery);
            else result = await itemsService.readByQuery(sanitizedQuery);

            return { type: 'text', data: result };
        }

        if (args.action === 'update') {
            const sanitizedQuery = await buildSanitizedQueryFromArgs(args, schema, accountability);

            if (isSingleton) {
                if (Array.isArray(args.data)) {
                    throw new InvalidPayloadException('Invalid data payload, object expected');
                }

                await itemsService.upsertSingleton(args.data);
                const item = await itemsService.readSingleton(sanitizedQuery);
                return { type: 'text', data: item || null };
            }

            let updatedKeys: PrimaryKey[] = [];

            if (Array.isArray(args.data)) updatedKeys = await itemsService.updateBatch(args.data);
            else if (args.keys) updatedKeys = await itemsService.updateMany(args.keys, args.data);
            else updatedKeys = await itemsService.updateByQuery(sanitizedQuery, args.data);

            const result = await itemsService.readMany(updatedKeys, sanitizedQuery);
            return { type: 'text', data: result };
        }

        if (args.action === 'delete') {
            const deletedKeys = await itemsService.deleteMany(args.keys);
            return { type: 'text', data: deletedKeys };
        }

        throw new InvalidPayloadException('Invalid action');
    },
});
