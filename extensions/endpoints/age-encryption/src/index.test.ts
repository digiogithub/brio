import { armor, Encrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import endpoint from './index.js';

type Handler = (req: any, res: any) => Promise<any>;

const ALLOWED_ROLE = 'role-allowed';

let identity: string;
let recipient: string;

async function encrypt(plaintext: string): Promise<string> {
	const encrypter = new Encrypter();
	encrypter.addRecipient(recipient);
	return armor.encode(await encrypter.encrypt(plaintext));
}

function setup(options: { env?: Record<string, unknown>; rows?: Record<string, unknown>[] } = {}) {
	const routes = new Map<string, Handler>();

	const router = {
		get: (path: string, handler: Handler) => routes.set(`GET ${path}`, handler),
		post: (path: string, handler: Handler) => routes.set(`POST ${path}`, handler),
	};

	const readMany = vi.fn(async () => options.rows ?? []);
	const ItemsService = vi.fn(function () {
		return { readMany };
	});

	const database = vi.fn(() => ({
		select: () => ({
			where: async () => [
				{ field: 'dni', interface: 'age-encrypted' },
				{ field: 'nombre', interface: 'input' },
			],
		}),
	}));

	const context = {
		env: { AGE_IDENTITY: identity, AGE_RECIPIENT: recipient, AGE_DECRYPT_ALLOW_ROLES: ALLOWED_ROLE, ...options.env },
		services: { ItemsService, SettingsService: vi.fn() },
		database,
		getSchema: async () => ({ collections: { socios: { primary: 'id' }, brio_users: { primary: 'id' } } }),
		logger: { info: vi.fn(), warn: vi.fn() },
	};

	(endpoint as any).handler(router, context);

	async function decrypt(body: unknown, accountability: unknown = { admin: true, user: 'admin-id' }) {
		const res: any = { statusCode: 200 };
		res.status = (code: number) => ((res.statusCode = code), res);
		res.json = (payload: unknown) => ((res.body = payload), res);

		await routes.get('POST /decrypt')!({ body, accountability }, res);

		return res as { statusCode: number; body: any };
	}

	return { decrypt, ItemsService, readMany, context };
}

beforeAll(async () => {
	identity = await generateIdentity();
	recipient = await identityToRecipient(identity);
});

describe('POST /age-encryption/decrypt', () => {
	it('decrypts a single value', async () => {
		const { decrypt } = setup();

		const res = await decrypt({ ciphertext: await encrypt('11111111H') });

		expect(res.statusCode).toBe(200);
		expect(res.body).toEqual({ plaintext: '11111111H' });
	});

	it('answers 400 when a single value cannot be decrypted', async () => {
		const { decrypt } = setup();

		expect((await decrypt({ ciphertext: 'not armored' })).statusCode).toBe(400);
	});

	it('decrypts a batch in order and reports the values that failed', async () => {
		const { decrypt } = setup();

		const res = await decrypt({ ciphertexts: [await encrypt('one'), 'garbage', await encrypt('three')] });

		expect(res.statusCode).toBe(200);
		expect(res.body).toEqual({ plaintexts: ['one', null, 'three'], failed: 1 });
	});

	it('rejects malformed, mixed and oversized requests', async () => {
		const { decrypt } = setup();

		for (const body of [
			{},
			{ ciphertexts: 'x' },
			{ ciphertexts: [1] },
			{ ciphertexts: new Array(501).fill('x') },
			{ ciphertext: 'a', ciphertexts: [] },
			{ collection: 'socios' },
			{ collection: 'socios', keys: new Array(501).fill(1) },
			{ collection: 'socios', keys: [1], fields: 'dni' },
		]) {
			expect((await decrypt(body)).statusCode, JSON.stringify(body).slice(0, 60)).toBe(400);
		}
	});

	it('only serves admins and the roles in AGE_DECRYPT_ALLOW_ROLES', async () => {
		const { decrypt } = setup();
		const body = { ciphertexts: [] };

		expect((await decrypt(body, null)).statusCode).toBe(403);
		expect((await decrypt(body, { admin: false, role: 'other-role' })).statusCode).toBe(403);
		expect((await decrypt(body, { admin: false, role: ALLOWED_ROLE })).statusCode).toBe(200);
		expect((await decrypt(body, { admin: true })).statusCode).toBe(200);
	});

	it('answers 501 without AGE_IDENTITY', async () => {
		const { decrypt } = setup({ env: { AGE_IDENTITY: '' } });

		expect((await decrypt({ ciphertexts: [] })).statusCode).toBe(501);
	});

	describe('collection mode', () => {
		it('reads the items as the requesting user and decrypts the encrypted fields', async () => {
			const accountability = { admin: false, role: ALLOWED_ROLE, user: 'user-id' };

			const { decrypt, ItemsService, readMany } = setup({
				rows: [
					{ id: 1, dni: await encrypt('11111111H') },
					{ id: 2, dni: null },
					{ id: 3, dni: 'stored in clear' },
					{ id: 4, dni: '-----BEGIN AGE ENCRYPTED FILE-----\nbroken' },
				],
			});

			const res = await decrypt({ collection: 'socios', keys: [1, 2, 3, 4, 5] }, accountability);

			expect(ItemsService).toHaveBeenCalledWith('socios', expect.objectContaining({ accountability }));
			expect(readMany).toHaveBeenCalledWith([1, 2, 3, 4, 5], { fields: ['id', 'dni'], limit: -1 });

			expect(res.statusCode).toBe(200);

			expect(res.body).toEqual({
				data: [
					{ id: 1, dni: '11111111H' },
					{ id: 2, dni: null },
					{ id: 3, dni: 'stored in clear' },
					{ id: 4, dni: null },
				],
				failed: 1,
			});
		});

		it('refuses fields that are not age-encrypted', async () => {
			const { decrypt, readMany } = setup();

			const res = await decrypt({ collection: 'socios', keys: [1], fields: ['dni', 'nombre'] });

			expect(res.statusCode).toBe(400);
			expect(readMany).not.toHaveBeenCalled();
		});

		it('refuses system and unknown collections', async () => {
			const { decrypt, readMany } = setup();

			expect((await decrypt({ collection: 'brio_users', keys: ['x'] })).statusCode).toBe(403);
			expect((await decrypt({ collection: 'missing', keys: [1] })).statusCode).toBe(403);
			expect(readMany).not.toHaveBeenCalled();
		});

		it('answers 403 when the user cannot read the collection', async () => {
			const { decrypt, readMany } = setup();
			readMany.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

			expect((await decrypt({ collection: 'socios', keys: [1] })).statusCode).toBe(403);
		});
	});
});
