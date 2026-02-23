import { z } from 'zod';
import { defineTool } from '../define-tool.js';

const SystemPromptInputSchema = z.object({});

const SystemPromptValidateSchema = z.object({
    promptOverride: z.union([z.string(), z.null()]).optional(),
});

export const system = defineTool<z.infer<typeof SystemPromptValidateSchema>>({
    name: 'system-prompt',
    description: 'Returns the default Brio system prompt for AI tasks.',
    annotations: {
        title: 'Brio - System Prompt',
    },
    inputSchema: SystemPromptInputSchema,
    validateSchema: SystemPromptValidateSchema,
    async handler({ args }) {
        return {
            type: 'text',
            data:
                args.promptOverride ||
                'You are Brio Assistant. Use available tools to safely read and mutate project data according to user intent and permissions.',
        };
    },
});
