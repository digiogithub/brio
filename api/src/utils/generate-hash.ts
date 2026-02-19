import { getConfigFromEnv } from './get-config-from-env.js';

export async function generateHash(stringToHash: string): Promise<string> {
	const hashConfigOptions = getConfigFromEnv('HASH_', 'HASH_RAW'); // Disallow the HASH_RAW option, see https://github.com/directus/directus/discussions/7670#discussioncomment-1255805

	// Bun.password.hash uses argon2id by default
	// Note: Bun.password does not support all argon2 options like associatedData
	// If custom options are needed, they may need to be adapted
	return await Bun.password.hash(stringToHash, {
		algorithm: 'argon2id',
		...hashConfigOptions,
	});
}
