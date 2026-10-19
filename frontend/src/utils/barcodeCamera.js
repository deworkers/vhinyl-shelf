export function getBarcodeCameraConstraints(deviceId = '') {
	return {
		audio: false,
		video: {
			...(deviceId
				? { deviceId: { exact: deviceId } }
				: { facingMode: { ideal: 'environment' } }),
			width: { ideal: 1920 },
			height: { ideal: 1080 },
		},
	};
}

function applyCameraSettings(track, settings) {
	const constraints = track.getConstraints?.() || {};
	const advanced = (constraints.advanced || [])
		.map((entry) => Object.fromEntries(
			Object.entries(entry).filter(([key]) => !(key in settings)),
		))
		.filter((entry) => Object.keys(entry).length);
	return track.applyConstraints({
		...constraints,
		advanced: [...advanced, settings],
	});
}

export async function configureBarcodeCamera(track) {
	let capabilities;
	try {
		capabilities = track?.getCapabilities?.() || {};
	} catch {
		return null;
	}
	if (capabilities.focusMode?.includes('continuous')) {
		try {
			await applyCameraSettings(track, { focusMode: 'continuous' });
		} catch {
			// Драйвер может сообщать о поддержке фокуса, но отклонять настройку.
		}
	}
	const zoom = capabilities.zoom;
	if (!zoom || !Number.isFinite(zoom.min) || !Number.isFinite(zoom.max) || zoom.max <= zoom.min) {
		return null;
	}
	const currentZoom = track.getSettings?.().zoom;
	return {
		min: zoom.min,
		max: zoom.max,
		step: Number.isFinite(zoom.step) && zoom.step > 0 ? zoom.step : 0.1,
		value: Number.isFinite(currentZoom)
			? Math.min(zoom.max, Math.max(zoom.min, currentZoom))
			: zoom.min,
	};
}

export function setBarcodeCameraZoom(track, zoom) {
	return applyCameraSettings(track, { zoom });
}
