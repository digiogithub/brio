import type { Knex } from 'knex';

const LEGACY_TABLE = 'directus_yaml_migrations';
const CURRENT_TABLE = 'brio_yaml_migrations';

export async function up(knex: Knex): Promise<void> {
    await renameTableIfNeeded(knex, LEGACY_TABLE, CURRENT_TABLE);
}

export async function down(knex: Knex): Promise<void> {
    await renameTableIfNeeded(knex, CURRENT_TABLE, LEGACY_TABLE);
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
        await knex.schema.renameTable(oldName, newName);
    }
}