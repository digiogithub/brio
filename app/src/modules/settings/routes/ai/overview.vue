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
			/>

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
import { computed, defineComponent, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import SettingsNavigation from '../../components/navigation.vue';
import { useEditsGuard } from '@/composables/use-edits-guard';
import { useShortcut } from '@/composables/use-shortcut';
import { useServerStore } from '@/stores/server';
import { useSettingsStore } from '@/stores/settings';

const MCP_FIELDS = [
	'mcp_group',
	'mcp_enabled',
	'mcp_allow_deletes',
	'mcp_prompts_collection',
	'mcp_system_prompt_enabled',
	'mcp_system_prompt',
];

export default defineComponent({
	components: { SettingsNavigation },
	setup() {
		const { t } = useI18n();
		const router = useRouter();
		const settingsStore = useSettingsStore();
		const serverStore = useServerStore();
		const { fields: allFields } = useCollection('directus_settings');

		const aiFields = computed(() => allFields.value.filter((field) => field.meta?.group === 'ai_group' || field.field === 'ai_group'));
		const mcpFields = computed(() => allFields.value.filter((field) => MCP_FIELDS.includes(field.field)));

		const initialValues = ref(clone(settingsStore.settings));
		const aiEdits = ref<Record<string, any> | null>(null);
		const mcpEdits = ref<Record<string, any> | null>(null);
		const hasEdits = computed(
			() =>
				(aiEdits.value !== null && Object.keys(aiEdits.value).length > 0) ||
				(mcpEdits.value !== null && Object.keys(mcpEdits.value).length > 0),
		);
		const saving = ref(false);

		useShortcut('meta+s', () => {
			if (hasEdits.value) save();
		});

		const { confirmLeave, leaveTo } = useEditsGuard(hasEdits);

		return {
			t,
			serverStore,
			aiFields,
			mcpFields,
			initialValues,
			aiEdits,
			mcpEdits,
			hasEdits,
			saving,
			confirmLeave,
			leaveTo,
			save,
			discardAndLeave,
		};

		async function save() {
			const combinedEdits = { ...(aiEdits.value ?? {}), ...(mcpEdits.value ?? {}) };
			if (Object.keys(combinedEdits).length === 0) return;
			saving.value = true;
			await settingsStore.updateSettings(combinedEdits);
			await serverStore.hydrate();
			aiEdits.value = null;
			mcpEdits.value = null;
			saving.value = false;
			initialValues.value = clone(settingsStore.settings);
		}

		function discardAndLeave() {
			if (!leaveTo.value) return;
			aiEdits.value = null;
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
	margin-bottom: var(--theme--form--row-gap);
}

.mcp-section {
	margin-top: var(--theme--form--row-gap);
}

.header-icon {
	--v-button-background-color-disabled: var(--primary-10);
	--v-button-color-disabled: var(--primary);
	--v-button-background-color-hover-disabled: var(--primary-25);
	--v-button-color-hover-disabled: var(--primary);
}
</style>
