import { armor, Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import hook from './index.js';

type Filter = (payload: any, meta: any, context: any) => Promise<any>;

let identity: string;
let recipient: string;

async function decrypt(ciphertext: string): Promise<string> {
	const decrypter = new Decrypter();
	decrypter.addIdentity(identity);
	return await decrypter.decrypt(armor.decode(ciphertext), 'text');
}

function setup(env: Record<string, unknown> = {}) {
	const filters = new Map<string, Filter>();

	const database = vi.fn(() => ({
		select: () => ({
			where: async ({ collection }: { collection: string }) =>
				collection === 'socios'
					? [
							{ field: 'dni', interface: 'age-encrypted' },
							{ field: 'nombre', interface: 'input' },
					  ]
					: [{ field: 'title', interface: 'input' }],
		}),
	}));

	const settings = { readSingleton: vi.fn(async () => ({})), upsertSingleton: vi.fn() };

	(hook as any)(
		{ filter: (event: string, handler: Filter) => filters.set(event, handler) },
		{
			services: {
				SettingsService: vi.fn(function () {
					return settings;
				}),
			},
			database,
			getSchema: async () => ({}),
			env: { AGE_RECIPIENT: recipient, ...env },
			logger: { warn: vi.fn() },
		}
	);

	return { filters };
}

beforeAll(async () => {
	identity = await generateIdentity();
	recipient = await identityToRecipient(identity);
});

describe('age-encryption hook', () => {
	it('registers write filters only: reads return the stored ciphertext', () => {
		const { filters } = setup();

		expect([...filters.keys()].sort()).toEqual(['items.create', 'items.update']);
	});

	it.each(['items.create', 'items.update'])('encrypts age-encrypted fields on %s', async (event) => {
		const { filters } = setup();

		const payload = await filters.get(event)!({ nombre: 'Ana', dni: '11111111H' }, { collection: 'socios' }, {});

		expect(payload.nombre).toBe('Ana');
		expect(payload.dni).toMatch(/^-----BEGIN AGE ENCRYPTED FILE-----/);
		expect(await decrypt(payload.dni)).toBe('11111111H');
	});

	it('does not encrypt a value twice', async () => {
		const { filters } = setup();
		const create = filters.get('items.create')!;

		const first = await create({ dni: '11111111H' }, { collection: 'socios' }, {});
		const second = await create({ dni: first.dni }, { collection: 'socios' }, {});

		expect(second.dni).toBe(first.dni);
	});

	it('leaves collections without encrypted fields untouched', async () => {
		const { filters } = setup();

		const payload = await filters.get('items.create')!({ title: 'Hello' }, { collection: 'noticias' }, {});

		expect(payload).toEqual({ title: 'Hello' });
	});

	it('stores null instead of the plaintext when no recipient is configured', async () => {
		const { filters } = setup({ AGE_RECIPIENT: '' });

		const payload = await filters.get('items.create')!(
			{ nombre: 'Ana', dni: '11111111H' },
			{ collection: 'socios' },
			{}
		);

		expect(payload).toEqual({ nombre: 'Ana', dni: null });
	});
});
