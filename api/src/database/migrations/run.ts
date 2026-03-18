import type { Knex } from 'knex';
import { orderBy } from 'lodash-es';
import { flushCaches } from '../../cache.js';
import logger from '../../logger.js';
import type { Migration } from '../../types/index.js';
import {
	buildMigrationPlan,
	DEFAULT_MIGRATIONS_TABLE,
	getCompletedMigrations as getStoredMigrations,
	resolveMigrationsTable,
} from './plan.js';

export default async function run(database: Knex, direction: 'up' | 'down' | 'latest', log = true): Promise<void> {
	const initialMigrationsTable = (await getMigrationsTable()) ?? DEFAULT_MIGRATIONS_TABLE;
	const completedMigrations = await getCompletedMigrations(initialMigrationsTable);
	const completedVersions = completedMigrations.map((migration) => migration.version);
	const migrations = await buildMigrationPlan(database, completedVersions);
	const runnableMigrations = migrations.filter((migration) => migration.required || migration.completed);

	if (log) {
		for (const migration of migrations) {
			if (migration.completed || migration.required) continue;
			logger.info(`Skipping ${migration.name}: ${migration.skipReason}`);
		}
	}

	const migrationKeys = new Set(runnableMigrations.map((m) => m.version));

	if (runnableMigrations.length > migrationKeys.size) {
		throw new Error('Migration keys collide! Please ensure that every migration uses a unique key.');
	}

	if (direction === 'up') await up();
	if (direction === 'down') await down();
	if (direction === 'latest') await latest();

	async function getMigrationsTable(): Promise<string | null> {
		return await resolveMigrationsTable(database);
	}

	async function getCompletedMigrations(migrationsTable: string): Promise<Migration[]> {
		return await getCompletedMigrationsFromTable(migrationsTable);
	}

	async function getCompletedMigrationsFromTable(migrationsTable: string): Promise<Migration[]> {
		return await getStoredMigrations(database, migrationsTable);
	}

	async function insertMigration(version: string, name: string): Promise<void> {
		const migrationsTable = (await getMigrationsTable()) ?? DEFAULT_MIGRATIONS_TABLE;
		await database.insert({ version, name }).into(migrationsTable);
	}

	async function deleteMigration(version: string): Promise<void> {
		const migrationsTable = (await getMigrationsTable()) ?? DEFAULT_MIGRATIONS_TABLE;
		await database(migrationsTable).delete().where({ version });
	}

	function getMigrationVersion(version: string | undefined): string {
		if (!version) {
			throw new Error('Migration version is missing');
		}

		return version;
	}

	async function up() {
		const currentVersion = completedMigrations[completedMigrations.length - 1];

		let nextVersion: any;

		if (!currentVersion) {
			nextVersion = runnableMigrations[0];
		} else {
			nextVersion = runnableMigrations.find((migration) => {
				return migration.version! > currentVersion.version && migration.completed === false;
			});
		}

		if (!nextVersion) {
			throw Error('Nothing to upgrade');
		}

		const { up } = nextVersion.module;

		if (log) {
			logger.info(`Applying ${nextVersion.name}...`);
		}

		if (!up) {
			throw new Error(`Migration ${nextVersion.name} is missing an up() export`);
		}

		await up(database);
		await insertMigration(nextVersion.version, nextVersion.name);

		await flushCaches(true);
	}

	async function down() {
		const lastAppliedMigration = orderBy(completedMigrations, ['timestamp', 'version'], ['desc', 'desc'])[0];

		if (!lastAppliedMigration) {
			throw Error('Nothing to downgrade');
		}

		const migration = migrations.find((migration) => migration.version === lastAppliedMigration.version);

		if (!migration) {
			throw new Error("Couldn't find migration");
		}

		const { down } = migration.module;

		if (log) {
			logger.info(`Undoing ${migration.name}...`);
		}

		if (!down) {
			throw new Error(`Migration ${migration.name} is missing a down() export`);
		}

		await down(database);
		await deleteMigration(getMigrationVersion(migration.version));

		await flushCaches(true);
	}

	async function latest() {
		let needsCacheFlush = false;

		for (const migration of runnableMigrations) {
			if (migration.completed === false) {
				needsCacheFlush = true;
				const { up } = migration.module;

				if (log) {
					logger.info(`Applying ${migration.name}...`);
				}

				if (!up) {
					throw new Error(`Migration ${migration.name} is missing an up() export`);
				}

				await up(database);
				await insertMigration(getMigrationVersion(migration.version), migration.name);
			}
		}

		if (needsCacheFlush) {
			await flushCaches(true);
		}
	}
}
