<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRecordsStore } from '../stores/records';
import AddRecordModal from '../components/AddRecordModal.vue';

const store = useRecordsStore();
const router = useRouter();
const route = useRoute();
const loading = ref(false);
const error = ref('');
const showManualModal = ref(false);
const addedIds = ref(new Set());

const filters = reactive({
	q: '',
	page: 1,
});

const hasResults = computed(() => store.searchResults?.length > 0);
const hasQuery = computed(() => filters.q.trim().length > 0);

function parseTitleParts(item) {
	const raw = item?.title || '';
	const [artist, ...rest] = raw.split(' - ');
	return {
		artist: rest.length ? artist : item?.artist || 'Unknown Artist',
		releaseTitle: rest.length ? rest.join(' - ') : raw,
	};
}

function getPreviewImage(item) {
	return item?.cover_image || item?.thumb || '/placeholder-cover.svg';
}

async function search(page = 1) {
	const query = filters.q.trim();
	if (!query) return;
	loading.value = true;
	error.value = '';
	try {
		filters.page = page;
		await store.searchDiscogs({
			q: query,
			format: 'Vinyl',
			page: String(filters.page),
			per_page: '12',
			type: 'release',
		});
	} catch (err) {
		error.value = err.message;
	} finally {
		loading.value = false;
	}
}

async function addRelease(result, status) {
	addedIds.value.add(result.id);
	addedIds.value = new Set(addedIds.value);
	try {
		const details = await store.fetchDiscogsRelease(result.id);
		await store.addDiscogsRelease(details, status);
		await store.fetchRecords();
	} catch (err) {
		error.value = err.message;
		addedIds.value.delete(result.id);
		addedIds.value = new Set(addedIds.value);
	}
}

function clearQuery() {
	filters.q = '';
}

function resetSearch() {
	filters.q = '';
	filters.page = 1;
	store.searchResults = [];
	store.searchPagination = null;
	error.value = '';
	if (route.query.q) {
		router.replace({ path: '/search', query: {} });
	}
}

onMounted(() => {
	const initialQ = typeof route.query.q === 'string' ? route.query.q : '';
	if (initialQ) {
		filters.q = initialQ;
		search(1);
	}
});

watch(
	() => route.query.q,
	(newQ) => {
		const value = typeof newQ === 'string' ? newQ : '';
		if (value !== filters.q) {
			filters.q = value;
			if (value) search(1);
		}
	},
);
</script>

<template>
	<section class="search-page">
		<div class="header-row">
			<button
				class="ghost-btn"
				@click="router.push('/')">
				<svg
					viewBox="0 0 24 24"
					aria-hidden="true">
					<path d="M14 7l-5 5 5 5V7z" />
				</svg>
				Назад
			</button>
			<h1>Поиск релизов</h1>
		</div>

		<form
			class="search-form"
			@submit.prevent="search(1)">
			<div class="search-input">
				<svg
					class="search-icon"
					viewBox="0 0 24 24"
					aria-hidden="true">
					<path
						d="M10.5 3a7.5 7.5 0 015.95 12.07l4.24 4.24-1.42 1.42-4.24-4.24A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11z" />
				</svg>
				<input
					v-model="filters.q"
					placeholder="Свободный поиск: исполнитель, альбом, трек…" />
				<button
					v-if="filters.q"
					type="button"
					class="clear-input"
					aria-label="Очистить поле"
					@click="clearQuery">
					<svg
						viewBox="0 0 24 24"
						aria-hidden="true">
						<path
							d="M6.4 5l12.6 12.6-1.4 1.4L5 6.4 6.4 5zm12.6 1.4L6.4 19 5 17.6 17.6 5 19 6.4z"
							fill="currentColor" />
					</svg>
				</button>
			</div>
			<button
				type="submit"
				class="primary-btn"
				:disabled="loading || !hasQuery">
				{{ loading ? 'Ищем…' : 'Найти' }}
			</button>
			<button
				v-if="hasResults || hasQuery"
				type="button"
				class="ghost-btn"
				@click="resetSearch">
				Сбросить
			</button>
		</form>

		<p
			v-if="error"
			class="error">
			{{ error }}
		</p>

		<div
			v-if="loading"
			class="results results-skeleton">
			<div
				v-for="n in 8"
				:key="n"
				class="skeleton-card">
				<div class="skeleton-cover"></div>
				<div class="skeleton-line"></div>
				<div class="skeleton-line short"></div>
			</div>
		</div>

		<div
			v-else-if="hasResults"
			class="results">
			<article
				v-for="item in store.searchResults"
				:key="item.id"
				class="result-card"
				@click="router.push(`/release/discogs-${item.id}`)">
				<div class="cover-wrap">
					<div
						class="vinyl-behind"
						aria-hidden="true">
						<div class="vinyl-label"></div>
					</div>
					<img
						:src="getPreviewImage(item)"
						:alt="item.title"
						loading="lazy"
						decoding="async"
						referrerpolicy="no-referrer" />
					<div
						class="quick-actions"
						@click.stop>
						<button
							class="quick-btn collect"
							:class="{ done: addedIds.has(item.id) }"
							:title="
								addedIds.has(item.id)
									? 'Добавлено в коллекцию'
									: 'В коллекцию'
							"
							@click.stop="
								addRelease(item, 'my_collection')
							">
							<svg
								viewBox="0 0 24 24"
								aria-hidden="true">
								<path
									v-if="!addedIds.has(item.id)"
									d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2z"
									fill="currentColor" />
								<path
									v-else
									d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.4-1.4z"
									fill="currentColor" />
							</svg>
						</button>
						<button
							class="quick-btn want"
							:title="'Хочу купить'"
							@click.stop="addRelease(item, 'want_to_buy')">
							<svg
								viewBox="0 0 24 24"
								aria-hidden="true">
								<path
									d="M12 21s-7-4.35-9.5-9C1.5 9 3.5 5 7 5c2 0 3.5 1 5 2.5C13.5 6 15 5 17 5c3.5 0 5.5 4 4.5 7-2.5 4.65-9.5 9-9.5 9z"
									stroke="currentColor"
									stroke-width="1.7"
									fill="none"
									stroke-linejoin="round" />
							</svg>
						</button>
					</div>
				</div>
				<div class="card-text">
					<strong class="artist">
						{{ parseTitleParts(item).artist }}
					</strong>
					<span class="title">
						{{ parseTitleParts(item).releaseTitle }}
					</span>
					<small class="meta-line">
						<span v-if="item.year">{{ item.year }}</span>
						<span
							v-if="item.year && item.country"
							class="dot-sep">
							·
						</span>
						<span v-if="item.country">{{ item.country }}</span>
					</small>
				</div>
			</article>
		</div>
		<div
			v-else-if="!loading && hasQuery"
			class="empty">
			<p>Ничего не нашлось по запросу «{{ filters.q }}».</p>
			<button
				class="ghost-btn"
				@click="resetSearch">
				Сбросить и попробовать снова
			</button>
		</div>
		<div
			v-else-if="!loading"
			class="empty hint">
			Введите название альбома, исполнителя или трека, чтобы начать
			поиск.
		</div>

		<div class="manual-inline">
			<span>Не нашли нужный релиз?</span>
			<button
				class="link-btn"
				@click="showManualModal = true">
				Добавить вручную →
			</button>
		</div>

		<div
			v-if="store.searchPagination && hasResults"
			class="pager">
			<button
				class="ghost-btn small"
				:disabled="filters.page <= 1"
				@click="search(filters.page - 1)">
				← Назад
			</button>
			<span class="pager-info">
				Страница {{ filters.page }} из {{ store.searchPagination.pages }}
			</span>
			<button
				class="ghost-btn small"
				:disabled="filters.page >= store.searchPagination.pages"
				@click="search(filters.page + 1)">
				Далее →
			</button>
		</div>

		<AddRecordModal
			v-if="showManualModal"
			@close="showManualModal = false"
			@saved="store.fetchRecords()" />
	</section>
</template>

<style scoped>
.search-page {
	display: grid;
	gap: 1.25rem;
}

.header-row {
	display: flex;
	align-items: center;
	gap: 1rem;
}
.header-row h1 {
	margin: 0;
	font-size: clamp(1.4rem, 2.5vw, 1.8rem);
}

/* Search form */
.search-form {
	display: flex;
	gap: 0.6rem;
	flex-wrap: wrap;
}
.search-input {
	flex: 1 1 280px;
	position: relative;
	display: flex;
	align-items: center;
	min-width: 0;
}
.search-icon {
	position: absolute;
	left: 14px;
	width: 18px;
	height: 18px;
	fill: var(--text-muted);
	pointer-events: none;
}
.search-input input {
	width: 100%;
	height: 46px;
	padding: 0 2.6rem 0 2.6rem;
	border-radius: var(--radius-pill);
	border: 1px solid var(--border);
	background: var(--bg-elevated);
	box-shadow: var(--shadow-xs);
	transition:
		border-color var(--transition),
		box-shadow var(--transition);
}
.search-input input::placeholder {
	color: var(--text-subtle);
}
.search-input input:focus {
	outline: none;
	border-color: var(--accent);
	box-shadow: var(--ring-accent);
}
.clear-input {
	position: absolute;
	right: 8px;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	border: 0;
	background: var(--bg-subtle);
	color: var(--text-muted);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition:
		background var(--transition),
		color var(--transition);
}
.clear-input:hover {
	background: var(--accent);
	color: var(--text-on-accent);
}
.clear-input svg {
	width: 12px;
	height: 12px;
}

/* Buttons */
.primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	background: var(--accent);
	color: var(--text-on-accent);
	border: 1px solid var(--accent);
	border-radius: var(--radius-pill);
	padding: 0.7rem 1.2rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		background var(--transition),
		transform var(--transition),
		box-shadow var(--transition);
	box-shadow: var(--shadow-sm);
}
.primary-btn:hover:not(:disabled) {
	background: var(--accent-hover);
	border-color: var(--accent-hover);
	transform: translateY(-1px);
}
.primary-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ghost-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.35rem;
	background: var(--bg-elevated);
	color: var(--text);
	border: 1px solid var(--border);
	border-radius: var(--radius-pill);
	padding: 0.55rem 0.95rem;
	font-weight: 500;
	cursor: pointer;
	transition:
		background var(--transition),
		border-color var(--transition),
		color var(--transition),
		transform var(--transition);
}
.ghost-btn:hover:not(:disabled) {
	border-color: var(--accent);
	color: var(--accent);
}
.ghost-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
.ghost-btn.small {
	padding: 0.5rem 0.9rem;
	font-size: 0.9rem;
}
.ghost-btn svg {
	width: 16px;
	height: 16px;
	fill: currentColor;
}

.link-btn {
	background: transparent;
	border: 0;
	padding: 0;
	color: var(--accent);
	font-weight: 600;
	cursor: pointer;
}
.link-btn:hover {
	color: var(--accent-hover);
}

/* Results grid (vinyl tile style) */
.results {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 1.1rem;
}

.result-card {
	display: grid;
	gap: 0.55rem;
	cursor: pointer;
	border-radius: var(--radius-md);
	transition: transform var(--transition);
}
.result-card:hover {
	transform: translateY(-2px);
}

.cover-wrap {
	position: relative;
	aspect-ratio: 1;
	border-radius: var(--radius-md);
	overflow: hidden;
	background: var(--bg-subtle);
	box-shadow: var(--shadow-sm);
	transition: box-shadow var(--transition);
}
.result-card:hover .cover-wrap {
	box-shadow: var(--shadow-lg);
}
.cover-wrap img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	transition: transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
	position: relative;
	z-index: 2;
}
.result-card:hover .cover-wrap img {
	transform: translateX(18%) rotate(2deg);
}

/* Vinyl peek behind cover */
.vinyl-behind {
	position: absolute;
	inset: 0;
	border-radius: 50%;
	margin: 8%;
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
	transform: translateX(-30%);
	transition: transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.result-card:hover .vinyl-behind {
	transform: translateX(15%) rotate(45deg);
}
.vinyl-label {
	width: 28%;
	height: 28%;
	border-radius: 50%;
	background:
		radial-gradient(circle, #fff 0 12%, transparent 13%),
		var(--accent);
	box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.8);
}

/* Quick actions overlay */
.quick-actions {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 0.6rem;
	display: flex;
	gap: 0.4rem;
	justify-content: flex-end;
	z-index: 4;
	background: linear-gradient(
		to top,
		rgba(31, 26, 22, 0.7) 0%,
		rgba(31, 26, 22, 0.45) 60%,
		transparent 100%
	);
	opacity: 0;
	transform: translateY(8px);
	transition:
		opacity var(--transition),
		transform var(--transition);
}
.result-card:hover .quick-actions,
.result-card:focus-within .quick-actions {
	opacity: 1;
	transform: translateY(0);
}
.quick-btn {
	width: 38px;
	height: 38px;
	border-radius: 50%;
	border: 0;
	background: rgba(255, 255, 255, 0.95);
	color: var(--text);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition:
		background var(--transition),
		color var(--transition),
		transform var(--transition);
	box-shadow: var(--shadow-sm);
}
.quick-btn svg {
	width: 18px;
	height: 18px;
}
.quick-btn:hover {
	transform: scale(1.06);
}
.quick-btn.collect:hover {
	background: var(--accent);
	color: var(--text-on-accent);
}
.quick-btn.want:hover {
	background: var(--amber);
	color: var(--text);
}
.quick-btn.done {
	background: var(--accent);
	color: var(--text-on-accent);
}

/* Card text */
.card-text {
	display: grid;
	gap: 0.15rem;
	padding: 0 0.15rem;
}
.artist {
	font-weight: 600;
	font-size: 0.95rem;
	line-height: 1.25;
	color: var(--text);
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 1;
	-webkit-box-orient: vertical;
}
.title {
	color: var(--text-muted);
	font-size: 0.88rem;
	line-height: 1.3;
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}
.meta-line {
	color: var(--text-subtle);
	font-size: 0.78rem;
	margin-top: 0.1rem;
}
.dot-sep {
	margin: 0 0.25rem;
}

/* Skeletons */
.results-skeleton {
	pointer-events: none;
}
.skeleton-card {
	display: grid;
	gap: 0.5rem;
}
.skeleton-cover {
	aspect-ratio: 1;
	border-radius: var(--radius-md);
	background: linear-gradient(
		90deg,
		var(--bg-subtle) 0%,
		var(--bg-tinted) 50%,
		var(--bg-subtle) 100%
	);
	background-size: 200% 100%;
	animation: shimmer 1.4s infinite linear;
}
.skeleton-line {
	height: 12px;
	border-radius: var(--radius-pill);
	background: linear-gradient(
		90deg,
		var(--bg-subtle) 0%,
		var(--bg-tinted) 50%,
		var(--bg-subtle) 100%
	);
	background-size: 200% 100%;
	animation: shimmer 1.4s infinite linear;
}
.skeleton-line.short {
	width: 60%;
}
@keyframes shimmer {
	from {
		background-position: 200% 0;
	}
	to {
		background-position: -200% 0;
	}
}

.empty {
	color: var(--text-muted);
	background: var(--bg-elevated);
	border: 1px dashed var(--border-strong);
	border-radius: var(--radius-md);
	padding: 1.5rem 1.25rem;
	text-align: center;
	display: grid;
	gap: 0.7rem;
	justify-items: center;
}
.empty p {
	margin: 0;
}
.empty.hint {
	color: var(--text-muted);
}

.error {
	color: var(--danger);
	background: var(--danger-soft);
	border-radius: var(--radius-sm);
	padding: 0.6rem 0.85rem;
	margin: 0;
}

.manual-inline {
	display: flex;
	gap: 0.5rem;
	align-items: center;
	flex-wrap: wrap;
	color: var(--text-muted);
	padding: 0.65rem 0.95rem;
	background: var(--bg-tinted);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
}

.pager {
	display: flex;
	gap: 0.6rem;
	align-items: center;
	justify-content: center;
	padding: 0.5rem 0;
	flex-wrap: wrap;
}
.pager-info {
	color: var(--text-muted);
	font-size: 0.92rem;
	min-width: 12ch;
	text-align: center;
}

@media (max-width: 640px) {
	.search-form {
		flex-direction: column;
	}
	.primary-btn,
	.search-form .ghost-btn {
		width: 100%;
	}
	.results {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}
	/* На тач-устройствах оверлей всегда виден, чтобы кнопки были доступны */
	.quick-actions {
		opacity: 1;
		transform: translateY(0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.cover-wrap img,
	.vinyl-behind {
		transition: none;
	}
	.result-card:hover .cover-wrap img {
		transform: none;
	}
	.result-card:hover .vinyl-behind {
		transform: translateX(-30%);
	}
}
</style>
