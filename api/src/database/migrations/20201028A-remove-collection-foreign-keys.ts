import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('brio_fields', (table) => {
		table.dropForeign(['collection']);
	});

	await knex.schema.alterTable('brio_activity', (table) => {
		table.dropForeign(['collection']);
	});

	await knex.schema.alterTable('brio_permissions', (table) => {
		table.dropForeign(['collection']);
	});

	await knex.schema.alterTable('brio_presets', (table) => {
		table.dropForeign(['collection']);
	});

	await knex.schema.alterTable('brio_relations', (table) => {
		table.dropForeign(['one_collection']);
		table.dropForeign(['many_collection']);
	});

	await knex.schema.alterTable('brio_revisions', (table) => {
		table.dropForeign(['collection']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('brio_fields', (table) => {
		table.foreign('collection').references('brio_collections.collection');
	});

	await knex.schema.alterTable('brio_activity', (table) => {
		table.foreign('collection').references('brio_collections.collection');
	});

	await knex.schema.alterTable('brio_permissions', (table) => {
		table.foreign('collection').references('brio_collections.collection');
	});

	await knex.schema.alterTable('brio_presets', (table) => {
		table.foreign('collection').references('brio_collections.collection');
	});

	await knex.schema.alterTable('brio_relations', (table) => {
		table.foreign('one_collection').references('brio_collections.collection');
		table.foreign('many_collection').references('brio_collections.collection');
	});

	await knex.schema.alterTable('brio_revisions', (table) => {
		table.foreign('collection').references('brio_collections.collection');
	});
}
