import type { SchemaOverview } from '@brio/types';
import type { Knex } from 'knex';
import getDatabase, {
	hasDatabaseConnection,
	isInstalled,
	validateDatabaseConnection,
} from '../../../database/index.js';
import runMigrations from '../../../database/migrations/run.js';
import installDatabase from '../../../database/seeds/run.js';
import env from '../../../env.js';
import logger from '../../../logger.js';
import { RolesService } from '../../../services/roles.js';
import { SettingsService } from '../../../services/settings.js';
import { UsersService } from '../../../services/users.js';
import { getSchema } from '../../../utils/get-schema.js';
import { defaultAdminRole, defaultAdminUser } from '../../utils/defaults.js';

export default async function bootstrap({ skipAdminInit }: { skipAdminInit?: boolean }): Promise<void> {
	logger.info('Initializing bootstrap...');

	const database = getDatabase();

	await waitForDatabase(database);

	const installed = await isInstalled();

	if (installed === false) {
		logger.info('Installing Brio system tables...');

		await installDatabase(database);
	} else {
		logger.info('Database already initialized, skipping install');
	}

	logger.info('Running migrations...');
	await runMigrations(database, 'latest');

	const schema = await getSchema();

	if (skipAdminInit == null) {
		await ensureDefaultAdmin(schema);
	} else {
		logger.info('Skipping creation of default Admin user and role...');
	}

	if (env['PROJECT_NAME'] && typeof env['PROJECT_NAME'] === 'string' && env['PROJECT_NAME'].length > 0) {
		const settingsService = new SettingsService({ schema });
		await settingsService.upsertSingleton({ project_name: env['PROJECT_NAME'] });
	}

	logger.info('Done');
	process.exit(0);
}

async function waitForDatabase(database: Knex) {
	const tries = 5;
	const secondsBetweenTries = 5;

	for (let i = 0; i < tries; i++) {
		if (await hasDatabaseConnection(database)) {
			return true;
		}

		await new Promise((resolve) => setTimeout(resolve, secondsBetweenTries * 1000));
	}

	// This will throw and exit the process if the database is not available
	await validateDatabaseConnection(database);

	return database;
}

async function ensureDefaultAdmin(schema: SchemaOverview) {
	const adminCredentials = await getAdminCredentials();
	const database = getDatabase();
	const rolesService = new RolesService({ schema, knex: database });
	const usersService = new UsersService({ schema, knex: database });
	const existingAdminRole = await getExistingAdminRole(database);

	if (existingAdminRole) {
		logger.info('Admin role already exists, skipping role creation...');
	} else {
		logger.info('Setting up first admin role...');
	}

	const role = existingAdminRole ?? (await rolesService.createOne(defaultAdminRole));

	const existingAdminUser = await getUserByEmail(database, adminCredentials.email);

	if (existingAdminUser) {
		logger.info(`Admin user "${adminCredentials.email}" already exists, skipping user creation...`);
		return;
	}

	logger.info('Adding first admin user...');

	await usersService.createOne({
		email: adminCredentials.email,
		password: adminCredentials.password,
		role,
		...defaultAdminUser,
	});
}

async function getAdminCredentials(): Promise<{ email: string; password: string }> {
	const { nanoid } = await import('nanoid');

	let adminEmail = env['ADMIN_EMAIL'];

	if (!adminEmail) {
		logger.info('No admin email provided. Defaulting to "admin@example.com"');
		adminEmail = 'admin@example.com';
	}

	let adminPassword = env['ADMIN_PASSWORD'];

	if (!adminPassword) {
		adminPassword = nanoid(12);
		logger.info(`No admin password provided. Defaulting to "${adminPassword}"`);
	}

	return { email: adminEmail, password: adminPassword };
}

async function getExistingAdminRole(database: Knex): Promise<string | null> {
	const role = await database.select('id').from('brio_roles').where({ admin_access: true }).first();
	return role?.id ?? null;
}

async function getUserByEmail(database: Knex, email: string): Promise<{ id: string } | null> {
	const user = await database
		.select('id')
		.from('brio_users')
		.whereRaw(`LOWER(??) = ?`, ['email', email.toLowerCase()])
		.first();

	return user ?? null;
}
