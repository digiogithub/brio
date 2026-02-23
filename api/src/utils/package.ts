import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { name, version } = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
	name: string;
	version: string;
};

/**
 * Resolve the latest local git tag with the `brio-` prefix.
 * Falls back to the local package.json version when no matching tag is available.
 */
export async function getLatestTag(): Promise<string> {
	try {
		const repoRoot = resolve(__dirname, '../../..');
		const output = execFileSync('git', ['tag', '--list', 'brio-*', '--sort=-v:refname'], {
			cwd: repoRoot,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});

		const latestBrioTag = output
			.split('\n')
			.map((line) => line.trim())
			.find((tag) => tag.length > 0);

		if (latestBrioTag) {
			return latestBrioTag.replace(/^brio-/, '');
		}
	} catch {
		// Git unavailable or not a git repository – fall back silently
	}

	return version;
}

export { name, version };
