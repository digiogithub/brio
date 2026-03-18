import type { Knex } from 'knex';
import { createRequire } from 'node:module';
import logger from '../../logger.js';

const require = createRequire(import.meta.url);

type SQLiteClientConstructor = new (config: Knex.Config) => Knex.Client;
type SQLiteDriverLoader = typeof require;

const BaseClient_SQLite3 = require('knex/lib/dialects/sqlite3/index.js') as SQLiteClientConstructor;
let spatialiteDriverWarningLogged = false;

export function resolveSQLiteDriver(loadDriver: SQLiteDriverLoader = require) {
    try {
        return loadDriver('spatialite');
    } catch (error: any) {
        warnSpatialiteDriver(
            `Failed to load the spatialite SQLite driver automatically. Falling back to sqlite3: ${error instanceof Error ? error.message : String(error)
            }`
        );
        return loadDriver('sqlite3');
    }
}

export class Client_SQLite3 extends BaseClient_SQLite3 {
    override _driver() {
        return resolveSQLiteDriver();
    }
}

function warnSpatialiteDriver(message: string): void {
    if (spatialiteDriverWarningLogged) return;
    spatialiteDriverWarningLogged = true;
    logger.warn(message);
}
