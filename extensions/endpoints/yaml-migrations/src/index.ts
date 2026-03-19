import { defineEndpoint } from '@brio/extensions-sdk';
import type { Request, Response } from 'express';

import {
    applyMigrationFile,
    applyPendingMigrations,
    exportMigrationSnapshot,
    listMigrations,
    resolveMigrationsDir,
    uploadMigrationRawFile,
} from './migrations.js';

function isAdmin(req: Request): boolean {
    return Boolean((req as any).accountability?.admin);
}

function isLoopbackIp(ip: string | undefined | null): boolean {
    if (!ip) return false;
    const normalized = ip.replace(/^::ffff:/, '');
    return normalized === '127.0.0.1' || normalized === '::1';
}

function requireAdmin(req: Request, res: Response, context: any): boolean {
    if (!(req as any).accountability) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    if (!isAdmin(req)) {
        res.status(403).json({ error: 'Forbidden' });
        return false;
    }

    const allowRemote = context.env.YAML_MIGRATIONS_ALLOW_REMOTE === '1' || context.env.YAML_MIGRATIONS_ALLOW_REMOTE === 'true';
    const localhostOnly = context.env.YAML_MIGRATIONS_LOCALHOST_ONLY === '1' || context.env.YAML_MIGRATIONS_LOCALHOST_ONLY === 'true';
    if (localhostOnly && !allowRemote) {
        const ip = (req as any).ip as string | undefined;
        if (!isLoopbackIp(ip)) {
            res.status(403).json({ error: 'Forbidden (localhost-only)' });
            return false;
        }
    }

    return true;
}

export default defineEndpoint({
    id: 'yaml-migrations',
    handler: (router, context) => {
        router.get('/', async (req: Request, res: Response) => {
            if (!requireAdmin(req, res, context)) return;
            const migrations = await listMigrations(context.database, context.env);
            const migrationsDir = resolveMigrationsDir(context.env);
            return res.json({ migrationsDir, migrations });
        });

        router.get('/collections', async (req: Request, res: Response) => {
            if (!requireAdmin(req, res, context)) return;

            const schema = await context.getSchema();
            const names = Object.keys(schema?.collections ?? {}).sort();
            const internal: string[] = [];
            const regular: string[] = [];
            for (const name of names) {
                if (name.startsWith('directus_') || name.startsWith('brio_')) internal.push(name);
                else regular.push(name);
            }

            return res.json({ regular, internal });
        });

        router.post('/export', async (req: Request, res: Response) => {
            if (!requireAdmin(req, res, context)) return;

            const body = req.body ?? {};
            const dataMode = body.dataMode === 'selected' || body.dataMode === 'all' ? body.dataMode : undefined;
            const result = await exportMigrationSnapshot({
                database: context.database,
                services: context.services,
                env: context.env,
                name: typeof body.name === 'string' ? body.name : undefined,
                filename: typeof body.filename === 'string' ? body.filename : undefined,
                includeData: Boolean(body.includeData),
                dataMode,
                dataCollections: Array.isArray(body.dataCollections) ? body.dataCollections : undefined,
                limitPerCollection: typeof body.limitPerCollection === 'number' ? body.limitPerCollection : undefined,
                schemaCollections: Array.isArray(body.schemaCollections) ? body.schemaCollections : undefined,
                includeSystemData: Boolean(body.includeSystemData),
                systemPresets: Array.isArray(body.systemPresets) ? body.systemPresets : undefined,
                systemDataCollections: Array.isArray(body.systemDataCollections) ? body.systemDataCollections : undefined,
                markApplied: body.markApplied === undefined ? true : Boolean(body.markApplied),
            });

            return res.json({ ...result });
        });

        router.post('/apply', async (req: Request, res: Response) => {
            if (!requireAdmin(req, res, context)) return;
            const body = req.body ?? {};
            const dryRun = Boolean(body.dryRun);
            const forceSchema = Boolean(body.forceSchema);
            const includeFailed = Boolean(body.includeFailed);
            const includeDrifted = Boolean(body.includeDrifted);

            try {
                if (typeof body.filename === 'string' && body.filename) {
                    const result = await applyMigrationFile({
                        database: context.database,
                        services: context.services,
                        getSchema: context.getSchema,
                        env: context.env,
                        filename: body.filename,
                        dryRun,
                        forceSchema,
                        logger: context.logger,
                    });
                    return res.json({ filename: body.filename, ...result });
                }

                const result = await applyPendingMigrations({
                    database: context.database,
                    services: context.services,
                    getSchema: context.getSchema,
                    env: context.env,
                    dryRun,
                    forceSchema,
                    includeFailed,
                    includeDrifted,
                    logger: context.logger,
                });

                return res.json({ ...result });
            } catch (err: any) {
                return res.status(500).json({ error: String(err?.message ?? err) });
            }
        });

        router.post('/upload', async (req: Request, res: Response) => {
            if (!requireAdmin(req, res, context)) return;

            const body = req.body ?? {};
            const filename = typeof body.filename === 'string' ? body.filename : '';
            const raw = typeof body.raw === 'string' ? body.raw : '';
            const overwrite = Boolean(body.overwrite);

            try {
                const result = await uploadMigrationRawFile({
                    env: context.env,
                    filename,
                    raw,
                    overwrite,
                });
                return res.json({ ...result });
            } catch (err: any) {
                return res.status(400).json({ error: String(err?.message ?? err) });
            }
        });
    },
});
