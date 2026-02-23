import type { PrimaryKey } from '@brio/types';
import { toArray } from '@brio/utils';
import { z } from 'zod';
import { FoldersService } from '../../../services/folders.js';
import { defineTool } from '../define-tool.js';
import {
    FolderItemInputSchema,
    FolderItemValidateSchema,
    PrimaryKeyInputSchema,
    PrimaryKeyValidateSchema,
    QueryInputSchema,
    QueryValidateSchema,
} from '../schema.js';
import { buildSanitizedQueryFromArgs } from '../utils.js';

const FoldersValidateSchema = z.discriminatedUnion('action', [
    z.strictObject({
        action: z.literal('create'),
        data: z.union([z.array(FolderItemValidateSchema), FolderItemValidateSchema]),
        query: QueryValidateSchema.optional(),
    }),
    z.strictObject({
        action: z.literal('read'),
        keys: z.array(PrimaryKeyValidateSchema).optional(),
        query: QueryValidateSchema.optional(),
    }),
    z.strictObject({
        action: z.literal('update'),
        data: FolderItemValidateSchema,
        keys: z.array(PrimaryKeyValidateSchema).optional(),
        query: QueryValidateSchema.optional(),
    }),
    z.strictObject({
        action: z.literal('delete'),
        keys: z.array(PrimaryKeyValidateSchema),
    }),
]);

const FoldersInputSchema = z.object({
    action: z.enum(['create', 'read', 'update', 'delete']).describe('The operation to perform'),
    query: QueryInputSchema.optional(),
    keys: z.array(PrimaryKeyInputSchema).optional(),
    data: z.array(FolderItemInputSchema).optional(),
});

export const folders = defineTool<z.infer<typeof FoldersValidateSchema>>({
    name: 'folders',
    description: 'CRUD operations for folders.',
    annotations: { title: 'Brio - Folders' },
    inputSchema: FoldersInputSchema,
    validateSchema: FoldersValidateSchema,
    async handler({ args, schema, accountability }) {
        const service = new FoldersService({ schema, accountability });

        if (args.action === 'create') {
            const sanitizedQuery = await buildSanitizedQueryFromArgs(args, schema, accountability);
            const savedKeys = await service.createMany(toArray(args.data) as Record<string, any>[]);
            const result = await service.readMany(savedKeys, sanitizedQuery);
            return { type: 'text', data: result || null };
        }

        if (args.action === 'read') {
            const sanitizedQuery = await buildSanitizedQueryFromArgs(args, schema, accountability);
            const result = args.keys ? await service.readMany(args.keys, sanitizedQuery) : await service.readByQuery(sanitizedQuery);
            return { type: 'text', data: result || null };
        }

        if (args.action === 'update') {
            const sanitizedQuery = await buildSanitizedQueryFromArgs(args, schema, accountability);
            let updatedKeys: PrimaryKey[] = [];
            if (Array.isArray(args.data)) updatedKeys = await service.updateBatch(args.data);
            else if (args.keys) updatedKeys = await service.updateMany(args.keys, args.data as Record<string, any>);
            else updatedKeys = await service.updateByQuery(sanitizedQuery, args.data as Record<string, any>);
            const result = await service.readMany(updatedKeys, sanitizedQuery);
            return { type: 'text', data: result };
        }

        if (args.action === 'delete') {
            const deletedKeys = await service.deleteMany(args.keys);
            return { type: 'text', data: deletedKeys };
        }

        throw new Error('Invalid action.');
    },
});
