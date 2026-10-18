import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATEGORIES = ['name', 'place', 'animal', 'thing'];
const VALID_MODES = ['classic', 'chaos'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RECONNECT_GRACE_MS = 60_000;
const MAX_PLAYERS = 12;
const VALIDATION_CACHE = new Map();
const VALIDATION_TIMEOUT_MS = 1800;

const cleanName = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 18) || 'Player';
const cleanAnswer = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 60);
const normalizeAnswer = value => cleanAnswer(value).normalize('NFKC').toLocaleLowerCase('en-US');
const validForLetter = (answer, letter) => /^[a-z]/i.test(answer) && answer[0].toLocaleUpperCase('en-US') === letter;

const CATEGORY_RULES = {
  name: {
    include: /given name|first name|middle name|surname|family name|personal name|human|person|fictional character|mythological figure|biblical (?:figure|patriarch|prophet)|actor|actress|singer|musician|writer|author|politician|athlete|scientist|artist|explorer|monarch|king|queen|president|inventor|philosopher|historical figure/i,
    exclude: /species of|genus of|family of|order of|class of|animal|mammal|bird|fish|reptile|amphibian|insect|city|town|village|country|river|mountain|island|lake|building|geographic location/i
  },
  place: {
    include: /place|city|town|village|country|state|province|region|continent|river|mountain|island|lake|ocean|sea|capital|settlement|geographic|geographical|location|national park|desert|valley|district|municipality|airport|building|street/i,
    exclude: /given name|surname|species of|genus of|animal|mammal|bird|fish|reptile|amphibian|insect|person|actor|singer|politician/i
  },
  animal: {
    include: /animal|species|mammal|bird|fish|reptile|amphibian|insect|arachnid|crustacean|mollusc|mollusk|organism|taxon|breed of|genus of|family of animals|butterfly|beetle|snake|lizard|frog|turtle|whale|dolphin|shark|dog breed|cat breed/i,
    exclude: /fictional character|film|movie|song|album|video game|person|given name|city|country|river|mountain/i
  },
  thing: {
    include: /object|artifact|artefact|tool|device|machine|instrument|equipment|vehicle|food|fruit|vegetable|beverage|drink|material|substance|product|utensil|appliance|furniture|clothing|garment|toy|book|musical instrument|electronic component|computer hardware|weapon|container|plant|flower|tree|chemical compound|mineral|textile|fabric|currency|coin|medication|medicine|sporting equipment/i,
    exclude: /given name|surname|person|human|politician|actor|singer|athlete|writer|city|town|village|country|river|mountain|island|lake|geographic location|species of|genus of|animal|mammal|bird|fish|reptile|amphibian|insect|fictional character/i
  }
};
function belongsToCategory(category, item) {
  const rule = CATEGORY_RULES[category];
  if (!rule || !item) return false;
  const description = String(item.description || '');
  const label = String(item.label || '');
  const combined = `${description} ${label}`;
  if (rule.exclude.test(combined)) return false;
  return rule.include.test(combined);
}
async function validateRealAnswer(category, answer) {
  const normalized = normalizeAnswer(answer);
  if (!normalized || !CATEGORY_RULES[category]) return false;
  const cacheKey = `${category}:${normalized}`;
  if (VALIDATION_CACHE.has(cacheKey)) return VALIDATION_CACHE.get(cacheKey);
  const validation = (async () => {
    let timer;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
      const url = new URL('https://www.wikidata.org/w/api.php');
      url.search = new URLSearchParams({ action:'wbsearchentities', search:answer, language:'en', uselang:'en', type:'item', limit:'10', format:'json', origin:'*' }).toString();
      const response = await fetch(url, { signal:controller.signal, headers:{ 'User-Agent':'NaPiTA/1.0 (word-game answer validation)' } });
      if (!response.ok) return false;
      const data = await response.json();
      // Only exact labels or aliases count; fuzzy search results cannot earn points.
      return (data.search || []).some(item => {
        const labels = [item.label, ...(item.aliases || [])].filter(Boolean).map(normalizeAnswer);
        return labels.includes(normalized) && belongsToCategory(category, item);
      });
    } catch {
      // Fail closed: if Wikidata is unreachable, unverified answers score zero.
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  VALIDATION_CACHE.set(cacheKey, validation);
  const result = await validation;
  VALIDATION_CACHE.set(cacheKey, result);
  return result;
}

const makeCode = rooms => {
  let code;
  do { code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomBytes(1)[0] % 32]).join(''); }
  while (rooms.has(code));
  return code;
};

export function createGameServer({ corsOrigin = '*' } = {}) {
  const app = express();
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '16kb' }));
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: corsOrigin, methods: ['GET', 'POST'] }, connectionStateRecovery: { maxDisconnectionDuration: RECONNECT_GRACE_MS, skipMiddlewares: true } });
  const rooms = new Map();

  function timeLeft(room) {
    if (room.status !== 'playing' || !room.endsAt) return room.timeLeft || 0;
    return Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000));
  }
  function snapshot(room) {
    return {
      code: room.code, hostId: room.hostId, status: room.status, settings: room.settings, gameId: room.gameId || null,
      letter: room.letter, round: room.round, timeLeft: timeLeft(room), endsAt: room.endsAt,
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, ready: p.ready, score: p.score, answers: { ...p.answers }, submitted: p.submitted, connected: p.connected })),
      results: room.results.map(result => ({ ...result, answers: { ...result.answers }, categoryPoints: { ...result.categoryPoints } })), bonusCategory: room.bonusCategory || null
    };
  }
  const emitRoom = room => io.to(room.code).emit('room:update', snapshot(room));
  function removePlayer(room, player) {
    if (player.expiryTimer) clearTimeout(player.expiryTimer);
    room.players.delete(player.id);
    if (room.hostId === player.id) {
      room.hostId = [...room.players.values()].find(p => p.connected)?.id || [...room.players.keys()][0] || null;
    }
    if (room.players.size === 0) {
      if (room.timer) clearInterval(room.timer);
      rooms.delete(room.code);
      return;
    }
    if (room.status === 'playing' && [...room.players.values()].every(p => p.submitted)) finishRound(room);
    else emitRoom(room);
  }
  async function finishRound(room) {
    if (room.status !== 'playing') return;
    room.status = 'validating';
    if (room.timer) clearInterval(room.timer);
    room.timer = null; room.endsAt = null; room.timeLeft = 0;
    const players = [...room.players.values()];
    emitRoom(room);
    const points = new Map(players.map(p => [p.id, 0]));
    const categoryPoints = new Map(players.map(p => [p.id, Object.fromEntries(CATEGORIES.map(k => [k, 0]))]));
    const validity = new Map();
    await Promise.all(players.flatMap(player => CATEGORIES.map(async key => {
      const answer = normalizeAnswer(player.answers[key]);
      const valid = Boolean(answer && validForLetter(answer, room.letter) && await validateRealAnswer(key, player.answers[key]));
      validity.set(`${player.id}:${key}`, valid);
    })));
    for (const key of CATEGORIES) {
      const counts = new Map();
      for (const player of players) {
        const answer = normalizeAnswer(player.answers[key]);
        if (validity.get(`${player.id}:${key}`)) counts.set(answer, (counts.get(answer) || 0) + 1);
      }
      for (const player of players) {
        const answer = normalizeAnswer(player.answers[key]);
        if (!validity.get(`${player.id}:${key}`)) continue;
        const earned = counts.get(answer) === 1 ? 10 : 5;
        points.set(player.id, points.get(player.id) + earned);
        categoryPoints.get(player.id)[key] = earned;
      }
    }
    if (room.settings.mode === 'chaos') {
      const bonusCategory = CATEGORIES[randomBytes(1)[0] % CATEGORIES.length];
      for (const player of players) {
        const base = categoryPoints.get(player.id)[bonusCategory];
        if (base > 0) { points.set(player.id, points.get(player.id) + base); categoryPoints.get(player.id)[bonusCategory] = base * 2; }
      }
      room.bonusCategory = bonusCategory;
    } else room.bonusCategory = null;
    for (const player of players) player.score += points.get(player.id);
    room.results = players.map(p => ({ id: p.id, name: p.name, answers: { ...p.answers }, categoryPoints: categoryPoints.get(p.id), roundPoints: points.get(p.id), totalScore: p.score }))
      .sort((a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name));
    room.status = 'results';
    emitRoom(room);
  }
  function startRound(room) {
    if (room.timer) clearInterval(room.timer);
    room.status = 'playing'; room.round += 1; room.answerVotes = new Map();
    room.letter = LETTERS[randomBytes(1)[0] % LETTERS.length];
    room.timeLeft = room.settings.duration; room.endsAt = Date.now() + room.settings.duration * 1000; room.results = [];
    for (const p of room.players.values()) { p.answers = Object.fromEntries(CATEGORIES.map(k => [k, ''])); p.submitted = false; }
    emitRoom(room);
    let lastSent = room.settings.duration;
    room.timer = setInterval(() => {
      if (!rooms.has(room.code) || room.status !== 'playing') { clearInterval(room.timer); return; }
      const remaining = timeLeft(room);
      room.timeLeft = remaining;
      if (remaining <= 0) { finishRound(room); return; }
      if (remaining !== lastSent) { lastSent = remaining; io.to(room.code).emit('round:tick', { timeLeft: remaining, endsAt: room.endsAt, serverNow: Date.now() }); }
    }, 200);
  }
  function ack(cb, value) { if (typeof cb === 'function') cb(value); }
  function getPlayer(room, socket) {
    if (!room) return null;
    return [...room.players.values()].find(p => p.socketId === socket.id) || null;
  }
  function findRoom(payload) { return rooms.get(String(payload?.code || '').trim().toUpperCase()); }

  io.on('connection', socket => {
    socket.on('room:create', (payload = {}, cb) => {
      const code = makeCode(rooms), playerId = randomUUID(), token = randomBytes(24).toString('hex');
      const duration = Number(payload.settings?.duration), rounds = Number(payload.settings?.rounds);
      const room = {
        code, hostId: playerId, status: 'lobby',
        settings: { duration: [30, 45, 60, 90, 120].includes(duration) ? duration : 60, rounds: [1, 3, 5, 7, 10].includes(rounds) ? rounds : 3, mode: VALID_MODES.includes(payload.settings?.mode) ? payload.settings.mode : 'classic' },
        letter: '', round: 0, timeLeft: 0, endsAt: null, players: new Map(), results: [], timer: null, bonusCategory: null, answerVotes: new Map()
      };
      const player = { id: playerId, token, socketId: socket.id, name: cleanName(payload.name), ready: true, score: 0, answers: Object.fromEntries(CATEGORIES.map(k => [k, ''])), submitted: false, connected: true, expiryTimer: null };
      room.players.set(player.id, player); rooms.set(code, room); socket.join(code);
      ack(cb, { ok: true, room: snapshot(room), playerId, token }); emitRoom(room);
    });

    socket.on('room:join', (payload = {}, cb) => {
      const room = findRoom(payload);
      if (!room) return ack(cb, { ok: false, error: 'Room not found. Check the code and try again.' });
      if (room.status !== 'lobby') return ack(cb, { ok: false, error: 'This game has already started.' });
      if (room.players.size >= MAX_PLAYERS) return ack(cb, { ok: false, error: `This room is full (${MAX_PLAYERS} players max).` });
      const playerId = randomUUID(), token = randomBytes(24).toString('hex');
      const player = { id: playerId, token, socketId: socket.id, name: cleanName(payload.name), ready: false, score: 0, answers: Object.fromEntries(CATEGORIES.map(k => [k, ''])), submitted: false, connected: true, expiryTimer: null };
      room.players.set(player.id, player); socket.join(room.code);
      ack(cb, { ok: true, room: snapshot(room), playerId, token }); emitRoom(room);
    });

    socket.on('room:reconnect', (payload = {}, cb) => {
      const room = findRoom(payload);
      const player = room && [...room.players.values()].find(p => p.token === payload.token);
      if (!room || !player) return ack(cb, { ok: false, error: 'Your room session expired. Join the room again with its code.' });
      if (player.expiryTimer) clearTimeout(player.expiryTimer);
      player.expiryTimer = null; player.socketId = socket.id; player.connected = true;
      socket.join(room.code);
      ack(cb, { ok: true, room: snapshot(room), playerId: player.id, token: player.token });
      emitRoom(room);
    });

    socket.on('room:leave', (payload = {}, cb) => {
      const room = findRoom(payload), player = getPlayer(room, socket);
      if (!room || !player) return ack(cb, { ok: true });
      socket.leave(room.code); removePlayer(room, player); ack(cb, { ok: true });
    });

    socket.on('player:ready', (payload = {}, cb) => {
      const room = findRoom(payload), player = getPlayer(room, socket);
      if (!player || room.status !== 'lobby') return ack(cb, { ok: false, error: 'Ready status can only change in the lobby.' });
      player.ready = Boolean(payload.ready); emitRoom(room); ack(cb, { ok: true });
    });

    socket.on('game:start', (payload = {}, cb) => {
      const room = findRoom(payload), player = getPlayer(room, socket);
      if (!room) return ack(cb, { ok: false, error: 'Room no longer exists.' });
      if (!player || room.hostId !== player.id) return ack(cb, { ok: false, error: 'Only the host can start the game.' });
      if (room.status !== 'lobby') return ack(cb, { ok: false, error: 'The game has already started.' });
      if (room.players.size < 2) return ack(cb, { ok: false, error: 'Invite at least one friend to start.' });
      if ([...room.players.values()].some(p => !p.ready || !p.connected)) return ack(cb, { ok: false, error: 'Everyone needs to be connected and ready first.' });
      room.players.forEach(p => p.score = 0); room.gameId = randomUUID(); startRound(room); ack(cb, { ok: true });
    });

    socket.on('answers:update', (payload = {}, cb) => {
      const room = findRoom(payload), player = getPlayer(room, socket);
      if (!player || room.status !== 'playing' || player.submitted || timeLeft(room) <= 0) return ack(cb, { ok: false, error: 'This round is no longer accepting answers.' });
      const answers = {};
      for (const key of CATEGORIES) answers[key] = cleanAnswer(payload.answers?.[key]);
      player.answers = answers; ack(cb, { ok: true });
    });

    socket.on('answers:submit', (payload = {}, cb) => {
      const room = findRoom(payload), player = getPlayer(room, socket);
      if (!player || room.status !== 'playing') return ack(cb, { ok: false, error: 'Round is not active.' });
      if (timeLeft(room) <= 0) { finishRound(room); return ack(cb, { ok: false, error: 'Time is up.' }); }
      if (player.submitted) return ack(cb, { ok: true, alreadySubmitted: true });
      if (payload.answers) player.answers = Object.fromEntries(CATEGORIES.map(k => [k, cleanAnswer(payload.answers[k])]));
      player.submitted = true;
      io.to(room.code).emit('player:progress', { id: player.id, submitted: true });
      if ([...room.players.values()].every(p => p.submitted)) finishRound(room); else emitRoom(room);
      ack(cb, { ok: true });
    });

    socket.on('answer:challenge', (payload = {}, cb) => {
      const room = findRoom(payload), player = getPlayer(room, socket);
      const category = CATEGORIES.includes(payload.category) ? payload.category : null;
      const targetId = String(payload.targetId || '');
      if (!room || room.status !== 'results' || !player || !category || !room.results.some(r => r.id === targetId)) return ack(cb, { ok: false, error: 'That answer cannot be challenged now.' });
      if (targetId === player.id) return ack(cb, { ok: false, error: 'You cannot challenge your own answer.' });
      const key = `${room.round}:${targetId}:${category}`;
      const votes = room.answerVotes.get(key) || new Set();
      if (votes.has(player.id)) return ack(cb, { ok: false, error: 'You already flagged this answer.' });
      votes.add(player.id); room.answerVotes.set(key, votes);
      io.to(room.code).emit('answer:challenge:update', { targetId, category, votes: votes.size });
      ack(cb, { ok: true, votes: votes.size, note: 'Flag recorded for host review. Scores are unchanged.' });
    });

    socket.on('game:next', (payload = {}, cb) => {
      const room = findRoom(payload), player = getPlayer(room, socket);
      if (!room || !player || room.hostId !== player.id || room.status !== 'results') return ack(cb, { ok: false, error: 'Only the host can continue.' });
      if (room.round >= room.settings.rounds) { room.status = 'finished'; emitRoom(room); return ack(cb, { ok: true, finished: true }); }
      startRound(room); ack(cb, { ok: true });
    });

    socket.on('game:rematch', (payload = {}, cb) => {
      const room = findRoom(payload), player = getPlayer(room, socket);
      if (!room || !player || room.hostId !== player.id || room.status !== 'finished') return ack(cb, { ok: false, error: 'Only the host can start a rematch.' });
      room.players.forEach(p => { p.score = 0; p.ready = p.id === room.hostId; p.answers = Object.fromEntries(CATEGORIES.map(k => [k, ''])); p.submitted = false; });
      room.round = 0; room.status = 'lobby'; room.letter = ''; room.results = []; room.timeLeft = 0; room.endsAt = null; room.bonusCategory = null; room.gameId = null; emitRoom(room); ack(cb, { ok: true });
    });

    socket.on('disconnect', () => {
      for (const room of rooms.values()) {
        const player = getPlayer(room, socket);
        if (!player) continue;
        player.connected = false;
        if (room.hostId === player.id) room.hostId = [...room.players.values()].find(p => p.id !== player.id && p.connected)?.id || player.id;
        player.expiryTimer = setTimeout(() => {
          const stillHere = room.players.get(player.id);
          if (stillHere && !stillHere.connected) removePlayer(room, stillHere);
        }, RECONNECT_GRACE_MS);
        if (room.status === 'playing' && [...room.players.values()].every(p => p.submitted)) finishRound(room);
        else emitRoom(room);
        break;
      }
    });
  });

  app.get('/health', (_req, res) => res.json({ ok: true, app: 'NaPiTA', activeRooms: rooms.size }));
  const dist = path.resolve(__dirname, '../dist');
  app.use(express.static(dist));
  app.get('*', (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), err => { if (err) next(); }));
  return { app, server, io, rooms };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const origins = (process.env.CLIENT_ORIGIN || '*').split(',').map(s => s.trim());
  const { server } = createGameServer({ corsOrigin: origins.length === 1 ? origins[0] : origins });
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`NaPiTA server running on http://localhost:${PORT}`));
}
