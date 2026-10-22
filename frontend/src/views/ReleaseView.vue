<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRecordsStore } from '../stores/records';
import ReleaseTracklist from '../components/ReleaseTracklist.vue';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const store = useRecordsStore();
const auth = useAuthStore();
const ownerId = ref(null);
const loading = ref(false);
const actionLoading = ref(false);
const error = ref('');
const releaseData = ref(null);
const allRecords = ref([]);
const currentRecord = ref(null);

const isDiscogsPreview = computed(() =>
	String(route.params.id).startsWith('discogs-'),
);
const currentStatus = computed(() => currentRecord.value?.status || null);

const myCollectionLabel = computed(() =>
	currentStatus.value === 'my_collection'
		? 'Убрать из коллекции'
		: 'В коллекцию',
);
const wantToBuyLabel = computed(() =>
	currentStatus.value === 'want_to_buy'
		? 'Убрать из желаемого'
		: 'Хочу купить',
);
const displayArtist = computed(
	() =>
		releaseData.value?.artist ||
		releaseData.value?.artists?.map((a) => a.name).join(', '),
);
const displayTitle = computed(() => releaseData.value?.title || 'Untitled');
const ignorePreviewAlbum = computed(() => releaseData.value?.formats?.some((format) =>
	format.descriptions?.some((description) => ['Compilation', 'Unofficial Release'].includes(description)),
) || false);
const displayYear = computed(
	() =>
		String(
			releaseData.value?.year ||
				releaseData.value?.released_formatted ||
				releaseData.value?.released ||
				'',
		).slice(0, 4) || '—',
);
const displayLabel = computed(
	() =>
		releaseData.value?.labels
			?.map((item) => item.name)
			.filter(Boolean)
			.join(', ') || '—',
);
const displayFormat = computed(() => {
	const formats = releaseData.value?.formats || [];
	if (!formats.length) return '—';
	return formats
		.map((item) => {
			const parts = [
				item.qty ? `${item.qty} x` : '',
				item.name,
				...(item.descriptions || []),
			]
				.filter(Boolean)
				.join(' ');
			return parts.trim();
		})
		.filter(Boolean)
		.join(', ');
});
const displayCountry = computed(() => releaseData.value?.country || '—');
const displayReleased = computed(
	() =>
		releaseData.value?.released_formatted ||
		releaseData.value?.released ||
		displayYear.value ||
		'—',
);
const displayGenres = computed(
	() => releaseData.value?.genres?.join(', ') || '—',
);
const displayStyles = computed(
	() => releaseData.value?.styles?.join(', ') || '—',
);
const displayRating = computed(() => {
	const average = releaseData.value?.community?.rating?.average;
	const count = releaseData.value?.community?.rating?.count;
	if (typeof average !== 'number') return null;
	return {
		avg: average.toFixed(2),
		count: typeof count === 'number' ? count : null,
	};
});

const coverUrl = computed(() => {
	const data = releaseData.value;
	if (!data) return '/placeholder-cover.svg';

	const images = Array.isArray(data.images) ? data.images : [];
	const primary = images.find((img) => img?.type === 'primary');
	const firstWithUri = images.find((img) => img?.uri);

	return (
		primary?.uri ||
		firstWithUri?.uri ||
		data.cover_url ||
		primary?.uri500 ||
		firstWithUri?.uri500 ||
		data.thumb ||
		'/placeholder-cover.svg'
	);
});

function findCurrentRecord(records) {
	if (!records?.length) return null;
	if (!isDiscogsPreview.value) {
		const id = Number(route.params.id);
		const byId = records.find((item) => item.id === id);
		if (byId) return byId;
	}

	const discogsId = Number(
		isDiscogsPreview.value
			? String(route.params.id).replace('discogs-', '')
			: releaseData.value?.id || 0,
	);
	if (!discogsId) return null;
	return (
		records.find((item) => item.discogs_release_id === discogsId) || null
	);
}

async function refreshCollectionState() {
	allRecords.value = await store.fetchAllRecords(ownerId.value);
	currentRecord.value = findCurrentRecord(allRecords.value);
}

async function toggleStatus(targetStatus) {
	if (!releaseData.value) return;
	actionLoading.value = true;
	error.value = '';
	try {
		const existing = currentRecord.value;
		if (existing && existing.status === targetStatus) {
			await store.deleteRecord(existing.id);
		} else if (existing) {
			await store.updateRecord(existing.id, { status: targetStatus });
		} else {
			await store.addDiscogsRelease(releaseData.value, targetStatus, ownerId.value);
		}
		await refreshCollectionState();
		await store.fetchRecords(ownerId.value);
	} catch (err) {
		error.value = err.message;
	} finally {
		actionLoading.value = false;
	}
}

watch(() => route.params.id, async (_id, _previousId, onCleanup) => {
	let cancelled = false;
	onCleanup(() => { cancelled = true; });
	loading.value = true;
	error.value = '';
	releaseData.value = null;
	currentRecord.value = null;
	ownerId.value = null;
	try {
		let data;
		if (isDiscogsPreview.value) {
			const releaseId = String(route.params.id).replace('discogs-', '');
			data = await store.fetchDiscogsRelease(releaseId);
		} else {
			const record = await store.fetchRecordById(route.params.id);
			if (cancelled) return;
			ownerId.value = auth.isAdmin && record.user_id !== auth.user.id ? record.user_id : null;
			const payload = record.payload_json
				? JSON.parse(record.payload_json)
				: {};
			data = {
				...payload,
				title: record.title,
				artist: record.artist,
				year: record.year,
				cover_url: record.cover_url,
				notes: payload.notes || record.notes || '',
			};
		}
		const records = await store.fetchAllRecords(ownerId.value);
		if (cancelled) return;
		releaseData.value = data;
		allRecords.value = records;
		currentRecord.value = findCurrentRecord(records);
	} catch (err) {
		if (!cancelled) error.value = err.message;
	} finally {
		if (!cancelled) loading.value = false;
	}
}, { immediate: true });
</script>

<template>
	<section class="release-page">
		<aside v-if="ownerId" class="collection-context">
			<span>Вы редактируете коллекцию пользователя #{{ ownerId }}</span>
			<router-link :to="{ path: '/', query: { user_id: ownerId } }">К коллекции</router-link>
		</aside>
		<button
			class="back-btn"
			@click="router.back()">
			<svg
				viewBox="0 0 24 24"
				aria-hidden="true">
				<path d="M14 7l-5 5 5 5V7z" />
			</svg>
			Назад
		</button>

		<div
			v-if="loading"
			class="state">
			<div class="spinner"></div>
			<span>Загружаем релиз…</span>
		</div>
		<p
			v-else-if="error"
			class="error">
			{{ error }}
		</p>
		<article
			v-else-if="releaseData"
			class="release">
			<aside class="cover-side">
				<div class="cover-stack">
					<div
						class="vinyl-disc"
						aria-hidden="true">
						<div class="vinyl-label"></div>
					</div>
					<img
						:src="coverUrl"
						:alt="displayTitle"
						decoding="async"
						referrerpolicy="no-referrer" />
				</div>

				<div class="actions">
					<button
						class="action-btn primary"
						:class="{
							active: currentStatus === 'my_collection',
						}"
						:disabled="actionLoading"
						@click="toggleStatus('my_collection')">
						<svg
							viewBox="0 0 24 24"
							aria-hidden="true">
							<path
								v-if="currentStatus === 'my_collection'"
								d="M19 13H5v-2h14v2z"
								fill="currentColor" />
							<path
								v-else
								d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2z"
								fill="currentColor" />
						</svg>
						{{ myCollectionLabel }}
					</button>
					<button
						class="action-btn"
						:class="{ active: currentStatus === 'want_to_buy' }"
						:disabled="actionLoading"
						@click="toggleStatus('want_to_buy')">
						<svg
							viewBox="0 0 24 24"
							aria-hidden="true">
							<path
								v-if="currentStatus === 'want_to_buy'"
								d="M12 21s-7-4.35-9.5-9C1.5 9 3.5 5 7 5c2 0 3.5 1 5 2.5C13.5 6 15 5 17 5c3.5 0 5.5 4 4.5 7-2.5 4.65-9.5 9-9.5 9z"
								fill="currentColor" />
							<path
								v-else
								d="M12 21s-7-4.35-9.5-9C1.5 9 3.5 5 7 5c2 0 3.5 1 5 2.5C13.5 6 15 5 17 5c3.5 0 5.5 4 4.5 7-2.5 4.65-9.5 9-9.5 9z"
								stroke="currentColor"
								stroke-width="1.7"
								fill="none"
								stroke-linejoin="round" />
						</svg>
						{{ wantToBuyLabel }}
					</button>
				</div>
			</aside>

			<div class="info-side">
				<header class="release-head">
					<p
						v-if="displayRating"
						class="rating-pill">
						★ {{ displayRating.avg }}
						<span
							v-if="displayRating.count !== null"
							class="rating-count">
							({{ displayRating.count }})
						</span>
					</p>
					<h2 class="artist">{{ displayArtist }}</h2>
					<h1 class="title">{{ displayTitle }}</h1>
					<p class="year">
						{{ displayYear }}
						<span
							v-if="displayCountry !== '—'"
							class="dot-sep">
							•
						</span>
						<span v-if="displayCountry !== '—'">
							{{ displayCountry }}
						</span>
					</p>
				</header>

				<dl class="meta">
					<div>
						<dt>Лейбл</dt>
						<dd>{{ displayLabel }}</dd>
					</div>
					<div>
						<dt>Формат</dt>
						<dd>{{ displayFormat }}</dd>
					</div>
					<div>
						<dt>Дата релиза</dt>
						<dd>{{ displayReleased }}</dd>
					</div>
					<div>
						<dt>Жанр</dt>
						<dd>{{ displayGenres }}</dd>
					</div>
					<div>
						<dt>Стиль</dt>
						<dd>{{ displayStyles }}</dd>
					</div>
				</dl>

				<ReleaseTracklist
					v-if="releaseData.tracklist?.length"
					:tracks="releaseData.tracklist"
					:artist="displayArtist"
					:album="displayTitle"
					:ignore-album="ignorePreviewAlbum" />
			</div>
		</article>
	</section>
</template>

<style scoped>
.release-page {
	display: grid;
	gap: 1.25rem;
}

.back-btn {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: var(--radius-pill);
	padding: 0.5rem 0.95rem;
	color: var(--text);
	cursor: pointer;
	width: max-content;
	font-weight: 500;
	transition:
		border-color var(--transition),
		color var(--transition);
}
.back-btn:hover {
	border-color: var(--accent);
	color: var(--accent);
}
.back-btn svg {
	width: 16px;
	height: 16px;
	fill: currentColor;
}

.release {
	display: grid;
	grid-template-columns: minmax(280px, 420px) 1fr;
	gap: 1.75rem;
	background:
		radial-gradient(
			circle at 0% 0%,
			rgba(232, 169, 81, 0.05),
			transparent 50%
		),
		var(--bg-elevated);
	padding: 1.75rem;
	border-radius: var(--radius-lg);
	border: 1px solid var(--border);
	box-shadow: var(--shadow-sm);
}

/* Cover side */
.cover-side {
	display: grid;
	gap: 1rem;
	align-content: start;
	min-width: 0;
}

.cover-stack {
	position: relative;
	aspect-ratio: 1.28;
	width: 100%;
	overflow: hidden;
}
.cover-stack img {
	position: absolute;
	top: 0;
	left: 0;
	height: 100%;
	aspect-ratio: 1;
	width: auto;
	object-fit: cover;
	border-radius: var(--radius-md);
	box-shadow: var(--shadow-lg);
	z-index: 2;
}
.vinyl-disc {
	position: absolute;
	top: 0;
	right: 0;
	height: 100%;
	aspect-ratio: 1;
	border-radius: 50%;
	background:
		repeating-radial-gradient(
			circle,
			#1c1814 0 1px,
			#2a221b 1px 4px
		),
		#1c1814;
	display: grid;
	place-items: center;
	z-index: 1;
	box-shadow:
		inset 0 0 0 1px rgba(255, 255, 255, 0.04),
		var(--shadow-md);
	animation: vinyl-spin 30s linear infinite;
}
.vinyl-label {
	width: 28%;
	height: 28%;
	border-radius: 50%;
	background:
		radial-gradient(circle, #fff 0 12%, transparent 13%),
		var(--accent);
	box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.85);
}
@keyframes vinyl-spin {
	to {
		transform: rotate(360deg);
	}
}

.actions {
	display: grid;
	gap: 0.5rem;
}
.action-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.45rem;
	border: 1px solid var(--border);
	background: var(--bg-elevated);
	color: var(--text);
	border-radius: var(--radius-pill);
	padding: 0.7rem 1rem;
	font-weight: 600;
	cursor: pointer;
	transition: all var(--transition);
}
.action-btn svg {
	width: 18px;
	height: 18px;
}
.action-btn:hover:not(:disabled) {
	border-color: var(--accent);
	color: var(--accent);
}
.action-btn.primary {
	background: var(--accent);
	color: var(--text-on-accent);
	border-color: var(--accent);
	box-shadow: var(--shadow-sm);
}
.action-btn.primary:hover:not(:disabled) {
	background: var(--accent-hover);
	border-color: var(--accent-hover);
	color: var(--text-on-accent);
}
.action-btn.active {
	background: var(--bg-subtle);
	color: var(--text-muted);
	border-color: var(--border);
	box-shadow: none;
}
.action-btn.active:hover:not(:disabled) {
	background: var(--bg-subtle);
	color: var(--text);
	border-color: var(--border-strong);
}
.action-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

/* Info side */
.info-side {
	display: grid;
	gap: 1.25rem;
	align-content: start;
	min-width: 0;
}
.release-head {
	display: grid;
	gap: 0.35rem;
}
.rating-pill {
	margin: 0 0 0.25rem;
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	background: var(--amber-soft);
	color: #8a5a14;
	border-radius: var(--radius-pill);
	padding: 0.25rem 0.7rem;
	font-size: 0.85rem;
	font-weight: 600;
	width: max-content;
}
.rating-count {
	color: #b48a4d;
	font-weight: 500;
}

.artist {
	margin: 0;
	font-size: 1rem;
	color: var(--accent);
	font-weight: 600;
	font-family: var(--font-sans);
	letter-spacing: 0.02em;
}
.title {
	margin: 0;
	font-family: var(--font-display);
	font-size: clamp(1.7rem, 3.5vw, 2.4rem);
	line-height: 1.1;
}
.year {
	margin: 0.4rem 0 0;
	color: var(--text-muted);
}
.dot-sep {
	margin: 0 0.3rem;
	color: var(--text-subtle);
}

/* Meta list */
.meta {
	display: grid;
	gap: 0;
	background: var(--bg-subtle);
	border-radius: var(--radius-md);
	overflow: hidden;
	border: 1px solid var(--border);
}
.meta div {
	display: grid;
	grid-template-columns: 130px 1fr;
	gap: 0.6rem;
	padding: 0.7rem 0.95rem;
	border-bottom: 1px solid var(--border);
}
.meta div:last-child {
	border-bottom: 0;
}
.meta dt {
	color: var(--text-muted);
	font-size: 0.88rem;
	font-weight: 500;
}
.meta dd {
	margin: 0;
	color: var(--text);
}

.state {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	color: var(--text-muted);
	padding: 1rem;
}
.spinner {
	width: 18px;
	height: 18px;
	border-radius: 50%;
	border: 2px solid var(--border-strong);
	border-top-color: var(--accent);
	animation: spin 0.8s linear infinite;
}
@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.error {
	color: var(--danger);
	background: var(--danger-soft);
	padding: 0.7rem 0.95rem;
	border-radius: var(--radius-sm);
}

@media (max-width: 820px) {
	.release {
		grid-template-columns: 1fr;
		padding: 1.25rem;
		gap: 1.25rem;
	}
	.cover-stack {
		max-width: 460px;
		margin: 0 auto;
		width: 100%;
		aspect-ratio: 1.32;
	}
	.actions {
		grid-template-columns: 1fr 1fr;
	}
	.meta div {
		grid-template-columns: 110px 1fr;
		padding: 0.6rem 0.8rem;
	}
}

@media (max-width: 480px) {
	.cover-stack {
		aspect-ratio: 1.22;
	}
}

@media (prefers-reduced-motion: reduce) {
	.vinyl-disc {
		animation: none;
	}
}
</style>
