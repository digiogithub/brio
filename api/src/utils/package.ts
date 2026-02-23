import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { name, version } = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
	name: string;
	version: string;
};

/**
 * Resolve the latest git tag from the upstream repository.
 * Falls back to the local package.json version when the network is unavailable or has no tags.
 */
export async function getLatestTag(): Promise<string> {
	try {
		const res = await fetch('https://api.github.com/repos/digiogithub/brio/tags', {
			headers: { accept: 'application/vnd.github+json' },
			signal: AbortSignal.timeout(5000),
		});

		if (!res.ok) return version;
		const tags = (await res.json()) as Array<{ name: string }>;
		if (Array.isArray(tags) && tags.length > 0 && tags[0]?.name) {
			return tags[0].name.replace(/^v/, '');
		}
	} catch {
		// Network unavailable or timeout – fall back silently
	}

	return version;
}

export { name, version };
