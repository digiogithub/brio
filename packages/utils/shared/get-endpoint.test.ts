import { describe, expect, it } from 'vitest';
import { getEndpoint } from './get-endpoint.js';

describe('getEndpoint', () => {
	it('When a directus_ system collection is passed in', () => {
		expect(getEndpoint('directus_system_collection')).toBe('/system_collection');
	});

	it('When a brio_ system collection is passed in', () => {
		expect(getEndpoint('brio_presets')).toBe('/presets');
		expect(getEndpoint('brio_users')).toBe('/users');
		expect(getEndpoint('brio_roles')).toBe('/roles');
		expect(getEndpoint('brio_files')).toBe('/files');
		expect(getEndpoint('brio_activity')).toBe('/activity');
		expect(getEndpoint('brio_settings')).toBe('/settings');
	});

	it('When a non-system collection is passed in', () => {
		expect(getEndpoint('user_collection')).toBe('/items/user_collection');
	});
});
