import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../logger.js';
import { createSQLiteConnectionHook, initializeSQLiteConnection } from './extensions.js';

vi.mock('../../logger.js', () => ({
    default: {
        trace: vi.fn(),
        warn: vi.fn(),
    },
}));

describe('initializeSQLiteConnection', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('enables foreign keys and loads sqlite extensions', async () => {
        const events: string[] = [];
        const sqliteVecLoad = vi.fn(async () => {
            events.push('sqlite-vec');
        });
        const connection = {
            run: vi.fn((sql: string, callback: (error: Error | null) => void) => {
                events.push(sql);
                callback(null);
            }),
            spatialite: vi.fn((callback: (error: Error | null) => void) => {
                events.push('spatialite');
                callback(null);
            }),
        };

        await initializeSQLiteConnection(connection, {
            loadSqliteVecModule: async () => ({ load: sqliteVecLoad }),
        });

        expect(connection.run).toHaveBeenCalledWith('PRAGMA foreign_keys = ON', expect.any(Function));
        expect(connection.spatialite).toHaveBeenCalledTimes(1);
        expect(sqliteVecLoad).toHaveBeenCalledWith(connection);
        expect(events).toEqual(['PRAGMA foreign_keys = ON', 'spatialite', 'sqlite-vec']);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('passes initialization errors to the hook callback', async () => {
        const error = new Error('pragma failed');
        const connection = {
            run: vi.fn((_sql: string, callback: (error: Error | null) => void) => callback(error)),
        };

        const callback = vi.fn();
        await new Promise<void>((resolve) => {
            createSQLiteConnectionHook()(connection, (callbackError, callbackConnection) => {
                callback(callbackError, callbackConnection);
                resolve();
            });
        });

        expect(callback).toHaveBeenCalledWith(error, connection);
    });
});