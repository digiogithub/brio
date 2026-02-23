import {
	APP_OR_HYBRID_EXTENSION_PACKAGE_TYPES,
	APP_OR_HYBRID_EXTENSION_TYPES,
	APP_SHARED_DEPS,
	NESTED_EXTENSION_TYPES,
} from '@brio/constants';
import {
	ensureExtensionDirs,
	generateExtensionsEntrypoint,
	getLocalExtensions,
	getPackageExtensions,
	resolvePackageExtensions,
} from '@brio/utils/node';
import yaml from '@rollup/plugin-yaml';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import path from 'node:path';
import { searchForWorkspaceRoot } from 'vite';
import { defineConfig } from 'vitest/config';
import { version as packageVersion } from '../brio/package.json';

const API_PATH = path.join('..', 'api');
const EXTENSIONS_PATH = path.join(API_PATH, 'extensions');

async function resolveLatestTag(fallback) {
	try {
		const res = await fetch('https://api.github.com/repos/digiogithub/brio/tags', {
			headers: { accept: 'application/vnd.github+json' },
			signal: AbortSignal.timeout(5000),
		});

		if (!res.ok) return fallback;
		const tags = await res.json();
		if (Array.isArray(tags) && tags.length > 0 && tags[0].name) {
			// Strip leading 'v' to match semver convention
			return tags[0].name.replace(/^v/, '');
		}
	} catch {
		// Network unavailable or timeout – fall back silently
	}

	return fallback;
}

// https://vitejs.dev/config/
export default defineConfig(async () => {
	const version = await resolveLatestTag(packageVersion);
	return {
	define: {
		__BRIO_VERSION__: JSON.stringify(version),
	},
	plugins: [
		brioExtensions(),
		vue(),
		yaml({
			transform(data) {
				return data === null ? {} : undefined;
			},
		}),
	],
	resolve: {
		alias: [
			{ find: '@', replacement: path.resolve(__dirname, 'src') },
			{ find: 'json2csv', replacement: 'json2csv/dist/json2csv.umd.js' },
		],
	},
	base: process.env.NODE_ENV === 'production' ? '' : '/admin/',
	server: {
		port: 8080,
		proxy: {
			'^/(?!admin)': {
				target: process.env.API_URL ? process.env.API_URL : 'http://127.0.0.1:8055/',
				changeOrigin: true,
			},
		},
		fs: {
			allow: [searchForWorkspaceRoot(process.cwd()), ...getExtensionsRealPaths()],
		},
	},
	test: {
		environment: 'happy-dom',
		setupFiles: ['src/__setup__/mock-globals.ts'],
	},
	};
});

function getExtensionsRealPaths() {
	return fs.existsSync(EXTENSIONS_PATH)
		? fs
			.readdirSync(EXTENSIONS_PATH)
			.flatMap((typeDir) => {
				const extensionTypeDir = path.join(EXTENSIONS_PATH, typeDir);
				if (!fs.lstatSync(extensionTypeDir).isDirectory()) return;
				return fs.readdirSync(extensionTypeDir).map((dir) => fs.realpathSync(path.join(extensionTypeDir, dir)));
			})
			.filter((v) => v)
		: [];
}

function brioExtensions() {
	const virtualExtensionsId = '@brio-extensions';

	let extensionsEntrypoint = null;

	return [
		{
			name: 'brio-extensions-serve',
			apply: 'serve',
			config: () => ({
				optimizeDeps: {
					include: APP_SHARED_DEPS,
				},
			}),
			async buildStart() {
				await loadExtensions();
			},
			resolveId(id) {
				if (id === virtualExtensionsId) {
					return id;
				}
			},
			load(id) {
				if (id === virtualExtensionsId) {
					return extensionsEntrypoint;
				}
			},
		},
		{
			name: 'brio-extensions-build',
			apply: 'build',
			config: () => ({
				build: {
					rollupOptions: {
						input: {
							index: path.resolve(__dirname, 'index.html'),
							...APP_SHARED_DEPS.reduce((acc, dep) => ({ ...acc, [dep.replace(/\//g, '_')]: dep }), {}),
						},
						output: {
							entryFileNames: 'assets/[name].[hash].entry.js',
						},
						external: [virtualExtensionsId],
						preserveEntrySignatures: 'exports-only',
					},
				},
			}),
		},
	];

	async function loadExtensions() {
		await ensureExtensionDirs(EXTENSIONS_PATH, NESTED_EXTENSION_TYPES);
		const packageExtensions = await getPackageExtensions(API_PATH, APP_OR_HYBRID_EXTENSION_PACKAGE_TYPES);
		const localPackageExtensions = await resolvePackageExtensions(EXTENSIONS_PATH);
		const localExtensions = await getLocalExtensions(EXTENSIONS_PATH, APP_OR_HYBRID_EXTENSION_TYPES);

		const extensions = [...packageExtensions, ...localPackageExtensions, ...localExtensions];

		extensionsEntrypoint = generateExtensionsEntrypoint(extensions);
	}
}
