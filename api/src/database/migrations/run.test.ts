import type { Knex } from 'knex';
import knex from 'knex';
import { createTracker, MockClient, Tracker } from 'knex-mock-client';
import type { MockedFunction } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import run from './run.js';

describe('run', () => {
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
				hasTable: vi.fn(async (tableName: string) => tableName === 'brio_migrations'),
			},
		});
	});

	afterEach(() => {
		tracker.reset();
	});

	describe('when passed the argument up', () => {
		it('returns "Nothing To Upgrade" if no brio_migrations', async () => {
			tracker.on.select('brio_migrations').response(['Empty']);

			await run(db, 'up').catch((e: Error) => {
				expect(e).toBeInstanceOf(Error);
				expect(e.message).toBe('Nothing to upgrade');
			});
		});

		it('returns "Method implemented in the dialect driver" if no brio_migrations', async () => {
			tracker.on.select('brio_migrations').response([]);

			await run(db, 'up').catch((e: Error) => {
				expect(e).toBeInstanceOf(Error);
				expect(e.message).toBe('Method implemented in the dialect driver');
			});
		});

		it('returns undefined if the migration is successful', async () => {
			tracker.on.select('brio_migrations').response([
				{
					version: '20201028A',
					name: 'Remove Collection Foreign Keys',
					timestamp: '2021-11-27 11:36:56.471595-05',
				},
			]);

			tracker.on.delete('brio_relations').response([]);
			tracker.on.insert('brio_migrations').response(['Remove System Relations', '20201029A']);

			expect(await run(db, 'up')).toBe(undefined);
		});
	});

	describe('when passed the argument down', () => {
		it('returns "Nothing To downgrade" if no valid brio_migrations', async () => {
			tracker.on.select('brio_migrations').response(['Empty']);

			await run(db, 'down').catch((e: Error) => {
				expect(e).toBeInstanceOf(Error);
				expect(e.message).toBe(`Couldn't find migration`);
			});
		});

		it('returns "Method implemented in the dialect driver" if no brio_migrations', async () => {
			tracker.on.select('brio_migrations').response([]);

			await run(db, 'down').catch((e: Error) => {
				expect(e).toBeInstanceOf(Error);
				expect(e.message).toBe('Nothing to downgrade');
			});
		});

		it(`returns "Couldn't find migration" if an invalid migration object is supplied`, async () => {
			tracker.on.select('brio_migrations').response([
				{
					version: '202018129A',
					name: 'Fake Migration',
					timestamp: '2020-00-32 11:36:56.471595-05',
				},
			]);

			await run(db, 'down').catch((e: Error) => {
				expect(e).toBeInstanceOf(Error);
				expect(e.message).toBe(`Couldn't find migration`);
			});
		});
	});

	describe('when passed the argument latest', () => {
		it('returns "Nothing To downgrade" if no valid brio_migrations', async () => {
			tracker.on.select('brio_migrations').response(['Empty']);

			await run(db, 'latest').catch((e: Error) => {
				expect(e).toBeInstanceOf(Error);
				expect(e.message).toBe(`Method implemented in the dialect driver`);
			});
		});

		it('returns "Method implemented in the dialect driver" if no brio_migrations', async () => {
			tracker.on.select('brio_migrations').response([]);

			await run(db, 'latest').catch((e: Error) => {
				expect(e).toBeInstanceOf(Error);
				expect(e.message).toBe('Method implemented in the dialect driver');
			});
		});
	});
});
