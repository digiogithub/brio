<template>
	<div class="age-encrypted">
		<div v-if="isEncrypted && !revealed" class="row">
			<v-input :class="{ danger: Boolean(decryptError) }" :model-value="maskedLabel" disabled />
			<v-button small :loading="busy" :disabled="disabled" @click="reveal">Reveal</v-button>
			<v-button small secondary :disabled="disabled" @click="clear">Clear</v-button>
		</div>

		<v-notice v-if="decryptError" class="notice" type="danger">
			{{ decryptError }}
		</v-notice>

		<div v-else class="row">
			<v-textarea
				v-if="multiline"
				:disabled="disabled"
				:model-value="plaintext"
				@update:model-value="onInput"
			/>
			<v-input v-else :disabled="disabled" :model-value="plaintext" @update:model-value="onInput" />

			<v-button v-if="isEncrypted && revealed" small secondary :disabled="disabled" @click="hide">Hide</v-button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useApi } from '@brio/extensions-sdk';

const ARMOR_BEGIN = '-----BEGIN AGE ENCRYPTED FILE-----';

const props = defineProps<{
	value: string | null;
	disabled?: boolean;
	options?: { multiline?: boolean };
}>();

const emit = defineEmits<{
	(e: 'input', value: string | null): void;
}>();

const api = useApi();

const revealed = ref(false);
const busy = ref(false);
const plaintext = ref('');
const encryptedValue = ref<string | null>(null);
const decryptError = ref<string | null>(null);

const multiline = computed(() => Boolean(props.options?.multiline));

const isEncrypted = computed(() => typeof props.value === 'string' && props.value.startsWith(ARMOR_BEGIN));
const maskedLabel = computed(() => (props.value ? '•••••••• (encrypted)' : ''));

watch(
	() => props.value,
	(val) => {
		if (typeof val === 'string' && val.startsWith(ARMOR_BEGIN)) {
			encryptedValue.value = val;
		}
		if (!revealed.value) {
			plaintext.value = typeof val === 'string' && !isEncrypted.value ? val : '';
		}
		decryptError.value = null;
	},
	{ immediate: true },
);

function onInput(val: string) {
	plaintext.value = val;
	emit('input', val);
}

function clear() {
	revealed.value = false;
	plaintext.value = '';
	decryptError.value = null;
	emit('input', null);
}

function hide() {
	revealed.value = false;
	plaintext.value = '';
	decryptError.value = null;
	emit('input', encryptedValue.value);
}

async function reveal() {
	if (!props.value) return;
	if (isEncrypted.value) encryptedValue.value = props.value;
	decryptError.value = null;
	busy.value = true;
	try {
		const { data } = await api.post('/age-encryption/decrypt', { ciphertext: props.value });
		plaintext.value = data?.plaintext ?? '';
		revealed.value = true;
		emit('input', plaintext.value);
	} catch {
		decryptError.value = 'Unable to decrypt: private key missing/invalid or you are not allowed to decrypt this value.';
	} finally {
		busy.value = false;
	}
}
</script>

<style scoped>
.row {
	display: flex;
	gap: 8px;
	align-items: center;
}
.age-encrypted :deep(textarea) {
	min-height: 120px;
}

.notice {
	margin-top: 8px;
}

.age-encrypted :deep(.input.danger),
.age-encrypted :deep(.danger .input) {
	border-color: var(--theme--danger);
}
</style>
