<template>
	<private-view :title="t('settings_extensions')">
		<template #headline>
			<v-breadcrumb :items="[{ name: t('settings'), to: '/settings' }]" />
		</template>

		<template #title-outer:prepend>
			<v-button class="header-icon" rounded icon exact disabled>
				<v-icon name="extension" />
			</v-button>
		</template>

		<template #navigation>
			<settings-navigation />
		</template>

		<div class="extensions-page">
			<v-info v-if="!loading && extensions.length === 0" :title="t('extensions_count', 0)" icon="extension" center type="info">
				{{ t('no_extensions_copy') }}
			</v-info>

			<template v-else>
				<div v-for="group in groupedExtensions" :key="group.type" class="extension-group">
					<h2 class="group-title type-label">{{ formatType(group.type) }}</h2>
					<v-table
						:headers="headers"
						:items="group.extensions"
						:loading="loading"
						show-resize
					>
						<template #[`item.local`]="{ item }">
							<v-chip x-small :class="item.local ? 'local' : 'package'">
								{{ item.local ? t('extension_local') : t('package') }}
							</v-chip>
						</template>
						<template #[`item.version`]="{ item }">
							<span class="monospace">{{ item.version ?? '—' }}</span>
						</template>
						<template #[`item.host`]="{ item }">
							<span class="monospace">{{ item.host ?? '—' }}</span>
						</template>
					</v-table>
				</div>
			</template>
		</div>
	</private-view>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import api from '@/api';
import SettingsNavigation from '../../components/navigation.vue';

interface ExtensionInfo {
	name: string;
	type: string;
	local: boolean;
	version?: string;
	host?: string;
	entries?: { name: string; type: string }[];
}

export default defineComponent({
	components: { SettingsNavigation },
	setup() {
		const { t } = useI18n();

		const loading = ref(false);
		const extensions = ref<ExtensionInfo[]>([]);

		const headers = [
			{ text: t('name'), value: 'name', width: 280 },
			{ text: t('extension_version'), value: 'version', width: 120 },
			{ text: 'Host', value: 'host', width: 120 },
			{ text: t('extension_local'), value: 'local', width: 100 },
		];

		const EXTENSION_TYPES = ['interface', 'display', 'layout', 'module', 'panel', 'hook', 'endpoint', 'operation', 'bundle'];

		const groupedExtensions = computed(() => {
			return EXTENSION_TYPES.map((type) => ({
				type,
				extensions: extensions.value.filter((ext) => ext.type === type),
			})).filter((g) => g.extensions.length > 0);
		});

		function formatType(type: string): string {
			return type.charAt(0).toUpperCase() + type.slice(1) + 's';
		}

		async function fetchExtensions() {
			loading.value = true;
			try {
				// Fetch all extension types in parallel
				const types = ['interfaces', 'displays', 'layouts', 'modules', 'panels', 'hooks', 'endpoints', 'operations', 'bundles'];
				const results = await Promise.allSettled(types.map((type) => api.get(`/extensions/${type}`)));

				const all: ExtensionInfo[] = [];
				for (const result of results) {
					if (result.status === 'fulfilled' && result.value?.data?.data) {
						all.push(...result.value.data.data);
					}
				}

				extensions.value = all;
			} catch {
				// silently ignore
			} finally {
				loading.value = false;
			}
		}

		onMounted(fetchExtensions);

		return { t, loading, extensions, headers, groupedExtensions, formatType };
	},
});
</script>

<style scoped>
.extensions-page {
	padding: var(--content-padding);
	padding-top: 0;
	padding-bottom: var(--content-padding-bottom);
}

.extension-group {
	margin-bottom: 32px;
}

.group-title {
	margin-bottom: 8px;
	text-transform: capitalize;
	color: var(--foreground-subdued);
}

.monospace {
	font-family: var(--family-monospace);
	font-size: 12px;
}

.local {
	--v-chip-color: var(--primary);
	--v-chip-background-color: var(--primary-10);
}

.package {
	--v-chip-color: var(--foreground-subdued);
	--v-chip-background-color: var(--background-subdued);
}
</style>
