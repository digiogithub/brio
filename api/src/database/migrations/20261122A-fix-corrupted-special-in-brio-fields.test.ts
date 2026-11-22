import type { Knex } from 'knex';
import knex from 'knex';
import { createTracker, MockClient, Tracker } from 'knex-mock-client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { systemFieldRows } from '../system-data/fields/index.js';
import { up } from './20261122A-fix-corrupted-special-in-brio-fields.js';

describe('20261122A-fix-corrupted-special-in-brio-fields', () => {
	let db: Knex;
	let tracker: Tracker;

	beforeAll(() => {
		db = knex.default({ client: MockClient });
		tracker = createTracker(db);
	});

	afterEach(() => {
		tracker.reset();
	});

	it('restores "special" as a comma-separated string, only on corrupted rows', async () => {
		tracker.on.update('brio_fields').response(1);

		await up(db);

		const withSpecial = systemFieldRows.filter((row) => Array.isArray(row.special) && row.special.length > 0);

		expect(withSpecial.length).toBeGreaterThan(0);
		expect(tracker.history.update).toHaveLength(withSpecial.length);

		const timestamp = tracker.history.update.find(
			({ bindings }) => bindings.includes('brio_activity') && bindings.includes('timestamp')
		)!;

		expect(timestamp.bindings).toEqual([
			'date-created,cast-timestamp',
			'brio_activity',
			'timestamp',
			'[object Object]',
			'{%}',
		]);

		expect(timestamp.sql).toBe(
			'update "brio_fields" set "special" = ? where "collection" = ? and "field" = ? and ("special" = ? or "special" like ?)'
		);
	});
});
