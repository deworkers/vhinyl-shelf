export function normalizeBarcode(value) {
	if (typeof value !== 'string') return '';
	const barcode = value.replace(/[\s-]/g, '');
	return /^(?:\d{8}|\d{12,13})$/.test(barcode) && !/^0+$/.test(barcode)
		? barcode
		: '';
}
