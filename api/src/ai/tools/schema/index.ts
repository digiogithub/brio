import type { Field, Relation } from '@brio/types';
import { z } from 'zod';
import { CollectionsService } from '../../../services/collections.js';
import { FieldsService } from '../../../services/fields.js';
import { RelationsService } from '../../../services/relations.js';
import type { Collection } from '../../../types/collection.js';
import { defineTool } from '../define-tool.js';

export interface fieldOverviewOutput {
    type: string;
    primary_key?: boolean;
    required?: boolean;
    readonly?: boolean;
    note?: string;
    interface?: { type: string; choices?: Array<string | number> };
    relation?: {
        type: string;
        collection?: string;
        many_field?: string;
        one_allowed_collections?: string[];
        junction?: {
            collection: string;
            many_field: string;
            junction_field: string;
            one_collection_field?: string;
            sort_field?: string;
        };
    };
    fields?: Record<string, fieldOverviewOutput>;
    value?: string;
}

export interface OverviewOutput {
    [collection: string]: {
        [field: string]: fieldOverviewOutput;
    };
}

export interface LightweightOverview {
    collections: string[];
    collection_folders: string[];
    notes: Record<string, string>;
}

export interface SchemaToolSnapshot {
    collections: Collection[];
    fields: Field[];
    relations: Relation[];
}

export const SchemaValidateSchema = z.strictObject({ keys: z.array(z.string()).optional() });

export const SchemaInputSchema = z.object({
    keys: z
        .array(z.string())
        .optional()
        .describe('Collection names to get detailed schema for. If omitted, returns a lightweight list of all collections.'),
});

export const schema = defineTool<z.infer<typeof SchemaValidateSchema>>({
    name: 'schema',
    description: 'Returns lightweight or detailed schema overview optimized for AI usage.',
    annotations: { title: 'Brio - Schema' },
    inputSchema: SchemaInputSchema,
    validateSchema: SchemaValidateSchema,
    async handler({ args, accountability, schema }) {
        const serviceOptions = { schema, accountability };
        const collectionsService = new CollectionsService(serviceOptions);
        const collections = await collectionsService.readByQuery();

        if (!args.keys || args.keys.length === 0) {
            const lightweightOverview: LightweightOverview = { collections: [], collection_folders: [], notes: {} };
            collections.forEach((collection) => {
                if (!collection.schema) lightweightOverview.collection_folders.push(collection.collection);
                else lightweightOverview.collections.push(collection.collection);
                if (collection.meta?.note && !collection.meta.note.startsWith('$t')) {
                    lightweightOverview.notes[collection.collection] = collection.meta.note;
                }
            });
            return { type: 'text', data: lightweightOverview };
        }

        const overview: OverviewOutput = {};
        const fieldsService = new FieldsService(serviceOptions);
        const fields = await fieldsService.readAll();
        const relationsService = new RelationsService(serviceOptions);
        const relations = await relationsService.readAll();
        const snapshot = { collections, fields, relations };

        fields.forEach((field) => {
            if (!args.keys?.includes(field.collection)) return;
            if (field.type === 'alias' && field.meta?.special?.includes('no-data')) return;
            if (!overview[field.collection]) overview[field.collection] = {};

            const fieldOverview: fieldOverviewOutput = { type: field.type };
            if (field.schema?.is_primary_key) fieldOverview.primary_key = field.schema.is_primary_key;
            if (field.meta?.required) fieldOverview.required = field.meta.required;
            if (field.meta?.readonly) fieldOverview.readonly = field.meta.readonly;
            if (field.meta?.note) fieldOverview.note = field.meta.note;

            if (field.meta?.interface) {
                fieldOverview.interface = { type: field.meta.interface };
                if (field.meta.options?.['choices']) {
                    fieldOverview.interface.choices = field.meta.options['choices'].map((choice: { value: string }) => choice.value);
                }
            }

            if (field.type === 'json' && field.meta?.options?.['fields']) {
                fieldOverview.fields = processNestedFields({ fields: field.meta.options['fields'] as any[], maxDepth: 5, currentDepth: 0, snapshot });
            }

            if (field.type === 'json' && field.meta?.interface === 'collection-item-dropdown') {
                fieldOverview.fields = processCollectionItemDropdown({ field, snapshot });
            }

            if (field.meta?.special) {
                const relationshipType = getRelationType(field.meta.special);
                if (relationshipType) fieldOverview.relation = buildRelationInfo(field, relationshipType, snapshot);
            }

            overview[field.collection]![field.field] = fieldOverview;
        });

        return { type: 'text', data: overview };
    },
});

function processNestedFields(options: {
    fields: any[];
    maxDepth?: number;
    currentDepth?: number;
    snapshot?: SchemaToolSnapshot | undefined;
}): Record<string, fieldOverviewOutput> {
    const { fields, maxDepth = 5, currentDepth = 0, snapshot } = options;
    const result: Record<string, fieldOverviewOutput> = {};
    if (currentDepth >= maxDepth || !Array.isArray(fields)) return result;

    for (const field of fields) {
        const fieldKey = field.field || field.name;
        if (!fieldKey) continue;
        const fieldOverview: fieldOverviewOutput = { type: field.type ?? 'any' };

        if (field.meta) {
            const { required, readonly, note, interface: interfaceConfig, options } = field.meta;
            if (required) fieldOverview.required = required;
            if (readonly) fieldOverview.readonly = readonly;
            if (note) fieldOverview.note = note;
            if (interfaceConfig) {
                fieldOverview.interface = { type: interfaceConfig };
                if (options?.choices) fieldOverview.interface.choices = options.choices;
            }
        }

        const nestedFields = field.meta?.options?.fields || field.options?.fields;
        if (field.type === 'json' && nestedFields) {
            fieldOverview.fields = processNestedFields({ fields: nestedFields, maxDepth, currentDepth: currentDepth + 1, snapshot });
        }
        if (field.type === 'json' && field.meta?.interface === 'collection-item-dropdown') {
            fieldOverview.fields = processCollectionItemDropdown({ field, snapshot });
        }

        result[fieldKey] = fieldOverview;
    }

    return result;
}

function processCollectionItemDropdown(options: { field: Field; snapshot?: any }): Record<string, fieldOverviewOutput> {
    const { field, snapshot } = options;
    const selectedCollection = field.meta?.options?.['selectedCollection'];
    let keyType = 'string | number | uuid';
    if (selectedCollection && snapshot?.fields) {
        const primaryKeyField = snapshot.fields.find((f: any) => f.collection === selectedCollection && f.schema?.is_primary_key);
        if (primaryKeyField) keyType = primaryKeyField.type;
    }

    return {
        collection: { value: selectedCollection, type: 'string' },
        key: { type: keyType },
    };
}

function getRelationType(special: string[]): string | null {
    if (special.includes('m2o') || special.includes('file')) return 'm2o';
    if (special.includes('o2m')) return 'o2m';
    if (special.includes('m2m') || special.includes('files')) return 'm2m';
    if (special.includes('m2a')) return 'm2a';
    return null;
}

function buildRelationInfo(field: Field, type: string, snapshot: SchemaToolSnapshot) {
    switch (type) {
        case 'm2o':
            return buildManyToOneRelation(field, snapshot);
        case 'o2m':
            return buildOneToManyRelation(field, snapshot);
        case 'm2m':
            return buildManyToManyRelation(field, snapshot);
        case 'm2a':
            return buildManyToAnyRelation(field, snapshot);
        default:
            return { type };
    }
}

function buildManyToOneRelation(field: Field, snapshot: SchemaToolSnapshot) {
    const relation = snapshot.relations.find((r) => r.collection === field.collection && r.field === field.field);
    const targetCollection = relation?.related_collection || relation?.schema?.foreign_key_table || field.schema?.foreign_key_table;
    return { type: 'm2o', collection: targetCollection };
}

function buildOneToManyRelation(field: Field, snapshot: SchemaToolSnapshot) {
    const reverseRelation = snapshot.relations.find((r) => r.meta?.one_collection === field.collection && r.meta?.one_field === field.field);
    if (!reverseRelation) return { type: 'o2m' };
    return { type: 'o2m', collection: reverseRelation.collection, many_field: reverseRelation.field };
}

function buildManyToManyRelation(field: Field, snapshot: SchemaToolSnapshot) {
    const junctionRelation = snapshot.relations.find(
        (r) => r.meta?.one_field === field.field && r.meta?.one_collection === field.collection && r.collection !== field.collection,
    );
    if (!junctionRelation) return { type: 'm2m' };

    const targetRelation = snapshot.relations.find(
        (r) => r.collection === junctionRelation.collection && r.field === junctionRelation.meta?.junction_field,
    );

    const targetCollection = targetRelation?.related_collection || 'brio_files';
    const result: any = {
        type: 'm2m',
        collection: targetCollection,
        junction: {
            collection: junctionRelation.collection,
            many_field: junctionRelation.field,
            junction_field: junctionRelation.meta?.junction_field,
        },
    };

    if (junctionRelation.meta?.sort_field) result.junction.sort_field = junctionRelation.meta.sort_field;
    return result;
}

function buildManyToAnyRelation(field: Field, snapshot: SchemaToolSnapshot) {
    const junctionRelation = snapshot.relations.find(
        (r) => r.meta?.one_field === field.field && r.meta?.one_collection === field.collection,
    );
    if (!junctionRelation) return { type: 'm2a' };

    const polymorphicRelation = snapshot.relations.find(
        (r) => r.collection === junctionRelation.collection && r.meta?.one_allowed_collections && r.meta.one_allowed_collections.length > 0,
    );
    if (!polymorphicRelation) return { type: 'm2a' };

    const parentRelation = snapshot.relations.find(
        (r) =>
            r.collection === junctionRelation.collection &&
            r.related_collection === field.collection &&
            r.field !== polymorphicRelation.field,
    );

    const result: any = {
        type: 'm2a',
        one_allowed_collections: polymorphicRelation.meta?.one_allowed_collections,
        junction: {
            collection: junctionRelation.collection,
            many_field: parentRelation?.field || `${field.collection}_id`,
            junction_field: polymorphicRelation.field,
            one_collection_field: polymorphicRelation.meta?.one_collection_field || 'collection',
        },
    };

    const sortField = parentRelation?.meta?.sort_field || polymorphicRelation.meta?.sort_field;
    if (sortField) result.junction.sort_field = sortField;
    return result;
}
