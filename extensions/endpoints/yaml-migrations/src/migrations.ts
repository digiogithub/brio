import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

const SYSTEM_PREFIXES = ['directus_', 'brio_'] as const;

const SYSTEM_PRESET_COLLECTIONS: Record<string, string[]> = {
    // Core access control (Brio 9 does not have directus_policies)
    roles: ['brio_roles'],
    permissions: ['brio_permissions'],
    // Automations
    flows: ['brio_flows', 'brio_operations'],
    // Dashboards
    panels: ['brio_dashboards', 'brio_panels'],
};

const SYSTEM_COLLECTION_ORDER: string[] = [
    'brio_settings',
    'brio_roles',
    'brio_permissions',
    'brio_flows',
    'brio_operations',
    'brio_dashboards',
    'brio_panels',
];

export const MIGRATION_TABLE = 'brio_yaml_migrations';
export const LEGACY_MIGRATION_TABLE = 'directus_yaml_migrations';

type MigrationRunReport = {
    filename: string;
    startedAt: string;
    finishedAt: string;
    dryRun: boolean;
    forceSchema: boolean;
    schema: {
        attempted: boolean;
        skippedReason?: string;
        diffComputed: boolean;
        applied: boolean;
        error?: string;
        diffSummary?: Record<string, any>;
    };
    data: {
        attempted: boolean;
        created: number;
        updated: number;
        collections: Array<{
            collection: string;
            created: number;
            updated: number;
            failed: number;
            errors: Array<{ index: number; match?: Record<string, any>; message: string }>;
        }>;
    };
};

export type YamlMigrationDataCollection = {
    collection: string;
    /**
     * Fields to match existing rows. Defaults to ['id'] if present.
     */
    match?: string[];
    items: Record<string, any>[];
};

export type YamlMigrationFile = {
    kind: 'directus-yaml-migration';
    version: 1;
    name: string;
    createdAt: string;
    schema?: {
        snapshot: Record<string, any>;
    };
    data?: {
        collections: YamlMigrationDataCollection[];
    };
};

export type MigrationDbRow = {
    id: string;
    filename: string;
    checksum: string;
    status: 'applied' | 'failed';
    created_at: string;
    applied_at: string | null;
    last_run_at?: string | null;
    error: string | null;
    report?: string | null;
    duration_ms: number | null;
};

export type ListedMigration = {
    filename: string;
    checksum: string;
    createdAtFromFilename: string | null;
    nameFromFilename: string;
    status: 'pending' | 'applied' | 'failed' | 'drifted';
    appliedAt: string | null;
    error: string | null;
    lastRunAt?: string | null;
    report?: string | null;
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

    const { systemFields: _systemFields, ...compatibleSnapshot } = snapshot;
    return {
        ...compatibleSnapshot,
        collections: (snapshot?.collections ?? []).filter((c: any) => allowCollection(c?.collection)),
        fields: (snapshot?.fields ?? []).filter((f: any) => allowCollection(f?.collection)),
        relations: (snapshot?.relations ?? []).filter(
            (r: any) =>
                allowCollection(r?.collection) ||
                (typeof r?.related_collection === 'string' && allowedCollections.has(r.related_collection)),
        ),
    };
}

function summarizeDiff(diff: any): Record<string, any> {
    if (!diff || typeof diff !== 'object') return { hasDiff: false };
    const summary: Record<string, any> = { hasDiff: true };
    for (const [k, v] of Object.entries(diff)) {
        if (Array.isArray(v)) summary[k] = { count: v.length };
        else if (v && typeof v === 'object') summary[k] = { keys: Object.keys(v as any).length };
        else summary[k] = { value: typeof v };
    }
    return summary;
}

function toTimestampPrefix(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        String(date.getFullYear()) +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        pad(date.getHours()) +
        pad(date.getMinutes())
    );
}

function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 80);
}

function safeBasename(filename: string): string {
    const base = path.basename(filename);
    if (base !== filename) throw new Error('Invalid filename');
    if (!base.endsWith('.yaml') && !base.endsWith('.yml')) throw new Error('Invalid migration extension');
    if (base.includes('..')) throw new Error('Invalid filename');
    return base;
}

export async function uploadMigrationRawFile(options: {
    env: Record<string, any>;
    filename: string;
    raw: string;
    overwrite?: boolean;
}): Promise<{ filename: string; checksum: string }> {
    const dir = resolveMigrationsDir(options.env);
    await ensureMigrationsDirExists(dir);

    const safe = safeBasename(options.filename);
    const full = path.join(dir, safe);

    const raw = typeof options.raw === 'string' ? options.raw : '';
    if (!raw.trim()) throw new Error('Empty file');

    const maxBytesEnv = options.env.YAML_MIGRATIONS_MAX_UPLOAD_BYTES;
    const maxBytes = typeof maxBytesEnv === 'number'
        ? maxBytesEnv
        : typeof maxBytesEnv === 'string' && maxBytesEnv.trim()
            ? Number(maxBytesEnv)
            : 5 * 1024 * 1024;

    const size = Buffer.byteLength(raw, 'utf8');
    if (Number.isFinite(maxBytes) && maxBytes > 0 && size > maxBytes) {
        throw new Error(`File too large (${size} bytes). Max allowed is ${maxBytes} bytes.`);
    }

    let parsed: any;
    try {
        parsed = YAML.parse(raw);
    } catch (err: any) {
        throw new Error(`Invalid YAML: ${String(err?.message ?? err)}`);
    }
    if (parsed?.kind !== 'directus-yaml-migration' || parsed?.version !== 1) {
        throw new Error('Invalid migration file (expected kind=directus-yaml-migration, version=1)');
    }

    if (!options.overwrite) {
        const exists = await fs
            .access(full)
            .then(() => true)
            .catch(() => false);
        if (exists) throw new Error('File already exists');
    }

    await fs.writeFile(full, raw, 'utf8');
    const checksum = crypto.createHash('sha256').update(raw).digest('hex');
    return { filename: safe, checksum };
}

export function resolveMigrationsDir(env: Record<string, any>): string {
    const configured = env.YAML_MIGRATIONS_DIR ?? env.DIRECTUS_YAML_MIGRATIONS_DIR ?? env.MIGRATIONS_DIR;
    if (typeof configured === 'string' && configured.trim()) {
        return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
    }
    return path.resolve(process.cwd(), 'migrations');
}

export async function ensureMigrationsDirExists(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

export async function listYamlFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
        .filter((e) => e.isFile() && (e.name.endsWith('.yaml') || e.name.endsWith('.yml')))
        .map((e) => e.name)
        .sort();
}

export async function readMigrationFile(dir: string, filename: string): Promise<{ parsed: YamlMigrationFile; raw: string; checksum: string }> {
    const safe = safeBasename(filename);
    const full = path.join(dir, safe);
    const raw = await fs.readFile(full, 'utf8');
    const checksum = crypto.createHash('sha256').update(raw).digest('hex');
    const parsed = YAML.parse(raw) as YamlMigrationFile;
    return { parsed, raw, checksum };
}

export async function writeMigrationFile(dir: string, filename: string, data: YamlMigrationFile): Promise<{ checksum: string }> {
    const safe = safeBasename(filename);
    const full = path.join(dir, safe);
    const raw = YAML.stringify(data, { indent: 2 });
    await fs.writeFile(full, raw, 'utf8');
    const checksum = crypto.createHash('sha256').update(raw).digest('hex');
    return { checksum };
}

export async function ensureTrackingTable(database: any): Promise<void> {
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

export async function readTrackingRows(database: any): Promise<MigrationDbRow[]> {
    try {
        const rows = await database(MIGRATION_TABLE).select('*');
        return rows as MigrationDbRow[];
    } catch {
        return [];
    }
}

export async function upsertTrackingRow(
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

export function parseFilenameInfo(filename: string): { createdAt: string | null; name: string } {
    const base = filename.replace(/\.(yaml|yml)$/i, '');
    const match = base.match(/^(\d{12})-(.+)$/);
    if (!match) return { createdAt: null, name: base };
    const ts = match[1]!;
    const name = match[2]!;
    const createdAt = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:00`;
    return { createdAt, name };
}

export async function listMigrations(database: any, env: Record<string, any>): Promise<ListedMigration[]> {
    const dir = resolveMigrationsDir(env);
    await ensureMigrationsDirExists(dir);
    await ensureTrackingTable(database);

    const files = await listYamlFiles(dir);
    const rows = await readTrackingRows(database);
    const byFilename = new Map(rows.map((r) => [r.filename, r]));

    const out: ListedMigration[] = [];
    for (const filename of files) {
        const { checksum } = await readMigrationFile(dir, filename);
        const info = parseFilenameInfo(filename);
        const row = byFilename.get(filename);

        let status: ListedMigration['status'] = 'pending';
        let appliedAt: string | null = null;
        let error: string | null = null;
        let lastRunAt: string | null = null;
        let report: string | null = null;
        if (row) {
            appliedAt = row.applied_at;
            error = row.error;
            lastRunAt = (row as any).last_run_at ?? null;
            report = (row as any).report ?? null;
            if (row.status === 'failed') status = 'failed';
            else if (row.status === 'applied' && row.checksum === checksum) status = 'applied';
            else if (row.status === 'applied' && row.checksum !== checksum) status = 'drifted';
        }

        out.push({
            filename,
            checksum,
            createdAtFromFilename: info.createdAt,
            nameFromFilename: info.name,
            status,
            appliedAt,
            error,
            lastRunAt,
            report,
        });
    }

    return out;
}

export async function exportMigrationSnapshot(options: {
    database: any;
    services: any;
    env: Record<string, any>;
    name?: string;
    filename?: string;
    includeData?: boolean;
    dataMode?: 'all' | 'selected';
    dataCollections?: string[];
    limitPerCollection?: number;
    schemaCollections?: string[];
    includeSystemData?: boolean;
    systemPresets?: string[];
    systemDataCollections?: string[];
    markApplied?: boolean;
}): Promise<{ filename: string; checksum: string }> {
    const dir = resolveMigrationsDir(options.env);
    await ensureMigrationsDirExists(dir);
    await ensureTrackingTable(options.database);

    const SchemaService = options.services?.SchemaService;
    if (!SchemaService) throw new Error('SchemaService not available in Directus services context');

    const schemaService = new SchemaService({ knex: options.database, accountability: { admin: true } as any });
    const snapshot = await schemaService.snapshot();
    const filteredSnapshot = filterSnapshot(snapshot, options.schemaCollections);

    const createdAt = new Date().toISOString();
    const baseName = options.name?.trim() || 'snapshot';
    const finalFilename = options.filename
        ? safeBasename(options.filename)
        : `${toTimestampPrefix(new Date())}-${slugify(baseName) || 'snapshot'}.yaml`;

    const includeData = Boolean(options.includeData);
    const limit = Number.isFinite(options.limitPerCollection as number) ? Number(options.limitPerCollection) : 500;

    const tableExistsCache = new Map<string, boolean>();
    const tableExists = async (collection: string): Promise<boolean> => {
        if (tableExistsCache.has(collection)) return tableExistsCache.get(collection)!;
        try {
            const ok = await options.database.schema.hasTable(collection);
            tableExistsCache.set(collection, Boolean(ok));
            return Boolean(ok);
        } catch {
            tableExistsCache.set(collection, false);
            return false;
        }
    };

    const cleanCollectionList = (list: unknown): string[] => {
        if (!Array.isArray(list)) return [];
        return list
            .filter((c) => typeof c === 'string')
            .map((c) => c.trim())
            .filter((c) => c.length > 0);
    };

    let dataCollections: string[] = [];
    if (includeData) {
        const mode = options.dataMode === 'selected' ? 'selected' : 'all';
        const requested = cleanCollectionList(options.dataCollections);

        if (mode === 'selected') {
            dataCollections = requested;
        } else {
            if (requested.length > 0) {
                dataCollections = requested;
            } else {
                dataCollections = (filteredSnapshot?.collections ?? [])
                    .filter((c: any) => c?.meta?.system !== true)
                    .map((c: any) => c.collection)
                    .filter((c: any) => typeof c === 'string' && !isInternalSystemCollection(c));
            }
        }
    }

    const includeSystemData = Boolean(options.includeSystemData);
    let systemCollections: string[] = [];
    if (includeSystemData) {
        const presets = cleanCollectionList(options.systemPresets);
        const fromPresets = presets.flatMap((p) => SYSTEM_PRESET_COLLECTIONS[p] ?? []);
        const fromManual = cleanCollectionList(options.systemDataCollections);

        systemCollections = ['brio_settings', ...fromPresets, ...fromManual].filter(
            (c) => typeof c === 'string' && c.length > 0,
        );

        const unique = new Set<string>();
        const ordered = [
            ...SYSTEM_COLLECTION_ORDER.filter((c) => systemCollections.includes(c)),
            ...systemCollections.filter((c) => !SYSTEM_COLLECTION_ORDER.includes(c)),
        ];
        systemCollections = ordered.filter((c) => (unique.has(c) ? false : (unique.add(c), true)));

        const existing: string[] = [];
        for (const c of systemCollections) {
            if (await tableExists(c)) existing.push(c);
        }
        systemCollections = existing;
    }

    const data: YamlMigrationDataCollection[] = [];
    if (includeData) {
        for (const collection of dataCollections) {
            if (!(await tableExists(collection))) continue;
            const items = await options.database(collection).select('*').limit(limit);
            data.push({ collection, match: ['id'], items });
        }
    }
    if (includeSystemData) {
        for (const collection of systemCollections) {
            if (!(await tableExists(collection))) continue;
            const perCollectionLimit =
                collection === 'brio_settings' ? Math.max(1, Math.min(limit, 50)) : Math.max(1, limit);
            const items = await options.database(collection).select('*').limit(perCollectionLimit);
            data.push({ collection, match: ['id'], items });
        }
    }

    let doc: YamlMigrationFile = {
        kind: 'directus-yaml-migration',
        version: 1,
        name: baseName,
        createdAt,
        schema: { snapshot: filteredSnapshot },
        data: { collections: data },
    };

    const fullPath = path.join(dir, finalFilename);
    try {
        const existingRaw = await fs.readFile(fullPath, 'utf8');
        const existing = YAML.parse(existingRaw) as YamlMigrationFile;
        if (existing?.kind === 'directus-yaml-migration' && existing?.version === 1 && existing?.data?.collections) {
            const merged = mergeDataCollections(existing.data.collections, doc.data?.collections ?? []);
            doc = {
                ...doc,
                data: { collections: merged },
            };
        }
    } catch {
        // ignore - file doesn't exist
    }

    const { checksum } = await writeMigrationFile(dir, finalFilename, doc);

    const markApplied = options.markApplied !== false;
    if (markApplied) {
        await upsertTrackingRow(options.database, {
            filename: finalFilename,
            checksum,
            status: 'applied',
            applied_at: new Date(),
            error: null,
            duration_ms: null,
        });
    }

    return { filename: finalFilename, checksum };
}

function filterSnapshot(snapshot: any, collections: string[] | undefined): any {
    if (!snapshot) return snapshot;
    const { systemFields: _systemFields, ...compatibleSnapshot } = snapshot;
    if (!Array.isArray(collections) || collections.length === 0) return compatibleSnapshot;
    const allow = new Set(collections.filter((c) => typeof c === 'string' && c.length > 0));
    return {
        ...compatibleSnapshot,
        collections: (snapshot.collections ?? []).filter((c: any) => allow.has(c?.collection)),
        fields: (snapshot.fields ?? []).filter((f: any) => allow.has(f?.collection)),
        relations: (snapshot.relations ?? []).filter((r: any) => allow.has(r?.collection) || allow.has(r?.related_collection)),
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

    const isTouchedRelation = (r: any) =>
        touchedCollections.has(r?.collection) ||
        (typeof r?.related_collection === 'string' && touchedCollections.has(r.related_collection));

    const currentRelations = Array.isArray(currentSnapshot?.relations) ? currentSnapshot.relations : [];
    const targetRelations = Array.isArray(targetSnapshot?.relations) ? targetSnapshot.relations : [];
    const mergedRelations = [...currentRelations.filter((r: any) => !isTouchedRelation(r)), ...targetRelations.filter(isTouchedRelation)];

    const { systemFields: _systemFields, ...compatibleSnapshot } = currentSnapshot;
    return {
        ...compatibleSnapshot,
        collections: mergedCollections,
        fields: mergedFields,
        relations: mergedRelations,
    };
}

function mergeDataCollections(oldCols: YamlMigrationDataCollection[], newCols: YamlMigrationDataCollection[]): YamlMigrationDataCollection[] {
    const byCollection = new Map<string, YamlMigrationDataCollection>();
    for (const c of oldCols) {
        const collection = normalizeSystemCollectionName(c.collection);
        if (!collection) continue;
        byCollection.set(collection, { ...c, collection, items: Array.isArray(c.items) ? [...c.items] : [] });
    }

    for (const c of newCols) {
        const collection = normalizeSystemCollectionName(c.collection);
        if (!collection) continue;

        const current = byCollection.get(collection);
        if (!current) {
            byCollection.set(collection, { ...c, collection, items: Array.isArray(c.items) ? [...c.items] : [] });
            continue;
        }

        const match = (c.match && c.match.length > 0 ? c.match : current.match && current.match.length > 0 ? current.match : ['id']).slice();
        current.match = match;

        const index = new Map<string, number>();
        current.items.forEach((item, i) => index.set(buildMatchKey(item, match), i));

        for (const item of c.items ?? []) {
            const key = buildMatchKey(item, match);
            const idx = index.get(key);
            if (idx === undefined) {
                index.set(key, current.items.length);
                current.items.push(item);
            } else {
                current.items[idx] = item;
            }
        }
    }

    return Array.from(byCollection.values());
}

function buildMatchKey(item: Record<string, any>, match: string[]): string {
    return match.map((f) => JSON.stringify(item?.[f] ?? null)).join('|');
}

export async function applyMigrationFile(options: {
    database: any;
    services: any;
    getSchema: () => Promise<any>;
    env: Record<string, any>;
    filename: string;
    dryRun?: boolean;
    forceSchema?: boolean;
    logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void };
}): Promise<{ appliedSchema: boolean; appliedData: { created: number; updated: number }; diff?: any; report: MigrationRunReport }> {
    const dir = resolveMigrationsDir(options.env);
    await ensureMigrationsDirExists(dir);
    await ensureTrackingTable(options.database);

    const { parsed, checksum } = await readMigrationFile(dir, options.filename);

    const startedAt = new Date();
    const started = startedAt.getTime();
    const report: MigrationRunReport = {
        filename: options.filename,
        startedAt: startedAt.toISOString(),
        finishedAt: startedAt.toISOString(),
        dryRun: Boolean(options.dryRun),
        forceSchema: Boolean(options.forceSchema),
        schema: {
            attempted: false,
            diffComputed: false,
            applied: false,
        },
        data: {
            attempted: false,
            created: 0,
            updated: 0,
            collections: [],
        },
    };

    try {
        let appliedSchema = false;
        let diff: any = null;

        if (parsed?.schema?.snapshot) {
            report.schema.attempted = true;

            try {
                const SchemaService = options.services?.SchemaService;
                if (!SchemaService) throw new Error('SchemaService not available in Directus services context');

                const schemaService = new SchemaService({ knex: options.database, accountability: { admin: true } as any });
                const rawCurrentSnapshot = await schemaService.snapshot();

                const currentSnapshot = filterSnapshotForNonInternalCollections(rawCurrentSnapshot);
                const targetSnapshot = filterSnapshotForNonInternalCollections(parsed.schema.snapshot);
                const targetSnapshotForDiff = mergeSnapshotsForPartialApply(currentSnapshot, targetSnapshot);

                diff = await schemaService.diff(targetSnapshotForDiff, {
                    currentSnapshot,
                    force: Boolean(options.forceSchema),
                });

                report.schema.diffComputed = Boolean(diff);
                report.schema.diffSummary = diff ? summarizeDiff(diff) : { hasDiff: false };

                if (diff) {
                    appliedSchema = true;
                    if (!options.dryRun) {
                        const payload = {
                            hash: schemaService.getHashedSnapshot(rawCurrentSnapshot).hash,
                            diff,
                        };
                        await schemaService.apply(payload);
                    }
                    report.schema.applied = true;
                }
            } catch (err: any) {
                report.schema.error = String(err?.message ?? err);
                options.logger?.warn?.('yaml-migrations: schema step failed, continuing with data', {
                    filename: options.filename,
                    err,
                });
            }
        }

        const dataResult = { created: 0, updated: 0 };
        if (parsed?.data?.collections?.length) {
            report.data.attempted = true;
            const schema = await options.getSchema();
            const ItemsService = options.services?.ItemsService;
            if (!ItemsService) throw new Error('ItemsService not available in Directus services context');

            const stripReadonlyFields = (item: Record<string, any>) => {
                const clone: Record<string, any> = { ...item };
                delete clone.date_created;
                delete clone.user_created;
                delete clone.date_updated;
                delete clone.user_updated;
                return clone;
            };

            const upsertCollection = async (opts: {
                collection: string;
                matchFields: string[];
                items: Record<string, any>[];
                transformItem?: (item: Record<string, any>) => Record<string, any>;
            }) => {
                const { collection, matchFields, items } = opts;
                const pk = schema?.collections?.[collection]?.primary;
                const itemsService = new ItemsService(collection, {
                    knex: options.database,
                    schema,
                    accountability: { admin: true } as any,
                });

                const collectionReport = {
                    collection,
                    created: 0,
                    updated: 0,
                    failed: 0,
                    errors: [] as Array<{ index: number; match?: Record<string, any>; message: string }>,
                };
                report.data.collections.push(collectionReport);

                for (const [index, rawItem] of (items ?? []).entries()) {
                    const transformed = opts.transformItem ? opts.transformItem(rawItem) : rawItem;
                    const item = stripReadonlyFields(transformed);

                    const where: Record<string, any> = {};
                    for (const f of matchFields) where[f] = item?.[f];
                    if (Object.values(where).some((v) => v === undefined)) {
                        collectionReport.failed++;
                        collectionReport.errors.push({
                            index,
                            match: where,
                            message: `Missing match fields. Required=${matchFields.join(',')}`,
                        });
                        continue;
                    }

                    try {
                        const existing = await options.database(collection).select([pk ?? matchFields[0]!]).where(where).first();
                        if (existing) {
                            if (!options.dryRun) {
                                const key = pk ? existing[pk] : existing[matchFields[0]!];
                                await itemsService.updateOne(key, item);
                            }
                            dataResult.updated++;
                            collectionReport.updated++;
                        } else {
                            if (!options.dryRun) {
                                await itemsService.createOne(item);
                            }
                            dataResult.created++;
                            collectionReport.created++;
                        }
                    } catch (err: any) {
                        collectionReport.failed++;
                        collectionReport.errors.push({
                            index,
                            match: where,
                            message: String(err?.message ?? err),
                        });
                        options.logger?.warn?.('yaml-migrations: data item failed, continuing', {
                            filename: options.filename,
                            collection,
                            where,
                            err,
                        });
                    }
                }
            };

            // Special handling for flows/operations to avoid FK ordering issues
            const normalizedCollections = parsed.data.collections.map((collection) => ({
                ...collection,
                collection: normalizeSystemCollectionName(collection?.collection) ?? collection?.collection,
            }));

            const byName = new Map<string, YamlMigrationDataCollection>();
            for (const col of normalizedCollections) {
                if (col?.collection) byName.set(col.collection, col);
            }

            const flows = byName.get('brio_flows');
            const operations = byName.get('brio_operations');

            if (flows && operations) {
                await upsertCollection({
                    collection: 'brio_flows',
                    matchFields: Array.isArray(flows.match) && flows.match.length > 0 ? flows.match : ['id'],
                    items: flows.items ?? [],
                    transformItem: (item) => ({ ...item, operation: null }),
                });

                await upsertCollection({
                    collection: 'brio_operations',
                    matchFields: Array.isArray(operations.match) && operations.match.length > 0 ? operations.match : ['id'],
                    items: operations.items ?? [],
                    transformItem: (item) => ({ ...item, resolve: null, reject: null }),
                });

                await upsertCollection({
                    collection: 'brio_operations',
                    matchFields: Array.isArray(operations.match) && operations.match.length > 0 ? operations.match : ['id'],
                    items: operations.items ?? [],
                });

                await upsertCollection({
                    collection: 'brio_flows',
                    matchFields: Array.isArray(flows.match) && flows.match.length > 0 ? flows.match : ['id'],
                    items: flows.items ?? [],
                });

                byName.delete('brio_flows');
                byName.delete('brio_operations');
            }

            for (const col of normalizedCollections) {
                if (!col?.collection) continue;
                if (!byName.has(col.collection)) continue;

                const collection = col.collection;
                const matchFields = Array.isArray(col.match) && col.match.length > 0 ? col.match : ['id'];
                await upsertCollection({ collection, matchFields, items: col.items ?? [] });
            }
        }

        report.data.created = dataResult.created;
        report.data.updated = dataResult.updated;

        const finishedAt = new Date();
        report.finishedAt = finishedAt.toISOString();

        const hasSchemaFatal = report.schema.attempted && Boolean(report.schema.error) && !report.data.attempted;
        if (hasSchemaFatal) {
            throw new Error(report.schema.error ?? 'Migration failed');
        }

        if (!options.dryRun) {
            await upsertTrackingRow(options.database, {
                filename: options.filename,
                checksum,
                status: 'applied',
                applied_at: new Date(),
                last_run_at: finishedAt,
                error: null,
                report: JSON.stringify(report),
                duration_ms: Date.now() - started,
            });
        }

        return { appliedSchema, appliedData: dataResult, diff: diff ?? undefined, report };
    } catch (err: any) {
        options.logger?.error?.('yaml-migrations: migration failed', { filename: options.filename, err });
        if (!options.dryRun) {
            const finishedAt = new Date();
            report.finishedAt = finishedAt.toISOString();
            report.schema.error = report.schema.error ?? String(err?.message ?? err);
            await upsertTrackingRow(options.database, {
                filename: options.filename,
                checksum,
                status: 'failed',
                applied_at: null,
                error: String(err?.stack ?? err?.message ?? err),
                last_run_at: finishedAt,
                report: JSON.stringify(report),
                duration_ms: Date.now() - started,
            });
        }
        throw err;
    } finally {
        const elapsed = Date.now() - started;
        options.logger?.info?.('yaml-migrations: finished migration', { filename: options.filename, elapsedMs: elapsed });
    }
}

export async function applyPendingMigrations(options: {
    database: any;
    services: any;
    getSchema: () => Promise<any>;
    env: Record<string, any>;
    dryRun?: boolean;
    forceSchema?: boolean;
    includeFailed?: boolean;
    includeDrifted?: boolean;
    logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void };
}): Promise<{ applied: string[]; skipped: { filename: string; reason: string }[] }> {
    const listed = await listMigrations(options.database, options.env);
    const applied: string[] = [];
    const skipped: { filename: string; reason: string }[] = [];

    for (const m of listed) {
        if (m.status === 'applied') continue;
        if (m.status === 'failed' && !options.includeFailed) {
            skipped.push({ filename: m.filename, reason: 'failed (retry disabled)' });
            continue;
        }
        if (m.status === 'drifted' && !options.includeDrifted) {
            skipped.push({ filename: m.filename, reason: 'drifted (force required)' });
            continue;
        }

        await applyMigrationFile({
            database: options.database,
            services: options.services,
            getSchema: options.getSchema,
            env: options.env,
            filename: m.filename,
            dryRun: options.dryRun,
            forceSchema: options.forceSchema,
            logger: options.logger,
        });

        applied.push(m.filename);
    }

    return { applied, skipped };
}
