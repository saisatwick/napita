import test from 'node:test';
import assert from 'node:assert/strict';
import { io as makeClient } from 'socket.io-client';
import { createGameServer } from '../server/index.js';

const connect = url => new Promise((resolve, reject) => {
  const socket = makeClient(url, { transports: ['websocket'], reconnection: false, timeout: 3000 });
  socket.once('connect', () => resolve(socket));
  socket.once('connect_error', reject);
});
const emitAck = (socket, event, payload) => new Promise(resolve => socket.emit(event, payload, resolve));
const waitFor = (socket, event, predicate = () => true, timeout = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timed out waiting for ${event}`)); }, timeout);
  const handler = value => { if (!predicate(value)) return; clearTimeout(timer); socket.off(event, handler); resolve(value); };
  socket.on(event, handler);
});

test('private rooms, reconnect, validation, scoring and rematch', async t => {
  const game = createGameServer();
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  const address = game.server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const host = await connect(url), guest = await connect(url);
  t.after(async () => {
    host.disconnect(); guest.disconnect();
    for (const room of game.rooms.values()) {
      if (room.timer) clearInterval(room.timer);
      for (const player of room.players.values()) if (player.expiryTimer) clearTimeout(player.expiryTimer);
    }
    await new Promise(resolve => game.io.close(resolve));
  });

  const created = await emitAck(host, 'room:create', { name: 'Host', settings: { duration: 30, rounds: 1, fixedLetter: 'N' } });
  assert.equal(created.ok, true);
  assert.match(created.room.code, /^[A-Z2-9]{4}$/);
  const joined = await emitAck(guest, 'room:join', { code: created.room.code.toLowerCase(), name: 'Guest' });
  assert.equal(joined.ok, true);
  assert.equal(joined.room.players.length, 2);
  assert.equal((await emitAck(guest, 'game:start', { code: created.room.code })).ok, false, 'non-host cannot start');
  await emitAck(guest, 'player:ready', { code: created.room.code, ready: true });
  const started = waitFor(host, 'room:update', room => room.status === 'playing');
  assert.equal((await emitAck(host, 'game:start', { code: created.room.code })).ok, true);
  const playing = await started;
  const letter = playing.letter;
  assert.equal(letter, 'N', 'fixed-letter rooms use the configured letter');
  assert.ok(playing.endsAt > Date.now(), 'round deadline is server-generated');
  assert.ok(playing.timeLeft > 0 && playing.timeLeft <= 30, 'round timer begins within configured duration');
  const hostAnswers = { name: 'Noah', place: 'Nagpur', animal: 'Newt', thing: 'Apple' };
  const guestAnswers = { name: 'Noah', place: 'Nellore', animal: 'Newt', thing: 'Notebook' };
  assert.equal((await emitAck(host, 'answers:update', { code: created.room.code, answers: hostAnswers })).ok, true);
  assert.equal((await emitAck(guest, 'answers:update', { code: created.room.code, answers: guestAnswers })).ok, true);
  const resultsEvent = waitFor(host, 'room:update', room => room.status === 'results');
  const hiddenAnswersEvent = waitFor(host, 'room:update', room => room.status === 'playing' && room.players.some(player => player.submitted));
  await emitAck(host, 'answers:submit', { code: created.room.code });
  const liveRoom = await hiddenAnswersEvent;
  assert.equal(liveRoom.players.find(player => player.id === joined.playerId).answers, undefined, 'other players cannot read draft answers before reveal');
  await emitAck(guest, 'answers:submit', { code: created.room.code });
  const results = await resultsEvent;
  const hostResult = results.results.find(r => r.id === created.playerId);
  assert.equal(hostResult.categoryPoints.name, 5, 'duplicate valid names earn 5 points');
  assert.equal(hostResult.categoryPoints.place, 10, 'valid unique Indian place names earn 10 points');
  assert.equal(hostResult.categoryPoints.animal, 5, 'duplicate valid animals earn 5 points');
  assert.equal(hostResult.categoryPoints.thing, 0, 'answers starting with the wrong letter score zero');
  assert.equal(hostResult.roundPoints, 20);
  const guestResult = results.results.find(r => r.id === joined.playerId);
  assert.equal(guestResult.categoryPoints.place, 10, 'another valid Indian place name is recognised');
  assert.equal(guestResult.categoryPoints.thing, 10, 'valid unique objects score correctly');

  assert.equal((await emitAck(host, 'game:next', { code: created.room.code })).ok, true);
  const finished = waitFor(host, 'room:update', room => room.status === 'finished');
  // A one-round room goes to the final screen when the host continues from results.
  await finished;
  const rematchLobby = waitFor(host, 'room:update', room => room.status === 'lobby' && room.round === 0);
  assert.equal((await emitAck(host, 'game:rematch', { code: created.room.code })).ok, true);
  const lobby = await rematchLobby;
  assert.equal(lobby.players.find(p => p.id === created.playerId).score, 0);
  assert.equal(lobby.players.find(p => p.id === joined.playerId).ready, false);

  // Simulate a dropped connection and reclaim the same player seat with its private token.
  guest.disconnect();
  await new Promise(resolve => setTimeout(resolve, 50));
  const guestAgain = await connect(url);
  const reconnected = await emitAck(guestAgain, 'room:reconnect', { code: created.room.code, token: joined.token });
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.playerId, joined.playerId);
  assert.equal(reconnected.room.players.find(p => p.id === joined.playerId).connected, true);
  guestAgain.disconnect();
});
