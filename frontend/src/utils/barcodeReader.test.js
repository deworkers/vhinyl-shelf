import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library';
import { createBarcodeReader } from './barcodeReader.js';

function barcodeImage(code) {
	const left = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
	const even = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
	const right = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
	const parities = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
	const parity = parities[Number(code[0])];
	const modules = '0'.repeat(11) + '101' +
		[...code.slice(1, 7)].map((digit, index) => (parity[index] === 'L' ? left : even)[Number(digit)]).join('') +
		'01010' + [...code.slice(7)].map((digit) => right[Number(digit)]).join('') + '101' + '0'.repeat(11);
	const width = modules.length * 3;
	const height = 120;
	const pixels = new Uint8ClampedArray(width * height).fill(255);
	for (let y = 10; y < height - 10; y += 1) {
		for (let x = 0; x < modules.length; x += 1) {
			if (modules[x] === '1') pixels.fill(0, y * width + x * 3, y * width + x * 3 + 3);
		}
	}
	return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
}

test('scanner decodes a UPC represented as EAN-13 with a leading zero', async () => {
	const reader = await createBarcodeReader();
	assert.equal(reader.decodeBitmap(barcodeImage('0602567988724')).getText(), '602567988724');
});

test('scanner decodes an EAN-13 without dropping meaningful digits', async () => {
	const reader = await createBarcodeReader();
	assert.equal(reader.decodeBitmap(barcodeImage('4006381333931')).getText(), '4006381333931');
});

test('scanner rejects an image with an invalid barcode checksum', async () => {
	const reader = await createBarcodeReader();
	assert.throws(() => reader.decodeBitmap(barcodeImage('4006381333932')));
});
