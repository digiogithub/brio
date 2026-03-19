import type { Accountability, SchemaOverview } from '@brio/types';
import { describe, expect, it, vi } from 'vitest';
import { getPermissions } from './get-permissions.js';

vi.mock('../database/index.js', () => ({
    default: vi.fn(),
}));

vi.mock('../cache.js', () => ({
    getCache: vi.fn().mockReturnValue({ cache: null }),
    getCacheValue: vi.fn(),
    getSystemCache: vi.fn(),
    setCacheValue: vi.fn(),
    setSystemCache: vi.fn(),
}));

describe('getPermissions', () => {
    it('returns wildcard permissions for admin users across all collections and actions', async () => {
        const accountability: Accountability = {
            user: 'user-id',
            role: 'role-id',
            admin: true,
            app: true,
        };

        const baseField = {
            field: 'id',
            defaultValue: null,
            nullable: false,
            generated: false,
            type: 'uuid' as const,
            dbType: 'uuid',
            precision: null,
            scale: null,
            special: [],
            note: null,
            validation: null,
            alias: false,
        };

        const schema: SchemaOverview = {
            collections: {
                brio_users: {
                    collection: 'brio_users',
                    primary: 'id',
                    singleton: false,
                    sortField: null,
                    note: null,
                    accountability: 'all',
                    fields: { id: baseField },
                },
                brio_files: {
                    collection: 'brio_files',
                    primary: 'id',
                    singleton: false,
                    sortField: null,
                    note: null,
                    accountability: 'all',
                    fields: { id: baseField },
                },
            },
            relations: [],
        };

        const permissions = await getPermissions(accountability, schema);

        expect(permissions).toHaveLength(14);
        expect(permissions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ role: 'role-id', collection: 'brio_users', action: 'read', fields: ['*'] }),
                expect.objectContaining({ role: 'role-id', collection: 'brio_files', action: 'delete', fields: ['*'] }),
            ])
        );
    });
});
