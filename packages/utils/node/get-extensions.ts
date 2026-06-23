import {
	EXTENSION_NAME_REGEX,
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
	if (await fse.exists(path.join(folder, `${filename}.ts`))) return `${filename}.ts`;
	return `${filename}.js`;
};

async function readNestedExtensionManifest(extensionPath: string) {
	const manifestPath = path.join(extensionPath, 'package.json');

	if ((await fse.pathExists(manifestPath)) === false) {
		return null;
	}

	const extensionManifest: Record<string, any> = await fse.readJSON(manifestPath);

	try {
		return ExtensionManifest.parse(extensionManifest);
	} catch (error) {
		throw new Error(`The extension manifest of "${extensionPath}" is not valid.\n${error}`);
	}
}

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

		const extensionOptions = parsedManifest['brio:extension'];

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
				const parsedManifest = await readNestedExtensionManifest(extensionPath);
				const manifestOptions = parsedManifest?.['brio:extension'];

				if (manifestOptions && manifestOptions.type !== extensionType) {
					continue;
				}

				if (isIn(extensionType, HYBRID_EXTENSION_TYPES)) {
					extensions.push({
						path: extensionPath,
						name: parsedManifest?.name ?? extensionName,
						type: extensionType,
						entrypoint: {
							app: manifestOptions && isTypeIn(manifestOptions, HYBRID_EXTENSION_TYPES)
								? manifestOptions.path.app
								: await findExtension(extensionPath, 'app'),
							api: manifestOptions && isTypeIn(manifestOptions, HYBRID_EXTENSION_TYPES)
								? manifestOptions.path.api
								: await findExtension(extensionPath, 'api'),
						},
						host: manifestOptions?.host,
						local: true,
					});
				} else {
					extensions.push({
						path: extensionPath,
						name: parsedManifest?.name ?? extensionName,
						type: extensionType as AppExtensionType | ApiExtensionType,
						entrypoint: manifestOptions?.path ?? (await findExtension(extensionPath, 'index')),
						host: manifestOptions?.host,
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
