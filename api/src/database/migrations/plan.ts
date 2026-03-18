import formatTitle from '@directus/format-title';
import fse from 'fs-extra';
import type { Knex } from 'knex';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'path';
import env from '../../env.js';
import type { Migration } from '../../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_MIGRATIONS_TABLE = 'brio_migrations';
export const LEGACY_MIGRATIONS_TABLE = 'directus_migrations';

export type SQLiteExtensionRequirement = 'spatialite' | 'sqlite-vec';

export type MigrationRequirements = {
    sqliteExtensions?: SQLiteExtensionRequirement[];
};

type MigrationModule = {
    up?: (database: Knex) => Promise<void>;
    down?: (database: Knex) => Promise<void>;
    requirements?: MigrationRequirements;
};

type DiscoveredMigration = {
    file: string;
    version: string;
    name: string;
    completed: boolean;
    module: MigrationModule;
    required: boolean;
    skipReason?: string;
};

type SQLiteExtensionAvailability = Record<SQLiteExtensionRequirement, boolean>;

type CapabilityCache = {
    sqliteExtensions?: SQLiteExtensionAvailability;
};

export async function resolveMigrationsTable(database: Knex): Promise<string | null> {
    if (await database.schema.hasTable(DEFAULT_MIGRATIONS_TABLE)) {
        return DEFAULT_MIGRATIONS_TABLE;
    }

    if (await database.schema.hasTable(LEGACY_MIGRATIONS_TABLE)) {
        return LEGACY_MIGRATIONS_TABLE;
    }

    return null;
}

export async function getCompletedMigrations(
    database: Knex,
    migrationsTable?: string | null
): Promise<Migration[]> {
    const resolvedTable = migrationsTable ?? (await resolveMigrationsTable(database));

    if (!resolvedTable) {
        return [];
    }

    if ((await database.schema.hasTable(resolvedTable)) === false) {
        return [];
    }

    return await database.select<Migration[]>('*').from(resolvedTable).orderBy('version');
}

export async function buildMigrationPlan(
    database: Knex,
    completedVersions: Iterable<string> = []
): Promise<DiscoveredMigration[]> {
    const completedVersionSet = new Set(completedVersions);
    const migrationFiles = await resolveMigrationFiles();
    const capabilityCache: CapabilityCache = {};

    const migrations = await Promise.all(
        migrationFiles.map(async ({ file, version, name }) => {
            const module = (await import(`file://${file}`)) as MigrationModule;
            const completed = completedVersionSet.has(version);
            const requirementStatus = completed
                ? { required: true as const, skipReason: undefined }
                : await evaluateMigrationRequirements(database, module.requirements, capabilityCache);

            return {
                file,
                version,
                name,
                completed,
                module,
                required: requirementStatus.required,
                skipReason: requirementStatus.skipReason,
            };
        })
    );

    return migrations.sort((a, b) => (a.version > b.version ? 1 : -1));
}

export async function evaluateMigrationRequirements(
    database: Knex,
    requirements?: MigrationRequirements,
    capabilityCache: CapabilityCache = {}
): Promise<{ required: boolean; skipReason?: string }> {
    if (!requirements?.sqliteExtensions || requirements.sqliteExtensions.length === 0) {
        return { required: true };
    }

    if (getDatabaseClientName(database) !== 'sqlite') {
        return { required: true };
    }

    const availability = await getSQLiteExtensionAvailability(database, capabilityCache);
    const missingExtensions = requirements.sqliteExtensions.filter((extension) => availability[extension] === false);

    if (missingExtensions.length === 0) {
        return { required: true };
    }

    return {
        required: false,
        skipReason: `requires SQLite extensions that are not available: ${missingExtensions.join(', ')}`,
    };
}

async function resolveMigrationFiles(): Promise<Array<{ file: string; version: string; name: string }>> {
    let migrationFiles = await fse.readdir(__dirname);

    const customMigrationsPath = path.resolve(env['EXTENSIONS_PATH'], 'migrations');

    let customMigrationFiles =
        ((await fse.pathExists(customMigrationsPath)) && (await fse.readdir(customMigrationsPath))) || [];

    migrationFiles = migrationFiles.filter((file: string) => /^[0-9]+[A-Z]-[^.]+\.(?:js|ts)$/.test(file));
    customMigrationFiles = customMigrationFiles.filter((file: string) => file.endsWith('.js'));

    return [
        ...migrationFiles.map((filePath) => toMigrationFile(path.join(__dirname, filePath), filePath)),
        ...customMigrationFiles.map((filePath) => toMigrationFile(path.join(customMigrationsPath, filePath), filePath)),
    ];
}

function toMigrationFile(file: string, filePath: string) {
    const version = filePath.split('-')[0]!;
    const name = formatTitle(filePath.split('-').slice(1).join('_').split('.')[0]!);

    return {
        file,
        version,
        name,
    };
}

async function getSQLiteExtensionAvailability(
    database: Knex,
    cache: CapabilityCache
): Promise<SQLiteExtensionAvailability> {
    if (cache.sqliteExtensions) {
        return cache.sqliteExtensions;
    }

    cache.sqliteExtensions = {
        spatialite: await hasSQLiteFunction(database, 'spatialite_version'),
        'sqlite-vec': await hasSQLiteFunction(database, 'vec_version'),
    };

    return cache.sqliteExtensions;
}

async function hasSQLiteFunction(database: Knex, functionName: string): Promise<boolean> {
    try {
        const rows = await database.select('name').from('pragma_function_list').where({ name: functionName });
        return rows.length > 0;
    } catch {
        return false;
    }
}

function getDatabaseClientName(database: Knex): string {
    switch (database.client.constructor.name) {
        case 'Client_SQLite3':
            return 'sqlite';
        case 'Client_PG':
            return 'postgres';
        case 'Client_CockroachDB':
            return 'cockroachdb';
        case 'Client_MySQL':
            return 'mysql';
        case 'Client_Oracledb':
        case 'Client_Oracle':
            return 'oracle';
        case 'Client_MSSQL':
            return 'mssql';
        case 'Client_Redshift':
            return 'redshift';
        default:
            return String(database.client.constructor.name);
    }
}