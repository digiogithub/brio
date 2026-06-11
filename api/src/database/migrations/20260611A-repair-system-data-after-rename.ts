import type { Knex } from 'knex';
import { v4 as uuid } from 'uuid';
import { systemCollectionRows } from '../system-data/collections/index.js';
import { systemFieldRows } from '../system-data/fields/index.js';
import { systemRelationRows } from '../system-data/relations/index.js';

// Map de las 21 colecciones de sistema renombradas
const SYSTEM_TABLES = [
  'activity',
  'collections',
  'dashboards',
  'fields',
  'files',
  'flows',
  'folders',
  'migrations',
  'notifications',
  'operations',
  'panels',
  'permissions',
  'presets',
  'relations',
  'revisions',
  'roles',
  'sessions',
  'settings',
  'shares',
  'users',
  'webhooks',
];

/**
 * Reparar referencias legacy `directus_*` → `brio_*` en datos del sistema
 * que no fueron actualizadas por la migración de rename inicial.
 *
 * Adicionalmente, repuebla las tablas de metadatos del sistema si quedaron
 * vacías tras el rename (situación detectada cuando las migraciones de
 * seed originales (20201029B/C) se ejecutaron sobre tablas ya renombradas
 * pero el código había sido actualizado retroactivamente).
 *
 * Cubre:
 *  - Columnas de colección simples en tablas del sistema
 *  - junction_field en brio_relations
 *  - Colecciones en brio_shares
 *  - Datos residuales en columnas JSON de brio_settings (reparar si translation_strings quedó NULL/empty)
 *  - Integridad del singleton de settings
 *  - Integridad del rol admin y usuarios huérfanos
 *  - Repoblación de brio_collections, brio_fields y brio_relations si están vacías
 *
 * Esta migración es IDEMPOTENTE — ejecutarla múltiples veces no produce efectos secundarios.
 */
export async function up(knex: Knex): Promise<void> {
  // ─── 1. Renombrar valores directus_* → brio_* en columnas de colección ───
  // Incluye todas las tablas/columnas afectadas, incluso aquellas que la migración
  // de rename ya actualizó (por si quedaron residuos).
  const columnsToUpdate: Array<{ table: string; columns: string[] }> = [
    { table: 'brio_permissions', columns: ['collection'] },
    { table: 'brio_presets', columns: ['collection'] },
    { table: 'brio_activity', columns: ['collection'] },
    { table: 'brio_collections', columns: ['collection'] },
    { table: 'brio_fields', columns: ['collection'] },
    { table: 'brio_relations', columns: ['many_collection', 'one_collection', 'junction_field'] },
    { table: 'brio_revisions', columns: ['collection'] },
    { table: 'brio_shares', columns: ['collection'] },
  ];

  for (const { table, columns } of columnsToUpdate) {
    const tableExists = await knex.schema.hasTable(table);
    if (!tableExists) continue;

    for (const col of columns) {
      const columnExists = await knex.schema.hasColumn(table, col);
      if (!columnExists) continue;

      for (const sysTable of SYSTEM_TABLES) {
        await knex(table)
          .where(col, `directus_${sysTable}`)
          .update({ [col]: `brio_${sysTable}` });
      }
    }
  }

  // ─── 2. Reparar singleton de brio_settings ───
  // Verificar que existe al menos un registro con datos mínimos válidos.
  const settingsExists = await knex('brio_settings').count('* as count').first();

  if (!settingsExists || Number(settingsExists.count) === 0) {
    // Insertar settings mínimos si no existe el singleton
    await knex('brio_settings').insert({
      project_name: 'Brio',
      project_descriptor: 'Application',
    });
  } else {
    // Verificar que translation_strings no sea NULL ni empty string.
    // Si la columna quedó vacía durante el rename, restaurarla como array vacío.
    const settingsRow = await knex('brio_settings').select('translation_strings').first();

    if (settingsRow) {
      const translationStrings = settingsRow.translation_strings;

      if (translationStrings === null || translationStrings === undefined) {
        await knex('brio_settings').whereNotNull('id').update({ translation_strings: '[]' });
      } else if (typeof translationStrings === 'string' && translationStrings.trim() === '') {
        await knex('brio_settings').whereNotNull('id').update({ translation_strings: '[]' });
      }
    }
  }

  // ─── 3. Garantizar rol admin funcional (solo en instalaciones existentes) ───
  // Verificar que existe un rol admin solo si ya había roles previamente.
  // En fresh install (brio_roles vacía) el bootstrap se encarga de crearlo.
  const allRolesCount = await knex('brio_roles').count('* as count').first();

  if (allRolesCount && Number(allRolesCount.count) > 0) {
    // Instalación existente — garantizar al menos un rol con admin_access = true
    const adminRole = await knex('brio_roles')
      .where(function () {
        this.where({ admin_access: true }).orWhere({ admin_access: 1 }).orWhere({ admin_access: '1' });
      })
      .first();

    if (!adminRole) {
      // Ningún rol admin existe — crear uno de recuperación
      await knex('brio_roles').insert({
        id: uuid(),
        name: 'Administrator',
        icon: 'supervised_user_circle',
        admin_access: true,
        app_access: true,
      });
    }
  }

  // ─── 4. Verificar que usuarios con rol asignado apuntan a roles existentes ───
  // Detecta usuarios con role apuntando a un UUID inexistente (FK rota tras rename)
  const validRoleIds = (await knex('brio_roles').select('id')).map((r: { id: string }) => r.id);
  const validRoleIdSet = new Set(validRoleIds);

  const usersWithRole = await knex('brio_users').whereNotNull('role').select('id', 'role');
  const orphanUserIds = usersWithRole
    .filter((u: { id: string; role: string }) => !validRoleIdSet.has(u.role))
    .map((u: { id: string }) => u.id);

  if (orphanUserIds.length > 0) {
    // Buscar el mejor rol admin disponible para reasignar
    const validAdminRole = await knex('brio_roles')
      .where(function () {
        this.where({ admin_access: true }).orWhere({ admin_access: 1 }).orWhere({ admin_access: '1' });
      })
      .first();

    if (validAdminRole) {
      await knex('brio_users')
        .whereIn('id', orphanUserIds)
        .update({ role: validAdminRole.id });
    }
  }

  // ─── 5. Repoblar tablas de metadatos del sistema si están vacías ───
  // Esto soluciona el caso donde las migraciones de seed originales
  // (20201029B/C) se ejecutaron cuando las tablas ya habían sido renombradas
  // pero el código aún referenciaba a los nombres nuevos (brio_*),
  // resultando en tablas de metadatos vacías.

  // 5a. Repoblar brio_collections si está vacía
  const collectionsCount = await knex('brio_collections').count('* as count').first();

  if (!collectionsCount || Number(collectionsCount.count) === 0) {
    // Preparar datos: systemCollectionRows tiene valores con 'brio_*'
    const collectionsToInsert = systemCollectionRows.map((row) => {
      // Asegurar que los campos necesarios existan con valores válidos
      const { system, ...rest } = row as Record<string, unknown>;
      return rest;
    });

    if (collectionsToInsert.length > 0) {
      await knex('brio_collections').insert(collectionsToInsert);
    }
  }

  // 5b. Repoblar brio_fields si está vacía
  const fieldsCount = await knex('brio_fields').count('* as count').first();

  if (!fieldsCount || Number(fieldsCount.count) === 0) {
    // Preparar datos: systemFieldRows tiene valores con 'brio_*'
    const fieldsToInsert = systemFieldRows.map((row) => {
      const { system, ...rest } = row as Record<string, unknown>;
      return rest;
    });

    if (fieldsToInsert.length > 0) {
      // Insertar en lotes de 500 para evitar límites de SQLite
      const BATCH_SIZE = 500;

      for (let i = 0; i < fieldsToInsert.length; i += BATCH_SIZE) {
        const batch = fieldsToInsert.slice(i, i + BATCH_SIZE);
        await knex('brio_fields').insert(batch);
      }
    }
  }

  // 5c. Repoblar brio_relations si está vacía
  const relationsCount = await knex('brio_relations').count('* as count').first();

  if (!relationsCount || Number(relationsCount.count) === 0) {
    const relationsToInsert = systemRelationRows.map((row) => {
      const { system, ...rest } = row as Record<string, unknown>;
      return rest;
    });

    if (relationsToInsert.length > 0) {
      await knex('brio_relations').insert(relationsToInsert);
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // No-reversible — los datos ya están en el nuevo prefijo y el rollback
  // sería ambiguo (no sabemos qué registros eran originales vs nuevos).
}
