import logger from '../../logger.js';

type SQLiteConnection = {
    run: (sql: string, callback: (error: Error | null) => void) => void;
    spatialite?: (callback: (error: Error | null) => void) => void;
};

type SQLiteConnectionCallback = (error: Error | null, connection: SQLiteConnection) => void;
type SQLiteVecModule = {
    load?: (connection: SQLiteConnection) => Promise<void> | void;
};
type SQLiteInitializationOptions = {
    loadSqliteVecModule?: () => Promise<SQLiteVecModule>;
};

let spatialiteWarningLogged = false;
let sqliteVecWarningLogged = false;

export function createSQLiteConnectionHook(options: SQLiteInitializationOptions = {}) {
    return (conn: SQLiteConnection, callback: SQLiteConnectionCallback) => {
        initializeSQLiteConnection(conn, options)
            .then(() => callback(null, conn))
            .catch((error) => callback(error, conn));
    };
}

export async function initializeSQLiteConnection(
    conn: SQLiteConnection,
    options: SQLiteInitializationOptions = {}
): Promise<void> {
    logger.trace('Enabling SQLite Foreign Keys support...');
    await runStatement(conn, 'PRAGMA foreign_keys = ON');

    await tryLoadSpatialite(conn);
    await tryLoadSqliteVec(conn, options.loadSqliteVecModule ?? defaultLoadSqliteVecModule);
}

async function tryLoadSpatialite(conn: SQLiteConnection): Promise<void> {
    if (typeof conn.spatialite !== 'function') {
        warnSpatialite(`Spatialite driver couldn't expose the SQLite extension loader. Geometry support will stay limited.`);
        return;
    }

    try {
        logger.trace('Loading SpatiaLite support for SQLite...');
        await new Promise<void>((resolve, reject) => {
            conn.spatialite?.((error) => {
                if (error) return reject(error);
                resolve();
            });
        });
    } catch (error: any) {
        warnSpatialite(
            `Failed to auto-load Spatialite support: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

async function tryLoadSqliteVec(
    conn: SQLiteConnection,
    loadSqliteVecModule: () => Promise<SQLiteVecModule>
): Promise<void> {
    try {
        logger.trace('Loading sqlite-vec support for SQLite...');
        const sqliteVec = await loadSqliteVecModule();

        if (typeof sqliteVec.load !== 'function') {
            throw new Error('sqlite-vec did not expose a load() function');
        }

        await sqliteVec.load(conn as never);
    } catch (error: any) {
        warnSqliteVec(`Failed to auto-load sqlite-vec support: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function defaultLoadSqliteVecModule(): Promise<SQLiteVecModule> {
    return await import('sqlite-vec');
}

async function runStatement(conn: SQLiteConnection, sql: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        conn.run(sql, (error) => {
            if (error) return reject(error);
            resolve();
        });
    });
}

function warnSpatialite(message: string): void {
    if (spatialiteWarningLogged) return;
    spatialiteWarningLogged = true;
    logger.warn(message);
}

function warnSqliteVec(message: string): void {
    if (sqliteVecWarningLogged) return;
    sqliteVecWarningLogged = true;
    logger.warn(message);
}
