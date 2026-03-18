import type { Knex } from 'knex';
import { getHelpers } from '../helpers/index.js';

export async function up(knex: Knex): Promise<void> {
	const helper = getHelpers(knex).schema;
	const type = helper.isOneOfClients(['oracle', 'cockroachdb']) ? 'text' : 'string';
	await helper.changeToType('brio_webhooks', 'collections', type);
}

export async function down(knex: Knex): Promise<void> {
	await getHelpers(knex).schema.changeToType('brio_webhooks', 'collections', 'string', {
		nullable: false,
		length: 255,
	});
}
