import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('brio_settings', (table) => {
		table.string('embeddings_provider').defaultTo(null).nullable();
		table.string('embeddings_model').defaultTo(null).nullable();
		table.string('embeddings_api_key').defaultTo(null).nullable();
		table.string('embeddings_base_url').defaultTo(null).nullable();
		table.integer('embeddings_dimensions').defaultTo(null).nullable();
		table.integer('embeddings_batch_size').defaultTo(100).notNullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('brio_settings', (table) => {
		table.dropColumn('embeddings_provider');
		table.dropColumn('embeddings_model');
		table.dropColumn('embeddings_api_key');
		table.dropColumn('embeddings_base_url');
		table.dropColumn('embeddings_dimensions');
		table.dropColumn('embeddings_batch_size');
	});
}
