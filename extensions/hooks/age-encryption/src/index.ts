import { defineHook } from '@brio/extensions-sdk';
import { armor, Encrypter } from 'age-encryption';

const ARMOR_BEGIN = '-----BEGIN AGE ENCRYPTED FILE-----';
const ENCRYPTED_INTERFACE = 'age-encrypted';

/** How long the list of encrypted fields of a collection is kept in memory. */
const FIELDS_CACHE_TTL = 30_000;

function isArmored(value: unknown): value is string {
	return typeof value === 'string' && value.startsWith(ARMOR_BEGIN);
}

/** Removes a `[[MARKER]]...[[/MARKER]]` block from a settings text field. */
function stripMarker(text: string | null | undefined, begin: string, end: string): string {
	const value = text ?? '';
	const start = value.indexOf(begin);
	const stop = value.indexOf(end);

	if (start === -1 || stop === -1 || stop <= start) return value;

	return `${value.slice(0, start)}${value.slice(stop + end.length)}`.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Encrypts the fields that use the `age-encrypted` interface before they are stored.
 *
 * Values are encrypted with the public key in AGE_RECIPIENT, so the server can encrypt without holding
 * the private key. Reading returns the stored ciphertext; decryption is explicit, through
 * POST /age-encryption/decrypt (see the age-encryption endpoint extension).
 */
export default defineHook(({ filter }, { services, database, getSchema, env, logger }) => {
	const fieldsCache = new Map<string, { expiresAt: number; fields: string[] }>();

	function getRecipient(): string {
		if (env['AGE_RECIPIENT']) return String(env['AGE_RECIPIENT']).trim();

		throw new Error('age-encryption: recipient not configured. Set AGE_RECIPIENT in the server environment.');
	}

	/** Names of the fields of a collection that use the age-encrypted interface. */
	async function getEncryptedFields(collection: string, knex: any): Promise<string[]> {
		const now = Date.now();
		const cached = fieldsCache.get(collection);

		if (cached && cached.expiresAt > now) return cached.fields;

		const rows = await knex('brio_fields').select('field', 'interface').where({ collection });

		const fields = rows
			.filter((row: { interface: string | null }) => row.interface === ENCRYPTED_INTERFACE)
			.map((row: { field: string }) => row.field);

		fieldsCache.set(collection, { expiresAt: now + FIELDS_CACHE_TTL, fields });

		return fields;
	}

	async function encrypt(plaintext: string, recipient: string): Promise<string> {
		const encrypter = new Encrypter();
		encrypter.addRecipient(recipient);

		return armor.encode(await encrypter.encrypt(plaintext));
	}

	/**
	 * Earlier versions stored the keys between markers in public settings fields. Remove any such
	 * leftover on startup.
	 */
	async function scrubLeakedMarkers(): Promise<void> {
		try {
			const settings = new services.SettingsService({
				knex: database,
				schema: await getSchema(),
				accountability: { admin: true },
			});

			const current = await settings.readSingleton({});
			const patch: Record<string, string> = {};

			for (const field of ['public_note', 'project_descriptor']) {
				const value = current?.[field];
				if (typeof value !== 'string' || !value) continue;

				let cleaned = stripMarker(value, '[[AGE_RECIPIENT]]', '[[/AGE_RECIPIENT]]');
				cleaned = stripMarker(cleaned, '[[AGE_IDENTITY]]', '[[/AGE_IDENTITY]]');

				if (cleaned !== value) patch[field] = cleaned;
			}

			if (Object.keys(patch).length > 0) {
				await settings.upsertSingleton(patch);
				logger?.warn?.('age-encryption: removed leaked AGE_* markers from public settings fields');
			}
		} catch (err) {
			logger?.warn?.({ err }, 'age-encryption: failed to scrub leaked markers from settings');
		}
	}

	void scrubLeakedMarkers();

	async function encryptPayload(payload: any, meta: Record<string, any>, context: Record<string, any>) {
		if (!payload || !meta?.['collection']) return payload;

		const collection = meta['collection'] as string;
		const fields = await getEncryptedFields(collection, context?.['database'] ?? database);

		if (fields.length === 0) return payload;

		// Only plaintext strings: values that are already armored are stored as they are
		const pending = fields.filter((field) => typeof payload[field] === 'string' && !isArmored(payload[field]));

		if (pending.length === 0) return payload;

		let recipient: string;

		try {
			recipient = getRecipient();
		} catch (err) {
			// Never store the plaintext of an encrypted field
			logger?.warn?.({ err, collection }, 'age-encryption: recipient not configured; skipping encryption');
			for (const field of pending) payload[field] = null;
			return payload;
		}

		for (const field of pending) {
			try {
				payload[field] = await encrypt(payload[field], recipient);
			} catch (err) {
				logger?.warn?.({ err, collection, field }, 'age-encryption: failed to encrypt field; storing null');
				payload[field] = null;
			}
		}

		return payload;
	}

	filter('items.create', encryptPayload);
	filter('items.update', encryptPayload);
});
