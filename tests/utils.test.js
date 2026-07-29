import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCsvCell } from '../src/utils.js';

test('sanitizeCsvCell preserves numeric 0', () => {
  assert.equal(sanitizeCsvCell(0), '"0"');
});

test('sanitizeCsvCell preserves boolean false', () => {
  assert.equal(sanitizeCsvCell(false), '"false"');
});

test('sanitizeCsvCell handles null and undefined as empty strings', () => {
  assert.equal(sanitizeCsvCell(null), '""');
  assert.equal(sanitizeCsvCell(undefined), '""');
});

test('sanitizeCsvCell neutralizes formula injection triggers', () => {
  assert.equal(sanitizeCsvCell('=1+1'), '"\'=1+1"');
  assert.equal(sanitizeCsvCell('  +cmd'), '"\'  +cmd"');
  assert.equal(sanitizeCsvCell('@admin'), '"\'@admin"');
});

test('sanitizeCsvCell handles double quotes escaping', () => {
  assert.equal(sanitizeCsvCell('Task "Feature"'), '"Task ""Feature"""');
});
