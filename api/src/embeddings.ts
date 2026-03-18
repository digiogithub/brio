import type { ActionHandler } from '@brio/types';
import getDatabase from './database/index.js';
import emitter from './emitter.js';
import env from './env.js';
import logger from './logger.js';
import { EmbeddingsService } from './services/embeddings.js';
import type { PrimaryKey } from './types/index.js';
import { getSchema } from './utils/get-schema.js';

const POLL_INTERVAL_MS = 2000;

let registered = false;
let queueInterval: NodeJS.Timeout | null = null;
let queueRunning = false;

let handlers: Array<{ event: string; handler: ActionHandler }> = [];

const onCreate: ActionHandler = async (meta, context) => {
	if (!env['EMBEDDINGS_ENABLED']) return;
	if (!meta['collection']) return;

	const collection = String(meta['collection']);
	const key = meta['key'];
	if (!isPrimaryKey(key)) return;

	const schema = context['schema'] ?? (await getSchema({ database: context['database'] }));
	const service = new EmbeddingsService({
		knex: context['database'],
		schema,
	});

	await service.enqueueForItem(collection, key, 'update');
	void processQueue();
};

const onUpdate: ActionHandler = async (meta, context) => {
	if (!env['EMBEDDINGS_ENABLED']) return;
	if (!meta['collection']) return;

	const collection = String(meta['collection']);
	const keys = normalizeKeys(meta['keys']);
	if (keys.length === 0) return;

	const schema = context['schema'] ?? (await getSchema({ database: context['database'] }));
	const service = new EmbeddingsService({
		knex: context['database'],
		schema,
	});

	for (const key of keys) {
		await service.enqueueForItem(collection, key, 'update');
	}

	void processQueue();
};

const onDelete: ActionHandler = async (meta, context) => {
	if (!env['EMBEDDINGS_ENABLED']) return;
	if (!meta['collection']) return;

	const collection = String(meta['collection']);
	const keys = normalizeKeys(meta['keys']);
	if (keys.length === 0) return;

	const schema = context['schema'] ?? (await getSchema({ database: context['database'] }));
	const service = new EmbeddingsService({
		knex: context['database'],
		schema,
	});

	for (const key of keys) {
		await service.enqueueForItem(collection, key, 'delete');
	}

	void processQueue();
};

const onServerStart: ActionHandler = async () => {
	startQueueProcessor();
	void processQueue();
};

const onServerStop: ActionHandler = async () => {
	stopQueueProcessor();
};

export async function init(): Promise<void> {
	if (registered) return;

	if (!env['EMBEDDINGS_ENABLED']) {
		logger.info('Embeddings are disabled');
		return;
	}

	register('items.create', onCreate);
	register('items.update', onUpdate);
	register('items.delete', onDelete);
	register('server.start', onServerStart);
	register('server.stop', onServerStop);

	startQueueProcessor();
	registered = true;
}

export function unregister(): void {
	for (const { event, handler } of handlers) {
		emitter.offAction(event, handler);
	}

	handlers = [];
	stopQueueProcessor();
	registered = false;
}

function register(event: string, handler: ActionHandler): void {
	emitter.onAction(event, handler);
	handlers.push({ event, handler });
}

function startQueueProcessor(): void {
	if (queueInterval) return;

	queueInterval = setInterval(() => {
		void processQueue();
	}, POLL_INTERVAL_MS);
}

function stopQueueProcessor(): void {
	if (!queueInterval) return;
	clearInterval(queueInterval);
	queueInterval = null;
}

async function processQueue(): Promise<void> {
	if (queueRunning || !env['EMBEDDINGS_ENABLED']) return;

	queueRunning = true;

	try {
		const database = getDatabase();
		const schema = await getSchema({ database });
		const service = new EmbeddingsService({ knex: database, schema });
		await service.processQueue(50);
	} catch (error: any) {
		logger.warn(`Embeddings queue processor error: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		queueRunning = false;
	}
}

function normalizeKeys(keys: unknown): PrimaryKey[] {
	if (!Array.isArray(keys)) return [];
	return keys.filter((key): key is PrimaryKey => isPrimaryKey(key));
}

function isPrimaryKey(value: unknown): value is PrimaryKey {
	return typeof value === 'string' || typeof value === 'number';
}
