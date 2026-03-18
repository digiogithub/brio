import type { AxiosInstance } from 'axios';
import { getAxios } from '../../../request/index.js';

export type OpenAICompatibleClientOptions = {
	apiKey: string;
	baseURL: string;
	model: string;
	dimensions?: number | null;
};

export type EmbeddingResult = {
	index: number;
	embedding: number[];
	tokenCount: number | null;
};

type OpenAICompatibleResponse = {
	data?: Array<{
		embedding?: number[];
		index?: number;
	}>;
	usage?: {
		prompt_tokens?: number;
	};
};

export class OpenAICompatibleEmbeddingsClient {
	private readonly apiKey: string;
	private readonly baseURL: string;
	private readonly model: string;
	private readonly dimensions: number | null;
	private axios: AxiosInstance | null;

	constructor(options: OpenAICompatibleClientOptions) {
		this.apiKey = options.apiKey;
		this.baseURL = options.baseURL.replace(/\/+$/, '');
		this.model = options.model;
		this.dimensions = options.dimensions ?? null;
		this.axios = null;
	}

	async embed(inputs: string[]): Promise<EmbeddingResult[]> {
		const axios = await this.getAxiosInstance();

		const payload: Record<string, unknown> = {
			model: this.model,
			input: inputs,
		};

		if (this.dimensions) {
			payload['dimensions'] = this.dimensions;
		}

		const response = await axios.post<OpenAICompatibleResponse>('/embeddings', payload, {
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
		});

		const embeddings = response.data?.data ?? [];
		const tokenCount = response.data?.usage?.prompt_tokens ?? null;

		if (embeddings.length !== inputs.length) {
			throw new Error(`Embeddings response length mismatch (expected ${inputs.length}, got ${embeddings.length})`);
		}

		return embeddings
			.map((item, index) => ({
				index: item.index ?? index,
				embedding: item.embedding ?? [],
				tokenCount,
			}))
			.sort((a, b) => a.index - b.index);
	}

	private async getAxiosInstance(): Promise<AxiosInstance> {
		if (!this.axios) {
			const baseAxios = await getAxios();
			this.axios = baseAxios.create({ baseURL: this.baseURL });
		}

		return this.axios;
	}
}
