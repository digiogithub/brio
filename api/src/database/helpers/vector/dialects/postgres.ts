import type { Knex } from 'knex';
import { VectorHelper } from '../types.js';

export class VectorHelperPostgres extends VectorHelper {
	override async supported() {
		const res = await this.knex.select('extname').from('pg_extension').where({ extname: 'vector' });
		return res.length > 0;
	}

	override columnType(dimensions: number): string {
		return `vector(${dimensions})`;
	}

	override literal(vector: number[]): Knex.Raw {
		return this.knex.raw('?::vector', [this.serialize(vector)]);
	}

	override cosineDistance(column: string, vector: number[]): Knex.Raw {
		return this.knex.raw('?? <=> ?::vector', [column, this.serialize(vector)]);
	}

	override euclideanDistance(column: string, vector: number[]): Knex.Raw {
		return this.knex.raw('?? <-> ?::vector', [column, this.serialize(vector)]);
	}
}
