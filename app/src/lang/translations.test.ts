import { afterEach, describe, expect, test, vi } from 'vitest';

import { merge } from 'lodash';
import { createI18n } from 'vue-i18n';
import availableLanguages from './available-languages.yaml';

const locales = Object.keys(availableLanguages).sort();
const consoleErrorSpy = vi.spyOn(console, 'error');

afterEach(() => {
	vi.clearAllMocks();
});

/**
 * Flatten nested objects to dot notations
 * Example input: { a: { b: 'b', c: 'c' }, d: 'd' }
 * Example output: { 'a.b': 'b', 'a.c': 'c', d: 'd' }
 */
function flatten(item: Record<string, any> | string, path: string[] = []): Record<string, any> {
	if (typeof item === 'string') return { [path.join('.')]: item };
	return Object.entries(item).reduce((acc, [key, value]) => merge(acc, flatten(value, [...path, key])), {});
}

async function importLanguageFile(locale: string): Promise<{ isImported: boolean; translations: Record<string, any> }> {
	try {
		const { default: translations } = await import(`./translations/${locale}.yaml`);
		return { isImported: true, translations };
	} catch (e) {
		return { isImported: false, translations: {} };
	}
}

describe.each(locales)('Locale %s', async (locale) => {
	// Same mode as the app (see ./index.ts). The legacy API is compiled out through the
	// `__VUE_I18N_LEGACY_API__: false` define in vite.config.js, so `messages` is a ref here.
	const i18n = createI18n({ legacy: false, locale: locale });
	const { isImported, translations } = await importLanguageFile(locale);
	i18n.global.mergeLocaleMessage(locale, translations);
	const messages = flatten((i18n.global.messages.value as Record<string, any>)[locale]);
	const translationKeys = Object.keys(messages);

	test(`import ${locale} language file successfully`, () => {
		expect(isImported).toBe(true);
	});

	test.each(translationKeys)('%s', (key) => {
		i18n.global.t(key);
		expect(consoleErrorSpy).not.toBeCalled();
	});
});
