import {
	EXTENSION_NAME_REGEX,
	EXTENSION_PKG_KEY,
	EXTENSION_TYPES,
	HYBRID_EXTENSION_TYPES,
	NESTED_EXTENSION_TYPES,
	ExtensionManifest,
} from '@brio/constants';
import type { ApiExtensionType, AppExtensionType, Extension, ExtensionType } from '@brio/types';
import fse from 'fs-extra';
import path from 'path';
import { isIn, isTypeIn } from './array-helpers.js';
import { listFolders } from './list-folders.js';
import { pluralize } from './pluralize.js';
import { resolvePackage } from './resolve-package.js';

export const findExtension = async (folder: string, filename: string) => {
	if (await fse.exists(path.join(folder, `${filename}.cjs`))) return `${filename}.cjs`;
	if (await fse.exists(path.join(folder, `${filename}.mjs`))) return `${filename}.mjs`;
	return `${filename}.js`;
};

export async function resolvePackageExtensions(
	root: string,
	extensionNames?: string[],
	allowedTypes: readonly ExtensionType[] = EXTENSION_TYPES
): Promise<Extension[]> {
	const extensions: Extension[] = [];

	const local = extensionNames === undefined;

	if (extensionNames === undefined) {
		extensionNames = await listFolders(root);
		extensionNames = extensionNames.filter((name) => EXTENSION_NAME_REGEX.test(name));
	}

	for (const extensionName of extensionNames) {
		const extensionPath = local ? path.join(root, extensionName) : resolvePackage(extensionName, root);
		const extensionManifest: Record<string, any> = await fse.readJSON(path.join(extensionPath, 'package.json'));

		let parsedManifest;

		try {
			parsedManifest = ExtensionManifest.parse(extensionManifest);
		} catch (error) {
			throw new Error(`The extension manifest of "${extensionName}" is not valid.\n${error}`);
		}

		const extensionOptions = parsedManifest[EXTENSION_PKG_KEY];

		if (!allowedTypes.includes(extensionOptions.type)) {
			continue;
		}

		if (extensionOptions.type === 'bundle') {
			extensions.push({
				path: extensionPath,
				name: parsedManifest.name,
				version: parsedManifest.version,
				type: extensionOptions.type,
				entrypoint: {
					app: extensionOptions.path.app,
					api: extensionOptions.path.api,
				},
				entries: extensionOptions.entries,
				host: extensionOptions.host,
				local,
			});
		} else if (isTypeIn(extensionOptions, HYBRID_EXTENSION_TYPES)) {
			extensions.push({
				path: extensionPath,
				name: parsedManifest.name,
				version: parsedManifest.version,
				type: extensionOptions.type,
				entrypoint: {
					app: extensionOptions.path.app,
					api: extensionOptions.path.api,
				},
				host: extensionOptions.host,
				local,
			});
		} else {
			extensions.push({
				path: extensionPath,
				name: parsedManifest.name,
				version: parsedManifest.version,
				type: extensionOptions.type,
				entrypoint: extensionOptions.path,
				host: extensionOptions.host,
				local,
			});
		}
	}

	return extensions;
}

export async function getPackageExtensions(
	root: string,
	allowedTypes: readonly ExtensionType[] = EXTENSION_TYPES
): Promise<Extension[]> {
	let pkg: { dependencies?: Record<string, string> };

	try {
		pkg = await fse.readJSON(path.resolve(root, 'package.json'));
	} catch {
		throw new Error('Current folder does not contain a package.json file');
	}

	const extensionNames = Object.keys(pkg.dependencies ?? {}).filter((dep) => EXTENSION_NAME_REGEX.test(dep));

	return resolvePackageExtensions(root, extensionNames, allowedTypes);
}

export async function getLocalExtensions(
	root: string,
	allowedTypes: readonly ExtensionType[] = NESTED_EXTENSION_TYPES
): Promise<Extension[]> {
	const extensions: Extension[] = [];

	for (const extensionType of allowedTypes) {
		const typeDir = pluralize(extensionType);
		const typePath = path.resolve(root, typeDir);

		try {
			const extensionNames = await listFolders(typePath);

			for (const extensionName of extensionNames) {
				const extensionPath = path.join(typePath, extensionName);

				// When a package.json with brio:extension is present, use the declared
				// build output path instead of assuming index.js at the folder root.
				const pkgFilePath = path.join(extensionPath, 'package.json');
				let pkgMeta: { name?: string; version?: string; [key: string]: any } | null = null;

				if (await fse.exists(pkgFilePath)) {
					try {
						const raw = await fse.readJSON(pkgFilePath);
						const parsed = ExtensionManifest.safeParse(raw);
						if (parsed.success) pkgMeta = parsed.data;
					} catch {
						// ignore malformed package.json — fall back to index.js
					}
				}

				if (isIn(extensionType, HYBRID_EXTENSION_TYPES)) {
					let appEntry: string;
					let apiEntry: string;

					if (pkgMeta && typeof pkgMeta[EXTENSION_PKG_KEY]?.path === 'object') {
						appEntry = pkgMeta[EXTENSION_PKG_KEY].path.app;
						apiEntry = pkgMeta[EXTENSION_PKG_KEY].path.api;
					} else {
						appEntry = await findExtension(extensionPath, 'app');
						apiEntry = await findExtension(extensionPath, 'api');
					}

					extensions.push({
						path: extensionPath,
						name: pkgMeta?.name ?? extensionName,
						type: extensionType,
						entrypoint: { app: appEntry, api: apiEntry },
						host: pkgMeta?.[EXTENSION_PKG_KEY]?.host,
						version: pkgMeta?.version,
						local: true,
					});
				} else {
					let entrypoint: string;

					if (pkgMeta && typeof pkgMeta[EXTENSION_PKG_KEY]?.path === 'string') {
						entrypoint = pkgMeta[EXTENSION_PKG_KEY].path;
					} else {
						entrypoint = await findExtension(extensionPath, 'index');
					}

					extensions.push({
						path: extensionPath,
						name: pkgMeta?.name ?? extensionName,
						type: extensionType as AppExtensionType | ApiExtensionType,
						entrypoint,
						host: pkgMeta?.[EXTENSION_PKG_KEY]?.host,
						version: pkgMeta?.version,
						local: true,
					});
				}
			}
		} catch (e) {
			throw new Error(`Extension folder "${typePath}" couldn't be opened`);
		}
	}

	return extensions;
}
