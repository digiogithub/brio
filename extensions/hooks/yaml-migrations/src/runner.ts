import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

const MIGRATION_TABLE = 'brio_yaml_migrations';
const LEGACY_MIGRATION_TABLE = 'directus_yaml_migrations';
const SYSTEM_PREFIXES = ['directus_', 'brio_'] as const;

type MigrationRunReport = {
    filename: string;
    startedAt: string;
    finishedAt: string;
    dryRun: boolean;
    forceSchema: boolean;
    schema: {
        attempted: boolean;
        diffComputed: boolean;
        applied: boolean;
        error?: string;
    };
    data: {
        attempted: boolean;
        created: number;
        updated: number;
        errors: Array<{ collection: string; index: number; match?: Record<string, any>; message: string }>;
    };
};

function isInternalSystemCollection(name: string): boolean {
    return SYSTEM_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function normalizeSystemCollectionName(name: string | null | undefined): string | null | undefined {
    if (typeof name !== 'string') return name;
    if (name.startsWith('directus_')) {
        return `brio_${name.slice('directus_'.length)}`;
    }

    return name;
}

function filterSnapshotForNonInternalCollections(snapshot: any): any {
    if (!snapshot) return snapshot;

    const allowCollection = (c: string | null | undefined) => typeof c === 'string' && c.length > 0 && !isInternalSystemCollection(c);

    const allowedCollections = new Set<string>(
        (snapshot?.collections ?? [])
            .map((c: any) => c?.collection)
            .filter((c: any) => allowCollection(c)),
    );

    return {
        ...snapshot,
        collections: (snapshot?.collections ?? []).filter((c: any) => allowCollection(c?.collection)),
        fields: (snapshot?.fields ?? []).filter((f: any) => allowCollection(f?.collection)),
        systemFields: (snapshot?.systemFields ?? []).filter((f: any) => allowCollection(f?.collection)),
        relations: (snapshot?.relations ?? []).filter(
            (r: any) =>
                allowCollection(r?.collection) ||
                (typeof r?.related_collection === 'string' && allowedCollections.has(r.related_collection)),
        ),
    };
}

function mergeSnapshotsForPartialApply(currentSnapshot: any, targetSnapshot: any): any {
    if (!currentSnapshot || !targetSnapshot) return targetSnapshot;

    const touchedCollections = new Set<string>(
        (targetSnapshot?.collections ?? [])
            .map((c: any) => c?.collection)
            .filter((c: any) => typeof c === 'string' && c.length > 0),
    );
    if (touchedCollections.size === 0) return targetSnapshot;

    const currentCollections = Array.isArray(currentSnapshot?.collections) ? currentSnapshot.collections : [];
    const targetCollections = Array.isArray(targetSnapshot?.collections) ? targetSnapshot.collections : [];
    const targetCollectionsByName = new Map<string, any>();
    for (const c of targetCollections) {
        if (typeof c?.collection === 'string') targetCollectionsByName.set(c.collection, c);
    }

    const mergedCollections: any[] = [];
    const seen = new Set<string>();
    for (const c of currentCollections) {
        const name = c?.collection;
        if (typeof name !== 'string') continue;
        if (touchedCollections.has(name) && targetCollectionsByName.has(name)) {
            mergedCollections.push(targetCollectionsByName.get(name));
        } else {
            mergedCollections.push(c);
        }
        seen.add(name);
    }
    for (const c of targetCollections) {
        const name = c?.collection;
        if (typeof name !== 'string') continue;
        if (!seen.has(name)) mergedCollections.push(c);
    }

    const currentFields = Array.isArray(currentSnapshot?.fields) ? currentSnapshot.fields : [];
    const targetFields = Array.isArray(targetSnapshot?.fields) ? targetSnapshot.fields : [];
    const mergedFields = [
        ...currentFields.filter((f: any) => !touchedCollections.has(f?.collection)),
        ...targetFields.filter((f: any) => touchedCollections.has(f?.collection)),
    ];

    const currentSystemFields = Array.isArray(currentSnapshot?.systemFields) ? currentSnapshot.systemFields : [];
    const targetSystemFields = Array.isArray(targetSnapshot?.systemFields) ? targetSnapshot.systemFields : [];
    const mergedSystemFields = [
        ...currentSystemFields.filter((f: any) => !touchedCollections.has(f?.collection)),
        ...targetSystemFields.filter((f: any) => touchedCollections.has(f?.collection)),
    ];

    const isTouchedRelation = (r: any) =>
        touchedCollections.has(r?.collection) ||
        (typeof r?.related_collection === 'string' && touchedCollections.has(r.related_collection));

    const currentRelations = Array.isArray(currentSnapshot?.relations) ? currentSnapshot.relations : [];
    const targetRelations = Array.isArray(targetSnapshot?.relations) ? targetSnapshot.relations : [];
    const mergedRelations = [...currentRelations.filter((r: any) => !isTouchedRelation(r)), ...targetRelations.filter(isTouchedRelation)];

    return {
        ...currentSnapshot,
        collections: mergedCollections,
        fields: mergedFields,
        systemFields: mergedSystemFields,
        relations: mergedRelations,
    };
}

function resolveMigrationsDir(env: Record<string, any>): string {
    const configured = env.YAML_MIGRATIONS_DIR ?? env.DIRECTUS_YAML_MIGRATIONS_DIR ?? env.MIGRATIONS_DIR;
    if (typeof configured === 'string' && configured.trim()) {
        return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
    }
    return path.resolve(process.cwd(), 'migrations');
}

async function ensureMigrationsDirExists(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

async function ensureTrackingTable(database: any): Promise<void> {
    const hasLegacy = await database.schema.hasTable(LEGACY_MIGRATION_TABLE);
    const has = await database.schema.hasTable(MIGRATION_TABLE);

    if (hasLegacy && has) {
        throw new Error(
            `Cannot rename "${LEGACY_MIGRATION_TABLE}" to "${MIGRATION_TABLE}" because both tables exist. Resolve this state before rerunning yaml migrations.`
        );
    }

    if (hasLegacy) {
        await database.schema.renameTable(LEGACY_MIGRATION_TABLE, MIGRATION_TABLE);
    }

    if (!has) {
        await database.schema.createTable(MIGRATION_TABLE, (t: any) => {
            t.uuid('id').primary();
            t.string('filename', 255).notNullable().unique();
            t.string('checksum', 64).notNullable();
            t.string('status', 20).notNullable().defaultTo('applied');
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(database.fn.now());
            t.timestamp('applied_at', { useTz: true }).nullable();
            t.timestamp('last_run_at', { useTz: true }).nullable();
            t.text('error').nullable();
            t.text('report').nullable();
            t.integer('duration_ms').nullable();
        });
        return;
    }

    const hasLastRunAt = await database.schema.hasColumn(MIGRATION_TABLE, 'last_run_at');
    if (!hasLastRunAt) {
        await database.schema.alterTable(MIGRATION_TABLE, (t: any) => {
            t.timestamp('last_run_at', { useTz: true }).nullable();
        });
    }

    const hasReport = await database.schema.hasColumn(MIGRATION_TABLE, 'report');
    if (!hasReport) {
        await database.schema.alterTable(MIGRATION_TABLE, (t: any) => {
            t.text('report').nullable();
        });
    }
}

async function listYamlFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
        .filter((e) => e.isFile() && (e.name.endsWith('.yaml') || e.name.endsWith('.yml')))
        .map((e) => e.name)
        .sort();
}

function safeBasename(filename: string): string {
    const base = path.basename(filename);
    if (base !== filename) throw new Error('Invalid filename');
    if (!base.endsWith('.yaml') && !base.endsWith('.yml')) throw new Error('Invalid migration extension');
    if (base.includes('..')) throw new Error('Invalid filename');
    return base;
}

async function readMigrationFile(dir: string, filename: string): Promise<{ parsed: any; raw: string; checksum: string }> {
    const safe = safeBasename(filename);
    const full = path.join(dir, safe);
    const raw = await fs.readFile(full, 'utf8');
    const checksum = crypto.createHash('sha256').update(raw).digest('hex');
    const parsed = YAML.parse(raw) as any;
    return { parsed, raw, checksum };
}

async function readTracking(database: any): Promise<any[]> {
    try {
        return await database(MIGRATION_TABLE).select('*');
    } catch {
        return [];
    }
}

async function upsertTrackingRow(
    database: any,
    row: {
        filename: string;
        checksum: string;
        status: 'applied' | 'failed';
        applied_at: Date | null;
        last_run_at?: Date | null;
        error: string | null;
        report?: string | null;
        duration_ms: number | null;
    },
): Promise<void> {
    const id = crypto.randomUUID();
    const existing = await database(MIGRATION_TABLE).select(['id']).where({ filename: row.filename }).first();
    if (existing?.id) {
        await database(MIGRATION_TABLE)
            .where({ id: existing.id })
            .update({
                checksum: row.checksum,
                status: row.status,
                applied_at: row.applied_at,
                last_run_at: row.last_run_at ?? null,
                error: row.error,
                report: row.report ?? null,
                duration_ms: row.duration_ms,
            });
        return;
    }

    await database(MIGRATION_TABLE).insert({
        id,
        filename: row.filename,
        checksum: row.checksum,
        status: row.status,
        applied_at: row.applied_at,
        last_run_at: row.last_run_at ?? null,
        error: row.error,
        report: row.report ?? null,
        duration_ms: row.duration_ms,
    });
}

async function applyOne(context: any, filename: string, forceSchema: boolean): Promise<void> {
    const dir = resolveMigrationsDir(context.env);
    const { parsed, checksum } = await readMigrationFile(dir, filename);

    const startedAt = new Date();
    const started = startedAt.getTime();
    const report: MigrationRunReport = {
        filename,
        startedAt: startedAt.toISOString(),
        finishedAt: startedAt.toISOString(),
        dryRun: false,
        forceSchema,
        schema: {
            attempted: false,
            diffComputed: false,
            applied: false,
        },
        data: {
            attempted: false,
            created: 0,
            updated: 0,
            errors: [],
        },
    };

    try {
        if (parsed?.schema?.snapshot) {
            report.schema.attempted = true;
            try {
                const SchemaService = context.services?.SchemaService;
                if (!SchemaService) throw new Error('SchemaService not available');

                const schemaService = new SchemaService({ knex: context.database, accountability: { admin: true } as any });
                const rawCurrentSnapshot = await schemaService.snapshot();

                const currentSnapshot = filterSnapshotForNonInternalCollections(rawCurrentSnapshot);
                const targetSnapshot = filterSnapshotForNonInternalCollections(parsed.schema.snapshot);

                const targetSnapshotForDiff = mergeSnapshotsForPartialApply(currentSnapshot, targetSnapshot);

                const diff = await schemaService.diff(targetSnapshotForDiff, {
                    currentSnapshot,
                    force: forceSchema,
                });
                report.schema.diffComputed = Boolean(diff);
                if (diff) {
                    const payload = { hash: schemaService.getHashedSnapshot(rawCurrentSnapshot).hash, diff };
                    await schemaService.apply(payload);
                    report.schema.applied = true;
                }
            } catch (err: any) {
                report.schema.error = String(err?.message ?? err);
                context.logger?.warn?.('yaml-migrations: schema step failed, continuing with data', { filename, err });
            }
        }

        if (parsed?.data?.collections?.length) {
            report.data.attempted = true;
            const schema = await context.getSchema();
            const ItemsService = context.services?.ItemsService;
            if (!ItemsService) throw new Error('ItemsService not available');

            for (const col of parsed.data.collections) {
                const collection = normalizeSystemCollectionName(col?.collection);
                if (!collection) continue;
                const matchFields = Array.isArray(col.match) && col.match.length > 0 ? col.match : ['id'];
                const pk = schema?.collections?.[collection]?.primary;
                const itemsService = new ItemsService(collection, {
                    knex: context.database,
                    schema,
                    accountability: { admin: true } as any,
                });

                for (const [index, item] of (col.items ?? []).entries()) {
                    const where: Record<string, any> = {};
                    for (const f of matchFields) where[f] = item?.[f];
                    if (Object.values(where).some((v) => v === undefined)) {
                        report.data.errors.push({
                            collection,
                            index,
                            match: where,
                            message: `Missing match fields. Required=${matchFields.join(',')}`,
                        });
                        continue;
                    }

                    try {
                        const existing = await context.database(collection).select([pk ?? matchFields[0]!]).where(where).first();
                        if (existing) {
                            const key = pk ? existing[pk] : existing[matchFields[0]!];
                            await itemsService.updateOne(key, item);
                            report.data.updated++;
                        } else {
                            await itemsService.createOne(item);
                            report.data.created++;
                        }
                    } catch (err: any) {
                        report.data.errors.push({
                            collection,
                            index,
                            match: where,
                            message: String(err?.message ?? err),
                        });
                        context.logger?.warn?.('yaml-migrations: data item failed, continuing', { filename, collection, where, err });
                    }
                }
            }
        }

        const finishedAt = new Date();
        report.finishedAt = finishedAt.toISOString();

        const hasSchemaFatal = report.schema.attempted && Boolean(report.schema.error) && !report.data.attempted;
        if (hasSchemaFatal) {
            throw new Error(report.schema.error ?? 'Migration failed');
        }

        await upsertTrackingRow(context.database, {
            filename,
            checksum,
            status: 'applied',
            applied_at: new Date(),
            last_run_at: finishedAt,
            error: null,
            report: JSON.stringify(report),
            duration_ms: Date.now() - started,
        });
    } catch (err: any) {
        const finishedAt = new Date();
        report.finishedAt = finishedAt.toISOString();
        report.schema.error = report.schema.error ?? String(err?.message ?? err);
        await upsertTrackingRow(context.database, {
            filename,
            checksum,
            status: 'failed',
            applied_at: null,
            error: String(err?.stack ?? err?.message ?? err),
            last_run_at: finishedAt,
            report: JSON.stringify(report),
            duration_ms: Date.now() - started,
        });
        throw err;
    }
}

export async function applyPendingMigrations(context: any): Promise<void> {
    const includeFailed = context.env.YAML_MIGRATIONS_RETRY_FAILED === '1' || context.env.YAML_MIGRATIONS_RETRY_FAILED === 'true';
    const includeDrifted = context.env.YAML_MIGRATIONS_APPLY_DRIFTED === '1' || context.env.YAML_MIGRATIONS_APPLY_DRIFTED === 'true';
    const forceSchema = context.env.YAML_MIGRATIONS_FORCE_SCHEMA === '1' || context.env.YAML_MIGRATIONS_FORCE_SCHEMA === 'true';

    const dir = resolveMigrationsDir(context.env);
    await ensureMigrationsDirExists(dir);
    await ensureTrackingTable(context.database);
    context.logger?.info?.('yaml-migrations: checking migrations directory', { dir });

    const files = await listYamlFiles(dir);
    const rows = await readTracking(context.database);
    const byFilename = new Map(rows.map((r: any) => [r.filename, r]));

    for (const filename of files) {
        const row = byFilename.get(filename);
        if (row?.status === 'applied') {
            // Detect drift
            const { checksum } = await readMigrationFile(dir, filename);
            if (row.checksum === checksum) continue;
            if (!includeDrifted) {
                context.logger?.warn?.('yaml-migrations: drifted migration skipped (set YAML_MIGRATIONS_APPLY_DRIFTED=true)', { filename });
                continue;
            }
        }
        if (row?.status === 'failed' && !includeFailed) {
            context.logger?.warn?.('yaml-migrations: failed migration skipped (set YAML_MIGRATIONS_RETRY_FAILED=true)', { filename });
            continue;
        }

        try {
            await applyOne(context, filename, forceSchema);
        } catch (err: any) {
            context.logger?.error?.('yaml-migrations: migration failed, continuing', { filename, err });
        }
    }
}
