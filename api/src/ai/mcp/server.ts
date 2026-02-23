import { BaseException } from '@brio/exceptions';
import { parseJSON, toArray } from '@brio/utils';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    type CallToolRequest,
    CallToolRequestSchema,
    type CallToolResult,
    type GetPromptRequest,
    GetPromptRequestSchema,
    type GetPromptResult,
    InitializedNotificationSchema,
    ErrorCode as JSONRPCErrorCode,
    JSONRPCMessageSchema,
    ListPromptsRequestSchema,
    ListToolsRequestSchema,
    McpError,
    type PromptArgument,
} from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import { render, tokenize } from 'micromustache';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { ForbiddenException, InvalidPayloadException } from '../../exceptions/index.js';
import env from '../../env.js';
import { ItemsService } from '../../services/items.js';
import { Url } from '../../utils/url.js';
import { findMcpTool, getAllMcpTools } from '../tools/index.js';
import type { ToolConfig, ToolResult } from '../tools/types.js';
import { DirectusTransport } from './transport.js';
import type { MCPOptions, Prompt } from './types.js';

export class DirectusMCP {
    promptsCollection?: string | null;
    systemPrompt?: string | null;
    systemPromptEnabled?: boolean;
    server: Server;
    allowDeletes?: boolean;

    constructor(options: MCPOptions = {}) {
        this.promptsCollection = options.promptsCollection ?? null;
        this.systemPromptEnabled = options.systemPromptEnabled ?? true;
        this.systemPrompt = options.systemPrompt ?? null;
        this.allowDeletes = options.allowDeletes ?? false;

        this.server = new Server(
            { name: 'brio-mcp', version: '0.1.0' },
            { capabilities: { tools: {}, prompts: {} } },
        );
    }

    handleRequest(req: Request, res: Response) {
        if (!req.accountability?.user && !req.accountability?.role && req.accountability?.admin !== true) {
            throw new ForbiddenException();
        }

        if (!req.accepts('application/json')) {
            res.status(405).send();
            return;
        }

        this.server.setNotificationHandler(InitializedNotificationSchema, () => {
            res.status(202).send();
        });

        this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
            const prompts = [];
            if (!this.promptsCollection) {
                throw new McpError(1001, 'A prompts collection must be set in settings');
            }

            const service = new ItemsService<Prompt>(this.promptsCollection, {
                accountability: req.accountability,
                schema: req.schema,
            });

            try {
                const promptList = await service.readByQuery({ fields: ['name', 'description', 'system_prompt', 'messages'] });

                for (const prompt of promptList) {
                    const args: PromptArgument[] = [];
                    if (prompt.system_prompt) {
                        for (const varName of tokenize(prompt.system_prompt).varNames) {
                            args.push({ name: varName, description: `Value for ${varName}`, required: false });
                        }
                    }

                    for (const message of prompt.messages || []) {
                        for (const varName of tokenize(message.text).varNames) {
                            args.push({ name: varName, description: `Value for ${varName}`, required: false });
                        }
                    }

                    prompts.push({ name: prompt.name, description: prompt.description, arguments: args });
                }

                return { prompts };
            } catch (error) {
                return this.toExecutionError(error);
            }
        });

        this.server.setRequestHandler(GetPromptRequestSchema, async (request: GetPromptRequest) => {
            if (!this.promptsCollection) {
                throw new McpError(1001, 'A prompts collection must be set in settings');
            }

            const service = new ItemsService<Prompt>(this.promptsCollection, {
                accountability: req.accountability,
                schema: req.schema,
            });

            const { name: promptName, arguments: args } = request.params;

            const promptCommand = await service.readByQuery({
                fields: ['description', 'system_prompt', 'messages'],
                filter: { name: { _eq: promptName } },
            });

            const prompt = promptCommand[0];
            if (!prompt) {
                throw new McpError(JSONRPCErrorCode.InvalidParams, `Invalid prompt "${promptName}"`);
            }

            const messages: GetPromptResult['messages'] = [];
            if (prompt.system_prompt) {
                messages.push({
                    role: 'assistant',
                    content: { type: 'text', text: render(prompt.system_prompt, args) },
                });
            }

            (prompt.messages || []).forEach((message) => {
                if (!message.role || !message.text) return;
                messages.push({
                    role: message.role,
                    content: { type: 'text', text: render(message.text, args) },
                });
            });

            return this.toPromptResponse({ messages, description: prompt.description });
        });

        this.server.setRequestHandler(ListToolsRequestSchema, () => {
            const tools = [];
            for (const tool of getAllMcpTools()) {
                if (req.accountability?.admin !== true && tool.admin === true) continue;
                if (tool.name === 'system-prompt' && this.systemPromptEnabled === false) continue;

                tools.push({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: z.toJSONSchema(tool.inputSchema),
                    annotations: tool.annotations,
                });
            }

            return { tools };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
            const tool = findMcpTool(request.params.name);

            try {
                if (!tool || (tool.name === 'system-prompt' && this.systemPromptEnabled === false)) {
                    throw new InvalidPayloadException(`"${request.params.name}" doesn't exist in the toolset`);
                }

                if (req.accountability?.admin !== true && tool.admin === true) {
                    throw new ForbiddenException();
                }

                if (tool.name === 'system-prompt') {
                    request.params.arguments = { promptOverride: this.systemPrompt };
                }

                if (request.params.arguments) {
                    for (const field of ['data', 'keys', 'query']) {
                        const arg = request.params.arguments[field];
                        if (typeof arg === 'string') request.params.arguments[field] = parseJSON(arg);
                    }
                }

                const { error, data: args } = tool.validateSchema?.safeParse(request.params.arguments) ?? {
                    data: request.params.arguments,
                };

                if (error) {
                    throw new InvalidPayloadException(fromZodError(error).message);
                }

                if (!args || typeof args !== 'object') {
                    throw new InvalidPayloadException('"arguments" must be an object');
                }

                if (this.allowDeletes === false && 'action' in args && args['action'] === 'delete') {
                    throw new InvalidPayloadException('Delete actions are disabled');
                }

                const result = await tool.handler({ args, schema: req.schema, accountability: req.accountability });
                const data = toArray(result?.data);

                if (
                    'action' in args &&
                    ['create', 'update', 'read', 'import'].includes(args['action'] as string) &&
                    result?.data &&
                    data.length === 1
                ) {
                    result.url = this.buildURL(tool, args, data[0]);
                }

                return this.toToolResponse(result);
            } catch (error) {
                return this.toExecutionError(error);
            }
        });

        const transport = new DirectusTransport(res);
        this.server.connect(transport);

        try {
            const parsedMessage = JSONRPCMessageSchema.parse(req.body);
            transport.onmessage?.(parsedMessage);
        } catch (error) {
            transport.onerror?.(error as Error);
            throw error;
        }
    }

    buildURL(tool: ToolConfig<unknown>, input: unknown, data: unknown) {
        const publicURL = env['PUBLIC_URL'] as string | undefined;
        if (!publicURL || !tool.endpoint) return;
        const path = tool.endpoint({ input, data });
        if (!path) return;
        return new Url(publicURL).addPath('admin', ...path).toString();
    }

    toPromptResponse(result: { description?: string | undefined; messages: GetPromptResult['messages'] }): GetPromptResult {
        const response: GetPromptResult = { messages: result.messages };
        if (result.description) response.description = result.description;
        return response;
    }

    toToolResponse(result?: ToolResult) {
        const response: CallToolResult = { content: [] };
        if (!result || typeof result.data === 'undefined' || result.data === null) return response;
        if (result.type === 'text') {
            response.content.push({ type: 'text', text: JSON.stringify({ raw: result.data, url: result.url }) });
        } else {
            response.content.push(result);
        }
        return response;
    }

    toExecutionError(err: unknown) {
        const errors: { error: string; code?: string }[] = [];
        const receivedErrors: unknown[] = Array.isArray(err) ? err : [err];

        const pushError = (message: string, code?: unknown) => {
            if (typeof code === 'string' && code.length > 0) {
                errors.push({ error: message, code });
                return;
            }

            errors.push({ error: message });
        };

        for (const error of receivedErrors) {
            if (error instanceof BaseException) {
                pushError(error.message || 'Unknown error', (error as any).code);
            } else if (error instanceof Error) {
                pushError(error.message, 'code' in error ? String((error as any).code) : undefined);
            } else if (typeof error === 'object' && error !== null) {
                pushError(
                    'message' in error ? String((error as any).message) : 'An unknown error occurred.',
                    'code' in error ? String((error as any).code) : undefined,
                );
            } else if (typeof error === 'string') {
                errors.push({ error });
            } else {
                errors.push({ error: 'An unknown error occurred.' });
            }
        }

        return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(errors) }],
        };
    }
}
