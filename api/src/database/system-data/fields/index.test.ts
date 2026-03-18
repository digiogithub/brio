import { describe, expect, it } from 'vitest';
import { systemFieldRows } from './index.js';

describe('systemFieldRows', () => {
	it('uses brio-prefixed system collections', () => {
		for (const field of systemFieldRows) {
			expect(field.collection.startsWith('directus_')).toBe(false);
		}
	});
});
