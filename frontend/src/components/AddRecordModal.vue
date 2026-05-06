<script setup>
import { computed, reactive, ref } from 'vue';
import { useRecordsStore } from '../stores/records';

const emit = defineEmits(['close', 'saved']);
const store = useRecordsStore();
const uploading = ref(false);
const submitting = ref(false);

const form = reactive({
	title: '',
	artist: '',
	year: '',
	label: '',
	format: 'Vinyl',
	description: '',
	notes: '',
	status: 'my_collection',
	cover_url: '',
});

const coverPreview = computed(
	() => form.cover_url || '/placeholder-cover.svg',
);

async function onCoverChange(event) {
	const file = event.target.files?.[0];
	if (!file) return;
	uploading.value = true;
	try {
		const uploaded = await store.uploadCover(file);
		const apiOrigin =
			import.meta.env.VITE_API_ORIGIN ||
			(window?.location?.origin ?? 'http://localhost:3001');
		form.cover_url = `${apiOrigin}${uploaded.cover_url}`;
	} finally {
		uploading.value = false;
	}
}

async function submit() {
	submitting.value = true;
	try {
		await store.addManualRelease(form, form.status);
		emit('saved');
		emit('close');
	} finally {
		submitting.value = false;
	}
}
</script>

<template>
	<Transition name="overlay">
		<div
			class="overlay"
			@click.self="$emit('close')">
			<div
				class="panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="modal-title">
				<header class="panel-head">
					<div>
						<p class="eyebrow">Новая запись</p>
						<h3 id="modal-title">Добавить вручную</h3>
					</div>
					<button
						type="button"
						class="close-btn"
						aria-label="Закрыть"
						@click="$emit('close')">
						<svg
							viewBox="0 0 24 24"
							aria-hidden="true">
							<path
								d="M6.4 5l12.6 12.6-1.4 1.4L5 6.4 6.4 5zm12.6 1.4L6.4 19 5 17.6 17.6 5 19 6.4z"
								fill="currentColor" />
						</svg>
					</button>
				</header>

				<form
					class="form"
					@submit.prevent="submit">
					<div class="cover-row">
						<div class="cover-preview">
							<img
								:src="coverPreview"
								alt="Превью обложки" />
						</div>
						<label class="upload">
							<span class="upload-title">
								{{ uploading ? 'Загружаем…' : 'Обложка' }}
							</span>
							<span class="upload-hint">
								JPG, PNG до нескольких МБ
							</span>
							<input
								type="file"
								accept="image/*"
								@change="onCoverChange" />
						</label>
					</div>

					<div class="row two">
						<label>
							<span>Исполнитель *</span>
							<input
								v-model="form.artist"
								required
								placeholder="например, Pink Floyd" />
						</label>
						<label>
							<span>Название *</span>
							<input
								v-model="form.title"
								required
								placeholder="The Dark Side of the Moon" />
						</label>
					</div>

					<div class="row two">
						<label>
							<span>Год</span>
							<input
								v-model="form.year"
								placeholder="1973" />
						</label>
						<label>
							<span>Формат</span>
							<input
								v-model="form.format"
								placeholder="LP, 12''" />
						</label>
					</div>

					<label>
						<span>Лейбл</span>
						<input
							v-model="form.label"
							placeholder="Harvest" />
					</label>

					<label>
						<span>Описание</span>
						<textarea
							v-model="form.description"
							rows="3"
							placeholder="Краткое описание релиза"></textarea>
					</label>

					<label>
						<span>Личные заметки</span>
						<textarea
							v-model="form.notes"
							rows="2"
							placeholder="Где купили, состояние, нюансы…"></textarea>
					</label>

					<div class="status-pick">
						<span class="status-label">Куда добавить?</span>
						<div class="status-options">
							<label
								class="chip"
								:class="{
									active: form.status === 'my_collection',
								}">
								<input
									v-model="form.status"
									type="radio"
									value="my_collection" />
								В коллекцию
							</label>
							<label
								class="chip"
								:class="{
									active: form.status === 'want_to_buy',
								}">
								<input
									v-model="form.status"
									type="radio"
									value="want_to_buy" />
								Хочу купить
							</label>
						</div>
					</div>

					<div class="actions">
						<button
							type="button"
							class="ghost-btn"
							@click="$emit('close')">
							Отмена
						</button>
						<button
							type="submit"
							class="primary-btn"
							:disabled="submitting">
							{{ submitting ? 'Сохраняем…' : 'Сохранить' }}
						</button>
					</div>
				</form>
			</div>
		</div>
	</Transition>
</template>

<style scoped>
.overlay {
	position: fixed;
	inset: 0;
	background: rgba(31, 26, 22, 0.45);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
	display: grid;
	place-items: end center;
	z-index: 50;
	padding: 0;
}

.panel {
	background: var(--bg-elevated);
	border-radius: var(--radius-xl) var(--radius-xl) 0 0;
	width: 100%;
	max-width: 600px;
	padding: 1.25rem 1.25rem 1.5rem;
	box-shadow: var(--shadow-lg);
	max-height: 90vh;
	overflow-y: auto;
}

.panel-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 1rem;
}
.eyebrow {
	margin: 0;
	font-size: 0.7rem;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--accent);
	font-weight: 600;
}
.panel-head h3 {
	margin: 0.15rem 0 0;
	font-size: 1.4rem;
}
.close-btn {
	border: 1px solid var(--border);
	background: var(--bg-elevated);
	border-radius: 50%;
	width: 36px;
	height: 36px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	color: var(--text-muted);
	transition: all var(--transition);
}
.close-btn:hover {
	color: var(--accent);
	border-color: var(--accent);
}
.close-btn svg {
	width: 14px;
	height: 14px;
}

.form {
	display: grid;
	gap: 0.85rem;
}

.row {
	display: grid;
	gap: 0.85rem;
}
.row.two {
	grid-template-columns: 1fr 1fr;
}

label {
	display: grid;
	gap: 0.3rem;
	font-size: 0.88rem;
	color: var(--text-muted);
}
label > span {
	font-weight: 500;
}

input,
textarea,
select {
	width: 100%;
	padding: 0.6rem 0.8rem;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-elevated);
	color: var(--text);
	transition:
		border-color var(--transition),
		box-shadow var(--transition);
}
input:focus,
textarea:focus,
select:focus {
	outline: none;
	border-color: var(--accent);
	box-shadow: var(--ring-accent);
}
textarea {
	resize: vertical;
	min-height: 60px;
}

/* Cover row */
.cover-row {
	display: grid;
	grid-template-columns: 110px 1fr;
	gap: 0.85rem;
	align-items: stretch;
}
.cover-preview {
	border-radius: var(--radius-sm);
	overflow: hidden;
	background: var(--bg-subtle);
	aspect-ratio: 1;
	border: 1px solid var(--border);
}
.cover-preview img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.upload {
	display: grid;
	gap: 0.2rem;
	align-content: center;
	border: 1px dashed var(--border-strong);
	border-radius: var(--radius-sm);
	padding: 0.85rem;
	cursor: pointer;
	background: var(--bg-tinted);
	color: var(--text);
	transition: border-color var(--transition);
}
.upload:hover {
	border-color: var(--accent);
}
.upload-title {
	font-weight: 600;
}
.upload-hint {
	color: var(--text-muted);
	font-size: 0.82rem;
}
.upload input[type='file'] {
	display: none;
}

/* Status picker */
.status-pick {
	display: grid;
	gap: 0.4rem;
}
.status-label {
	font-size: 0.88rem;
	font-weight: 500;
	color: var(--text-muted);
}
.status-options {
	display: flex;
	gap: 0.4rem;
	flex-wrap: wrap;
}
.chip {
	display: inline-flex;
	align-items: center;
	gap: 0;
	padding: 0.5rem 0.95rem;
	border-radius: var(--radius-pill);
	border: 1px solid var(--border);
	background: var(--bg-elevated);
	cursor: pointer;
	font-size: 0.92rem;
	font-weight: 500;
	color: var(--text);
	transition: all var(--transition);
}
.chip input {
	display: none;
}
.chip:hover {
	border-color: var(--border-strong);
}
.chip.active {
	background: var(--accent);
	color: var(--text-on-accent);
	border-color: var(--accent);
	box-shadow: var(--shadow-sm);
}

/* Actions */
.actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
	margin-top: 0.5rem;
	padding-top: 0.85rem;
	border-top: 1px solid var(--border);
}
.primary-btn,
.ghost-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.35rem;
	border-radius: var(--radius-pill);
	padding: 0.6rem 1.1rem;
	font-weight: 600;
	cursor: pointer;
	transition: all var(--transition);
}
.primary-btn {
	background: var(--accent);
	color: var(--text-on-accent);
	border: 1px solid var(--accent);
	box-shadow: var(--shadow-sm);
}
.primary-btn:hover:not(:disabled) {
	background: var(--accent-hover);
	border-color: var(--accent-hover);
}
.primary-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
.ghost-btn {
	background: var(--bg-elevated);
	color: var(--text);
	border: 1px solid var(--border);
}
.ghost-btn:hover {
	border-color: var(--accent);
	color: var(--accent);
}

/* Animations */
.overlay-enter-active,
.overlay-leave-active {
	transition: opacity 200ms ease;
}
.overlay-enter-active .panel,
.overlay-leave-active .panel {
	transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.overlay-enter-from,
.overlay-leave-to {
	opacity: 0;
}
.overlay-enter-from .panel,
.overlay-leave-to .panel {
	transform: translateY(20px);
}

@media (min-width: 640px) {
	.overlay {
		place-items: center;
		padding: 1rem;
	}
	.panel {
		border-radius: var(--radius-xl);
	}
}

@media (max-width: 480px) {
	.row.two {
		grid-template-columns: 1fr;
	}
	.cover-row {
		grid-template-columns: 90px 1fr;
	}
}
</style>
