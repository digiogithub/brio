import type { EmbeddingProvider, EmbeddingsRuntimeSettings } from '../../../types/embeddings.js';
import { OpenAICompatibleEmbeddingsClient } from './openai-compatible.js';

const defaultBaseURLs: Record<EmbeddingProvider, string | null> = {
	openai: 'https://api.openai.com/v1',
	gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
	openrouter: 'https://openrouter.ai/api/v1',
	ollama: 'http://localhost:11434/v1',
	custom: null,
};

export function createEmbeddingsProviderClient(settings: EmbeddingsRuntimeSettings): OpenAICompatibleEmbeddingsClient {
	if (!settings.embeddings_provider) {
		throw new Error('Embeddings provider is not configured');
	}

	if (!settings.embeddings_model) {
		throw new Error('Embeddings model is not configured');
	}

	if (!settings.embeddings_api_key && settings.embeddings_provider !== 'ollama') {
		throw new Error('Embeddings API key is not configured');
	}

	const baseURL = settings.embeddings_base_url || defaultBaseURLs[settings.embeddings_provider];

	if (!baseURL) {
		throw new Error(`Embeddings base URL is required for provider "${settings.embeddings_provider}"`);
	}

	return new OpenAICompatibleEmbeddingsClient({
		apiKey: settings.embeddings_api_key || 'ollama',
		baseURL,
		model: settings.embeddings_model,
		dimensions: settings.embeddings_dimensions,
	});
}
