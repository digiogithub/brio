export const EMBEDDING_STATUSES = ['pending', 'processing', 'completed', 'error'] as const;

export const EMBEDDING_QUEUE_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;

export const EMBEDDING_QUEUE_ACTIONS = ['embed', 'update', 'delete'] as const;

export const EMBEDDING_CHUNK_STRATEGIES = ['auto', 'sentence', 'paragraph', 'fixed', 'none'] as const;

export const EMBEDDING_PROVIDERS = ['openai', 'gemini', 'openrouter', 'ollama', 'custom'] as const;

export type EmbeddingStatus = (typeof EMBEDDING_STATUSES)[number];
export type EmbeddingQueueStatus = (typeof EMBEDDING_QUEUE_STATUSES)[number];
export type EmbeddingQueueAction = (typeof EMBEDDING_QUEUE_ACTIONS)[number];
export type EmbeddingChunkStrategy = (typeof EMBEDDING_CHUNK_STRATEGIES)[number];
export type EmbeddingProvider = (typeof EMBEDDING_PROVIDERS)[number];

export type EmbeddingsRuntimeSettings = {
	embeddings_provider: EmbeddingProvider | null;
	embeddings_model: string | null;
	embeddings_api_key: string | null;
	embeddings_base_url: string | null;
	embeddings_dimensions: number | null;
	embeddings_batch_size: number | null;
};

export type EmbeddingsConfigRow = {
	id: string;
	collection: string;
	field: string;
	enabled: boolean;
	chunk_strategy: EmbeddingChunkStrategy;
	chunk_size: number;
	chunk_overlap: number;
	template: string | null;
	metadata_fields: string | null;
};

export type EmbeddingsQueueRow = {
	id: string;
	action: EmbeddingQueueAction;
	source_collection: string;
	source_item: string;
	source_field: string;
	priority: number;
	status: EmbeddingQueueStatus;
	attempts: number;
	max_attempts: number;
	error_message: string | null;
	scheduled_at: Date;
	started_at: Date | null;
	completed_at: Date | null;
	date_created: Date;
};
