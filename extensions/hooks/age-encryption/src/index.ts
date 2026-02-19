import { defineHook } from '@brio/extensions-sdk';
import * as age from 'age-encryption';

const ARMOR_BEGIN = '-----BEGIN AGE ENCRYPTED FILE-----';

const RECIPIENT_MARKER_START = '[[AGE_RECIPIENT]]';
const RECIPIENT_MARKER_END = '[[/AGE_RECIPIENT]]';

const IDENTITY_MARKER_START = '[[AGE_IDENTITY]]';
const IDENTITY_MARKER_END = '[[/AGE_IDENTITY]]';

function isArmoredAge(value: unknown): value is string {
	return typeof value === 'string' && value.startsWith(ARMOR_BEGIN);
}

function removeMarker(container: string | null | undefined, startMarker: string, endMarker: string): string {
	const current = container ?? '';
	const start = current.indexOf(startMarker);
	const end = current.indexOf(endMarker);
	if (start === -1 || end === -1 || end <= start) return current;
	const next = `${current.slice(0, start)}${current.slice(end + endMarker.length)}`;
	return next.replace(/\n{3,}/g, '\n\n').trim();
}

function parseAllowRoles(envValue: string | undefined): Set<string> {
	if (!envValue) return new Set();
	return new Set(
		envValue
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
	);
}

export default defineHook(({ filter }, { services, database, getSchema, env, logger }) => {
	const allowRoles = parseAllowRoles(env.AGE_DECRYPT_ALLOW_ROLES);

	async function scrubLeakedMarkersFromPublicSettings(): Promise<void> {
		try {
			const schema = await getSchema();
			const settingsService = new services.SettingsService({ knex: database, schema, accountability: { admin: true } as any });
			const settings = await settingsService.readSingleton({});

			const patch: Record<string, any> = {};
			let changed = false;

			for (const field of ['public_note', 'project_descriptor'] as const) {
				const current = (settings as any)?.[field];
				if (typeof current !== 'string' || !current) continue;
				let next = current;
				next = removeMarker(next, RECIPIENT_MARKER_START, RECIPIENT_MARKER_END);
				next = removeMarker(next, IDENTITY_MARKER_START, IDENTITY_MARKER_END);
				if (next !== current) {
					patch[field] = next;
					changed = true;
				}
			}

			if (changed) {
				await settingsService.upsertSingleton(patch);
				logger?.warn?.('age-encryption: removed leaked AGE_* markers from Directus public settings fields');
			}
		} catch (err) {
			logger?.warn?.({ err }, 'age-encryption: failed to scrub leaked markers from settings');
		}
	}

	async function getRecipient(): Promise<string> {
		if (env.AGE_RECIPIENT) return String(env.AGE_RECIPIENT).trim();
		throw new Error('age-encryption: recipient not configured. Set AGE_RECIPIENT in the server environment.');
	}

	async function getIdentity(): Promise<string | null> {
		if (env.AGE_IDENTITY) return String(env.AGE_IDENTITY).trim();
		return null;
	}

	async function getEncryptedFields(collection: string): Promise<string[]> {
		// Brio 9 (Directus 9) uses the meta JSON column in directus_fields
		const rows = await database('directus_fields').select(['field', 'meta']).where({ collection });
		const fields: string[] = [];
		for (const row of rows as Array<{ field: string; meta?: any }>) {
			const meta = row.meta ?? {};
			const iface =
				typeof meta === 'string'
					? (() => {
						try {
							return JSON.parse(meta)?.interface;
						} catch {
							return undefined;
						}
					})()
					: meta.interface;
			if (iface === 'age-encrypted') fields.push(row.field);
		}
		return fields;
	}

	async function encryptToArmor(plaintext: string, recipient: string): Promise<string> {
		const e = new age.Encrypter();
		e.addRecipient(recipient);
		const ciphertext = await e.encrypt(plaintext);
		return age.armor.encode(ciphertext);
	}

	function decryptOptIn(context: any): boolean {
		const req = context?.req;
		const header = req?.headers?.['x-age-decrypt'] ?? req?.headers?.['X-Age-Decrypt'];
		const query = req?.query?.age_decrypt;
		return header === '1' || header === 'true' || query === '1' || query === 'true';
	}

	function isAuthorizedToDecrypt(context: any): boolean {
		const acc = context?.accountability;
		if (acc?.admin) return true;
		if (allowRoles.size > 0 && acc?.role && allowRoles.has(String(acc.role))) return true;
		return false;
	}

	// SECURITY: ensure no AGE key material is leaked through the login screen.
	void scrubLeakedMarkersFromPublicSettings();

	filter('items.create', async (payload: any, meta: any) => {
		if (!payload || !meta?.collection) return payload;
		const encryptedFields = await getEncryptedFields(meta.collection);
		if (encryptedFields.length === 0) return payload;

		const fieldsToEncrypt = encryptedFields.filter((field) => {
			const value = payload[field];
			return typeof value === 'string' && !isArmoredAge(value);
		});
		if (fieldsToEncrypt.length === 0) return payload;

		let recipient: string;
		try {
			recipient = await getRecipient();
		} catch (err) {
			logger?.warn?.({ err, collection: meta?.collection }, 'age-encryption: recipient not configured; skipping encryption');
			for (const field of fieldsToEncrypt) payload[field] = null;
			return payload;
		}

		for (const field of fieldsToEncrypt) {
			const value = payload[field];
			if (typeof value !== 'string') continue;
			try {
				payload[field] = await encryptToArmor(value, recipient);
			} catch (err) {
				logger?.warn?.({ err, collection: meta?.collection, field }, 'age-encryption: failed to encrypt field; storing null');
				payload[field] = null;
			}
		}

		return payload;
	});

	filter('items.update', async (payload: any, meta: any) => {
		if (!payload || !meta?.collection) return payload;
		const encryptedFields = await getEncryptedFields(meta.collection);
		if (encryptedFields.length === 0) return payload;

		const fieldsToEncrypt = encryptedFields.filter((field) => {
			const value = payload[field];
			return typeof value === 'string' && !isArmoredAge(value);
		});
		if (fieldsToEncrypt.length === 0) return payload;

		let recipient: string;
		try {
			recipient = await getRecipient();
		} catch (err) {
			logger?.warn?.({ err, collection: meta?.collection }, 'age-encryption: recipient not configured; skipping encryption');
			for (const field of fieldsToEncrypt) payload[field] = null;
			return payload;
		}

		for (const field of fieldsToEncrypt) {
			const value = payload[field];
			if (typeof value !== 'string') continue;
			try {
				payload[field] = await encryptToArmor(value, recipient);
			} catch (err) {
				logger?.warn?.({ err, collection: meta?.collection, field }, 'age-encryption: failed to encrypt field; storing null');
				payload[field] = null;
			}
		}

		return payload;
	});

	filter('items.read', async (items: any, meta: any, context: any) => {
		if (!items || !meta?.collection) return items;
		if (!decryptOptIn(context)) return items;
		if (!isAuthorizedToDecrypt(context)) return items;

		const identity = await getIdentity();
		if (!identity) return items;

		const encryptedFields = await getEncryptedFields(meta.collection);
		if (encryptedFields.length === 0) return items;

		const d = new age.Decrypter();
		d.addIdentity(String(identity));

		async function decryptValue(value: string): Promise<string> {
			const decoded = age.armor.decode(value);
			return await d.decrypt(decoded, 'text');
		}

		const list = Array.isArray(items) ? items : [items];
		for (const item of list) {
			if (!item) continue;
			for (const field of encryptedFields) {
				const value = item[field];
				if (!isArmoredAge(value)) continue;
				try {
					item[field] = await decryptValue(value);
				} catch {
					// If decryption fails, keep ciphertext.
				}
			}
		}

		return Array.isArray(items) ? list : list[0];
	});
});
