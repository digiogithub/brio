import type { Knex } from 'knex';
import knex from 'knex';
import { createTracker, MockClient, Tracker } from 'knex-mock-client';
import type { MockedFunction } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { up } from './20260611A-repair-system-data-after-rename.js';

describe('20260611A-repair-system-data-after-rename', () => {
	let db: MockedFunction<Knex>;
	let tracker: Tracker;

	beforeAll(() => {
		db = knex.default({ client: MockClient }) as unknown as MockedFunction<Knex>;
		tracker = createTracker(db);
	});

	beforeEach(() => {
		Object.defineProperty(db, 'schema', {
			configurable: true,
			value: {
				hasTable: vi.fn(async (tableName: string) => {
					const knownTables = [
						'brio_permissions',
						'brio_presets',
						'brio_activity',
						'brio_collections',
						'brio_fields',
						'brio_relations',
						'brio_revisions',
						'brio_shares',
						'brio_settings',
						'brio_roles',
						'brio_users',
					];
					return knownTables.includes(tableName);
				}),
				hasColumn: vi.fn(async (_tableName: string, colName: string) => {
					const validColumns = ['collection', 'many_collection', 'one_collection', 'junction_field'];
					return validColumns.includes(colName);
				}),
			},
		});
	});

	afterEach(() => {
		tracker.reset();
	});

	describe('up', () => {
		function mockUpdateQueries() {
			tracker.on.update('brio_permissions').response(0);
			tracker.on.update('brio_presets').response(0);
			tracker.on.update('brio_activity').response(0);
			tracker.on.update('brio_collections').response(0);
			tracker.on.update('brio_fields').response(0);
			tracker.on.update('brio_relations').response(0);
			tracker.on.update('brio_revisions').response(0);
			tracker.on.update('brio_shares').response(0);
		}

		function mockMetadataTablesHaveData() {
			tracker.on.select('brio_collections').response([{ count: 21 }]);
			tracker.on.select('brio_fields').response([{ count: 100 }]);
			tracker.on.select('brio_relations').response([{ count: 15 }]);
		}

		it('updates directus_* references to brio_* in collection columns', async () => {
			tracker.on.update('brio_permissions').response(1);
			tracker.on.update('brio_presets').response(1);
			tracker.on.update('brio_activity').response(1);
			tracker.on.update('brio_collections').response(1);
			tracker.on.update('brio_fields').response(1);
			tracker.on.update('brio_relations').response(1);
			tracker.on.update('brio_revisions').response(1);
			tracker.on.update('brio_shares').response(1);

			// Section 2: settings
			tracker.on.select('brio_settings').responseOnce([{ count: 1 }]);
			tracker.on.select('translation_strings').responseOnce([{ translation_strings: '[]' }]);

			// Section 3: roles (order matters — responseOnce consumed in FIFO)
			//   Query 1: count(*) FROM brio_roles  →  [{ count: 1 }]
			//   Query 2: SELECT admin role         →  [{ id: 'admin-1', admin_access: true }]
			tracker.on.select('brio_roles').responseOnce([{ count: 1 }]);
			tracker.on.select('brio_roles').responseOnce([{ id: 'admin-1', admin_access: true }]);

			// Section 4: orphan users (new code does two queries)
			//   Query A: SELECT id FROM brio_roles →  [{ id: 'admin-1' }]
			//   Query B: SELECT id, role FROM brio_users WHERE role IS NOT NULL → [] (no users with roles)
			tracker.on.select('brio_roles').responseOnce([{ id: 'admin-1' }]);
			tracker.on.select('brio_users').response([]);

			mockMetadataTablesHaveData();

			await up(db);

			const permissionUpdates = tracker.history['update']?.filter((q) => q.sql?.includes('brio_permissions'));
			expect(permissionUpdates).toBeDefined();
			expect(permissionUpdates!.length).toBeGreaterThan(0);
		});

		it('creates settings singleton when none exists', async () => {
			mockUpdateQueries();

			// Section 2: settings doesn't exist
			tracker.on.select('brio_settings').response([{ count: 0 }]);
			tracker.on.insert('brio_settings').response([1]);

			// Section 3: roles empty (fresh install) — skip admin creation
			tracker.on.select('brio_roles').responseOnce([{ count: 0 }]);

			// Section 4:
			tracker.on.select('brio_roles').responseOnce([]); // validRoleIds query
			tracker.on.select('brio_users').response([]); // usersWithRole: none

			mockMetadataTablesHaveData();

			await up(db);

			const settingsInserts = tracker.history['insert']?.filter((q) => q.sql?.includes('brio_settings'));
			expect(settingsInserts).toBeDefined();
			expect(settingsInserts!.length).toBeGreaterThanOrEqual(1);
		});

		it('creates admin role when roles exist but none is admin', async () => {
			mockUpdateQueries();

			// Section 2: settings ok
			tracker.on.select('brio_settings').responseOnce([{ count: 1 }]);
			tracker.on.select('translation_strings').responseOnce([{ translation_strings: '[]' }]);

			// Section 3: roles exist but no admin
			tracker.on.select('brio_roles').responseOnce([{ count: 2 }]); // allRolesCount
			tracker.on.select('brio_roles').responseOnce([]); // adminRole check empty
			tracker.on.insert('brio_roles').response(['new-admin-id']);

			// Section 4:
			tracker.on.select('brio_roles').responseOnce([{ id: 'role-1' }, { id: 'role-2' }, { id: 'new-admin-id' }]);
			tracker.on.select('brio_users').response([]); // no users with role yet

			mockMetadataTablesHaveData();

			await up(db);

			const roleInserts = tracker.history['insert']?.filter((q) => q.sql?.includes('brio_roles'));
			expect(roleInserts).toBeDefined();
			expect(roleInserts!.length).toBeGreaterThanOrEqual(1);
		});

		it('does NOT create admin role when brio_roles is empty (fresh install)', async () => {
			mockUpdateQueries();

			// Section 2: settings ok
			tracker.on.select('brio_settings').responseOnce([{ count: 1 }]);
			tracker.on.select('translation_strings').responseOnce([{ translation_strings: '[]' }]);

			// Section 3: no roles — skip
			tracker.on.select('brio_roles').responseOnce([{ count: 0 }]);

			// Section 4:
			tracker.on.select('brio_roles').responseOnce([]); // validRoleIds: empty
			tracker.on.select('brio_users').response([]); // usersWithRole: none

			mockMetadataTablesHaveData();

			await up(db);

			const roleInserts = tracker.history['insert']?.filter((q) => q.sql?.includes('brio_roles'));
			expect(roleInserts).toHaveLength(0);
		});
	});
});
