import { defineHook } from '@brio/extensions-sdk';

import { applyPendingMigrations } from './runner.js';

declare global {
    // eslint-disable-next-line no-var
    var __directusYamlMigrationsRan: boolean | undefined;
}

export default defineHook((_, context) => {
    if (globalThis.__directusYamlMigrationsRan) return;
    globalThis.__directusYamlMigrationsRan = true;

    const auto = context.env.YAML_MIGRATIONS_AUTO;
    if (auto === '0' || auto === 'false') {
        context.logger?.info?.('yaml-migrations: auto-run disabled (YAML_MIGRATIONS_AUTO=false)');
        return;
    }

    void applyPendingMigrations(context).catch((err: any) => {
        context.logger?.error?.('yaml-migrations: failed during startup', { err });
        const hardFail = context.env.YAML_MIGRATIONS_HARD_FAIL;
        if (hardFail === '1' || hardFail === 'true') throw err;
    });
});
