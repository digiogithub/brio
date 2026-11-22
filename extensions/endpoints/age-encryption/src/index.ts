import { defineEndpoint } from '@brio/extensions-sdk';
import { armor, Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import type { Request, Response } from 'express';

const ARMOR_BEGIN = '-----BEGIN AGE ENCRYPTED FILE-----';
const ENCRYPTED_INTERFACE = 'age-encrypted';

/** Upper bound of values (batch mode) or items (collection mode) decrypted by one request. */
const MAX_BATCH_SIZE = 500;

type Accountability = { admin?: boolean; role?: string | null; user?: string | null };
type AgeRequest = Request & { accountability?: Accountability | null };

function isAdmin(req: AgeRequest): boolean {
	return Boolean(req.accountability?.admin);
}

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

function parseRoles(value: unknown): Set<string> {
	if (typeof value !== 'string' || !value) return new Set();

	return new Set(
		value
			.split(',')
			.map((role) => role.trim())
			.filter(Boolean)
	);
}

export default defineEndpoint({
	id: 'age-encryption',
	handler: (router, context) => {
		const { env, services, database, getSchema, logger } = context;

		const allowedRoles = parseRoles(env['AGE_DECRYPT_ALLOW_ROLES']);

		function envValue(name: string): string | null {
			const value = env[name];
			return typeof value === 'string' && value.trim() ? value.trim() : null;
		}

		function canDecrypt(req: AgeRequest): boolean {
			if (isAdmin(req)) return true;
			const role = req.accountability?.role;
			return Boolean(allowedRoles.size > 0 && role && allowedRoles.has(String(role)));
		}

		async function readSettings(req: AgeRequest) {
			const settings = new services.SettingsService({
				knex: database,
				schema: await getSchema(),
				accountability: req.accountability,
			});

			return await settings.readSingleton({});
		}

		function status() {
			const recipient = envValue('AGE_RECIPIENT');
			const identity = envValue('AGE_IDENTITY');

			return {
				recipient: { value: recipient, source: recipient ? 'env' : null },
				// The private key is never sent to the client
				identity: { value: null, source: identity ? 'env' : null },
				canDecrypt: Boolean(identity),
				storedIn: null,
			};
		}

		function createDecrypter(): Decrypter | null {
			const identity = envValue('AGE_IDENTITY');
			if (!identity) return null;

			const decrypter = new Decrypter();
			decrypter.addIdentity(identity);
			return decrypter;
		}

		async function decryptValue(decrypter: Decrypter, ciphertext: string): Promise<string> {
			return await decrypter.decrypt(armor.decode(ciphertext), 'text');
		}

		/** Names of the fields of a collection that use the age-encrypted interface. */
		async function getEncryptedFields(collection: string): Promise<string[]> {
			const rows = await database('brio_fields').select('field', 'interface').where({ collection });

			return rows
				.filter((row: { interface: string | null }) => row.interface === ENCRYPTED_INTERFACE)
				.map((row: { field: string }) => row.field);
		}

		const getStatus = async (req: AgeRequest, res: Response) => {
			if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });

			try {
				await readSettings(req);
				return res.json(status());
			} catch (err) {
				logger?.warn?.({ err }, 'age-encryption: failed to read status');
				return res.status(500).json({ error: 'Failed to read status' });
			}
		};

		router.get('/', getStatus);
		router.get('/status', getStatus);

		router.post('/generate-keypair', async (req: AgeRequest, res: Response) => {
			if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });

			const identity = await generateIdentity();
			const recipient = await identityToRecipient(identity);

			return res.json({
				recipient: { value: recipient, source: null },
				identity: { value: identity, source: null },
				canDecrypt: true,
				storedIn: null,
				warning:
					'Keypair generated. For security, nothing was stored in the project settings. Configure AGE_RECIPIENT/AGE_IDENTITY in the server environment.',
			});
		});

		/**
		 * Earlier versions stored the keys between markers in public settings fields. This removes any
		 * such leftover.
		 */
		router.post('/delete-private-key', async (req: AgeRequest, res: Response) => {
			if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });

			try {
				const current = await readSettings(req);
				const patch: Record<string, string> = {};

				for (const field of ['public_note', 'project_descriptor']) {
					const value = current?.[field];
					if (typeof value !== 'string' || !value) continue;

					let cleaned = stripMarker(value, '[[AGE_RECIPIENT]]', '[[/AGE_RECIPIENT]]');
					cleaned = stripMarker(cleaned, '[[AGE_IDENTITY]]', '[[/AGE_IDENTITY]]');

					if (cleaned !== value) patch[field] = cleaned;
				}

				if (Object.keys(patch).length > 0) {
					const settings = new services.SettingsService({
						knex: database,
						schema: await getSchema(),
						accountability: req.accountability,
					});

					await settings.upsertSingleton(patch);
				}

				return res.json(status());
			} catch (err) {
				logger?.warn?.({ err }, 'age-encryption: failed to delete private key from settings');
				return res.status(500).json({ error: 'Failed to delete private key' });
			}
		});

		/**
		 * Decrypts values for admins and for the roles listed in AGE_DECRYPT_ALLOW_ROLES.
		 *
		 * Accepts one of three request bodies:
		 *  - `{ ciphertext }`: one value. Answers `{ plaintext }`, or 400 when it can't be decrypted.
		 *  - `{ ciphertexts: [...] }`: up to MAX_BATCH_SIZE values. Answers `{ plaintexts, failed }` where
		 *    `plaintexts` keeps the order of the request and holds `null` for values that failed.
		 *  - `{ collection, keys: [...], fields?: [...] }`: reads up to MAX_BATCH_SIZE items with the
		 *    permissions of the requesting user and answers `{ data, failed }`, one object per readable
		 *    item with its primary key and the decrypted age-encrypted fields.
		 */
		router.post('/decrypt', async (req: AgeRequest, res: Response) => {
			if (!canDecrypt(req)) return res.status(403).json({ error: 'Forbidden' });

			const body = (req.body ?? {}) as Record<string, unknown>;

			const isSingle = 'ciphertext' in body;
			const isBatch = 'ciphertexts' in body;
			const isCollection = 'collection' in body || 'keys' in body;

			if ([isSingle, isBatch, isCollection].filter(Boolean).length > 1) {
				return res.status(400).json({ error: 'use only one of ciphertext, ciphertexts or collection + keys' });
			}

			if (isBatch) {
				const { ciphertexts } = body;

				if (!Array.isArray(ciphertexts) || ciphertexts.some((value) => typeof value !== 'string')) {
					return res.status(400).json({ error: 'ciphertexts must be an array of strings' });
				}

				if (ciphertexts.length > MAX_BATCH_SIZE) {
					return res.status(400).json({ error: `ciphertexts accepts at most ${MAX_BATCH_SIZE} values` });
				}
			} else if (isCollection) {
				const { collection, keys, fields } = body;

				if (typeof collection !== 'string' || !collection) {
					return res.status(400).json({ error: 'collection must be a string' });
				}

				if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string' && typeof key !== 'number')) {
					return res.status(400).json({ error: 'keys must be an array of primary keys' });
				}

				if (keys.length > MAX_BATCH_SIZE) {
					return res.status(400).json({ error: `keys accepts at most ${MAX_BATCH_SIZE} values` });
				}

				if (fields !== undefined && (!Array.isArray(fields) || fields.some((field) => typeof field !== 'string'))) {
					return res.status(400).json({ error: 'fields must be an array of strings' });
				}
			} else if (typeof body['ciphertext'] !== 'string') {
				return res.status(400).json({ error: 'ciphertext must be a string' });
			}

			const decrypter = createDecrypter();
			if (!decrypter) return res.status(501).json({ error: 'AGE_IDENTITY not configured' });

			if (isBatch) {
				const ciphertexts = body['ciphertexts'] as string[];
				const plaintexts: (string | null)[] = [];
				let failed = 0;

				for (const ciphertext of ciphertexts) {
					try {
						plaintexts.push(await decryptValue(decrypter, ciphertext));
					} catch {
						plaintexts.push(null);
						failed++;
					}
				}

				logger?.info?.(
					{ user: req.accountability?.user ?? null, values: ciphertexts.length, failed },
					'age-encryption: batch decrypt'
				);

				return res.json({ plaintexts, failed });
			}

			if (isCollection) {
				const collection = body['collection'] as string;
				const keys = body['keys'] as (string | number)[];
				const requestedFields = body['fields'] as string[] | undefined;

				try {
					const schema = await getSchema();
					const collectionInfo = schema.collections[collection];

					// Same answer for unknown and for system collections: nothing to decrypt there
					if (!collectionInfo || collection.startsWith('brio_')) {
						return res.status(403).json({ error: 'Forbidden' });
					}

					const encryptedFields = await getEncryptedFields(collection);

					const fields = requestedFields
						? requestedFields.filter((field) => encryptedFields.includes(field))
						: encryptedFields;

					if (requestedFields && fields.length !== requestedFields.length) {
						return res.status(400).json({ error: 'fields must be age-encrypted fields of the collection' });
					}

					const primaryKey = collectionInfo.primary;

					if (fields.length === 0 || keys.length === 0) return res.json({ data: [], failed: 0 });

					// Read with the permissions of the requesting user: items and fields they can't read are left out
					const items = new services.ItemsService(collection, {
						knex: database,
						schema,
						accountability: req.accountability,
					});

					const rows = await items.readMany(keys, { fields: [primaryKey, ...fields], limit: -1 });

					let failed = 0;

					const data = await Promise.all(
						rows.map(async (row: Record<string, unknown>) => {
							const result: Record<string, unknown> = { [primaryKey]: row[primaryKey] };

							for (const field of fields) {
								if (!(field in row)) continue;

								const value = row[field];

								if (!isArmored(value)) {
									// Empty, or stored before the field was encrypted
									result[field] = value ?? null;
									continue;
								}

								try {
									result[field] = await decryptValue(decrypter, value);
								} catch {
									result[field] = null;
									failed++;
								}
							}

							return result;
						})
					);

					logger?.info?.(
						{ user: req.accountability?.user ?? null, collection, items: data.length, fields, failed },
						'age-encryption: collection decrypt'
					);

					return res.json({ data, failed });
				} catch (err: any) {
					if (err?.status === 403 || err?.code === 'FORBIDDEN') {
						return res.status(403).json({ error: 'Forbidden' });
					}

					logger?.warn?.({ err, collection }, 'age-encryption: collection decrypt failed');
					return res.status(500).json({ error: 'Failed to decrypt' });
				}
			}

			try {
				return res.json({ plaintext: await decryptValue(decrypter, body['ciphertext'] as string) });
			} catch {
				return res.status(400).json({ error: 'Failed to decrypt' });
			}
		});
	},
});
