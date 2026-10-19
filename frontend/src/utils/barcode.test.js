import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeBarcode } from './barcode.js';

test('EAN and UPC remain strings with leading zeros intact', () => {
	assert.equal(normalizeBarcode('0 602567-988724'), '0602567988724');
	assert.equal(normalizeBarcode('602567988724'), '602567988724');
	assert.equal(normalizeBarcode('96385074'), '96385074');
});

test('text searches and malformed codes are not treated as barcodes', () => {
	for (const value of ['Queen', '1984', '', '0000000000000', 'EAN602567988724', 602567988724]) {
		assert.equal(normalizeBarcode(value), '', String(value));
	}
});
