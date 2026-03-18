import api, { replaceQueue } from '@/api';
import { AUTH_SSO_DRIVERS, DEFAULT_AUTH_DRIVER, DEFAULT_AUTH_PROVIDER } from '@/constants';
import { i18n } from '@/lang';
import { setLanguage } from '@/lang/set-language';
import formatTitle from '@directus/format-title';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, reactive, unref } from 'vue';
import { useUserStore } from '@/stores/user';

type HydrateOptions = {
	/**
	 * Allow setting current admin language only when default language gets updated.
	 */
	isLanguageUpdated?: boolean;
};

export type Info = {
	project: null | {
		project_name: string | null;
		project_descriptor: string | null;
		project_logo: string | null;
		project_color: string | null;
		default_language: string | null;
		public_foreground: string | null;
		public_background: string | null;
		public_note: string | null;
		custom_css: string | null;
	};
	brio?: {
		version: string;
	};
	node?: {
		version: string;
		uptime: number;
	};
	os?: {
		type: string;
		version: string;
		uptime: number;
		totalmem: number;
	};
	rateLimit?:
	| false
	| {
		points: number;
		duration: number;
	};
	flows?: {
		execAllowedModules: string[];
	};
	ai_enabled?: boolean;
	embeddings_enabled?: boolean;
	mcp_enabled?: boolean;
	vector_supported?: boolean;
	vector_capabilities?: Record<string, any> | null;
};

export type Auth = {
	providers: { driver: string; name: string }[];
	disableDefault: boolean;
};

export const useServerStore = defineStore('serverStore', () => {
	const info = reactive<Info>({
		project: null,
		brio: undefined,
		node: undefined,
		os: undefined,
		rateLimit: undefined,
		flows: undefined,
		ai_enabled: false,
		embeddings_enabled: false,
		mcp_enabled: false,
		vector_supported: undefined,
		vector_capabilities: null,
	});

	const auth = reactive<Auth>({
		providers: [],
		disableDefault: false,
	});

	const providerOptions = computed(() => {
		const options = auth.providers
			.filter((provider) => !AUTH_SSO_DRIVERS.includes(provider.driver))
			.map((provider) => ({ text: formatTitle(provider.name), value: provider.name, driver: provider.driver }));

		if (!auth.disableDefault) {
			options.unshift({
				text: i18n.global.t('default_provider'),
				value: DEFAULT_AUTH_PROVIDER,
				driver: DEFAULT_AUTH_DRIVER,
			});
		}

		return options;
	});

	const hydrate = async (options?: HydrateOptions) => {
		const [serverInfoResponse, authResponse] = await Promise.all([
			api.get(`/server/info`, { params: { limit: -1 } }),
			api.get('/auth'),
		]);

		info.project = serverInfoResponse.data.data?.project;
		info.brio = serverInfoResponse.data.data?.brio;
		info.node = serverInfoResponse.data.data?.node;
		info.os = serverInfoResponse.data.data?.os;
		info.flows = serverInfoResponse.data.data?.flows;
		info.ai_enabled = serverInfoResponse.data.data?.ai_enabled;
		info.embeddings_enabled = serverInfoResponse.data.data?.embeddings_enabled;
		info.mcp_enabled = serverInfoResponse.data.data?.mcp_enabled;
		info.vector_supported = serverInfoResponse.data.data?.vector_supported;
		info.vector_capabilities = serverInfoResponse.data.data?.vector_capabilities ?? null;

		auth.providers = authResponse.data.data;
		auth.disableDefault = authResponse.data.disableDefault;

		const { currentUser } = useUserStore();

		// set language as default locale before login
		// or reset language for admin when they update it without having their own language set
		if (!currentUser || (options?.isLanguageUpdated === true && !currentUser?.language)) {
			await setLanguage(unref(info)?.project?.default_language ?? 'en-US');
		}

		if (serverInfoResponse.data.data?.rateLimit !== undefined) {
			if (serverInfoResponse.data.data?.rateLimit === false) {
				await replaceQueue();
			} else {
				const { duration, points } = serverInfoResponse.data.data.rateLimit;
				await replaceQueue({ intervalCap: points - 10, interval: duration * 1000, carryoverConcurrencyCount: true });
			}
		}
	};

	const dehydrate = () => {
		info.project = null;
		info.brio = undefined;
		info.node = undefined;
		info.os = undefined;
		info.ai_enabled = false;
		info.embeddings_enabled = false;
		info.mcp_enabled = false;
		info.vector_supported = undefined;
		info.vector_capabilities = null;

		auth.providers = [];
		auth.disableDefault = false;
	};

	return { info, auth, providerOptions, hydrate, dehydrate };
});

if (import.meta.hot) {
	import.meta.hot.accept(acceptHMRUpdate(useServerStore, import.meta.hot));
}
