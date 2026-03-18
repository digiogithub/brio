import type { Accountability, Query, SchemaOverview } from '@brio/types';
import { parseJSON, toArray } from '@brio/utils';
import type { Knex } from 'knex';
import { createHash, randomUUID } from 'node:crypto';
import getDatabase from '../database/index.js';
import { getHelpers } from '../database/helpers/index.js';
import { ForbiddenException, InvalidPayloadException, ServiceUnavailableException } from '../exceptions/index.js';
import logger from '../logger.js';
import type {
	EmbeddingQueueAction,
	EmbeddingsConfigRow,
	EmbeddingsQueueRow,
	EmbeddingsRuntimeSettings,
} from '../types/embeddings.js';
import type { AbstractServiceOptions } from '../types/services.js';
import { ItemsService } from './items.js';
import { chunkText } from './embeddings/chunking.js';
import { createEmbeddingsProviderClient } from './embeddings/providers/index.js';
import { SettingsService } from './settings.js';

const EMBEDDINGS_TABLE = 'brio_embeddings';
const EMBEDDINGS_QUEUE_TABLE = 'brio_embeddings_queue';
const EMBEDDINGS_CONFIG_TABLE = 'brio_embeddings_config';

export type SemanticSearchDistanceMetric = 'cosine' | 'l2';

export type SemanticSearchInput = {
	query: string;
	collection?: string;
	field?: string;
	limit?: number;
	distanceMetric?: SemanticSearchDistanceMetric;
};

export type SemanticSearchResult = {
	id: string;
	collection: string;
	item: string;
	field: string;
	chunk_index: number;
	chunk_text: string | null;
	distance: number;
	metadata: Record<string, unknown>;
};

export class EmbeddingsService {
	knex: Knex;
	schema: SchemaOverview;
	accountability: Accountability | null | undefined;
	private vectorSupport: boolean | null;
	private vectorColumnInitialized: boolean;

	constructor(options: AbstractServiceOptions) {
		this.knex = options.knex || getDatabase();
		this.schema = options.schema;
		this.accountability = options.accountability;
		this.vectorSupport = null;
		this.vectorColumnInitialized = false;
	}

	async getEnabledConfigs(collection: string): Promise<EmbeddingsConfigRow[]> {
		return this.knex<EmbeddingsConfigRow>(EMBEDDINGS_CONFIG_TABLE)
			.select('*')
			.where({
				collection,
				enabled: true,
			});
	}

	async enqueueForItem(collection: string, item: string | number, action: 'update' | 'delete'): Promise<number> {
		if (action === 'delete') {
			await this.enqueue({
				action: 'delete',
				sourceCollection: collection,
				sourceItem: String(item),
				sourceField: '*',
				priority: 10,
			});

			return 1;
		}

		const configs = await this.getEnabledConfigs(collection);
		if (configs.length === 0) return 0;

		for (const config of configs) {
			await this.enqueue({
				action: 'update',
				sourceCollection: collection,
				sourceItem: String(item),
				sourceField: config.field,
			});
		}

		return configs.length;
	}

	async enqueue(input: {
		action: EmbeddingQueueAction;
		sourceCollection: string;
		sourceItem: string;
		sourceField: string;
		priority?: number;
	}): Promise<string> {
		await this.knex(EMBEDDINGS_QUEUE_TABLE)
			.where({
				status: 'pending',
				source_collection: input.sourceCollection,
				source_item: input.sourceItem,
				source_field: input.sourceField,
			})
			.delete();

		const id = randomUUID();
		const now = new Date();

		await this.knex(EMBEDDINGS_QUEUE_TABLE).insert({
			id,
			action: input.action,
			source_collection: input.sourceCollection,
			source_item: input.sourceItem,
			source_field: input.sourceField,
			priority: input.priority ?? 0,
			status: 'pending',
			attempts: 0,
			max_attempts: 3,
			error_message: null,
			scheduled_at: now,
			started_at: null,
			completed_at: null,
			date_created: now,
		});

		return id;
	}

	async processQueue(limit = 25): Promise<number> {
		let processed = 0;

		while (processed < limit) {
			const claimed = await this.claimNextJob();
			if (!claimed) break;

			try {
				await this.processJob(claimed);

				await this.knex(EMBEDDINGS_QUEUE_TABLE).where({ id: claimed.id }).update({
					status: 'completed',
					error_message: null,
					completed_at: new Date(),
				});
			} catch (error: any) {
				const attempts = claimed.attempts;
				const shouldRetry = attempts < claimed.max_attempts;
				const backoffSeconds = Math.min(60, 2 ** Math.max(1, attempts));
				const nextSchedule = new Date(Date.now() + backoffSeconds * 1000);
				const message = error instanceof Error ? error.message : String(error);

				await this.knex(EMBEDDINGS_QUEUE_TABLE).where({ id: claimed.id }).update({
					status: shouldRetry ? 'pending' : 'failed',
					error_message: message,
					scheduled_at: shouldRetry ? nextSchedule : claimed.scheduled_at,
					completed_at: shouldRetry ? null : new Date(),
				});

				logger.warn(`Embeddings queue job failed (${claimed.id}): ${message}`);
			}

			processed++;
		}

		return processed;
	}

	async getConfigs(collection?: string): Promise<EmbeddingsConfigRow[]> {
		const query = this.knex<EmbeddingsConfigRow>(EMBEDDINGS_CONFIG_TABLE).select('*').orderBy('collection').orderBy('field');

		if (collection) query.where({ collection });

		return query;
	}

	async getStatus(): Promise<{
		providerConfigured: boolean;
		provider: string | null;
		model: string | null;
		vectorSupported: boolean;
		queue: {
			pending: number;
			processing: number;
			completed: number;
			failed: number;
		};
	}> {
		const settings = await this.getRuntimeSettings();
		const queue = await this.getQueueCounts();
		const vectorSupported = await this.isVectorSupported();

		return {
			providerConfigured: Boolean(settings.embeddings_provider && settings.embeddings_model),
			provider: settings.embeddings_provider,
			model: settings.embeddings_model,
			vectorSupported,
			queue,
		};
	}

	async getStats(): Promise<{
		embeddings: { total: number; collections: Array<{ collection: string; count: number }> };
		queue: { pending: number; processing: number; completed: number; failed: number };
		configurations: { total: number; enabled: number };
	}> {
		const embeddingsCountRows = (await this.knex(EMBEDDINGS_TABLE).count('* as total')) as Array<Record<string, unknown>>;
		const configCountRows = (await this.knex(EMBEDDINGS_CONFIG_TABLE).count('* as total')) as Array<Record<string, unknown>>;
		const enabledConfigCountRows = (await this.knex(EMBEDDINGS_CONFIG_TABLE)
			.where({ enabled: true })
			.count('* as total')) as Array<Record<string, unknown>>;

		const byCollectionRows = (await this.knex(EMBEDDINGS_TABLE)
			.select('source_collection as collection')
			.count('id as count')
			.groupBy('source_collection')
			.orderBy('count', 'desc')
			.limit(25)) as Array<Record<string, unknown>>;

		const embeddingsCountRow = embeddingsCountRows[0] ?? {};
		const configCountRow = configCountRows[0] ?? {};
		const enabledConfigCountRow = enabledConfigCountRows[0] ?? {};

		return {
			embeddings: {
				total: Number(embeddingsCountRow?.['total'] || 0),
				collections: byCollectionRows.map((row) => ({
					collection: String(row['collection']),
					count: Number(row['count'] || 0),
				})),
			},
			queue: await this.getQueueCounts(),
			configurations: {
				total: Number(configCountRow?.['total'] || 0),
				enabled: Number(enabledConfigCountRow?.['total'] || 0),
			},
		};
	}

	async testConnection(): Promise<{
		success: boolean;
		provider: string;
		model: string;
		dimensions: number;
		latency_ms: number;
	}> {
		const settings = await this.getRuntimeSettings();
		this.assertProviderConfigured(settings);
		const provider = createEmbeddingsProviderClient(settings);
		const startedAt = Date.now();
		const result = await provider.embed(['Brio embeddings connection test']);
		const latencyMs = Date.now() - startedAt;
		const firstEmbedding = result[0]?.embedding;

		if (!firstEmbedding || firstEmbedding.length === 0) {
			throw new ServiceUnavailableException('Embeddings provider returned an empty embedding vector', {
				service: 'embeddings',
			});
		}

		return {
			success: true,
			provider: settings.embeddings_provider!,
			model: settings.embeddings_model!,
			dimensions: firstEmbedding.length,
			latency_ms: latencyMs,
		};
	}

	async semanticSearch(input: SemanticSearchInput): Promise<SemanticSearchResult[]> {
		const normalizedInput = this.validateSearchInput(input);
		const settings = await this.getRuntimeSettings();
		this.assertProviderConfigured(settings);
		const provider = createEmbeddingsProviderClient(settings);
		const queryEmbedding = await provider.embed([normalizedInput.query]);
		const vector = queryEmbedding[0]?.embedding;

		if (!vector || vector.length === 0) {
			throw new ServiceUnavailableException('Embeddings provider returned an empty query vector', {
				service: 'embeddings',
			});
		}

		const vectorSupported = await this.isVectorSupported();
		const candidates = vectorSupported
			? await this.semanticSearchWithVector(normalizedInput, vector)
			: await this.semanticSearchWithFallback(normalizedInput, vector);

		return this.filterSearchResultsByPermissions(candidates, normalizedInput.limit);
	}

	private async claimNextJob(): Promise<EmbeddingsQueueRow | null> {
		const now = new Date();
		const next = await this.knex<EmbeddingsQueueRow>(EMBEDDINGS_QUEUE_TABLE)
			.select('*')
			.where('status', 'pending')
			.andWhere('scheduled_at', '<=', now)
			.orderBy('priority', 'desc')
			.orderBy('scheduled_at', 'asc')
			.orderBy('date_created', 'asc')
			.first();

		if (!next) return null;

		const attempts = next.attempts + 1;
		const updated = await this.knex(EMBEDDINGS_QUEUE_TABLE)
			.where({ id: next.id, status: 'pending' })
			.update({
				status: 'processing',
				attempts,
				started_at: now,
				error_message: null,
			});

		if (updated === 0) return null;

		return {
			...next,
			status: 'processing',
			attempts,
			started_at: now,
		};
	}

	private async processJob(job: EmbeddingsQueueRow): Promise<void> {
		if (job.action === 'delete') {
			await this.deleteEmbeddings(job.source_collection, job.source_item, job.source_field);
			return;
		}

		await this.embedItem(job.source_collection, job.source_item, job.source_field);
	}

	private async embedItem(collection: string, sourceItem: string, field: string): Promise<void> {
		const config = await this.knex<EmbeddingsConfigRow>(EMBEDDINGS_CONFIG_TABLE)
			.select('*')
			.where({
				collection,
				field,
				enabled: true,
			})
			.first();

		if (!config) {
			await this.deleteEmbeddings(collection, sourceItem, field);
			return;
		}

		const primaryKeyField = this.schema.collections[collection]?.primary;

		if (!primaryKeyField) {
			throw new Error(`Collection "${collection}" is missing from schema`);
		}

		const typedPrimaryKey = this.castPrimaryKey(collection, primaryKeyField, sourceItem);
		const item = await this.knex(collection).where({ [primaryKeyField]: typedPrimaryKey }).first();

		if (!item) {
			await this.deleteEmbeddings(collection, sourceItem, field);
			return;
		}

		const text = this.resolveSourceText(item, config);

		if (!text) {
			await this.deleteEmbeddings(collection, sourceItem, field);
			return;
		}

		const chunks = chunkText(text, {
			strategy: config.chunk_strategy,
			size: config.chunk_size,
			overlap: config.chunk_overlap,
		});

		if (chunks.length === 0) {
			await this.deleteEmbeddings(collection, sourceItem, field);
			return;
		}

		const settings = await this.getRuntimeSettings();
		const provider = createEmbeddingsProviderClient(settings);
		const batchSize = Math.max(1, settings.embeddings_batch_size ?? 100);
		const embeddings = await this.embedInBatches(provider, chunks, batchSize);

		if (embeddings.length !== chunks.length) {
			throw new Error(`Provider returned ${embeddings.length} embeddings for ${chunks.length} chunks`);
		}

		const dimensions = embeddings[0]?.embedding.length ?? settings.embeddings_dimensions ?? null;
		await this.ensureEmbeddingStorage(dimensions);

		const metadata = this.resolveMetadata(item, config);
		await this.upsertEmbeddings({
			collection,
			sourceItem,
			field,
			chunks,
			embeddings,
			settings,
			metadata,
		});
	}

	private async upsertEmbeddings(input: {
		collection: string;
		sourceItem: string;
		field: string;
		chunks: string[];
		embeddings: Array<{ embedding: number[]; tokenCount: number | null }>;
		settings: EmbeddingsRuntimeSettings;
		metadata: Record<string, unknown>;
	}): Promise<void> {
		const existing = await this.knex(EMBEDDINGS_TABLE)
			.select('id', 'chunk_index')
			.where({
				source_collection: input.collection,
				source_item: input.sourceItem,
				source_field: input.field,
			});

		const existingByChunk = new Map<number, string>();
		for (const row of existing) {
			existingByChunk.set(row['chunk_index'], row['id']);
		}

		for (let chunkIndex = 0; chunkIndex < input.chunks.length; chunkIndex++) {
			const chunkTextValue = input.chunks[chunkIndex]!;
			const embedding = input.embeddings[chunkIndex]!;
			const chunkHash = createHash('sha256').update(chunkTextValue).digest('hex');
			const rowId = existingByChunk.get(chunkIndex) ?? randomUUID();
			const now = new Date();

			const values: Record<string, unknown> = {
				source_collection: input.collection,
				source_item: input.sourceItem,
				source_field: input.field,
				chunk_index: chunkIndex,
				chunk_text: chunkTextValue,
				chunk_hash: chunkHash,
				embedding_model: input.settings.embeddings_model,
				embedding_provider: input.settings.embeddings_provider,
				dimensions: embedding.embedding.length,
				status: 'completed',
				error_message: null,
				token_count: embedding.tokenCount,
				metadata: JSON.stringify(input.metadata),
				date_updated: now,
			};

			if (this.vectorSupport) {
				values['embedding'] = getHelpers(this.knex).vector.literal(embedding.embedding);
			} else {
				values['embedding_json'] = JSON.stringify(embedding.embedding);
			}

			if (existingByChunk.has(chunkIndex)) {
				await this.knex(EMBEDDINGS_TABLE).where({ id: rowId }).update(values);
			} else {
				await this.knex(EMBEDDINGS_TABLE).insert({
					id: rowId,
					date_created: now,
					...values,
				});
			}
		}

		await this.knex(EMBEDDINGS_TABLE)
			.where({
				source_collection: input.collection,
				source_item: input.sourceItem,
				source_field: input.field,
			})
			.andWhere('chunk_index', '>=', input.chunks.length)
			.delete();
	}

	private async ensureEmbeddingStorage(dimensions: number | null): Promise<void> {
		if (!dimensions || dimensions <= 0) {
			throw new Error('Embeddings dimensions are required');
		}

		if (this.vectorSupport === null) {
			this.vectorSupport = await getHelpers(this.knex).vector.supported();
		}

		if (this.vectorSupport && !this.vectorColumnInitialized) {
			const hasColumn = await this.knex.schema.hasColumn(EMBEDDINGS_TABLE, 'embedding');

			if (!hasColumn) {
				await this.knex.schema.alterTable(EMBEDDINGS_TABLE, (table) => {
					getHelpers(this.knex).vector.createColumn(table, 'embedding', dimensions).nullable();
				});
			}

			this.vectorColumnInitialized = true;
		}

		if (!this.vectorSupport) {
			const hasFallbackColumn = await this.knex.schema.hasColumn(EMBEDDINGS_TABLE, 'embedding_json');

			if (!hasFallbackColumn) {
				await this.knex.schema.alterTable(EMBEDDINGS_TABLE, (table) => {
					table.text('embedding_json').nullable();
				});
			}
		}
	}

	private async isVectorSupported(): Promise<boolean> {
		if (this.vectorSupport === null) {
			this.vectorSupport = await getHelpers(this.knex).vector.supported();
		}

		return this.vectorSupport;
	}

	private async getRuntimeSettings(): Promise<EmbeddingsRuntimeSettings> {
		const settingsService = new SettingsService({
			knex: this.knex,
			schema: this.schema,
		});

		return (await settingsService.readSingleton({
			fields: [
				'embeddings_provider',
				'embeddings_model',
				'embeddings_api_key',
				'embeddings_base_url',
				'embeddings_dimensions',
				'embeddings_batch_size',
			],
		})) as EmbeddingsRuntimeSettings;
	}

	private async embedInBatches(
		provider: { embed: (inputs: string[]) => Promise<Array<{ embedding: number[]; tokenCount: number | null }>> },
		chunks: string[],
		batchSize: number
	) {
		const results: Array<{ embedding: number[]; tokenCount: number | null }> = [];

		for (let index = 0; index < chunks.length; index += batchSize) {
			const batch = chunks.slice(index, index + batchSize);
			const batchEmbeddings = await provider.embed(batch);
			results.push(...batchEmbeddings);
		}

		return results;
	}

	private resolveSourceText(item: Record<string, any>, config: EmbeddingsConfigRow): string | null {
		if (config.template && config.template.trim().length > 0) {
			return interpolateTemplate(config.template, item).trim() || null;
		}

		const value = item[config.field];
		if (value === null || value === undefined) return null;
		if (typeof value === 'string') return value.trim() || null;
		if (typeof value === 'number' || typeof value === 'boolean') return String(value);

		return JSON.stringify(value);
	}

	private resolveMetadata(item: Record<string, any>, config: EmbeddingsConfigRow): Record<string, unknown> {
		if (!config.metadata_fields) return {};

		let parsedMetadataFields: unknown = config.metadata_fields;

		if (typeof config.metadata_fields === 'string' && config.metadata_fields.trim().startsWith('[')) {
			parsedMetadataFields = parseJSON(config.metadata_fields);
		}

		const fields = toArray(parsedMetadataFields).filter((value): value is string => typeof value === 'string');

		const metadata: Record<string, unknown> = {};

		for (const field of fields) {
			metadata[field] = item[field];
		}

		return metadata;
	}

	private async getQueueCounts(): Promise<{
		pending: number;
		processing: number;
		completed: number;
		failed: number;
	}> {
		const [row] = await this.knex(EMBEDDINGS_QUEUE_TABLE)
			.select(this.knex.raw("SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending"))
			.select(this.knex.raw("SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing"))
			.select(this.knex.raw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed"))
			.select(this.knex.raw("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed"));

		return {
			pending: Number(row?.['pending'] || 0),
			processing: Number(row?.['processing'] || 0),
			completed: Number(row?.['completed'] || 0),
			failed: Number(row?.['failed'] || 0),
		};
	}

	private validateSearchInput(input: SemanticSearchInput): Required<SemanticSearchInput> {
		const query = (input.query || '').trim();
		if (!query) {
			throw new InvalidPayloadException('"query" is required');
		}

		const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
		const distanceMetric = input.distanceMetric ?? 'cosine';

		if (!['cosine', 'l2'].includes(distanceMetric)) {
			throw new InvalidPayloadException('"distance_metric" must be one of: cosine, l2');
		}

		if (input.collection) {
			const collection = input.collection.trim();
			if (!collection) throw new InvalidPayloadException('"collection" cannot be empty');
			if (this.accountability?.admin !== true && collection.startsWith('brio_')) {
				throw new ForbiddenException();
			}
			if (!this.schema.collections[collection]) {
				throw new InvalidPayloadException(`Collection "${collection}" does not exist`);
			}
		}

		if (input.field) {
			const field = input.field.trim();
			if (!field) throw new InvalidPayloadException('"field" cannot be empty');
		}

		return {
			query,
			collection: input.collection?.trim() || '',
			field: input.field?.trim() || '',
			limit,
			distanceMetric,
		};
	}

	private assertProviderConfigured(settings: EmbeddingsRuntimeSettings): void {
		if (settings.embeddings_provider && settings.embeddings_model) return;

		throw new ServiceUnavailableException('Embeddings provider is not configured', {
			service: 'embeddings',
		});
	}

	private async semanticSearchWithVector(
		input: Required<SemanticSearchInput>,
		vector: number[]
	): Promise<SemanticSearchResult[]> {
		const candidateLimit = Math.min(Math.max(input.limit * 8, 50), 1000);
		const distanceExpression =
			input.distanceMetric === 'l2'
				? getHelpers(this.knex).vector.euclideanDistance('embedding', vector)
				: getHelpers(this.knex).vector.cosineDistance('embedding', vector);
		const distanceSQL = distanceExpression.toSQL();

		const query = this.knex(EMBEDDINGS_TABLE)
			.select(
				'id',
				'source_collection',
				'source_item',
				'source_field',
				'chunk_index',
				'chunk_text',
				'metadata',
				this.knex.raw(`(${distanceSQL.sql}) as distance`, distanceSQL.bindings)
			)
			.whereNotNull('embedding')
			.andWhere('status', 'completed')
			.orderBy('distance', 'asc')
			.limit(candidateLimit);

		if (input.collection) query.andWhere('source_collection', input.collection);
		if (input.field) query.andWhere('source_field', input.field);

		const rows = await query;
		return rows.map((row) => this.mapSearchResultRow(row));
	}

	private async semanticSearchWithFallback(
		input: Required<SemanticSearchInput>,
		vector: number[]
	): Promise<SemanticSearchResult[]> {
		const candidateLimit = Math.min(Math.max(input.limit * 30, 200), 2000);
		const query = this.knex(EMBEDDINGS_TABLE)
			.select('id', 'source_collection', 'source_item', 'source_field', 'chunk_index', 'chunk_text', 'metadata', 'embedding_json')
			.whereNotNull('embedding_json')
			.andWhere('status', 'completed')
			.limit(candidateLimit);

		if (input.collection) query.andWhere('source_collection', input.collection);
		if (input.field) query.andWhere('source_field', input.field);

		const rows = await query;
		const scored: SemanticSearchResult[] = [];

		for (const row of rows) {
			const embeddingValue = row['embedding_json'];
			const parsed = typeof embeddingValue === 'string' ? parseJSON(embeddingValue) : embeddingValue;
			if (!Array.isArray(parsed)) continue;

			const candidate = parsed
				.map((value) => Number(value))
				.filter((value) => Number.isFinite(value))
				.slice(0, vector.length);

			if (candidate.length !== vector.length) continue;

			const distance = input.distanceMetric === 'l2' ? euclideanDistance(vector, candidate) : cosineDistance(vector, candidate);
			scored.push(this.mapSearchResultRow({ ...row, distance }));
		}

		return scored.sort((a, b) => a.distance - b.distance).slice(0, candidateLimit);
	}

	private mapSearchResultRow(row: Record<string, any>): SemanticSearchResult {
		const metadata = row['metadata'];
		const parsedMetadata =
			typeof metadata === 'string' ? parseJSON(metadata) : typeof metadata === 'object' && metadata ? metadata : {};

		return {
			id: String(row['id']),
			collection: String(row['source_collection']),
			item: String(row['source_item']),
			field: String(row['source_field']),
			chunk_index: Number(row['chunk_index'] || 0),
			chunk_text: row['chunk_text'] === null || row['chunk_text'] === undefined ? null : String(row['chunk_text']),
			distance: Number(row['distance'] || 0),
			metadata: isPlainObject(parsedMetadata) ? parsedMetadata : {},
		};
	}

	private async filterSearchResultsByPermissions(
		results: SemanticSearchResult[],
		limit: number
	): Promise<SemanticSearchResult[]> {
		if (results.length === 0) return [];
		if (this.accountability?.admin === true) return results.slice(0, limit);
		if (!this.accountability?.user && !this.accountability?.role) return [];

		const byCollection = new Map<string, SemanticSearchResult[]>();

		for (const result of results) {
			if (result.collection.startsWith('brio_')) continue;
			if (!this.schema.collections[result.collection]) continue;
			if (!byCollection.has(result.collection)) byCollection.set(result.collection, []);
			byCollection.get(result.collection)!.push(result);
		}

		const allowedCollectionItems = new Map<string, Set<string>>();

		for (const [collection, collectionResults] of byCollection) {
			const primaryKeyField = this.schema.collections[collection]?.primary;
			if (!primaryKeyField) continue;

			const keys = Array.from(new Set(collectionResults.map((entry) => this.castPrimaryKey(collection, primaryKeyField, entry.item))));
			if (keys.length === 0) continue;

			try {
				const itemsService = new ItemsService(collection, {
					knex: this.knex,
					schema: this.schema,
					accountability: this.accountability,
				});

				const query: Query = {
					fields: [primaryKeyField],
					filter: {
						[primaryKeyField]: {
							_in: keys,
						},
					},
					limit: keys.length,
				};

				const accessibleItems = await itemsService.readByQuery(query);
				allowedCollectionItems.set(
					collection,
					new Set(accessibleItems.map((item: Record<string, any>) => String(item[primaryKeyField])))
				);
			} catch (error: any) {
				if (error instanceof ForbiddenException) {
					continue;
				}

				throw error;
			}
		}

		return results
			.filter((result) => allowedCollectionItems.get(result.collection)?.has(String(result.item)) ?? false)
			.slice(0, limit);
	}

	private async deleteEmbeddings(collection: string, sourceItem: string, field?: string): Promise<void> {
		const query = this.knex(EMBEDDINGS_TABLE).where({
			source_collection: collection,
			source_item: sourceItem,
		});

		if (field && field !== '*') {
			query.andWhere({ source_field: field });
		}

		await query.delete();
	}

	private castPrimaryKey(collection: string, primaryKeyField: string, value: string): string | number {
		const primaryField = this.schema.collections[collection]?.fields[primaryKeyField];
		if (!primaryField) return value;

		const numericTypes = new Set(['integer', 'bigInteger', 'float', 'decimal']);
		if (!numericTypes.has(primaryField.type)) return value;

		const parsed = Number(value);
		if (Number.isNaN(parsed)) return value;
		return parsed;
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cosineDistance(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let index = 0; index < a.length; index++) {
		const valueA = a[index]!;
		const valueB = b[index]!;
		dot += valueA * valueB;
		normA += valueA * valueA;
		normB += valueB * valueB;
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	if (!Number.isFinite(denominator) || denominator <= 0) return 1;

	const similarity = dot / denominator;
	return 1 - similarity;
}

function euclideanDistance(a: number[], b: number[]): number {
	let sum = 0;

	for (let index = 0; index < a.length; index++) {
		const delta = a[index]! - b[index]!;
		sum += delta * delta;
	}

	return Math.sqrt(sum);
}

function interpolateTemplate(template: string, item: Record<string, any>): string {
	return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
		const normalizedKey = String(key).trim();
		if (!normalizedKey) return '';
		const value = getPathValue(item, normalizedKey);
		if (value === null || value === undefined) return '';
		if (typeof value === 'string') return value;
		if (typeof value === 'number' || typeof value === 'boolean') return String(value);
		return JSON.stringify(value);
	});
}

function getPathValue(input: Record<string, any>, path: string): unknown {
	const pathParts = path.split('.');
	let cursor: unknown = input;

	for (const part of pathParts) {
		if (typeof cursor !== 'object' || cursor === null) return undefined;
		cursor = (cursor as Record<string, unknown>)[part];
	}

	return cursor;
}
