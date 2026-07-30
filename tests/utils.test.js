import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCsvCell, escHtml } from '../src/utils.js';

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

test('escHtml neutralizes HTML tags and special characters', () => {
  assert.equal(escHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escHtml("2026-01-01' OR '1'='1"), '2026-01-01&#39; OR &#39;1&#39;=&#39;1');
  assert.equal(escHtml('A & B'), 'A &amp; B');
  assert.equal(escHtml(null), '');
  assert.equal(escHtml(undefined), '');
});

