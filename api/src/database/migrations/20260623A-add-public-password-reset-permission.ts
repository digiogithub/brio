import type { Knex } from 'knex';
import { v4 as uuid } from 'uuid';

/**
 * Garantiza que el rol público/anónimo pueda leer únicamente los campos
 * necesarios de brio_users para solicitar recuperación de contraseña.
 *
 * El flujo /auth/password/request usa UsersService.requestPasswordReset(), que
 * necesita localizar al usuario por email y validar su status/password actual.
 * Sin permiso de lectura sobre brio_users para el rol público, el acceso acaba
 * resolviendo en ForbiddenException durante el envío del email.
 *
 * Esta migración es idempotente.
 */
export async function up(knex: Knex): Promise<void> {
	const publicRoles = await knex('brio_roles').select('id').whereNull('name');

	for (const publicRole of publicRoles) {
		const existingPermission = await knex('brio_permissions')
			.select('id')
			.where({
				role: publicRole.id,
				collection: 'brio_users',
				action: 'read',
			})
			.first();

		if (existingPermission) continue;

		await knex('brio_permissions').insert({
			id: uuid(),
			role: publicRole.id,
			collection: 'brio_users',
			action: 'read',
			permissions: JSON.stringify({
				status: {
					_eq: 'active',
				},
			}),
			validation: null,
			presets: null,
			fields: 'email,status,password',
		});
	}
}

export async function down(_knex: Knex): Promise<void> {
	// Do nothing
}
