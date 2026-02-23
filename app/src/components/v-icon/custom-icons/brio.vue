<template>
	<!-- Reference external SVG file instead of embedding paths inline -->
	<img class="brio-custom-icon" :src="brioLogoSrc" aria-hidden="true" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { getRootPath } from '@/utils/get-root-path';

export default defineComponent({
	setup() {
		return {
			brioLogoSrc: `${getRootPath()}admin/img/brio-logo.svg`,
		};
	},
});
</script>

<style scoped>
.brio-custom-icon {
	width: 100%;
	height: 100%;
	object-fit: contain;
	/*
	 * The SVG source uses black fill (#000000).
	 * brightness(0) forces all pixels to black so the icon matches
	 * the dark foreground text colour on light/mint backgrounds.
	 * On dark backgrounds (e.g. module bar) the parent component
	 * applies its own filter to invert to white.
	 */
	filter: brightness(0);
}
</style>
