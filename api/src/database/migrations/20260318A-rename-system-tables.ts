import type { Knex } from 'knex';

const SYSTEM_TABLE_RENAMES = [
	['directus_activity', 'brio_activity'],
	['directus_collections', 'brio_collections'],
	['directus_dashboards', 'brio_dashboards'],
	['directus_fields', 'brio_fields'],
	['directus_files', 'brio_files'],
	['directus_flows', 'brio_flows'],
	['directus_folders', 'brio_folders'],
	['directus_notifications', 'brio_notifications'],
	['directus_operations', 'brio_operations'],
	['directus_panels', 'brio_panels'],
	['directus_permissions', 'brio_permissions'],
	['directus_presets', 'brio_presets'],
	['directus_relations', 'brio_relations'],
	['directus_revisions', 'brio_revisions'],
	['directus_roles', 'brio_roles'],
	['directus_sessions', 'brio_sessions'],
	['directus_settings', 'brio_settings'],
	['directus_shares', 'brio_shares'],
	['directus_users', 'brio_users'],
	['directus_webhooks', 'brio_webhooks'],
] as const;

const MIGRATIONS_TABLE_RENAME = ['directus_migrations', 'brio_migrations'] as const;

export async function up(knex: Knex): Promise<void> {
	if ((await knex.schema.hasTable('directus_collections')) === false) {
		return;
	}

	for (const tableRename of SYSTEM_TABLE_RENAMES) {
		await renameTableIfNeeded(knex, tableRename[0], tableRename[1]);
	}

	await renameTableIfNeeded(knex, MIGRATIONS_TABLE_RENAME[0], MIGRATIONS_TABLE_RENAME[1]);
	await updateSystemCollectionReferences(knex, 'directus_', 'brio_');
}

export async function down(knex: Knex): Promise<void> {
	if ((await knex.schema.hasTable('brio_collections')) === false) {
		return;
	}

	await updateSystemCollectionReferences(knex, 'brio_', 'directus_');

	for (const [oldName, newName] of SYSTEM_TABLE_RENAMES) {
		await renameTableIfNeeded(knex, newName, oldName);
	}

	await renameTableIfNeeded(knex, MIGRATIONS_TABLE_RENAME[1], MIGRATIONS_TABLE_RENAME[0]);
}

async function renameTableIfNeeded(knex: Knex, oldName: string, newName: string): Promise<void> {
	const hasOldTable = await knex.schema.hasTable(oldName);
	const hasNewTable = await knex.schema.hasTable(newName);

	if (hasOldTable && hasNewTable) {
		throw new Error(
			`Cannot rename "${oldName}" to "${newName}" because both tables exist. Resolve this state before rerunning migration.`
		);
	}

	if (hasOldTable) {
		// TODO: If a database dialect blocks this due to FK dependencies, add dialect-specific FK drop/recreate handling.
		await knex.schema.renameTable(oldName, newName);
	}
}

async function updateSystemCollectionReferences(knex: Knex, fromPrefix: string, toPrefix: string): Promise<void> {
	const updates: Array<{ table: string; column: string }> = [
		{ table: 'brio_relations', column: 'many_collection' },
		{ table: 'brio_relations', column: 'one_collection' },
		{ table: 'brio_collections', column: 'collection' },
		{ table: 'brio_fields', column: 'collection' },
		{ table: 'brio_permissions', column: 'collection' },
		{ table: 'brio_presets', column: 'collection' },
		{ table: 'brio_activity', column: 'collection' },
		{ table: 'brio_revisions', column: 'collection' },
	];

	for (const { table, column } of updates) {
		if ((await knex.schema.hasTable(table)) === false) continue;

		await knex(table)
			.where(column, 'like', `${fromPrefix}%`)
			.update({
				[column]: knex.raw(`REPLACE(??, ?, ?)`, [column, fromPrefix, toPrefix]),
			});
	}
}
