import { afterEach, describe, expect, it } from 'vitest';
import fse from 'fs-extra';
import os from 'os';
import path from 'path';

import { getLocalExtensions, getPackageExtensions, resolvePackageExtensions } from './get-extensions.js';

const tempDirs: string[] = [];

async function createTempDir() {
	const dir = await fse.mkdtemp(path.join(os.tmpdir(), 'brio-get-extensions-'));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => fse.remove(dir)));
});

describe('get-extensions helpers', () => {
	it('filters package extensions by allowed types', async () => {
		const root = await createTempDir();
		const extensionDir = path.join(root, 'node_modules', 'brio-extension-endpoint');

		await fse.ensureDir(extensionDir);
		await fse.writeJSON(path.join(root, 'package.json'), {
			dependencies: {
				'brio-extension-endpoint': '1.0.0',
			},
		});
		await fse.writeJSON(path.join(extensionDir, 'package.json'), {
			name: 'brio-extension-endpoint',
			version: '1.0.0',
			'brio:extension': {
				type: 'endpoint',
				path: './src/index.ts',
				source: './src/index.ts',
				host: '^9.0.0',
			},
		});

		const appExtensions = await getPackageExtensions(root, ['interface', 'module', 'operation', 'bundle']);
		expect(appExtensions).toEqual([]);

		const apiExtensions = await getPackageExtensions(root, ['endpoint']);
		expect(apiExtensions).toHaveLength(1);
		expect(apiExtensions[0]?.entrypoint).toBe('./src/index.ts');
	});

	it('filters local package extensions by allowed types', async () => {
		const root = await createTempDir();
		const extensionDir = path.join(root, 'brio-extension-hook');

		await fse.ensureDir(extensionDir);
		await fse.writeJSON(path.join(extensionDir, 'package.json'), {
			name: 'brio-extension-hook',
			version: '1.0.0',
			'brio:extension': {
				type: 'hook',
				path: './src/index.ts',
				source: './src/index.ts',
				host: '^9.0.0',
			},
		});

		const appExtensions = await resolvePackageExtensions(root, undefined, ['interface', 'module']);
		expect(appExtensions).toEqual([]);

		const apiExtensions = await resolvePackageExtensions(root, undefined, ['hook']);
		expect(apiExtensions).toHaveLength(1);
		expect(apiExtensions[0]?.entrypoint).toBe('./src/index.ts');
	});

	it('filters local nested extensions by allowed types and uses declared TypeScript entrypoints', async () => {
		const root = await createTempDir();
		const interfaceDir = path.join(root, 'interfaces', 'example-interface');
		const hookDir = path.join(root, 'hooks', 'example-hook');

		await fse.ensureDir(interfaceDir);
		await fse.ensureDir(hookDir);
		await fse.writeJSON(path.join(interfaceDir, 'package.json'), {
			name: 'brio-extension-example-interface',
			version: '1.0.0',
			'brio:extension': {
				type: 'interface',
				path: './src/index.ts',
				source: './src/index.ts',
				host: '^9.0.0',
			},
		});
		await fse.writeJSON(path.join(hookDir, 'package.json'), {
			name: 'brio-extension-example-hook',
			version: '1.0.0',
			'brio:extension': {
				type: 'hook',
				path: './src/index.ts',
				source: './src/index.ts',
				host: '^9.0.0',
			},
		});

		const appExtensions = await getLocalExtensions(root, ['interface']);
		expect(appExtensions).toHaveLength(1);
		expect(appExtensions[0]?.type).toBe('interface');
		expect(appExtensions[0]?.entrypoint).toBe('./src/index.ts');

		const apiExtensions = await getLocalExtensions(root, ['hook']);
		expect(apiExtensions).toHaveLength(1);
		expect(apiExtensions[0]?.type).toBe('hook');
		expect(apiExtensions[0]?.entrypoint).toBe('./src/index.ts');
	});
});
