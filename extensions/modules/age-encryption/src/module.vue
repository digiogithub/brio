<template>
	<private-view title="Age Encryption">
		<div class="page">
			<p>
				Manage the <code>age</code> public (recipient) and private (identity) keys.
				Keys can be provided by environment variables and are persisted into Directus Settings for operational use.
			</p>

			<div class="actions">
				<v-button :loading="busy" @click="regenerate">Regenerate keypair</v-button>
				<v-button
					v-if="status?.identity?.source === 'settings' && status?.identity?.value"
					small
					secondary
					:loading="busyDelete"
					@click="deletePrivateKey"
				>
					Delete private key
				</v-button>
				<v-button small secondary :loading="busyRefresh" @click="refresh">Refresh</v-button>
			</div>

			<v-notice v-if="status?.warning" type="warning">
				{{ status.warning }}
			</v-notice>

			<div v-if="status" class="result">
				<h2>Recipient (public key)</h2>
				<v-input :model-value="status.recipient?.value ?? ''" readonly />
				<p class="meta">
					Source:
					<code>{{ status.recipient?.source ?? 'missing' }}</code>
					<span v-if="status.storedIn">— stored in settings field <code>{{ status.storedIn }}</code></span>
				</p>

				<h2>Identity (private key)</h2>
				<v-notice v-if="status.canDecrypt === false" type="warning">
					Private key not configured. Decryption will not be possible.
				</v-notice>
				<v-textarea
					:model-value="status.identity?.value ?? (status.identity?.source ? '[configured — redacted]' : '')"
					readonly
				/>
				<p class="meta">
					Source:
					<code>{{ status.identity?.source ?? 'missing' }}</code>
				</p>

				<v-notice v-if="status.canDecrypt === false" type="warning">
					Decryption is currently disabled (missing or invalid private key).
				</v-notice>
			</div>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useApi } from '@brio/extensions-sdk';

const api = useApi();

const busy = ref(false);
const busyRefresh = ref(false);
const busyDelete = ref(false);

type KeySource = 'env' | 'settings' | null;
type KeyStatus = { value: string | null; source: KeySource };
type StatusResponse = {
	recipient: KeyStatus;
	identity: KeyStatus;
	canDecrypt: boolean;
	storedIn: string | null;
	warning?: string;
};

const status = ref<StatusResponse | null>(null);

async function refresh() {
	busyRefresh.value = true;
	try {
		const { data } = await api.get('/age-encryption/status');
		status.value = data;
	} finally {
		busyRefresh.value = false;
	}
}

async function regenerate() {
	busy.value = true;
	try {
		const { data } = await api.post('/age-encryption/generate-keypair');
		status.value = data;
	} finally {
		busy.value = false;
	}
}

async function deletePrivateKey() {
	busyDelete.value = true;
	try {
		const { data } = await api.post('/age-encryption/delete-private-key');
		status.value = data;
	} finally {
		busyDelete.value = false;
	}
}

onMounted(() => {
	void refresh();
});
</script>

<style scoped>
.page {
	padding: 24px;
	max-width: 900px;
}
.actions {
	display: flex;
	gap: 12px;
	align-items: center;
	flex-wrap: wrap;
	margin: 12px 0 18px;
}
.result {
	margin-top: 24px;
	display: grid;
	gap: 12px;
}
.meta {
	margin: 0;
	color: var(--theme--foreground-subdued);
}
</style>
