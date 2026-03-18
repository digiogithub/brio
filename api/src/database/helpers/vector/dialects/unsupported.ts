import type { Knex } from 'knex';
import { VectorHelper } from '../types.js';

export class VectorHelperUnsupported extends VectorHelper {
	override supported() {
		return false;
	}

	override columnType(dimensions: number): string {
		throw this.unsupportedError(`vector(${dimensions}) column type`);
	}

	override literal(vector: number[]): Knex.Raw {
		throw this.unsupportedError(`vector literal (${vector.length} dimensions)`);
	}

	override cosineDistance(column: string, vector: number[]): Knex.Raw {
		throw this.unsupportedError(`cosine distance (column: ${column}, dimensions: ${vector.length})`);
	}

	override euclideanDistance(column: string, vector: number[]): Knex.Raw {
		throw this.unsupportedError(`euclidean distance (column: ${column}, dimensions: ${vector.length})`);
	}

	private unsupportedError(feature: string): Error {
		return new Error(`Vector helper doesn't support ${feature} for this database client`);
	}
}
