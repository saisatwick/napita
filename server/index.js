import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATEGORIES = ['name', 'place', 'animal', 'thing'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RECONNECT_GRACE_MS = 60_000;
const MAX_PLAYERS = 12;
const COMMON_ANSWERS = {
  name: new Set('aarav aarohi abhi abhay aditi aditya ajay akash akhil akshara akshay amara amit amrita ananya anil anjali ananya arjun arnav arun arya ashish asha ashok avinash bhanu bharat bhavana bhavya chaitanya charan chetan deepa deepak deepika dev dhruv diya divya gautam geetha gita gopal harini hari harsha hema indira ishita jagan jai janaki jasmin jay jhansi jiya kalyan kalyani karthik kavya keerthi kiran kishore krishna lakshmi lavanya madhav madhavi mahesh manoj megha meera mihir mohan nagesh nakul nandini naveen navya neha nikhil nikita nisha nithin pooja prasad praveen priya rahul raj raja rakesh ram rama ravi rekha rohan rohit sai sakshi sanjay sandeep sanjana sarah satya shiva shreya siddharth sneha srinivas sriram sushma swathi teja uma varun ved vikas vijay vikram vishal yash'.split(' ')),
  place: new Set('agra ahmedabad amaravati amritsar anakapalle andhra araku aurangabad australia bangalore bengaluru bhopal bhubaneswar chennai chicago delhi dubai hyderabad india indore jaipur jammu jamnagar jhansi jodhpur kanpur kashmir kerala kolkata london lucknow madurai mumbai mysore nagpur nellore newyork ooty paris pune rajahmundry rajasthan surat tirupati vijayawada vizag warangal washington'.split(' ')),
  animal: new Set('ant antelope bear bee buffalo butterfly camel cat cheetah chicken cow crocodile deer dog dolphin donkey dove duck eagle elephant fish flamingo fox frog giraffe goat goose gorilla hawk hen hippopotamus horse hyena jaguar jellyfish kangaroo koala leopard lion lizard llama lobster monkey mosquito mouse octopus ostrich otter owl ox panda parrot peacock penguin pig pigeon platypus polar bear quail rabbit rat raven rhinoceros salmon shark sheep snake sparrow spider squirrel tiger tortoise turtle vulture whale wolf yak zebra'.split(' ')),
  thing: new Set('airplane album apple apron arrow bag ball balloon banana battery bed belt bicycle book bottle bowl box bracelet bread broom brush bucket camera candle car card carpet chair charger clock clothes comb computer cup curtain cushion desk dictionary door dress drum earphones envelope fan flag flower fork fridge game glass glue guitar hammer hat headphones helmet key keyboard knife lamp laptop map mattress mirror monitor mouse mug notebook paper pen pencil phone pillow plate pot purse radio ruler scissors screen shoe soap sofa spoon spoon steel spoon suitcase table tablet television tent ticket towel toy train tree umbrella vase wallet watch water bottle window'.split(' '))
};
const validCategory = (answer, category) => { const normalized = normalizeAnswer(answer).replace(/[^a-z0-9 ]/g, '').trim(); if (!normalized) return false; if (COMMON_ANSWERS[category]?.has(normalized)) return true; if (category === 'name') return /^[a-z][a-z .'-]{1,30}$/i.test(answer) && !COMMON_ANSWERS.animal.has(normalized) && !COMMON_ANSWERS.thing.has(normalized); if (category === 'place') return /^[a-z][a-z .'-]{1,40}$/i.test(answer) && (/(city|town|village|river|mount|lake|street|park|state|country|beach|island)/i.test(answer) || COMMON_ANSWERS.place.has(normalized)); return false; };

const cleanName = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 18) || 'Player';
const cleanAnswer = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 60);
const normalizeAnswer = value => cleanAnswer(value).normalize('NFKC').toLocaleLowerCase('en-US');
const validForLetter = (answer, letter) => /^[a-z]/i.test(answer) && answer[0].toLocaleUpperCase('en-US') === letter;
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
      code: room.code, hostId: room.hostId, status: room.status, settings: room.settings,
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
  function finishRound(room) {
    if (room.status !== 'playing') return;
    const roundEndsAt = room.endsAt;
    if (room.timer) clearInterval(room.timer);
    room.timer = null; room.endsAt = null; room.timeLeft = 0;
    const players = [...room.players.values()];
    const points = new Map(players.map(p => [p.id, 0]));
    const categoryPoints = new Map(players.map(p => [p.id, Object.fromEntries(CATEGORIES.map(k => [k, 0]))]));
    for (const key of CATEGORIES) {
      const counts = new Map();
      for (const player of players) {
        const answer = normalizeAnswer(player.answers[key]);
        if (answer && validForLetter(answer, room.letter)) counts.set(answer, (counts.get(answer) || 0) + 1);
      }
      for (const player of players) {
        const answer = normalizeAnswer(player.answers[key]);
        if (!answer || !validForLetter(answer, room.letter)) continue;
        if (!validCategory(answer, key)) continue;
        let earned = counts.get(answer) === 1 ? 10 : 5;
        if (room.settings.mode === 'chaos' && room.bonusCategory === key) earned *= 2;
        points.set(player.id, points.get(player.id) + earned);
        categoryPoints.get(player.id)[key] = earned;
      }
    }
    for (const player of players) player.score += points.get(player.id);
    room.results = players.map(p => ({ id: p.id, name: p.name, answers: { ...p.answers }, categoryPoints: categoryPoints.get(p.id), roundPoints: points.get(p.id), totalScore: p.score, clutch: Boolean(p.submittedAt && roundEndsAt && (roundEndsAt - p.submittedAt) <= 5000 && (roundEndsAt - p.submittedAt) >= 0) }))
      .sort((a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name));
    room.status = 'results';
    emitRoom(room);
  }
  function startRound(room) {
    if (room.timer) clearInterval(room.timer);
    room.status = 'playing'; room.round += 1;
    room.bonusCategory = room.settings.mode === 'chaos' ? CATEGORIES[randomBytes(1)[0] % CATEGORIES.length] : null;
    room.letter = room.settings.fixedLetter || LETTERS[randomBytes(1)[0] % LETTERS.length];
    room.timeLeft = room.settings.duration; room.endsAt = Date.now() + room.settings.duration * 1000; room.results = [];
    for (const p of room.players.values()) { p.answers = Object.fromEntries(CATEGORIES.map(k => [k, ''])); p.submitted = false; p.submittedAt = null; }
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
        settings: { duration: payload.settings?.mode === 'speed' ? 30 : ([30, 45, 60, 90, 120].includes(duration) ? duration : 60), rounds: [1, 3, 5, 7, 10].includes(rounds) ? rounds : 3, mode: ['classic', 'chaos', 'speed'].includes(payload.settings?.mode) ? payload.settings.mode : 'classic', fixedLetter: /^[A-Z]$/.test(String(payload.settings?.fixedLetter || '').toUpperCase()) ? String(payload.settings.fixedLetter).toUpperCase() : null },
        letter: '', round: 0, timeLeft: 0, endsAt: null, players: new Map(), results: [], timer: null
      };
      const player = { id: playerId, token, socketId: socket.id, name: cleanName(payload.name), ready: true, score: 0, answers: Object.fromEntries(CATEGORIES.map(k => [k, ''])), submitted: false, submittedAt: null, connected: true, expiryTimer: null };
      room.players.set(player.id, player); rooms.set(code, room); socket.join(code);
      ack(cb, { ok: true, room: snapshot(room), playerId, token }); emitRoom(room);
    });

    socket.on('room:join', (payload = {}, cb) => {
      const room = findRoom(payload);
      if (!room) return ack(cb, { ok: false, error: 'Room not found. Check the code and try again.' });
      if (room.status !== 'lobby') return ack(cb, { ok: false, error: 'This game has already started.' });
      if (room.players.size >= MAX_PLAYERS) return ack(cb, { ok: false, error: `This room is full (${MAX_PLAYERS} players max).` });
      const playerId = randomUUID(), token = randomBytes(24).toString('hex');
      const player = { id: playerId, token, socketId: socket.id, name: cleanName(payload.name), ready: false, score: 0, answers: Object.fromEntries(CATEGORIES.map(k => [k, ''])), submitted: false, submittedAt: null, connected: true, expiryTimer: null };
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
      room.players.forEach(p => p.score = 0); startRound(room); ack(cb, { ok: true });
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
      player.submitted = true; player.submittedAt = Date.now();
      io.to(room.code).emit('player:progress', { id: player.id, submitted: true });
      if ([...room.players.values()].every(p => p.submitted)) finishRound(room); else emitRoom(room);
      ack(cb, { ok: true });
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
      room.players.forEach(p => { p.score = 0; p.ready = p.id === room.hostId; p.answers = Object.fromEntries(CATEGORIES.map(k => [k, ''])); p.submitted = false; p.submittedAt = null; });
      room.round = 0; room.status = 'lobby'; room.letter = ''; room.results = []; room.bonusCategory = null; room.timeLeft = 0; room.endsAt = null; emitRoom(room); ack(cb, { ok: true });
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
