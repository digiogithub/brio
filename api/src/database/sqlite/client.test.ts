import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../logger.js';
import { resolveSQLiteDriver } from './client.js';

vi.mock('../../logger.js', () => ({
    default: {
        warn: vi.fn(),
    },
}));

describe('resolveSQLiteDriver', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('prefers the spatialite driver when available', () => {
        const spatialiteDriver = { name: 'spatialite-driver' };
        const loadDriver = vi.fn((moduleName: string) => {
            if (moduleName === 'spatialite') return spatialiteDriver;
            throw new Error(`Unexpected module request: ${moduleName}`);
        });

        expect(resolveSQLiteDriver(loadDriver as never)).toBe(spatialiteDriver);
        expect(loadDriver).toHaveBeenCalledWith('spatialite');
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('falls back to sqlite3 when spatialite is unavailable', () => {
        const sqlite3Driver = { name: 'sqlite3-driver' };
        const loadDriver = vi.fn((moduleName: string) => {
            if (moduleName === 'spatialite') throw new Error('native bindings missing');
            if (moduleName === 'sqlite3') return sqlite3Driver;
            throw new Error(`Unexpected module request: ${moduleName}`);
        });

        expect(resolveSQLiteDriver(loadDriver as never)).toBe(sqlite3Driver);
        expect(loadDriver).toHaveBeenCalledWith('spatialite');
        expect(loadDriver).toHaveBeenCalledWith('sqlite3');
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Failed to load the spatialite SQLite driver automatically. Falling back to sqlite3')
        );
    });
});