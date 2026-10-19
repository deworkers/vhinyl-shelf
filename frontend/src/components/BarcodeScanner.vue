<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { normalizeBarcode } from '../utils/barcode';
import { createBarcodeReader } from '../utils/barcodeReader';
import {
    getBarcodeCameraConstraints,
    configureBarcodeCamera,
    setBarcodeCameraZoom,
} from '../utils/barcodeCamera';

const emit = defineEmits(['close', 'detected']);
const dialog = ref(null);
const video = ref(null);
const manualBarcode = ref('');
const error = ref('');
const inputError = ref('');
const starting = ref(false);
const decodingPhoto = ref(false);
const cameras = ref([]);
const selectedCamera = ref('');
const cameraZoom = ref(null);
const zoomValue = ref(1);
const cameraNotice = ref('');

let stream = null;
let controls = null;
let generation = 0;
let disposed = false;
let detected = false;

function stopCamera() {
    generation += 1;
    controls?.stop();
    controls = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (video.value) video.value.srcObject = null;
    starting.value = false;
    cameraZoom.value = null;
    cameraNotice.value = '';
}

function acceptBarcode(value) {
    const barcode = normalizeBarcode(value);
    if (!barcode || disposed || detected) return;
    detected = true;
    stopCamera();
    emit('detected', barcode);
}

function cameraErrorMessage(cause) {
    if (cause.name === 'NotAllowedError' || cause.name === 'SecurityError') {
        return 'Доступ к камере запрещён. Разрешите его в настройках браузера или выберите фото.';
    }
    if (
        cause.name === 'NotFoundError' ||
        cause.name === 'OverconstrainedError'
    ) {
        return 'Камера не найдена. Выберите фото штрихкода или введите цифры вручную.';
    }
    if (cause.name === 'NotReadableError') {
        return 'Камера недоступна или занята другим приложением. Попробуйте ещё раз или выберите фото.';
    }
    return 'Не удалось включить камеру. Попробуйте ещё раз, выберите фото или введите штрихкод вручную.';
}

async function startCamera() {
    stopCamera();
    const currentGeneration = generation;
    error.value = '';
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        error.value =
            'Для камеры откройте сайт по HTTPS или на localhost. Можно выбрать фото или ввести штрихкод вручную.';
        return;
    }
    starting.value = true;
    try {
        const reader = await createBarcodeReader();
        if (disposed || currentGeneration !== generation) return;
        const cameraStream = await navigator.mediaDevices.getUserMedia(
            getBarcodeCameraConstraints(selectedCamera.value),
        );
        if (disposed || currentGeneration !== generation) {
            cameraStream.getTracks().forEach((track) => track.stop());
            return;
        }
        stream = cameraStream;
        const track = cameraStream.getVideoTracks()[0];
        const zoom = await configureBarcodeCamera(track);
        if (disposed || currentGeneration !== generation) return;
        const devices = navigator.mediaDevices.enumerateDevices
            ? await navigator.mediaDevices.enumerateDevices().catch(() => [])
            : [];
        if (disposed || currentGeneration !== generation) return;
        cameras.value = devices.filter(
            (device) => device.kind === 'videoinput' && device.deviceId,
        );
        selectedCamera.value = track.getSettings().deviceId || selectedCamera.value;
        cameraZoom.value = zoom;
        zoomValue.value = zoom?.value ?? 1;
        const cameraControls = await reader.decodeFromStream(
            cameraStream,
            video.value,
            (result, _error, scanControls) => {
                if (!result || disposed || currentGeneration !== generation)
                    return;
                if (!normalizeBarcode(result.getText())) return;
                scanControls.stop();
                acceptBarcode(result.getText());
            },
        );
        if (disposed || currentGeneration !== generation) {
            cameraControls.stop();
            return;
        }
        controls = cameraControls;
        starting.value = false;
    } catch (cause) {
        if (disposed || currentGeneration !== generation) return;
        stopCamera();
        error.value = cameraErrorMessage(cause);
    }
}

async function changeZoom() {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const currentGeneration = generation;
    const previousZoom = track.getSettings().zoom ?? cameraZoom.value?.min ?? 1;
    cameraNotice.value = '';
    try {
        await setBarcodeCameraZoom(track, zoomValue.value);
    } catch {
        if (disposed || currentGeneration !== generation) return;
        zoomValue.value = previousZoom;
        cameraNotice.value = 'Не удалось изменить приближение. Попробуйте выбрать другую камеру.';
    }
}

async function scanPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    stopCamera();
    const currentGeneration = generation;
    error.value = '';
    decodingPhoto.value = true;
    const imageUrl = URL.createObjectURL(file);
    try {
        const reader = await createBarcodeReader();
        if (disposed || currentGeneration !== generation) return;
        const result = await reader.decodeFromImageUrl(imageUrl);
        if (disposed || currentGeneration !== generation) return;
        if (!normalizeBarcode(result.getText()))
            throw new Error('Invalid barcode');
        acceptBarcode(result.getText());
    } catch {
        if (!disposed && currentGeneration === generation) {
            error.value =
                'Штрихкод на фото не распознан. Снимите его крупнее, без бликов, или введите цифры вручную.';
        }
    } finally {
        URL.revokeObjectURL(imageUrl);
        if (!disposed) decodingPhoto.value = false;
    }
}

function submitManual() {
    const barcode = normalizeBarcode(manualBarcode.value);
    if (!barcode) {
        inputError.value = 'Введите 8, 12 или 13 цифр штрихкода.';
        return;
    }
    acceptBarcode(barcode);
}

function close() {
    stopCamera();
    emit('close');
}

function onBackdropClick(event) {
    if (event.target !== dialog.value) return;
    const bounds = dialog.value.getBoundingClientRect();
    if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
    )
        close();
}

onMounted(() => {
    dialog.value.showModal();
    startCamera();
});

onBeforeUnmount(() => {
    disposed = true;
    stopCamera();
    dialog.value?.close();
});
</script>

<template>
    <Teleport to="body">
        <dialog
            ref="dialog"
            class="scanner-dialog"
            aria-labelledby="scanner-title"
            @cancel.prevent="close"
            @click="onBackdropClick">
            <header class="scanner-head">
                <h2 id="scanner-title">Сканировать штрихкод</h2>
                <button
                    type="button"
                    class="close-btn"
                    aria-label="Закрыть сканер"
                    @click="close">
                    ×
                </button>
            </header>

            <div class="scanner-body">
                <label v-if="cameras.length > 1" class="camera-choice">
                    Камера
                    <select
                        v-model="selectedCamera"
                        :disabled="starting || decodingPhoto"
                        @change="startCamera">
                        <option
                            v-for="(camera, index) in cameras"
                            :key="camera.deviceId"
                            :value="camera.deviceId">
                            {{ camera.label || `Камера ${index + 1}` }}
                        </option>
                    </select>
                </label>
                <div
                    v-show="!error && !decodingPhoto"
                    class="camera-preview">
                    <video
                        ref="video"
                        autoplay
                        muted
                        playsinline
                        aria-label="Изображение с камеры"></video>
                    <div
                        class="scan-guide"
                        aria-hidden="true"></div>
                </div>
                <p
                    v-if="error"
                    class="scanner-error"
                    role="alert">
                    {{ error }}
                </p>
                <p
                    v-else
                    class="scanner-hint"
                    role="status">
                    {{
                        decodingPhoto
                            ? 'Распознаём штрихкод…'
                            : starting
                              ? 'Открываем камеру…'
                              : 'Поместите штрихкод целиком в рамку. Если изображение размыто, отодвиньте телефон чуть дальше.'
                    }}
                </p>
                <label v-if="cameraZoom && !error && !decodingPhoto" class="camera-zoom">
                    <span>Приближение <output>{{ Number(zoomValue).toFixed(1) }}×</output></span>
                    <input
                        v-model.number="zoomValue"
                        type="range"
                        aria-label="Приближение камеры"
                        :min="cameraZoom.min"
                        :max="cameraZoom.max"
                        :step="cameraZoom.step"
                        :disabled="starting"
                        @change="changeZoom" />
                </label>
                <p v-if="cameraNotice" class="scanner-hint" role="status">{{ cameraNotice }}</p>
                <div class="scanner-options">
                    <label class="secondary-btn photo-upload">
                        {{ decodingPhoto ? 'Распознаём…' : 'Выбрать фото' }}
                        <input
                            type="file"
                            accept="image/*"
                            :disabled="decodingPhoto"
                            @change="scanPhoto" />
                    </label>
                    <button
                        v-if="error"
                        type="button"
                        class="secondary-btn"
                        :disabled="starting || decodingPhoto"
                        @click="startCamera">
                        Включить камеру
                    </button>
                </div>

                <form
                    class="manual-form"
                    @submit.prevent="submitManual">
                    <label for="manual-barcode"
                        >Или введите штрихкод вручную</label
                    >
                    <div class="manual-row">
                        <input
                            id="manual-barcode"
                            v-model="manualBarcode"
                            inputmode="numeric"
                            autocomplete="off"
                            maxlength="32"
                            placeholder="Цифры под штрихкодом"
                            :aria-invalid="!!inputError"
                            :aria-describedby="
                                inputError ? 'barcode-input-error' : undefined
                            "
                            @input="inputError = ''" />
                        <button
                            type="submit"
                            class="primary-btn"
                            :disabled="decodingPhoto || !manualBarcode.trim()">
                            Найти
                        </button>
                    </div>
                    <p
                        v-if="inputError"
                        id="barcode-input-error"
                        class="input-error"
                        role="alert">
                        {{ inputError }}
                    </p>
                </form>
            </div>
        </dialog>
    </Teleport>
</template>

<style scoped>
.scanner-dialog {
    width: min(560px, calc(100% - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elevated);
    color: var(--text);
    box-shadow: var(--shadow-lg);
}
.scanner-dialog::backdrop {
    background: rgba(31, 26, 22, 0.45);
    backdrop-filter: blur(3px);
}
.scanner-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.1rem 1.25rem;
    border-bottom: 1px solid var(--border);
}
.scanner-head h2 {
    margin: 0;
    font-size: 1.25rem;
}
.close-btn {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    font-size: 1.6rem;
    cursor: pointer;
}
.close-btn:hover {
    background: var(--bg-subtle);
    color: var(--text);
}
.scanner-body {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
}
.camera-preview {
    position: relative;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: #1f1a16;
}
.camera-choice,
.camera-zoom {
    display: grid;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
}
.camera-choice select {
    width: 100%;
    min-width: 0;
    height: 42px;
    padding: 0 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text);
    font: inherit;
}
.camera-zoom > span {
    display: flex;
    justify-content: space-between;
}
.camera-zoom input {
    width: 100%;
    accent-color: var(--accent);
}
.camera-preview video {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.scan-guide {
    position: absolute;
    inset: 28% 8%;
    border: 2px solid rgba(255, 255, 255, 0.75);
    border-radius: var(--radius-xs);
    pointer-events: none;
}
.scanner-hint,
.scanner-error,
.input-error {
    margin: 0;
    font-size: 0.9rem;
}
.scanner-hint {
    color: var(--text-muted);
}
.scanner-error {
    padding: 0.85rem 1rem;
    border-radius: var(--radius-sm);
    background: var(--bg-subtle);
}
.input-error {
    color: var(--danger);
}
.scanner-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
}
.primary-btn,
.secondary-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0.6rem 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
}
.secondary-btn {
    background: var(--bg-elevated);
    color: var(--text);
}
.secondary-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
}
.primary-btn {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--text-on-accent);
}
.primary-btn:hover:not(:disabled) {
    background: var(--accent-hover);
}
.primary-btn:disabled,
.secondary-btn:has(input:disabled) {
    opacity: 0.55;
    cursor: not-allowed;
}
.photo-upload {
    position: relative;
}
.photo-upload input {
    position: absolute;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
    overflow: hidden;
}
.photo-upload:focus-within {
    box-shadow: var(--ring-accent);
}
.manual-form {
    display: grid;
    gap: 0.6rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
}
.manual-form > label {
    color: var(--text-muted);
    font-size: 0.9rem;
}
.manual-row {
    display: flex;
    gap: 0.6rem;
}
.manual-row input {
    width: 100%;
    min-width: 0;
    height: 42px;
    padding: 0 0.85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--bg-elevated);
}
@media (max-width: 480px) {
    .scanner-head,
    .scanner-body {
        padding: 1rem;
    }
    .manual-row {
        flex-wrap: wrap;
    }
    .manual-row .primary-btn {
        width: 100%;
    }
}
</style>
