import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	getBarcodeCameraConstraints,
	configureBarcodeCamera,
	setBarcodeCameraZoom,
} from './barcodeCamera.js';

test('barcode video prefers the rear camera at 1080p and can select a specific lens', () => {
	const defaults = getBarcodeCameraConstraints();
	assert.equal(defaults.audio, false);
	assert.equal(defaults.video.facingMode.ideal, 'environment');
	assert.equal(defaults.video.width.ideal, 1920);
	assert.equal(defaults.video.height.ideal, 1080);
	const selected = getBarcodeCameraConstraints('macro-camera');
	assert.equal(selected.video.deviceId.exact, 'macro-camera');
	assert.equal(selected.video.facingMode, undefined);
});

test('a camera with continuous autofocus is focused before decoding', async () => {
	let focusMode = 'manual';
	const track = {
		getCapabilities: () => ({ focusMode: ['manual', 'continuous'] }),
		getConstraints: () => ({ width: { ideal: 1920 } }),
		applyConstraints: async (constraints) => {
			assert.equal(constraints.width.ideal, 1920);
			focusMode = constraints.advanced.at(-1).focusMode;
		},
	};
	assert.equal(await configureBarcodeCamera(track), null);
	assert.equal(focusMode, 'continuous');
});

test('missing or rejected focus capabilities do not prevent scanning', async () => {
	assert.equal(await configureBarcodeCamera({}), null);
	assert.equal(await configureBarcodeCamera({
		getCapabilities: () => { throw new Error('unsupported'); },
	}), null);
	const zoom = await configureBarcodeCamera({
		getCapabilities: () => ({ focusMode: ['continuous'], zoom: { min: 1, max: 4, step: 0.1 } }),
		getSettings: () => ({ zoom: 2 }),
		applyConstraints: async () => { throw new Error('unsupported focus'); },
	});
	assert.deepEqual(zoom, { min: 1, max: 4, step: 0.1, value: 2 });
});

test('zoom controls only describe a usable camera range', async () => {
	assert.equal(await configureBarcodeCamera({
		getCapabilities: () => ({ zoom: { min: 1, max: 1, step: 0 } }),
	}), null);
	const zoom = await configureBarcodeCamera({
		getCapabilities: () => ({ zoom: { min: 1, max: 3, step: 0 } }),
		getSettings: () => ({ zoom: 9 }),
	});
	assert.deepEqual(zoom, { min: 1, max: 3, step: 0.1, value: 3 });
});

test('changing zoom twice preserves autofocus and replaces the previous zoom', async () => {
	let constraints = { width: { ideal: 1920 }, advanced: [{ focusMode: 'continuous', zoom: 1 }] };
	const track = {
		getConstraints: () => constraints,
		applyConstraints: async (next) => { constraints = next; },
	};
	await setBarcodeCameraZoom(track, 2);
	await setBarcodeCameraZoom(track, 3);
	assert.equal(constraints.width.ideal, 1920);
	assert.equal(constraints.advanced.find((item) => item.focusMode)?.focusMode, 'continuous');
	assert.deepEqual(constraints.advanced.filter((item) => 'zoom' in item).map((item) => item.zoom), [3]);
});
