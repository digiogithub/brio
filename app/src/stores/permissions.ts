import api from '@/api';
import { Permission } from '@brio/types';
import { deepMap } from '@brio/utils';
import { parseFilter } from '@/utils/parse-filter';
import { parsePreset } from '@/utils/parse-preset';
import { defineStore } from 'pinia';
import { useUserStore } from '../stores/user';

const ADMIN_ACTIONS: Permission['action'][] = ['create', 'read', 'update', 'delete', 'comment', 'explain', 'share'];

export const usePermissionsStore = defineStore({
	id: 'permissionsStore',
	state: () => ({
		permissions: [] as Permission[],
	}),
	actions: {
		async hydrate() {
			const userStore = useUserStore();

			const response = await api.get('/permissions', {
				params: { limit: -1, filter: { role: { _eq: userStore.currentUser!.role.id } } },
			});

			let rawPermissions = response.data.data as Permission[];

			if (userStore.currentUser?.role?.admin_access === true) {
				rawPermissions = await hydrateAdminPermissions(userStore.currentUser.role.id, rawPermissions);
			}

			const fields = getNestedDynamicVariableFieldsInPresets(rawPermissions);

			if (fields.length > 0) {
				await userStore.hydrateAdditionalFields(fields);
			}

			this.permissions = rawPermissions.map((rawPermission: Permission) => {
				if (rawPermission.permissions) {
					rawPermission.permissions = parseFilter(rawPermission.permissions);
				}

				if (rawPermission.validation) {
					rawPermission.validation = parseFilter(rawPermission.validation);
				}

				if (rawPermission.presets) {
					rawPermission.presets = parsePreset(rawPermission.presets);
				}

				return rawPermission;
			});

			function getNestedDynamicVariableFieldsInPresets(rawPermissions: Permission[]) {
				const fields: string[] = [];
				const rawPermissionsWithPresets = rawPermissions.filter((rawPermission: Permission) => rawPermission.presets);

				for (const rawPermissions of rawPermissionsWithPresets) {
					deepMap(rawPermissions.presets, (value) => {
						if (typeof value !== 'string') return;

						if (value.startsWith('$CURRENT_USER.')) {
							fields.push(value.replace('$CURRENT_USER.', ''));
						} else if (value.startsWith('$CURRENT_ROLE.')) {
							fields.push(value.replace('$CURRENT_ROLE.', 'role.'));
						}
					});
				}

				return fields;
			}

			async function hydrateAdminPermissions(roleId: string, existingPermissions: Permission[]): Promise<Permission[]> {
				const { data } = await api.get('/collections', {
					params: { limit: -1, fields: ['collection'] },
				});

				const collections = (data.data as Array<{ collection: string }>).map(({ collection }) => collection);

				const generatedPermissions = collections.flatMap((collection) => {
					return ADMIN_ACTIONS.map((action) => ({
						role: roleId,
						collection,
						action,
						permissions: {},
						validation: {},
						presets: {},
						fields: ['*'],
						system: true,
					}));
				});

				if (existingPermissions.length === 0) return generatedPermissions;

				const permissionMap = new Map(
					existingPermissions.map((permission) => [
						`${permission.collection}:${permission.action}:${permission.role}`,
						permission,
					])
				);

				for (const permission of generatedPermissions) {
					permissionMap.set(`${permission.collection}:${permission.action}:${permission.role}`, permission);
				}

				return Array.from(permissionMap.values());
			}
		},
		dehydrate() {
			this.$reset();
		},
		getPermissionsForUser(collection: string, action: Permission['action']) {
			const userStore = useUserStore();
			return (
				this.permissions.find(
					(permission) =>
						permission.action === action &&
						permission.collection === collection &&
						permission.role === userStore.currentUser?.role?.id
				) || null
			);
		},
		hasPermission(collection: string, action: Permission['action']) {
			const userStore = useUserStore();
			if (userStore.currentUser?.role?.admin_access === true) return true;
			return !!this.getPermissionsForUser(collection, action);
		},
	},
});
