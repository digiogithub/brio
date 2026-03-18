import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('brio_embeddings', (table) => {
		table.uuid('id').primary().notNullable();
		table.string('source_collection').notNullable();
		table.string('source_item').notNullable();
		table.string('source_field').notNullable();
		table.integer('chunk_index').notNullable().defaultTo(0);
		table.text('chunk_text').nullable();
		table.string('chunk_hash').nullable();
		table.string('embedding_model').nullable();
		table.string('embedding_provider').nullable();
		table.integer('dimensions').nullable();
		table.string('status').notNullable().defaultTo('pending');
		table.text('error_message').nullable();
		table.integer('token_count').nullable();
		table.text('metadata').notNullable().defaultTo('{}');
		table.timestamp('date_created').defaultTo(knex.fn.now());
		table.timestamp('date_updated').defaultTo(knex.fn.now());

		table.unique(
			['source_collection', 'source_item', 'source_field', 'chunk_index'],
			'brio_embeddings_source_chunk_unique'
		);
		table.index(['source_collection'], 'brio_embeddings_source_collection_idx');
		table.index(['status'], 'brio_embeddings_status_idx');
		table.index(['embedding_model'], 'brio_embeddings_model_idx');
	});

	await knex.schema.createTable('brio_embeddings_queue', (table) => {
		table.uuid('id').primary().notNullable();
		table.string('action').notNullable();
		table.string('source_collection').notNullable();
		table.string('source_item').notNullable();
		table.string('source_field').notNullable();
		table.integer('priority').notNullable().defaultTo(0);
		table.string('status').notNullable().defaultTo('pending');
		table.integer('attempts').notNullable().defaultTo(0);
		table.integer('max_attempts').notNullable().defaultTo(3);
		table.text('error_message').nullable();
		table.timestamp('scheduled_at').defaultTo(knex.fn.now());
		table.timestamp('started_at').nullable();
		table.timestamp('completed_at').nullable();
		table.timestamp('date_created').defaultTo(knex.fn.now());

		table.index(['status', 'priority', 'scheduled_at'], 'brio_embeddings_queue_polling_idx');
		table.index(
			['source_collection', 'source_item', 'source_field'],
			'brio_embeddings_queue_source_lookup_idx'
		);
	});

	await knex.schema.createTable('brio_embeddings_config', (table) => {
		table.uuid('id').primary().notNullable();
		table.string('collection').notNullable();
		table.string('field').notNullable();
		table.boolean('enabled').notNullable().defaultTo(true);
		table.string('chunk_strategy').notNullable().defaultTo('auto');
		table.integer('chunk_size').notNullable().defaultTo(512);
		table.integer('chunk_overlap').notNullable().defaultTo(50);
		table.text('template').nullable();
		table.text('metadata_fields').nullable();
		table.timestamp('date_created').defaultTo(knex.fn.now());
		table.timestamp('date_updated').defaultTo(knex.fn.now());

		table.unique(['collection', 'field'], 'brio_embeddings_config_collection_field_unique');
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('brio_embeddings_config');
	await knex.schema.dropTable('brio_embeddings_queue');
	await knex.schema.dropTable('brio_embeddings');
}
