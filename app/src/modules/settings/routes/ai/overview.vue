<template>
	<private-view :title="t('settings_ai')">
		<template #headline><v-breadcrumb :items="[{ name: t('settings'), to: '/settings' }]" /></template>
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded icon exact disabled>
				<v-icon name="smart_toy" />
			</v-button>
		</template>

		<template #actions>
			<v-button v-tooltip.bottom="t('save')" icon rounded :disabled="!hasEdits" :loading="saving" @click="save">
				<v-icon name="check" />
			</v-button>
		</template>

		<template #navigation>
			<settings-navigation />
		</template>

		<div class="settings">
			<v-notice v-if="!serverStore.info.ai_enabled" type="warning" class="disabled-notice">
				{{ t('ai_disabled_by_env') }}
			</v-notice>
			<v-form
				v-model="aiEdits"
				:initial-values="initialValues"
				:fields="aiFields"
				:primary-key="1"
				:disabled="!serverStore.info.ai_enabled"
				:show-no-visible-fields="false"
			/>

			<div class="embeddings-section">
				<v-notice v-if="!serverStore.info.embeddings_enabled" type="warning" class="disabled-notice">
					{{ t('embeddings_disabled_by_env') }}
				</v-notice>
				<v-notice v-else-if="vectorStatusNotice" :type="vectorStatusNotice.type" class="capability-notice">
					<span>{{ vectorStatusNotice.message }}</span>
					<span v-if="vectorStatusNotice.setupUrl">
						&nbsp;
						<a
							class="external-link"
							:href="vectorStatusNotice.setupUrl"
							target="_blank"
							rel="noopener noreferrer"
						>
							{{ t('vector_capability_setup_link') }}
						</a>
					</span>
				</v-notice>

				<v-notice v-if="selectedProviderMeta" type="info" class="provider-notice">
					<div class="provider-title">{{ t('embeddings_provider_guidance_title', { provider: selectedProviderMeta.label }) }}</div>
					<div>{{ t('embeddings_provider_guidance_body') }}</div>
					<div v-if="selectedProviderMeta.defaultModel">
						{{ t('embeddings_provider_default_model', { model: selectedProviderMeta.defaultModel }) }}
					</div>
					<div v-if="selectedProviderMeta.defaultBaseUrl">
						{{ t('embeddings_provider_default_base_url', { baseUrl: selectedProviderMeta.defaultBaseUrl }) }}
					</div>
					<div class="provider-actions">
						<v-button x-small secondary :disabled="!canApplyProviderDefaults" @click="applyProviderDefaults">
							{{ t('embeddings_apply_provider_defaults') }}
						</v-button>
						<a
							v-if="selectedProviderMeta.docsUrl"
							class="external-link"
							:href="selectedProviderMeta.docsUrl"
							target="_blank"
							rel="noopener noreferrer"
						>
							{{ t('embeddings_provider_docs_link') }}
						</a>
					</div>
				</v-notice>

				<v-form
					v-model="embeddingsEdits"
					:initial-values="initialValues"
					:fields="embeddingsFields"
					:primary-key="1"
					:disabled="!serverStore.info.embeddings_enabled"
				/>
			</div>

			<div class="mcp-section">
				<v-notice v-if="!serverStore.info.mcp_enabled" type="warning" class="disabled-notice">
					{{ t('mcp_disabled_by_env') }}
				</v-notice>
				<v-form
					v-model="mcpEdits"
					:initial-values="initialValues"
					:fields="mcpFields"
					:primary-key="1"
					:disabled="!serverStore.info.mcp_enabled"
				/>
			</div>
		</div>

		<v-dialog v-model="confirmLeave" @esc="confirmLeave = false">
			<v-card>
				<v-card-title>{{ t('unsaved_changes') }}</v-card-title>
				<v-card-text>{{ t('unsaved_changes_copy') }}</v-card-text>
				<v-card-actions>
					<v-button secondary @click="discardAndLeave">{{ t('discard_changes') }}</v-button>
					<v-button @click="confirmLeave = false">{{ t('keep_editing') }}</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</private-view>
</template>

<script lang="ts">
import { useCollection } from '@brio/composables';
import { clone } from 'lodash';
import { computed, defineComponent, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import SettingsNavigation from '../../components/navigation.vue';
import { useEditsGuard } from '@/composables/use-edits-guard';
import { useShortcut } from '@/composables/use-shortcut';
import { useServerStore } from '@/stores/server';
import { useSettingsStore } from '@/stores/settings';

const EMBEDDINGS_FIELDS = [
	'embeddings_group',
	'embeddings_provider',
	'embeddings_model',
	'embeddings_api_key',
	'embeddings_base_url',
	'embeddings_dimensions',
	'embeddings_batch_size',
];

const MCP_FIELDS = [
	'mcp_group',
	'mcp_enabled',
	'mcp_allow_deletes',
	'mcp_prompts_collection',
	'mcp_system_prompt_enabled',
	'mcp_system_prompt',
];

const EMBEDDINGS_PROVIDER_META = {
	openai: {
		label: 'OpenAI',
		defaultModel: 'text-embedding-3-small',
		defaultBaseUrl: 'https://api.openai.com/v1',
		docsUrl: 'https://platform.openai.com/docs/guides/embeddings',
	},
	gemini: {
		label: 'Google Gemini',
		defaultModel: 'text-embedding-004',
		defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
		docsUrl: 'https://ai.google.dev/gemini-api/docs/embeddings',
	},
	openrouter: {
		label: 'OpenRouter',
		defaultModel: 'openai/text-embedding-3-small',
		defaultBaseUrl: 'https://openrouter.ai/api/v1',
		docsUrl: 'https://openrouter.ai/docs/api-reference/embeddings',
	},
	ollama: {
		label: 'Ollama',
		defaultModel: 'nomic-embed-text',
		defaultBaseUrl: 'http://localhost:11434/v1',
		docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
	},
	custom: {
		label: 'Custom',
		defaultModel: '',
		defaultBaseUrl: '',
		docsUrl: '',
	},
} as const;

export default defineComponent({
	components: { SettingsNavigation },
	setup() {
		const { t } = useI18n();
		const router = useRouter();
		const settingsStore = useSettingsStore();
		const serverStore = useServerStore();
		const { fields: allFields } = useCollection('brio_settings');

		const aiFields = computed(() => allFields.value.filter((field) => field.meta?.group === 'ai_group' || field.field === 'ai_group'));
		const embeddingsFields = computed(() => allFields.value.filter((field) => EMBEDDINGS_FIELDS.includes(field.field)));
		const mcpFields = computed(() => allFields.value.filter((field) => MCP_FIELDS.includes(field.field)));

		const initialValues = ref(clone(settingsStore.settings));
		const aiEdits = ref<Record<string, any> | null>(null);
		const embeddingsEdits = ref<Record<string, any> | null>(null);
		const mcpEdits = ref<Record<string, any> | null>(null);
		const hasEdits = computed(
			() =>
				(aiEdits.value !== null && Object.keys(aiEdits.value).length > 0) ||
				(embeddingsEdits.value !== null && Object.keys(embeddingsEdits.value).length > 0) ||
				(mcpEdits.value !== null && Object.keys(mcpEdits.value).length > 0),
		);
		const saving = ref(false);

		useShortcut('meta+s', () => {
			if (hasEdits.value) save();
		});

		const { confirmLeave, leaveTo } = useEditsGuard(hasEdits);

		const selectedEmbeddingsProvider = computed(() => {
			const provider =
				embeddingsEdits.value?.embeddings_provider ?? (initialValues.value as Record<string, any>)?.embeddings_provider;
			if (typeof provider !== 'string' || provider.trim() === '') return null;
			return provider.trim().toLowerCase();
		});

		const selectedProviderMeta = computed(() => {
			const provider = selectedEmbeddingsProvider.value;
			if (!provider) return null;
			if (provider === 'custom') {
				return { ...EMBEDDINGS_PROVIDER_META.custom, label: t('custom') };
			}
			return EMBEDDINGS_PROVIDER_META[provider as keyof typeof EMBEDDINGS_PROVIDER_META] ?? null;
		});

		const vectorStatusNotice = computed(() => {
			if (!serverStore.info.embeddings_enabled) return null;

			const info = serverStore.info as Record<string, any>;
			const vectorCapabilities =
				(typeof info.vector_capabilities === 'object' && info.vector_capabilities !== null
					? info.vector_capabilities
					: undefined) ??
				(typeof info.vectorCapabilities === 'object' && info.vectorCapabilities !== null
					? info.vectorCapabilities
					: undefined) ??
				(typeof info.vector_db === 'object' && info.vector_db !== null ? info.vector_db : undefined) ??
				(typeof info.vectorDatabase === 'object' && info.vectorDatabase !== null ? info.vectorDatabase : undefined);

			const support =
				([vectorCapabilities?.supported, vectorCapabilities?.available, info.vector_supported, info.vector_enabled].find(
					(value) => typeof value === 'boolean',
				) as boolean | undefined) ?? null;
			const backend =
				([vectorCapabilities?.database, vectorCapabilities?.client, vectorCapabilities?.driver, info.db_client].find(
					(value) => typeof value === 'string' && value.trim() !== '',
				) as string | undefined) ?? null;
			const extension =
				([vectorCapabilities?.extension, vectorCapabilities?.adapter].find(
					(value) => typeof value === 'string' && value.trim() !== '',
				) as string | undefined) ?? null;

			let setupUrl =
				([vectorCapabilities?.setup_url, vectorCapabilities?.setupUrl].find(
					(value) => typeof value === 'string' && value.trim() !== '',
				) as string | undefined) ?? null;

			if (!setupUrl && backend) {
				const normalizedBackend = backend.toLowerCase();
				if (normalizedBackend.includes('post')) setupUrl = 'https://github.com/pgvector/pgvector';
				if (normalizedBackend.includes('sqlite')) setupUrl = 'https://github.com/asg017/sqlite-vec';
			}

			const backendLabel = [backend, extension].filter(Boolean).join(' / ');

			if (support === true) {
				return {
					type: 'success',
					message: backendLabel
						? t('vector_capability_ready_with_backend', { backend: backendLabel })
						: t('vector_capability_ready'),
					setupUrl: null,
				};
			}

			if (support === false) {
				return {
					type: 'warning',
					message: backendLabel
						? t('vector_capability_missing_with_backend', { backend: backendLabel })
						: t('vector_capability_missing'),
					setupUrl,
				};
			}

			return {
				type: 'info',
				message: backendLabel
					? t('vector_capability_unknown_with_backend', { backend: backendLabel })
					: t('vector_capability_unknown'),
				setupUrl,
			};
		});

		const canApplyProviderDefaults = computed(() => {
			const providerMeta = selectedProviderMeta.value;
			if (!providerMeta) return false;
			const currentModel = getEmbeddingValue('embeddings_model');
			const currentBaseUrl = getEmbeddingValue('embeddings_base_url');
			return (
				(Boolean(providerMeta.defaultModel) && isEmptyValue(currentModel)) ||
				(Boolean(providerMeta.defaultBaseUrl) && isEmptyValue(currentBaseUrl))
			);
		});

		watch(selectedEmbeddingsProvider, (provider, previous) => {
			if (!provider || provider === previous) return;
			applyProviderDefaults();
		});

		return {
			t,
			serverStore,
			aiFields,
			embeddingsFields,
			mcpFields,
			initialValues,
			aiEdits,
			embeddingsEdits,
			mcpEdits,
			hasEdits,
			saving,
			selectedProviderMeta,
			vectorStatusNotice,
			canApplyProviderDefaults,
			confirmLeave,
			leaveTo,
			save,
			applyProviderDefaults,
			discardAndLeave,
		};

		async function save() {
			const combinedEdits = { ...(aiEdits.value ?? {}), ...(embeddingsEdits.value ?? {}), ...(mcpEdits.value ?? {}) };
			if (Object.keys(combinedEdits).length === 0) return;
			saving.value = true;
			await settingsStore.updateSettings(combinedEdits);
			await serverStore.hydrate();
			aiEdits.value = null;
			embeddingsEdits.value = null;
			mcpEdits.value = null;
			saving.value = false;
			initialValues.value = clone(settingsStore.settings);
		}

		function applyProviderDefaults() {
			const providerMeta = selectedProviderMeta.value;
			if (!providerMeta) return;

			const nextEdits = { ...(embeddingsEdits.value ?? {}) };
			let changed = false;

			if (providerMeta.defaultModel && isEmptyValue(getEmbeddingValue('embeddings_model'))) {
				nextEdits.embeddings_model = providerMeta.defaultModel;
				changed = true;
			}

			if (providerMeta.defaultBaseUrl && isEmptyValue(getEmbeddingValue('embeddings_base_url'))) {
				nextEdits.embeddings_base_url = providerMeta.defaultBaseUrl;
				changed = true;
			}

			if (changed) embeddingsEdits.value = nextEdits;
		}

		function getEmbeddingValue(field: 'embeddings_model' | 'embeddings_base_url') {
			const edited = embeddingsEdits.value?.[field];
			if (edited !== undefined) return edited;
			return (initialValues.value as Record<string, any>)?.[field];
		}

		function isEmptyValue(value: unknown) {
			return value === null || value === undefined || value === '';
		}

		function discardAndLeave() {
			if (!leaveTo.value) return;
			aiEdits.value = null;
			embeddingsEdits.value = null;
			mcpEdits.value = null;
			confirmLeave.value = false;
			router.push(leaveTo.value);
		}
	},
});
</script>

<style lang="scss" scoped>
.settings {
	padding: var(--content-padding);
	padding-bottom: var(--content-padding-bottom);
}

.disabled-notice {
	margin-bottom: var(--form-vertical-gap, 40px);
}

.capability-notice {
	margin-bottom: var(--form-vertical-gap, 40px);
}

.mcp-section {
	margin-top: var(--form-vertical-gap, 40px);
}

.embeddings-section {
	margin-top: var(--form-vertical-gap, 40px);
}

.provider-notice {
	display: grid;
	gap: 6px;
	margin-bottom: var(--form-vertical-gap, 40px);
}

.provider-title {
	font-weight: 600;
}

.provider-actions {
	display: flex;
	align-items: center;
	gap: 10px;
}

.external-link {
	color: var(--primary);
}

.header-icon {
	--v-button-background-color-disabled: var(--primary-10);
	--v-button-color-disabled: var(--primary);
	--v-button-background-color-hover-disabled: var(--primary-25);
	--v-button-color-hover-disabled: var(--primary);
}
</style>
