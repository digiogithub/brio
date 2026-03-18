import type { Knex } from 'knex';
import { describe, expect, it } from 'vitest';
import { evaluateMigrationRequirements } from './plan.js';

describe('evaluateMigrationRequirements', () => {
    it('requires migrations without extension requirements', async () => {
        const database = createDatabaseMock('Client_SQLite3', []);

        await expect(evaluateMigrationRequirements(database)).resolves.toEqual({ required: true });
    });

    it('skips SQLite-only migrations when a required extension is missing', async () => {
        const database = createDatabaseMock('Client_SQLite3', ['spatialite_version']);

        await expect(
            evaluateMigrationRequirements(database, { sqliteExtensions: ['spatialite', 'sqlite-vec'] })
        ).resolves.toEqual({
            required: false,
            skipReason: 'requires SQLite extensions that are not available: sqlite-vec',
        });
    });

    it('keeps SQLite migrations required when all requested extensions are available', async () => {
        const database = createDatabaseMock('Client_SQLite3', ['spatialite_version', 'vec_version']);

        await expect(
            evaluateMigrationRequirements(database, { sqliteExtensions: ['spatialite', 'sqlite-vec'] })
        ).resolves.toEqual({ required: true });
    });

    it('does not skip SQLite-specific requirements on non-SQLite databases', async () => {
        const database = createDatabaseMock('Client_PG', []);

        await expect(
            evaluateMigrationRequirements(database, { sqliteExtensions: ['sqlite-vec'] })
        ).resolves.toEqual({ required: true });
    });
});

function createDatabaseMock(clientName: string, availableFunctions: string[]): Knex {
    return {
        client: {
            constructor: {
                name: clientName,
            },
        },
        select: () => ({
            from: () => ({
                where: ({ name }: { name: string }) =>
                    Promise.resolve(availableFunctions.includes(name) ? [{ name }] : []),
            }),
        }),
    } as unknown as Knex;
}