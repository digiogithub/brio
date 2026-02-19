exports.hash = function (stringToHash) {
	const hashConfigOptions = { test: 'test', associatedData: 'string' }; // Disallow the HASH_RAW option, see https://github.com/directus/directus/discussions/7670#discussioncomment-1255805
	
	// Using Bun.password instead of argon2
	return Bun.password.hash(stringToHash, {
		algorithm: 'argon2id',
		...hashConfigOptions,
	});
};
