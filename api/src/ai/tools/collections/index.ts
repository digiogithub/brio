import { toArray } from '@brio/utils';
import { z } from 'zod';
import { InvalidPayloadException } from '../../../exceptions/index.js';
import { CollectionsService } from '../../../services/collections.js';
import { defineTool } from '../define-tool.js';
import {
    CollectionItemInputSchema,
    CollectionItemValidateCreateSchema,
    CollectionItemValidateUpdateSchema,
} from '../schema.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export const CollectionsValidateSchema = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('create'), data: z.array(CollectionItemValidateCreateSchema) }),
    z.strictObject({ action: z.literal('read'), keys: z.array(z.string()).optional() }),
    z.strictObject({ action: z.literal('update'), data: z.array(CollectionItemValidateUpdateSchema) }),
    z.strictObject({ action: z.literal('delete'), keys: z.array(z.string()) }),
]);

export const CollectionsInputSchema = z.object({
    action: z.enum(['create', 'read', 'update', 'delete']).describe('The operation to perform'),
    keys: z.array(z.string()).optional(),
    data: z.array(CollectionItemInputSchema).optional(),
});

export const collections = defineTool<z.infer<typeof CollectionsValidateSchema>>({
    name: 'collections',
    admin: true,
    description: 'CRUD operations for collections.',
    annotations: { title: 'Brio - Collections' },
    inputSchema: CollectionsInputSchema,
    validateSchema: CollectionsValidateSchema,
    endpoint({ data }) {
        if (!isRecord(data) || !('collection' in data)) return;
        return ['content', String(data['collection'])];
    },
    async handler({ args, schema, accountability }) {
        const service = new CollectionsService({ schema, accountability });

        if (args.action === 'create') {
            const savedKeys = await service.createMany(toArray(args.data) as any[]);
            const result = await service.readMany(savedKeys);
            return { type: 'text', data: result || null };
        }

        if (args.action === 'read') {
            const result = args.keys ? await service.readMany(args.keys) : await service.readByQuery();
            return { type: 'text', data: result || null };
        }

        if (args.action === 'update') {
            const updatedKeys = await service.updateBatch(toArray(args.data as any));
            const result = await service.readMany(updatedKeys);
            return { type: 'text', data: result || null };
        }

        if (args.action === 'delete') {
            const deletedKeys = await service.deleteMany(args.keys);
            return { type: 'text', data: deletedKeys };
        }

        throw new InvalidPayloadException('Invalid action');
    },
});
