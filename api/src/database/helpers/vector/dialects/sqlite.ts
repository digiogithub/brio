import type { Knex } from 'knex';
import { VectorHelper } from '../types.js';

export class VectorHelperSQLite extends VectorHelper {
	override async supported() {
		const res = await this.knex.select('name').from('pragma_function_list').where({ name: 'vec_version' });
		return res.length > 0;
	}

	override columnType(dimensions: number): string {
		return `float[${dimensions}]`;
	}

	override literal(vector: number[]): Knex.Raw {
		return this.knex.raw('vec_f32(?)', [this.serialize(vector)]);
	}

	override cosineDistance(column: string, vector: number[]): Knex.Raw {
		return this.knex.raw('vec_distance_cosine(??, vec_f32(?))', [column, this.serialize(vector)]);
	}

	override euclideanDistance(column: string, vector: number[]): Knex.Raw {
		return this.knex.raw('vec_distance_l2(??, vec_f32(?))', [column, this.serialize(vector)]);
	}
}
