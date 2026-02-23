export interface MCPOptions {
    promptsCollection?: string | null;
    systemPromptEnabled?: boolean;
    systemPrompt?: string | null;
    allowDeletes?: boolean;
}

export interface Prompt {
    name: string;
    description?: string;
    system_prompt?: string;
    messages?: Array<{ role: 'user' | 'assistant'; text: string }>;
}
