import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoundScores } from '../shared/scoring.js';

const allValid = () => ({ name: { status: 'valid' }, place: { status: 'valid' }, animal: { status: 'valid' }, thing: { status: 'valid' } });

test('scores unique valid answers and shared valid answers correctly in Chaos mode', () => {
  const players = [
    { id: 'p1', name: 'A', answers: { name: 'Quinn', place: 'Qatar', animal: 'Quail', thing: 'Quill' } },
    { id: 'p2', name: 'B', answers: { name: 'Quinn', place: 'Quito', animal: 'Quail', thing: 'Quilt' } }
  ];
  const validation = new Map([['p1', allValid()], ['p2', allValid()]]);
  const room = { letter: 'Q', settings: { mode: 'chaos' }, bonusCategory: 'animal' };
  const scores = calculateRoundScores(room, players, validation);
  assert.equal(scores[0].categoryPoints.name, 5, 'matching names earn 5 points');
  assert.equal(scores[0].categoryPoints.animal, 10, 'matching answers in the Chaos category get doubled');
  assert.equal(scores[0].categoryPoints.place, 10, 'unique valid place earns 10 points');
  assert.equal(scores[0].roundPoints, 35);
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
