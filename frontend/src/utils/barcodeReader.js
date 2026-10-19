export async function createBarcodeReader() {
	const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
		await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
	const hints = new Map([
		[
			DecodeHintType.POSSIBLE_FORMATS,
			[
				BarcodeFormat.EAN_13,
				BarcodeFormat.EAN_8,
				BarcodeFormat.UPC_A,
				BarcodeFormat.UPC_E,
			],
		],
		[DecodeHintType.TRY_HARDER, true],
	]);
	return new BrowserMultiFormatReader(hints, {
		delayBetweenScanAttempts: 150,
	});
}
