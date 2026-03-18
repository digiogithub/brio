import type { Knex } from 'knex';

const updates = [
	{
		table: 'brio_fields',
		constraints: [
			{
				column: 'group',
				references: 'brio_fields.id',
			},
		],
	},
	{
		table: 'brio_files',
		constraints: [
			{
				column: 'folder',
				references: 'brio_folders.id',
			},
			{
				column: 'uploaded_by',
				references: 'brio_users.id',
			},
			{
				column: 'modified_by',
				references: 'brio_users.id',
			},
		],
	},
	{
		table: 'brio_folders',
		constraints: [
			{
				column: 'parent',
				references: 'brio_folders.id',
			},
		],
	},
	{
		table: 'brio_permissions',
		constraints: [
			{
				column: 'role',
				references: 'brio_roles.id',
			},
		],
	},
	{
		table: 'brio_presets',
		constraints: [
			{
				column: 'user',
				references: 'brio_users.id',
			},
			{
				column: 'role',
				references: 'brio_roles.id',
			},
		],
	},
	{
		table: 'brio_revisions',
		constraints: [
			{
				column: 'activity',
				references: 'brio_activity.id',
			},
			{
				column: 'parent',
				references: 'brio_revisions.id',
			},
		],
	},
	{
		table: 'brio_sessions',
		constraints: [
			{
				column: 'user',
				references: 'brio_users.id',
			},
		],
	},
	{
		table: 'brio_settings',
		constraints: [
			{
				column: 'project_logo',
				references: 'brio_files.id',
			},
			{
				column: 'public_foreground',
				references: 'brio_files.id',
			},
			{
				column: 'public_background',
				references: 'brio_files.id',
			},
		],
	},
	{
		table: 'brio_users',
		constraints: [
			{
				column: 'role',
				references: 'brio_roles.id',
			},
		],
	},
];

/**
 * NOTE:
 * Not all databases allow (or support) recursive onUpdate/onDelete triggers. MS SQL / Oracle flat out deny creating them,
 * Postgres behaves erratic on those triggers, not sure if MySQL / Maria plays nice either.
 */

export async function up(knex: Knex): Promise<void> {
	for (const update of updates) {
		await knex.schema.alterTable(update.table, (table) => {
			for (const constraint of update.constraints) {
				table.dropForeign([constraint.column]);
				table.foreign(constraint.column).references(constraint.references);
			}
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	for (const update of updates) {
		await knex.schema.alterTable(update.table, (table) => {
			for (const constraint of update.constraints) {
				table.dropForeign([constraint.column]);
			}
		});
	}
}
