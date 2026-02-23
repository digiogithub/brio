<template>
	<component
		:is="url ? 'a' : 'div'"
		v-tooltip.right="urlTooltip"
		:href="url"
		:target="url ? '_blank' : undefined"
		:rel="url ? 'noopener noreferrer' : undefined"
		class="module-bar-logo"
		:class="{ loading: showLoader }"
	>
		<template v-if="customLogoPath">
			<transition name="fade">
				<v-progress-linear v-if="showLoader" indeterminate rounded @animationiteration="stopSpinnerIfQueueIsEmpty" />
			</transition>
			<img class="custom-logo" :src="customLogoPath" alt="Project Logo" />
		</template>
		<template v-else>
			<transition name="fade">
				<v-progress-linear v-if="showLoader" indeterminate rounded @animationiteration="stopSpinnerIfQueueIsEmpty" />
			</transition>
			<img class="default-logo" src="/img/brio-logo.svg" alt="Brio" />
		</template>
	</component>
</template>

<script lang="ts">
import { useRequestsStore } from '@/stores/requests';
import { useSettingsStore } from '@/stores/settings';
import { computed, defineComponent, ref, toRefs, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getRootPath } from '@/utils/get-root-path';

export default defineComponent({
	setup() {
		const { t } = useI18n();

		const requestsStore = useRequestsStore();
		const settingsStore = useSettingsStore();

		const customLogoPath = computed<string | null>(() => {
			if (settingsStore.settings === null) return null;
			if (!settingsStore.settings?.project_logo) return null;
			return `${getRootPath()}assets/${settingsStore.settings.project_logo}`;
		});

		const showLoader = ref(false);

		const { queueHasItems } = toRefs(requestsStore);

		watch(
			() => queueHasItems.value,
			(hasItems) => {
				if (hasItems) showLoader.value = true;
			}
		);

		const url = computed(() => settingsStore.settings?.project_url);

		const urlTooltip = computed(() => {
			return settingsStore.settings?.project_url ? t('view_project') : false;
		});

		return {
			customLogoPath,
			showLoader,
			stopSpinnerIfQueueIsEmpty,
			url,
			urlTooltip,
		};

		function stopSpinnerIfQueueIsEmpty() {
			if (queueHasItems.value === false) showLoader.value = false;
		}
	},
});
</script>

<style lang="scss" scoped>
.module-bar-logo {
	--v-progress-linear-height: 2px;
	--v-progress-linear-color: var(--white);
	--v-progress-linear-background-color: rgb(255 255 255 / 0.5);

	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 60px;
	height: 60px;
	padding: 12px;
	background-color: var(--brand);

	.v-progress-linear {
		position: absolute;
		right: 10px;
		bottom: 5px;
		left: 10px;
		width: 40px;
	}

	.custom-logo {
		display: block;
		width: 36px;
		height: 36px;
		object-fit: contain;
	}

	/* Original SVG uses black fill; invert it to white for the dark sidebar */
	.default-logo {
		display: block;
		width: 36px;
		height: 36px;
		object-fit: contain;
		filter: brightness(0) invert(1);

		/* Color variants — apply via a wrapper class or v-bind */
		&.dark {
			filter: brightness(0); /* keep black on light backgrounds */
		}

		&.brand {
			filter: brightness(0) saturate(1) invert(0.5) sepia(1) saturate(4) hue-rotate(120deg);
		}
	}
}

.fade-enter-active {
	transition: opacity var(--slow) var(--transition);
}

.fade-leave-active {
	transition: opacity var(--medium) var(--transition);
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
