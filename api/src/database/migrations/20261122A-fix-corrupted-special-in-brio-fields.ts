import type { Knex } from 'knex';
import { systemFieldRows } from '../system-data/fields/index.js';

/**
 * Migration 20260611A inserted the system field rows into brio_fields passing the `special` array
 * straight to the database driver, instead of the comma-separated string the column holds. Depending
 * on the driver the stored value became '[object Object]' or an array literal such as
 * '{"date-created","cast-timestamp"}'.
 *
 * With `special` unreadable, the fields API reports system fields without their specials: for example
 * `cast-timestamp` is lost and the admin app shows timestamps on SQLite as raw ISO strings.
 *
 * This restores `special` from the system field definitions, only on rows that hold a corrupted value.
 * It is idempotent.
 */
export async function up(knex: Knex): Promise<void> {
	for (const row of systemFieldRows) {
		if (!Array.isArray(row.special) || row.special.length === 0) continue;

		await knex('brio_fields')
			.where({ collection: row.collection, field: row.field })
			.andWhere((query) => {
				query.where('special', '[object Object]').orWhere('special', 'like', '{%}');
			})
			.update({ special: row.special.join(',') });
	}
}

export async function down(_knex: Knex): Promise<void> {
	// Not reversible: the previous values were corrupted.
}
