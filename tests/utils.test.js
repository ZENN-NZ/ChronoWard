import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCsvCell, escHtml, parseTicketNum } from '../src/utils.js';

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

test('parseTicketNum validates Dual 12/12 prefix and integer ID constraints', () => {
  assert.deepEqual(parseTicketNum(''), { prefix: '', id: '', isValid: true });
  assert.deepEqual(parseTicketNum(null), { prefix: '', id: '', isValid: true });
  assert.deepEqual(parseTicketNum('INC0012345'), { prefix: 'INC', id: '0012345', isValid: true });
  assert.deepEqual(parseTicketNum('RITM10000000'), { prefix: 'RITM', id: '10000000', isValid: true });
  assert.deepEqual(parseTicketNum('DEV-12345'), { prefix: 'DEV-', id: '12345', isValid: true });
  assert.deepEqual(parseTicketNum('123456789012'), { prefix: '', id: '123456789012', isValid: true });
  assert.deepEqual(parseTicketNum('SUPPORT'), { prefix: 'SUPPORT', id: '', isValid: true });

  // Invalid cases (> 12 chars prefix or > 12 digits ID)
  assert.equal(parseTicketNum('INFRASTRUCTURE-12345').isValid, false); // Prefix "INFRASTRUCTURE-" is 15 chars
  assert.equal(parseTicketNum('NINJA-1234567890123').isValid, false); // ID "1234567890123" is 13 digits
  assert.equal(parseTicketNum('1234567890123').isValid, false); // ID is 13 digits
});


