import type { Knex } from 'knex';
import { systemFieldRows } from '../system-data/fields/index.js';

const JSON_COLUMNS = ['options', 'display_options', 'conditions', 'translations'] as const;

/**
 * Repara columnas JSON en brio_fields que quedaron almacenadas como '[object Object]'
 * tras la migración 20260611A, la cual insertó objetos sin pasar por JSON.stringify.
 *
 * Esta migración es IDEMPOTENTE.
 */
export async function up(knex: Knex): Promise<void> {
	for (const row of systemFieldRows) {
		const updates: Record<string, string> = {};

		for (const col of JSON_COLUMNS) {
			const value = (row as Record<string, unknown>)[col];
			if (value && typeof value === 'object') {
				updates[col] = JSON.stringify(value);
			}
		}

		if (Object.keys(updates).length === 0) continue;

		// Solo actualizar filas donde la columna tenga el valor corrupto '[object Object]'
		const conditions: Record<string, unknown> = {
			collection: row.collection,
			field: row.field,
		};

		for (const col of Object.keys(updates) as (keyof typeof updates)[]) {
			await knex('brio_fields')
				.where(conditions)
				.where(col, '[object Object]')
				.update({ [col]: updates[col] });
		}
	}
}

export async function down(_knex: Knex): Promise<void> {
	// No reversible de forma segura — los datos originales ya estaban corruptos.
}
