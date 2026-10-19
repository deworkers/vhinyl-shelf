<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useRecordsStore } from '../stores/records';

const props = defineProps({
	tracks: { type: Array, required: true },
	artist: { type: String, default: '' },
	album: { type: String, default: '' },
	ignoreAlbum: { type: Boolean, default: false },
});
const store = useRecordsStore();
const audio = ref(null);
const previews = ref({});
const errors = ref({});
const activeIndex = ref(null);
const loadingIndex = ref(null);
const isPlaying = ref(false);
const position = ref(0);
const duration = ref(0);
let requestId = 0;
let controller;

const tracks = computed(() => props.tracks.flatMap((track) =>
	track.sub_tracks?.length
		? [{ ...track, type_: 'heading' }, ...track.sub_tracks]
		: [track],
));
const hasPreviews = computed(() => Object.values(previews.value).some(Boolean));

function trackArtist(track) {
	return track.artists?.map((artist) => artist.name).filter(Boolean).join(', ') || props.artist;
}

function isSong(track) {
	return !['heading', 'index'].includes(track.type_) && Boolean(track.title?.trim());
}

function hasArtist(track) {
	return Boolean(trackArtist(track)) && !/^various(?: artists)?$/i.test(trackArtist(track));
}

function stop() {
	requestId += 1;
	controller?.abort();
	if (audio.value) {
		audio.value.pause();
		audio.value.removeAttribute('src');
		audio.value.load();
	}
	activeIndex.value = null;
	loadingIndex.value = null;
	isPlaying.value = false;
	position.value = 0;
	duration.value = 0;
}

async function play(index, id) {
	try {
		if (audio.value.ended) audio.value.currentTime = 0;
		await audio.value.play();
	} catch (error) {
		if (id !== requestId || error.name === 'AbortError') return;
		errors.value[index] = error.name === 'NotAllowedError'
			? 'Превью готово. Нажмите ▶ ещё раз.'
			: 'Не удалось воспроизвести превью. Попробуйте ещё раз.';
	}
}

async function togglePreview(track, index) {
	if (loadingIndex.value === index) {
		stop();
		return;
	}
	delete errors.value[index];
	if (activeIndex.value === index && previews.value[index]) {
		if (audio.value.paused) await play(index, requestId);
		else audio.value.pause();
		return;
	}

	stop();
	const id = requestId;
	activeIndex.value = index;
	loadingIndex.value = index;
	controller = new AbortController();
	try {
		const preview = previews.value[index] || await store.fetchTrackPreview({
			artist: trackArtist(track),
			title: track.title,
			album: props.album,
			duration: track.duration || '',
			ignoreAlbum: props.ignoreAlbum,
		}, controller.signal);
		if (id !== requestId) return;
		previews.value[index] = preview;
		if (!preview) {
			activeIndex.value = null;
			return;
		}
		audio.value.src = preview.previewUrl;
		await play(index, id);
	} catch (error) {
		if (id !== requestId || error.name === 'AbortError') return;
		errors.value[index] = error.message || 'Не удалось найти превью. Попробуйте ещё раз.';
		activeIndex.value = null;
	} finally {
		if (id === requestId) loadingIndex.value = null;
	}
}

function updateProgress() {
	position.value = audio.value.currentTime || 0;
	duration.value = Number.isFinite(audio.value.duration) ? audio.value.duration : 0;
}

function playbackError() {
	if (activeIndex.value === null || !audio.value?.getAttribute('src')) return;
	errors.value[activeIndex.value] = 'Не удалось загрузить аудио. Попробуйте ещё раз.';
	stop();
}

function formatTime(seconds) {
	const value = Math.floor(seconds);
	return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

watch([() => props.tracks, () => props.artist, () => props.album, () => props.ignoreAlbum], () => {
	stop();
	previews.value = {};
	errors.value = {};
});
onBeforeRouteLeave(stop);
onBeforeUnmount(stop);
</script>

<template>
	<section class="tracklist-section">
		<h3>Треклист</h3>
		<audio
			ref="audio"
			preload="none"
			@play="isPlaying = true"
			@pause="isPlaying = false"
			@ended="isPlaying = false"
			@timeupdate="updateProgress"
			@durationchange="updateProgress"
			@error="playbackError"></audio>
		<ol class="tracklist">
			<li
				v-for="(track, index) in tracks"
				:key="index"
				:class="{ active: activeIndex === index, heading: !isSong(track) }">
				<span class="track-pos">{{ track.position || (isSong(track) ? index + 1 : '') }}</span>
				<button
					v-if="isSong(track)"
					type="button"
					class="preview-button"
					:disabled="previews[index] === null || !hasArtist(track)"
					:aria-label="loadingIndex === index ? `Отменить поиск: ${track.title}` : `${activeIndex === index && isPlaying ? 'Пауза' : 'Слушать превью'}: ${track.title}`"
					:aria-pressed="activeIndex === index && isPlaying"
					:title="previews[index] === null ? 'Превью недоступно' : !hasArtist(track) ? 'Исполнитель не указан' : 'Слушать превью'"
					@click="togglePreview(track, index)">
					<span v-if="loadingIndex === index" class="preview-spinner" aria-hidden="true"></span>
					<svg v-else viewBox="0 0 24 24" aria-hidden="true">
						<path v-if="activeIndex === index && isPlaying" d="M6 5h4v14H6zm8 0h4v14h-4z" />
						<path v-else d="M8 5v14l11-7z" />
					</svg>
				</button>
				<span v-else aria-hidden="true"></span>
				<div class="track-main">
					<span class="track-title">{{ track.title }}</span>
					<div v-if="activeIndex === index && previews[index]" class="preview-progress">
						<progress :value="position" :max="duration || 1" :aria-label="`Прогресс превью: ${track.title}`"></progress>
						<span>{{ formatTime(position) }} / {{ formatTime(duration) }}</span>
					</div>
					<p v-if="errors[index]" class="preview-error" role="status">{{ errors[index] }}</p>
					<span v-else-if="loadingIndex === index" class="preview-status" role="status">Ищем превью…</span>
					<span v-else-if="previews[index] === null" class="preview-status" role="status">Превью недоступно</span>
					<a
						v-if="previews[index]"
						class="itunes-link"
						:href="previews[index].trackViewUrl"
						target="_blank"
						rel="noopener noreferrer">
						<img src="/itunes-badge.png" alt="Get it on iTunes" width="138" height="40" />
					</a>
				</div>
				<span class="track-dur">{{ track.duration }}</span>
			</li>
		</ol>
		<p v-if="hasPreviews" class="preview-attribution">Song previews provided courtesy of iTunes.</p>
	</section>
</template>

<style scoped>
h3 {
	margin: 0 0 0.6rem;
	font-size: 1.1rem;
}
.tracklist {
	margin: 0;
	padding: 0;
	list-style: none;
	display: grid;
	gap: 0.15rem;
}
.tracklist li {
	display: grid;
	grid-template-columns: 28px 36px minmax(0, 1fr) auto;
	gap: 0.6rem;
	align-items: start;
	padding: 0.55rem 0.6rem;
	border-radius: var(--radius-sm);
	transition: background var(--transition);
}
.tracklist li:hover {
	background: var(--bg-tinted);
}
.tracklist li.active {
	background: var(--accent-soft);
}
.track-pos,
.track-dur {
	padding-top: 0.45rem;
	color: var(--text-muted);
	font-variant-numeric: tabular-nums;
	font-size: 0.85rem;
}
.track-pos {
	font-weight: 600;
}
.track-main {
	min-width: 0;
	padding-top: 0.3rem;
}
.track-title {
	overflow-wrap: anywhere;
}
.heading .track-title {
	font-weight: 600;
}
.preview-button {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	padding: 0;
	border: 1px solid var(--border);
	border-radius: 50%;
	background: var(--bg-elevated);
	color: var(--accent);
	cursor: pointer;
}
.preview-button:hover:not(:disabled) {
	border-color: var(--accent);
}
.preview-button:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 3px;
}
.preview-button:disabled {
	opacity: 0.4;
	cursor: default;
}
.preview-button svg {
	width: 20px;
	height: 20px;
	fill: currentColor;
}
.preview-spinner {
	width: 16px;
	height: 16px;
	border: 2px solid var(--border-strong);
	border-top-color: var(--accent);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}
.preview-progress {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 0.5rem;
	margin-top: 0.5rem;
	font-size: 0.75rem;
	font-variant-numeric: tabular-nums;
	color: var(--text-muted);
}
.preview-progress progress {
	flex: 1 1 80px;
	min-width: 0;
	height: 5px;
	accent-color: var(--accent);
}
.preview-error,
.preview-status,
.preview-attribution {
	display: block;
	margin: 0.35rem 0 0;
	font-size: 0.78rem;
	color: var(--text-muted);
}
.preview-error {
	color: var(--danger);
}
.preview-attribution {
	margin-top: 0.75rem;
}
.itunes-link {
	display: block;
	width: max-content;
	margin-top: 0.5rem;
}
.itunes-link img {
	display: block;
}
@keyframes spin {
	to { transform: rotate(360deg); }
}
@media (max-width: 480px) {
	.tracklist li {
		grid-template-columns: 24px 36px minmax(0, 1fr) auto;
		gap: 0.35rem;
		padding-inline: 0;
	}
}
@media (prefers-reduced-motion: reduce) {
	.preview-spinner { animation: none; }
}
</style>
