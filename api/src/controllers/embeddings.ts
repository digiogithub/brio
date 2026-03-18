import { Router } from 'express';
import { ForbiddenException } from '../exceptions/index.js';
import { respond } from '../middleware/respond.js';
import { EmbeddingsService } from '../services/embeddings.js';
import asyncHandler from '../utils/async-handler.js';

const router = Router();

router.post(
	'/search',
	asyncHandler(async (req, res, next) => {
		const service = new EmbeddingsService({
			accountability: req.accountability,
			schema: req.schema,
		});

		const data = await service.semanticSearch({
			query: req.body?.query,
			collection: req.body?.collection,
			field: req.body?.field,
			limit: req.body?.limit,
			distanceMetric: req.body?.distance_metric,
		});

		res.locals['payload'] = { data };
		return next();
	}),
	respond
);

router.get(
	'/config',
	asyncHandler(async (req, res, next) => {
		requireAdmin(req.accountability?.admin === true);

		const service = new EmbeddingsService({
			accountability: req.accountability,
			schema: req.schema,
		});

		const data = await service.getConfigs(typeof req.query['collection'] === 'string' ? req.query['collection'] : undefined);

		res.locals['payload'] = { data };
		return next();
	}),
	respond
);

router.get(
	'/status',
	asyncHandler(async (req, res, next) => {
		requireAdmin(req.accountability?.admin === true);

		const service = new EmbeddingsService({
			accountability: req.accountability,
			schema: req.schema,
		});

		const data = await service.getStatus();
		res.locals['payload'] = { data };
		return next();
	}),
	respond
);

router.get(
	'/stats',
	asyncHandler(async (req, res, next) => {
		requireAdmin(req.accountability?.admin === true);

		const service = new EmbeddingsService({
			accountability: req.accountability,
			schema: req.schema,
		});

		const data = await service.getStats();
		res.locals['payload'] = { data };
		return next();
	}),
	respond
);

router.post(
	'/test-connection',
	asyncHandler(async (req, res, next) => {
		requireAdmin(req.accountability?.admin === true);

		const service = new EmbeddingsService({
			accountability: req.accountability,
			schema: req.schema,
		});

		const data = await service.testConnection();
		res.locals['payload'] = { data };
		return next();
	}),
	respond
);

function requireAdmin(isAdmin: boolean): void {
	if (!isAdmin) {
		throw new ForbiddenException();
	}
}

export default router;
