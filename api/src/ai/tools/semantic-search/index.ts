import { z } from 'zod';
import { ForbiddenException } from '../../../exceptions/index.js';
import { EmbeddingsService } from '../../../services/embeddings.js';
import { defineTool } from '../define-tool.js';

const SemanticSearchValidateSchema = z.strictObject({
	query: z.string().min(1),
	collection: z.string().optional(),
	field: z.string().optional(),
	limit: z.number().int().min(1).max(50).optional(),
	distance_metric: z.enum(['cosine', 'l2']).optional(),
});

const SemanticSearchInputSchema = z.object({
	query: z.string().describe('Natural-language semantic query text'),
	collection: z.string().optional().describe('Optional collection filter'),
	field: z.string().optional().describe('Optional field filter'),
	limit: z.number().int().min(1).max(50).optional().describe('Maximum number of matches (default: 10, max: 50)'),
	distance_metric: z
		.enum(['cosine', 'l2'])
		.optional()
		.describe('Distance metric to use when ranking similarities (default: cosine)'),
});

export const semanticSearch = defineTool<z.infer<typeof SemanticSearchValidateSchema>>({
	name: 'semantic-search',
	description: 'Search embedded content by semantic similarity and return accessible matching chunks.',
	annotations: {
		title: 'Brio - Semantic Search',
	},
	inputSchema: SemanticSearchInputSchema,
	validateSchema: SemanticSearchValidateSchema,
	async handler({ args, schema, accountability }) {
		if (!accountability?.user && !accountability?.role && accountability?.admin !== true) {
			throw new ForbiddenException();
		}

		const service = new EmbeddingsService({
			accountability,
			schema,
		});

		const input = { query: args.query } as {
			query: string;
			collection?: string;
			field?: string;
			limit?: number;
			distanceMetric?: 'cosine' | 'l2';
		};
		if (args.collection !== undefined) input.collection = args.collection;
		if (args.field !== undefined) input.field = args.field;
		if (args.limit !== undefined) input.limit = args.limit;
		if (args.distance_metric !== undefined) input.distanceMetric = args.distance_metric;

		const data = await service.semanticSearch(input);

		return { type: 'text', data };
	},
});
