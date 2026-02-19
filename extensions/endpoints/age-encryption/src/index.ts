import { defineEndpoint } from '@brio/extensions-sdk';
import type { Request, Response } from 'express';
import * as age from 'age-encryption';

const RECIPIENT_MARKER_START = '[[AGE_RECIPIENT]]';
const RECIPIENT_MARKER_END = '[[/AGE_RECIPIENT]]';

function isAdmin(req: Request): boolean {
	return Boolean((req as any).accountability?.admin);
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

function canDecrypt(req: Request, allowRoles: Set<string>): boolean {
	if (isAdmin(req)) return true;
	const role = (req as any).accountability?.role;
	if (allowRoles.size > 0 && role && allowRoles.has(String(role))) return true;
	return false;
}

function removeMarker(container: string | null | undefined, startMarker: string, endMarker: string): string {
	const current = container ?? '';
	const start = current.indexOf(startMarker);
	const end = current.indexOf(endMarker);
	if (start === -1 || end === -1 || end <= start) return current;
	const next = `${current.slice(0, start)}${current.slice(end + endMarker.length)}`;
	return next.replace(/\n{3,}/g, '\n\n').trim();
}

function scrubPublicSettingsMarkers(settings: any): { patch: Record<string, any>; changed: boolean } {
	const patch: Record<string, any> = {};
	let changed = false;

	for (const field of ['public_note', 'project_descriptor'] as const) {
		const current = settings?.[field];
		if (typeof current !== 'string' || !current) continue;

		let next = current;
		next = removeMarker(next, RECIPIENT_MARKER_START, RECIPIENT_MARKER_END);
		next = removeMarker(next, '[[AGE_IDENTITY]]', '[[/AGE_IDENTITY]]');

		if (next !== current) {
			patch[field] = next;
			changed = true;
		}
	}

	return { patch, changed };
}

export default defineEndpoint({
	id: 'age-encryption',
	handler: (router, context) => {
		const allowRoles = parseAllowRoles(context.env.AGE_DECRYPT_ALLOW_ROLES);

		async function readSettings(req: Request): Promise<any> {
			const schema = await context.getSchema();
			const settingsService = new context.services.SettingsService({
				knex: context.database,
				schema,
				accountability: (req as any).accountability,
			});
			return await settingsService.readSingleton({});
		}

		async function writeSettings(req: Request, patch: Record<string, any>): Promise<void> {
			const schema = await context.getSchema();
			const settingsService = new context.services.SettingsService({
				knex: context.database,
				schema,
				accountability: (req as any).accountability,
			});
			await settingsService.upsertSingleton(patch);
		}

		function buildStatus(settings: any): any {
			const recipientFromEnv = typeof context.env.AGE_RECIPIENT === 'string' && context.env.AGE_RECIPIENT.trim() ? context.env.AGE_RECIPIENT.trim() : null;
			const identityFromEnv = typeof context.env.AGE_IDENTITY === 'string' && context.env.AGE_IDENTITY.trim() ? context.env.AGE_IDENTITY.trim() : null;

			return {
				recipient: {
					value: recipientFromEnv,
					source: recipientFromEnv ? 'env' : null,
				},
				identity: {
					value: null,
					source: identityFromEnv ? 'env' : null,
				},
				canDecrypt: Boolean(identityFromEnv),
				storedIn: null,
			};
		}

		const statusHandler = async (req: Request, res: Response) => {
			if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
			try {
				const settings = await readSettings(req);
				return res.json(buildStatus(settings));
			} catch (err: any) {
				context.logger?.warn?.({ err }, 'age-encryption: failed to read status');
				return res.status(500).json({ error: 'Failed to read status' });
			}
		};

		router.get('/', statusHandler);
		router.get('/status', statusHandler);

		router.post('/generate-keypair', async (req: Request, res: Response) => {
			if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });

			const identity = await age.generateIdentity();
			const recipient = await age.identityToRecipient(identity);

			return res.json({
				recipient: { value: recipient, source: null },
				identity: { value: identity, source: null },
				canDecrypt: true,
				storedIn: null,
				warning: 'Keypair generated. For security, nothing was stored in Directus settings. Configure AGE_RECIPIENT/AGE_IDENTITY in the server environment.',
			});
		});

		router.post('/delete-private-key', async (req: Request, res: Response) => {
			if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
			try {
				const settings = await readSettings(req);
				const { patch, changed } = scrubPublicSettingsMarkers(settings);
				if (changed) await writeSettings(req, patch);
				const updated = { ...(settings as any), ...(changed ? patch : {}) };
				return res.json(buildStatus(updated));
			} catch (err: any) {
				context.logger?.warn?.({ err }, 'age-encryption: failed to delete private key from settings');
				return res.status(500).json({ error: 'Failed to delete private key' });
			}
		});

		router.post('/decrypt', async (req: Request, res: Response) => {
			if (!canDecrypt(req, allowRoles)) return res.status(403).json({ error: 'Forbidden' });

			const ciphertext = req.body?.ciphertext;
			if (typeof ciphertext !== 'string') return res.status(400).json({ error: 'ciphertext must be a string' });

			try {
				const identity = typeof context.env.AGE_IDENTITY === 'string' && context.env.AGE_IDENTITY.trim() ? context.env.AGE_IDENTITY.trim() : null;
				if (!identity) return res.status(501).json({ error: 'AGE_IDENTITY not configured' });

				const d = new age.Decrypter();
				d.addIdentity(String(identity));
				const decoded = age.armor.decode(ciphertext);
				const plaintext = await d.decrypt(decoded, 'text');
				return res.json({ plaintext });
			} catch {
				return res.status(400).json({ error: 'Failed to decrypt' });
			}
		});
	},
});
