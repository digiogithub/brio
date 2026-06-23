import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const { name, version: packageVersion } = JSON.parse(
	readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
) as {
	name: string;
	version: string;
};

function normalizeBrioTag(tag: string): string {
	return tag.replace(/^brio[-_]/, '');
}

function readBrioVersionFromEnv(): string | null {
	const value = process.env['BRIO_VERSION'];
	if (typeof value !== 'string') return null;

	const normalized = value.trim();
	return normalized.length > 0 ? normalizeBrioTag(normalized) : null;
}

function readLatestBrioTagFromGit(): string | null {
	try {
		const output = execFileSync('git', ['tag', '--list', 'brio-*', 'brio_*', '--sort=-v:refname'], {
			cwd: repoRoot,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});

		const latestBrioTag = output
			.split('\n')
			.map((line) => line.trim())
			.find((tag) => tag.length > 0);

		return latestBrioTag ? normalizeBrioTag(latestBrioTag) : null;
	} catch {
		return null;
	}
}

/**
 * Resolve the Brio version from the explicit environment override, the latest local git tag,
 * or the local package.json version.
 */
export function getBrioVersion(): string {
	return readBrioVersionFromEnv() ?? readLatestBrioTagFromGit() ?? packageVersion;
}

/**
 * Resolve the latest local git tag with the `brio-` or `brio_` prefix.
 * Falls back to the resolved Brio version when no matching tag is available.
 */
export async function getLatestTag(): Promise<string> {
	return readLatestBrioTagFromGit() ?? getBrioVersion();
}

const version = getBrioVersion();

export { name, version };
