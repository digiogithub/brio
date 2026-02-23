import { z } from 'zod';
import { InvalidPayloadException } from '../../../exceptions/index.js';
import { getFlowManager } from '../../../flows.js';
import { FlowsService } from '../../../services/flows.js';
import { defineTool } from '../define-tool.js';
import { TriggerFlowInputSchema, TriggerFlowValidateSchema } from '../schema.js';

export const triggerFlow = defineTool<z.infer<typeof TriggerFlowValidateSchema>>({
    name: 'trigger-flow',
    description: 'Trigger an active manual flow with payload context.',
    annotations: { title: 'Brio - Trigger Flow' },
    inputSchema: TriggerFlowInputSchema,
    validateSchema: TriggerFlowValidateSchema,
    async handler({ args, schema, accountability }) {
        const flowsService = new FlowsService({ schema, accountability });
        const flow = await flowsService.readOne(args.id, {
            filter: { status: { _eq: 'active' }, trigger: { _eq: 'manual' } },
            fields: ['options'],
        });

        const requiredFields = ((flow.options?.['fields'] as { field: string; meta: { required: boolean } }[]) ?? [])
            .filter((field) => field.meta?.required)
            .map((field) => field.field);

        for (const fieldName of requiredFields) {
            if (!args.data || !(fieldName in args.data)) {
                throw new InvalidPayloadException(`Required field "${fieldName}" is missing`);
            }
        }

        const flowManager = getFlowManager();
        const result = await flowManager.runWebhookFlow(
            `POST-${args.id}`,
            {
                path: `/trigger/${args.id}`,
                query: args.query ?? {},
                method: 'POST',
                body: { collection: args.collection, keys: args.keys, ...(args.data ?? {}) },
                headers: args.headers ?? {},
            },
            { accountability, schema },
        );

        return { type: 'text', data: result };
    },
});
