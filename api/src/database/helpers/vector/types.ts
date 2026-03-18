import type { Knex } from 'knex';
import { DatabaseHelper } from '../types.js';

export abstract class VectorHelper extends DatabaseHelper {
	supported(): boolean | Promise<boolean> {
		return false;
	}

	createColumn(table: Knex.CreateTableBuilder, column: string, dimensions: number) {
		return table.specificType(column, this.columnType(dimensions));
	}

	columnType(dimensions: number): string {
		throw new Error(`Vector columns are not supported for this database client (dimensions: ${dimensions})`);
	}

	literal(vector: number[]): Knex.Raw {
		return this.knex.raw('?', [this.serialize(vector)]);
	}

	cosineDistance(column: string, vector: number[]): Knex.Raw {
		throw new Error(
			`Cosine vector distance is not supported for this database client (column: ${column}, dimensions: ${vector.length})`
		);
	}

	euclideanDistance(column: string, vector: number[]): Knex.Raw {
		throw new Error(
			`Euclidean vector distance is not supported for this database client (column: ${column}, dimensions: ${vector.length})`
		);
	}

	protected serialize(vector: number[]): string {
		return `[${vector.join(',')}]`;
	}
}
