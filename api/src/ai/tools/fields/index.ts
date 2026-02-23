import type { Field, Item, RawField, Type } from '@brio/types';
import { toArray } from '@brio/utils';
import { z } from 'zod';
import { clearSystemCache } from '../../../cache.js';
import { InvalidPayloadException } from '../../../exceptions/index.js';
import { FieldsService } from '../../../services/fields.js';
import { getSchema } from '../../../utils/get-schema.js';
import { defineTool } from '../define-tool.js';
import {
    FieldItemInputSchema,
    FieldItemValidateSchema,
    RawFieldItemInputSchema,
    RawFieldItemValidateSchema,
} from '../schema.js';

type FieldCreateItem = Partial<Field> & {
    field: string;
    type: Type | null;
};

export const FieldsBaseValidateSchema = z.strictObject({ collection: z.string() });

export const FieldsValidateSchema = z.discriminatedUnion('action', [
    FieldsBaseValidateSchema.extend({ action: z.literal('create'), data: z.union([z.array(FieldItemValidateSchema), FieldItemValidateSchema]) }),
    z.object({ action: z.literal('read'), collection: z.string().optional(), field: z.string().optional() }),
    FieldsBaseValidateSchema.extend({ action: z.literal('update'), data: z.array(RawFieldItemValidateSchema) }),
    FieldsBaseValidateSchema.extend({ action: z.literal('delete'), field: z.string() }),
]);

export const FieldsInputSchema = z.object({
    action: z.enum(['read', 'create', 'update', 'delete']).describe('The operation to perform'),
    collection: z.string().describe('The name of the collection').optional(),
    field: z.string().optional(),
    data: z.array(FieldItemInputSchema.extend({ children: RawFieldItemInputSchema.shape.children }).partial()).optional(),
});

export const fields = defineTool<z.infer<typeof FieldsValidateSchema>>({
    name: 'fields',
    admin: true,
    description: 'CRUD operations for collection fields.',
    annotations: { title: 'Brio - Fields' },
    inputSchema: FieldsInputSchema,
    validateSchema: FieldsValidateSchema,
    async handler({ args, schema, accountability }) {
        const service = new FieldsService({ schema, accountability });

        if (args.action === 'create') {
            const fieldsData = toArray(args.data as FieldCreateItem | FieldCreateItem[]);
            const result: Item[] = [];

            for (const field of fieldsData) {
                await service.createField(args.collection, field);
            }

            await clearSystemCache();
            const postMutationService = new FieldsService({ schema: await getSchema(), accountability });

            for (const field of fieldsData) {
                const createdField = await postMutationService.readOne(args.collection, field.field);
                result.push(createdField);
            }

            return { type: 'text', data: result || null };
        }

        if (args.action === 'read') {
            let result = null;
            if (args.collection) result = args.field ? await service.readOne(args.collection, args.field) : await service.readAll(args.collection);
            else result = await service.readAll();
            return { type: 'text', data: result || null };
        }

        if (args.action === 'update') {
            const fieldsData = toArray(args.data as RawField | RawField[]);
            const result: Item[] = [];

            for (const field of fieldsData) {
                await service.updateField(args.collection, field);
            }

            await clearSystemCache();

            const postMutationService = new FieldsService({ schema: await getSchema(), accountability });
            for (const field of fieldsData) {
                const updatedField = await postMutationService.readOne(args.collection, field.field);
                result.push(updatedField);
            }

            return { type: 'text', data: result || null };
        }

        if (args.action === 'delete') {
            await service.deleteField(args.collection, args.field);
            return { type: 'text', data: { collection: args.collection, field: args.field } };
        }

        throw new InvalidPayloadException('Invalid action');
    },
});
