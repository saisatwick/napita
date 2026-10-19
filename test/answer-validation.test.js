import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestSpelling, validateLocally } from '../shared/answer-data.js';

test('accepts common regional Indian names and known animals', () => {
  assert.equal(validateLocally('Jhansi', 'name', 'J').status, 'valid');
  assert.equal(validateLocally('Quail', 'animal', 'Q').status, 'valid');
});

test('rejects a well-known name under Animal and rejects the wrong starting letter', () => {
  assert.equal(validateLocally('Noah', 'animal', 'N').status, 'invalid');
  assert.equal(validateLocally('Quail', 'animal', 'M').status, 'invalid');
});

test('offers a correction for likely typos without silently rewriting the answer', () => {
  const validation = validateLocally('Qail', 'animal', 'Q');
  assert.equal(validation.status, 'review');
  assert.equal(validation.suggestion, 'Quail');
  assert.equal(suggestSpelling('Qail', 'animal', 'Q'), 'Quail');
});

test('rejects answers that clearly belong to another category without manual review', () => {
  const vulture = validateLocally('Vulture', 'name', 'V');
  assert.equal(vulture.status, 'invalid');
  assert.match(vulture.reason, /animal, not name/i);
  assert.equal(validateLocally('Vietnam', 'place', 'V').status, 'valid');
  assert.equal(validateLocally('Van', 'thing', 'V').status, 'valid');
});

test('does not send unrecognised category answers to manual review', () => {
  assert.equal(validateLocally('Monkey', 'name', 'M').status, 'invalid');
});
