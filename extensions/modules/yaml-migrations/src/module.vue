<template>
	<private-view title="YAML Migrations">
		<div class="page">
			<p>
				Manage schema + data migrations stored as YAML files in the configured migrations directory.
			</p>
			<p v-if="migrationsDir" class="muted">Migrations directory: <code>{{ migrationsDir }}</code></p>

			<div class="export">
				<h3 class="section-title">Export snapshot</h3>
				<p class="muted">
					Choose exactly which collections should be included in the schema snapshot and which collections should have data exported.
					Internal Brio collections (<code>brio_*</code>) are listed separately.
				</p>

				<div class="export-controls">
					<v-checkbox v-model="exportIncludeData" label="Include data" />
					<v-checkbox v-model="exportMarkApplied" label="Mark exported migration as applied" />
					<v-input v-model="exportLimit" :disabled="!exportIncludeData && !effectiveIncludeSystemData" type="number" placeholder="Limit per collection (default 500)" />
				</div>

				<div class="export-groups">
					<div class="export-group">
						<div class="group-header">
							<h4>Regular collections</h4>
							<div class="group-actions">
								<button class="link" type="button" @click="setAllRegularSchema(true)">Select all schema</button>
								<button class="link" type="button" @click="setAllRegularSchema(false)">Clear schema</button>
								<button class="link" type="button" :disabled="!exportIncludeData" @click="setAllRegularData(true)">Select all data</button>
								<button class="link" type="button" :disabled="!exportIncludeData" @click="setAllRegularData(false)">Clear data</button>
							</div>
						</div>
						<div class="collection-list">
							<div v-for="c in regularCollections" :key="c" class="collection-row">
								<code class="collection-name">{{ c }}</code>
								<v-checkbox v-model="exportSchemaSelected[c]" label="Schema" />
								<v-checkbox v-model="exportDataSelected[c]" :disabled="!exportIncludeData" label="Data" />
							</div>
						</div>
					</div>

					<div class="export-group">
						<div class="group-header">
							<h4>Internal Brio collections</h4>
							<div class="group-actions">
								<button class="link" type="button" @click="setAllInternalData(true)">Select all data</button>
								<button class="link" type="button" @click="setAllInternalData(false)">Clear data</button>
							</div>
						</div>
						<p class="muted">
							Schema export for internal collections is intentionally disabled to avoid generating migrations that would try to alter Directus internals.
						</p>

						<div class="system-presets">
							<v-checkbox v-model="exportPresetRoles" label="Roles" />
							<v-checkbox v-model="exportPresetPermissions" label="Permissions" />
							<v-checkbox v-model="exportPresetFlows" label="Flows" />
							<v-checkbox v-model="exportPresetPanels" label="Dashboards / Panels" />
						</div>

						<div class="collection-list">
							<div v-for="c in internalCollections" :key="c" class="collection-row">
								<code class="collection-name">{{ c }}</code>
								<span class="muted" style="min-width: 90px;">Schema</span>
								<v-checkbox v-model="exportInternalDataSelected[c]" label="Data" />
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="upload">
				<p class="muted">Upload an existing YAML migration file into the configured migrations directory.</p>
				<div class="upload-row">
					<input
						ref="uploadInputEl"
						type="file"
						accept=".yaml,.yml"
						class="upload-input-hidden"
						@change="onUploadSelected"
					/>
					<v-button :loading="busy" secondary @click="openFilePicker">Select file</v-button>
					<div class="upload-meta">
						<div v-if="uploadFileName" class="upload-filename"><code>{{ uploadFileName }}</code></div>
						<div v-else class="muted">No file selected.</div>
					</div>
					<v-checkbox v-model="uploadOverwrite" label="Overwrite if exists" />
					<v-checkbox v-model="uploadApplyAfter" label="Apply after upload" />
					<v-button :loading="busy" :disabled="!uploadFile" kind="primary" @click="uploadSelected">Upload file</v-button>
				</div>
			</div>

			<div class="actions">
				<v-button :loading="busy" @click="refresh">Refresh</v-button>
				<v-button :loading="busy" secondary @click="exportSnapshot">Export snapshot</v-button>
				<v-button :loading="busy" kind="primary" @click="applyPending">Apply pending</v-button>
				<v-checkbox v-model="applyForceSchema" label="Force schema (overwrite)" />
			</div>

			<v-notice v-if="error" type="danger">{{ error }}</v-notice>

			<div class="table" v-if="migrations.length">
				<table>
					<thead>
						<tr>
							<th></th>
							<th>Filename</th>
							<th>Status</th>
							<th>Applied at</th>
							<th>Actions</th>
							<th>Last result</th>
						</tr>
					</thead>
					<tbody>
						<template v-for="m in migrations" :key="m.filename">
							<tr>
								<td style="width: 36px;">
									<button class="expander" type="button" @click="toggleExpanded(m.filename)">
										{{ expanded[m.filename] ? '−' : '+' }}
									</button>
								</td>
								<td><code>{{ m.filename }}</code></td>
								<td>
									<span :class="['status', m.status]">{{ m.status }}</span>
								</td>
								<td>{{ m.appliedAt ?? '' }}</td>
								<td class="actions-cell">
									<v-button :loading="busy" secondary @click="applyOne(m.filename)">
										{{ m.status === 'pending' ? 'Apply' : 'Re-run' }}
									</v-button>
								</td>
								<td class="muted">
									<span v-if="m.lastRunAt">{{ m.lastRunAt }}</span>
									<span v-else>—</span>
								</td>
							</tr>
							<tr v-if="expanded[m.filename]">
								<td colspan="6" class="report-cell">
									<div class="report">
										<div class="report-header">
											<strong>Last apply report</strong>
											<span class="muted">(persisted)</span>
										</div>
										<pre class="report-pre">{{ formatReport(m.report) }}</pre>
									</div>
								</td>
							</tr>
						</template>
					</tbody>
				</table>
			</div>
			<p v-else class="muted">No migration files found.</p>
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useApi } from '@brio/extensions-sdk';

const api = useApi();

type MigrationRow = {
	filename: string;
	status: 'pending' | 'applied' | 'failed' | 'drifted';
	appliedAt: string | null;
	lastRunAt?: string | null;
	report?: string | null;
};

const busy = ref(false);
const error = ref<string | null>(null);
const migrations = ref<MigrationRow[]>([]);
const migrationsDir = ref<string | null>(null);

const regularCollections = ref<string[]>([]);
const internalCollections = ref<string[]>([]);

const expanded = reactive<Record<string, boolean>>({});

const applyForceSchema = ref(false);

const exportIncludeData = ref(false);
const exportMarkApplied = ref(true);
const exportLimit = ref<number | null>(null);

const exportSchemaSelected = reactive<Record<string, boolean>>({});
const exportDataSelected = reactive<Record<string, boolean>>({});
const exportInternalDataSelected = reactive<Record<string, boolean>>({});

const exportPresetRoles = ref(false);
const exportPresetPermissions = ref(false);
const exportPresetFlows = ref(false);
const exportPresetPanels = ref(false);

const uploadInputEl = ref<HTMLInputElement | null>(null);
const uploadFile = ref<File | null>(null);
const uploadFileName = computed(() => uploadFile.value?.name ?? '');
const uploadOverwrite = ref(false);
const uploadApplyAfter = ref(true);

const effectiveIncludeSystemData = computed(() => {
	return (
		exportPresetRoles.value ||
		exportPresetPermissions.value ||
		exportPresetFlows.value ||
		exportPresetPanels.value
	);
});

function toggleExpanded(filename: string) {
	expanded[filename] = !expanded[filename];
}

function ensureCollectionSelectionInitialized() {
	for (const c of regularCollections.value) {
		if (exportSchemaSelected[c] === undefined) exportSchemaSelected[c] = true;
		if (exportDataSelected[c] === undefined) exportDataSelected[c] = false;
	}
	for (const c of internalCollections.value) {
		if (exportInternalDataSelected[c] === undefined) exportInternalDataSelected[c] = false;
	}
}

function setAllRegularSchema(value: boolean) {
	for (const c of regularCollections.value) exportSchemaSelected[c] = value;
}

function setAllRegularData(value: boolean) {
	for (const c of regularCollections.value) exportDataSelected[c] = value;
}

function setAllInternalData(value: boolean) {
	for (const c of internalCollections.value) exportInternalDataSelected[c] = value;
}

function formatReport(raw: string | null | undefined): string {
	if (!raw) return 'No report stored yet.';
	try {
		const obj = JSON.parse(raw);
		return JSON.stringify(obj, null, 2);
	} catch {
		return raw;
	}
}

async function loadCollections() {
	try {
		const { data } = await api.get('/yaml-migrations/collections');
		regularCollections.value = Array.isArray(data?.regular) ? data.regular : [];
		internalCollections.value = Array.isArray(data?.internal) ? data.internal : [];
		ensureCollectionSelectionInitialized();
	} catch {
		// Non-fatal. Export will still work via manual defaults.
	}
}

async function refresh() {
	busy.value = true;
	error.value = null;
	try {
		const { data } = await api.get('/yaml-migrations');
		migrationsDir.value = data?.migrationsDir ?? null;
		migrations.value = data?.migrations ?? [];
		await loadCollections();
	} catch (e: any) {
		error.value = e?.response?.data?.error ?? e?.message ?? 'Failed to load migrations';
	} finally {
		busy.value = false;
	}
}

async function exportSnapshot() {
	busy.value = true;
	error.value = null;
	try {
		const schemaCollections = regularCollections.value.filter((c) => exportSchemaSelected[c]);
		if (schemaCollections.length === 0) {
			throw new Error('Select at least one regular collection for schema export.');
		}
		const dataCollections = regularCollections.value.filter((c) => exportDataSelected[c]);
		const systemCollections = internalCollections.value.filter((c) => exportInternalDataSelected[c]);

		const systemPresets: string[] = [];
		if (exportPresetRoles.value) systemPresets.push('roles');
		if (exportPresetPermissions.value) systemPresets.push('permissions');
		if (exportPresetFlows.value) systemPresets.push('flows');
		if (exportPresetPanels.value) systemPresets.push('panels');

		const includeSystemData = effectiveIncludeSystemData.value || systemCollections.length > 0;
		await api.post('/yaml-migrations/export', {
			name: 'snapshot',
			schemaCollections,
			includeData: exportIncludeData.value,
			dataMode: exportIncludeData.value ? 'selected' : undefined,
			dataCollections: exportIncludeData.value ? dataCollections : undefined,
			includeSystemData,
			systemPresets: includeSystemData && systemPresets.length > 0 ? systemPresets : undefined,
			systemDataCollections: includeSystemData && systemCollections.length > 0 ? systemCollections : undefined,
			markApplied: exportMarkApplied.value,
			limitPerCollection: exportIncludeData.value || includeSystemData ? exportLimit.value ?? undefined : undefined,
		});
		await refresh();
	} catch (e: any) {
		error.value = e?.response?.data?.error ?? e?.message ?? 'Failed to export snapshot';
	} finally {
		busy.value = false;
	}
}

async function applyOne(filename: string) {
	busy.value = true;
	error.value = null;
	try {
		await api.post('/yaml-migrations/apply', {
			filename,
			forceSchema: applyForceSchema.value,
		});
		await refresh();
		expanded[filename] = true;
	} catch (e: any) {
		error.value = e?.response?.data?.error ?? e?.message ?? 'Failed to apply migration';
	} finally {
		busy.value = false;
	}
}

async function applyPending() {
	busy.value = true;
	error.value = null;
	try {
		await api.post('/yaml-migrations/apply', {
			forceSchema: applyForceSchema.value,
		});
		await refresh();
	} catch (e: any) {
		error.value = e?.response?.data?.error ?? e?.message ?? 'Failed to apply migrations';
	} finally {
		busy.value = false;
	}
}

function onUploadSelected(event: Event) {
	const input = event.target as HTMLInputElement | null;
	const file = input?.files?.[0] ?? null;
	uploadFile.value = file;
}

function openFilePicker() {
	uploadInputEl.value?.click();
}

async function uploadSelected() {
	if (!uploadFile.value) {
		error.value = 'Please select a .yaml/.yml file first.';
		return;
	}

	busy.value = true;
	error.value = null;
	try {
		const file = uploadFile.value;
		const raw = await file.text();
		const { data } = await api.post('/yaml-migrations/upload', {
			filename: file.name,
			raw,
			overwrite: uploadOverwrite.value,
		});

		if (uploadApplyAfter.value) {
			const uploadedFilename = data?.filename ?? file.name;
			await api.post('/yaml-migrations/apply', {
				filename: uploadedFilename,
			});
		}

		uploadFile.value = null;
		if (uploadInputEl.value) uploadInputEl.value.value = '';
		await refresh();
	} catch (e: any) {
		error.value = e?.response?.data?.error ?? e?.message ?? 'Failed to upload migration file';
	} finally {
		busy.value = false;
	}
}

onMounted(() => {
	void refresh();
});
</script>

<style scoped>
.page {
	padding: 24px;
	max-width: 1100px;
}
.actions {
	display: flex;
	gap: 10px;
	margin: 16px 0;
	flex-wrap: wrap;
}
.section-title {
	margin: 18px 0 6px;
}
.export {
	margin: 16px 0;
	padding: 12px;
	border: 1px solid var(--border-normal);
	border-radius: var(--border-radius);
}
.export-controls {
	display: flex;
	gap: 12px;
	flex-wrap: wrap;
	align-items: center;
	margin-top: 10px;
}
.export-groups {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 14px;
	margin-top: 12px;
}
.export-group {
	border: 1px solid var(--border-normal);
	border-radius: var(--border-radius);
	padding: 10px;
	min-width: 0;
}
.group-header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 10px;
}
.group-actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
.link {
	background: none;
	border: none;
	padding: 0;
	color: var(--theme--primary);
	cursor: pointer;
	text-decoration: underline;
}
.link:disabled {
	opacity: 0.6;
	cursor: not-allowed;
	text-decoration: none;
}
.collection-list {
	margin-top: 10px;
	max-height: 280px;
	overflow: auto;
	border-top: 1px solid var(--border-normal);
	padding-top: 8px;
}
.collection-row {
	display: grid;
	grid-template-columns: 1fr 120px 120px;
	gap: 8px;
	align-items: center;
	padding: 4px 0;
}
.collection-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.system-presets {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
	margin: 8px 0;
}
.upload {
	margin: 12px 0 6px;
	padding: 12px;
	border: 1px solid var(--border-normal);
	border-radius: var(--border-radius);
}
.upload-row {
	display: flex;
	gap: 10px;
	align-items: center;
	flex-wrap: wrap;
}
.upload-input-hidden {
	display: none;
}
.upload-meta {
	min-width: 240px;
}
.upload-filename {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 520px;
}
.export-options :deep(.v-input) {
	width: 100%;
}
.table {
	margin-top: 16px;
	overflow: auto;
}
.table table {
	width: 100%;
	border-collapse: collapse;
}
.table th,
.table td {
	text-align: left;
	padding: 10px 12px;
	border-bottom: 1px solid var(--border-normal);
	vertical-align: top;
}
.status {
	font-weight: 600;
	text-transform: capitalize;
}
.status.applied {
	color: var(--theme--primary);
}
.status.pending {
	color: var(--theme--foreground-subdued);
}
.status.failed {
	color: var(--theme--danger);
}
.status.drifted {
	color: var(--theme--warning);
}
.error {
	white-space: pre-wrap;
	max-width: 560px;
}
.actions-cell {
	white-space: nowrap;
}
.expander {
	width: 28px;
	height: 28px;
	border-radius: 6px;
	border: 1px solid var(--border-normal);
	background: var(--theme--background-normal);
	cursor: pointer;
}
.report-cell {
	padding: 0;
}
.report {
	padding: 12px;
	background: var(--theme--background-subdued);
	border-top: 1px solid var(--border-normal);
}
.report-header {
	display: flex;
	gap: 10px;
	align-items: baseline;
	margin-bottom: 8px;
}
.report-pre {
	max-height: 260px;
	overflow: auto;
	padding: 10px;
	background: var(--theme--background-normal);
	border: 1px solid var(--border-normal);
	border-radius: var(--border-radius);
	white-space: pre;
}
.muted {
	color: var(--theme--foreground-subdued);
}

@media (max-width: 1000px) {
	.export-groups {
		grid-template-columns: 1fr;
	}
}
</style>
