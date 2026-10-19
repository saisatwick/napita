import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoundScores } from '../shared/scoring.js';

const allValid = () => ({ name: { status: 'valid' }, place: { status: 'valid' }, animal: { status: 'valid' }, thing: { status: 'valid' } });

test('scores unique valid answers for 10 and matching valid answers for 5 each', () => {
  const players = [
    { id: 'p1', name: 'A', answers: { name: 'Quinn', place: 'Qatar', animal: 'Quail', thing: 'Quill' } },
    { id: 'p2', name: 'B', answers: { name: 'Quinn', place: 'Quito', animal: 'Quail', thing: 'Quilt' } }
  ];
  const validation = new Map([['p1', allValid()], ['p2', allValid()]]);
  const room = { letter: 'Q', settings: { mode: 'classic' }, bonusCategory: null };
  const scores = calculateRoundScores(room, players, validation);
  assert.equal(scores[0].categoryPoints.name, 5, 'matching names earn 5 points');
  assert.equal(scores[0].categoryPoints.animal, 5, 'matching answers score 5 each');
  assert.equal(scores[0].categoryPoints.place, 10, 'unique valid place earns 10 points');
  assert.equal(scores[0].roundPoints, 30);
});

test('invalid or unreviewed answers cannot dilute a valid answer duplicate count', () => {
  const players = [
    { id: 'p1', name: 'A', answers: { name: 'Quinn', place: '', animal: 'Quail', thing: '' } },
    { id: 'p2', name: 'B', answers: { name: 'Quinn', place: '', animal: 'Quail', thing: '' } }
  ];
  const p1 = { ...allValid(), animal: { status: 'review' } };
  const p2 = { ...allValid(), place: { status: 'empty' }, thing: { status: 'empty' } };
  const validation = new Map([['p1', p1], ['p2', p2]]);
  const room = { letter: 'Q', settings: { mode: 'classic' }, bonusCategory: null };
  const scores = calculateRoundScores(room, players, validation);
  assert.equal(scores.find(score => score.player.id === 'p1').categoryPoints.animal, 0);
  assert.equal(scores.find(score => score.player.id === 'p2').categoryPoints.animal, 10, 'only accepted answers count for duplicate scoring');
});


test('case and whitespace differences still count as matching answers', () => {
  const players = [
    { id: 'p1', name: 'A', answers: { name: 'Harsha', place: '', animal: '', thing: '' } },
    { id: 'p2', name: 'B', answers: { name: ' harsha ', place: '', animal: '', thing: '' } }
  ];
  const validation = new Map([['p1', allValid()], ['p2', allValid()]]);
  const scores = calculateRoundScores({ letter: 'H', settings: { mode: 'classic' } }, players, validation);
  assert.equal(scores[0].categoryPoints.name, 5);
  assert.equal(scores[1].categoryPoints.name, 5);
  assert.equal(scores[0].roundPoints, 5);
  assert.equal(scores[1].roundPoints, 5);
});
