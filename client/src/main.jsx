import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { ArrowDownRight, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, CircleHelp, Copy, Crown, DoorOpen, Hash, Heart, Link2, LockKeyhole, MapPin, BookOpen, PawPrint, Pencil, Plus, RotateCcw, Sparkles, Timer, Trophy, UserRound, Users, X, Zap, BarChart3, CheckSquare } from 'lucide-react';
import { suggestSpelling } from '../../shared/answer-data.js';
import './styles.css';

const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, { autoConnect: true, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 500, reconnectionDelayMax: 5000 });
const categories = [
  { key:'name', label:'Name', hint:'Someone’s name', color:'lavender', Icon:UserRound },
  { key:'place', label:'Place', hint:'A place on the map', color:'peach', Icon:MapPin },
  { key:'animal', label:'Animal', hint:'Wild or not-so-wild', color:'mint', Icon:PawPrint },
  { key:'thing', label:'Thing', hint:'Something you can name', color:'yellow', Icon:Pencil }
];
const initials = name => String(name || 'P').trim().split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()).join('');
const promptPacks = { classic: { label:'Classic', description:'No extra theme — just the letter and four categories.' }, india: { label:'Around India', description:'A little inspiration from Indian names, places, wildlife and everyday life.' }, movies: { label:'Movie Night', description:'Think actors, memorable places, animal characters and iconic things from films.' }, food: { label:'Food & Brands', description:'A food-flavoured nudge for names, places, animals and things.' } };
const letterDifficultyLabels = { easy:'Easy letters', standard:'Full alphabet', challenge:'Challenge letters' };
function App() {
  const [view, setView] = useState('home');
  const [name, setName] = useState('Cherry');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState(null);
  const [playerId, setPlayerId] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [connectionState, setConnectionState] = useState('connecting');
  const [duration, setDuration] = useState(60);
  const [rounds, setRounds] = useState(3);
  const [mode, setMode] = useState('classic');
  const [letterDifficulty, setLetterDifficulty] = useState('standard');
  const [promptPack, setPromptPack] = useState('classic');
  const [dailyChallenge, setDailyChallenge] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('napita-theme') || 'midnight');
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('napita-sound') !== 'off');
  const dailyDate = new Date();
  const utcYear = dailyDate.getUTCFullYear();
  const dailyDayIndex = Math.floor((Date.UTC(utcYear, dailyDate.getUTCMonth(), dailyDate.getUTCDate()) - Date.UTC(utcYear, 0, 0)) / 86400000);
  const dailyLetter = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[dailyDayIndex % 24];
  const [answers, setAnswers] = useState({ name:'', place:'', animal:'', thing:'' });
  const [spellSuggestions, setSpellSuggestions] = useState({});
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [submittedIds, setSubmittedIds] = useState([]);
  const isHost = room?.hostId === playerId;
  const me = room?.players?.find(p=>p.id===playerId);
  const submitted = Boolean(me?.submitted);
  useEffect(() => {
    const onUpdate = data => { setRoom(data); setSeconds(data.timeLeft || 0); setSubmittedIds(data.players.filter(p=>p.submitted).map(p=>p.id)); let saved; try { saved = JSON.parse(localStorage.getItem('napita-session') || 'null'); } catch { saved = null; } const self = data.players.find(p => p.id === saved?.playerId); if (self?.answers) setAnswers(self.answers); if (data.status === 'playing') setView('game'); if (data.status === 'validating') setView('validating'); if (data.status === 'results') setView('results'); if (data.status === 'finished') setView('finished'); if (data.status === 'lobby') setView('lobby'); };
    const onTick = payload => setSeconds(typeof payload === 'number' ? payload : payload?.timeLeft ?? 0);
    const onProgress = ({id, submitted: isSubmitted}) => setSubmittedIds(prev => isSubmitted ? [...new Set([...prev,id])] : prev.filter(v=>v!==id));
    const onConnect = () => {
      setConnectionState('connected');
      let saved; try { saved = JSON.parse(localStorage.getItem('napita-session') || 'null'); } catch { saved = null; }
      if (saved?.code && saved?.token) socket.emit('room:reconnect', saved, res => {
        if (!res?.ok) { localStorage.removeItem('napita-session'); setRoom(null); setPlayerId(''); setSessionToken(''); setView('home'); setConnectionState('connected'); setNotice(res?.error || 'Your room session expired. Join again with the room code.'); return; }
        setRoom(res.room); setPlayerId(res.playerId); setSessionToken(res.token); localStorage.setItem('napita-session', JSON.stringify({ code:res.room.code, token:res.token, playerId:res.playerId }));
        const me = res.room.players.find(p => p.id === res.playerId);
        if (me?.answers) setAnswers(me.answers);
        setRoomCode(res.room.code); setView(res.room.status === 'lobby' ? 'lobby' : res.room.status === 'playing' ? 'game' : res.room.status === 'validating' ? 'validating' : res.room.status === 'results' ? 'results' : res.room.status === 'finished' ? 'finished' : 'home');
        setConnectionState('connected'); showReconnectNotice();
      });
    };
    const onDisconnect = () => setConnectionState('reconnecting');
    const onConnectError = () => setConnectionState('reconnecting');
    function showReconnectNotice() { setNotice('You’re back in your room.'); window.setTimeout(() => setNotice(''), 2600); }
    socket.on('room:update', onUpdate); socket.on('round:tick', onTick); socket.on('player:progress', onProgress);
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('connect_error', onConnectError);
    if (socket.connected) onConnect();
    return () => { socket.off('room:update', onUpdate); socket.off('round:tick', onTick); socket.off('player:progress', onProgress); socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('connect_error', onConnectError); };
  }, []);
  useEffect(() => { setSpellSuggestions({}); }, [room?.round]);
  useEffect(() => { if (!room?.code) return; const handler = e => { if (e.key === 'Escape' && ['lobby','game','results','finished'].includes(view)) { e.preventDefault(); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown',handler); }, [room?.code, view]);
  const sortedPlayers = useMemo(() => [...(room?.players || [])].sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name)), [room?.players]);
  const roundInsights = useMemo(() => {
    const results = room?.results || [];
    const summaries = results.map(result => {
      const accepted = categories.flatMap(category => {
        const answer = String(result.answers?.[category.key] || '').trim();
        const validation = result.validations?.[category.key];
        if (!answer || validation?.status !== 'valid') return [];
        return [{ playerId: result.id, playerName: result.name, category: category.label, answer, count: result.answerCounts?.[category.key] || 0, points: result.categoryPoints?.[category.key] || 0 }];
      });
      return {
        id: result.id,
        name: result.name,
        validCount: accepted.length,
        duplicates: accepted.filter(entry => entry.count > 1).length,
        accepted
      };
    });
    const mostValid = [...summaries].filter(player => player.validCount > 0).sort((a, b) => b.validCount - a.validCount || b.duplicates - a.duplicates)[0] || null;
    const mostDuplicates = [...summaries].filter(player => player.duplicates > 0).sort((a, b) => b.duplicates - a.duplicates || b.validCount - a.validCount)[0] || null;
    const wildcards = summaries.flatMap(player => player.accepted.filter(entry => entry.count === 1).map(entry => ({ ...entry, playerId: player.id, playerName: player.name }))).sort((a, b) => b.answer.length - a.answer.length || b.points - a.points);
    const clutch = results.find(result => result.clutch) || null;
    return { mostValid, mostDuplicates, wildcard: wildcards[0] || null, clutch };
  }, [room?.results]);
  const matchInsights = useMemo(() => {
    const history = room?.history || [];
    const playerStats = new Map((room?.players || []).map(player => [player.id, { id: player.id, name: player.name, unique: 0, duplicates: 0, clutch: 0, categories: { name: 0, place: 0, animal: 0, thing: 0 }, roundPoints: [] }]));
    const uniqueWords = [];
    const answerEntries = [];
    for (const round of history) {
      for (const result of round.results || []) {
        const stats = playerStats.get(result.id);
        if (stats) { stats.roundPoints.push({ round: round.round, points: result.roundPoints || 0 }); if (result.clutch) stats.clutch += 1; }
        for (const category of categories) {
          const answer = String(result.answers?.[category.key] || '').trim();
          const validation = result.validations?.[category.key];
          const points = result.categoryPoints?.[category.key] || 0;
          const count = result.answerCounts?.[category.key] || 0;
          if (!answer || validation?.status !== 'valid') continue;
          answerEntries.push({ playerId: result.id, playerName: result.name, category: category.label, answer, points, count, round: round.round, letter: round.letter });
          if (stats) {
            stats.categories[category.key] += points;
            if (count === 1) stats.unique += 1;
            if (count > 1) stats.duplicates += 1;
          }
          if (count === 1) uniqueWords.push({ playerName: result.name, playerId: result.id, category: category.label, answer, round: round.round, letter: round.letter, points });
        }
      }
    }
    const strongestCategoryFor = stats => { const ranked = Object.entries(stats.categories).sort((a,b)=>b[1]-a[1]); return ranked[0]?.[1] > 0 ? ranked[0][0] : ''; };
    const bestUnique = [...uniqueWords].sort((a,b)=>b.answer.length-a.answer.length || b.points-a.points)[0] || null;
    const clutchMoment = history.flatMap(round => (round.results || []).filter(result => result.clutch).map(result => ({ name: result.name, round: round.round, letter: round.letter, points: result.roundPoints || 0 }))).sort((a,b)=>b.points-a.points)[0] || null;
    const topDuplicates = [...playerStats.values()].sort((a,b)=>b.duplicates-a.duplicates)[0] || null;
    const topUnique = [...playerStats.values()].sort((a,b)=>b.unique-a.unique)[0] || null;
    const mostDuplicates = topDuplicates?.duplicates > 0 ? topDuplicates : null;
    const mostUnique = topUnique?.unique > 0 ? topUnique : null;
    const categoryLeaders = categories.map(category => { const ranked = [...playerStats.values()].sort((a,b)=>b.categories[category.key]-a.categories[category.key]); const leader = ranked[0] || null; const points = leader?.categories[category.key] || 0; return { key: category.key, label: category.label, leader: points > 0 ? leader : null, points }; });
    return { rounds: history.length, bestUnique, clutchMoment, mostDuplicates, mostUnique, categoryLeaders, totalAccepted: answerEntries.length, needsReview: history.reduce((count, round) => count + (round.results || []).reduce((sum,result)=>sum + Object.values(result.validations || {}).filter(v=>v.status==='review').length,0),0), playerStats: [...playerStats.values()].map(stats=>({ ...stats, strongestCategory: strongestCategoryFor(stats) })) };
  }, [room?.history, room?.players]);
  const showNotice = text => { setNotice(text); window.setTimeout(()=>setNotice(''), 3200); };
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('napita-theme', theme); }, [theme]);
  useEffect(() => { if (view === 'game' && seconds > 0 && seconds <= 5) playTone(seconds === 1 ? 420 : 560, 65); }, [seconds, view]);
  const playTone = (frequency=660, durationMs=90) => { if (!soundOn) return; try { const Ctx = window.AudioContext || window.webkitAudioContext; const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = frequency; osc.type = 'sine'; gain.gain.setValueAtTime(0.045, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs/1000); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + durationMs/1000); osc.onended = () => ctx.close(); } catch {} };
  const shareResults = async () => {
    const finalMatch = room?.status === 'finished';
    const receiptPlayers = finalMatch
      ? sortedPlayers.map(player => ({ id: player.id, name: player.name, score: player.score }))
      : [...(room?.results || [])].sort((a, b) => b.roundPoints - a.roundPoints).map(result => ({ id: result.id, name: result.name, score: result.roundPoints }));
    const wildcard = finalMatch ? matchInsights.bestUnique : roundInsights.wildcard;
    const clutch = finalMatch ? matchInsights.clutchMoment : roundInsights.clutch;
    const text = `NaPiTA ${finalMatch ? 'match results' : `round ${room?.round} results`}\n${receiptPlayers.map((player, i) => `${i + 1}. ${player.name}: ${player.score} pts`).join('\n')}\n${wildcard ? `Wildcard: ${wildcard.answer} (${wildcard.category}) by ${wildcard.playerName}\n` : ''}${clutch ? `Last-second save: ${clutch.name}\n` : ''}Play with us: ${window.location.origin}`;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable in this browser.');
      const palettes = {
        classic: { bg: '#fbfaf6', surface: '#fffefa', text: '#26262d', muted: '#6e6d78', line: '#e4e1d9', accent: '#6958c9', soft: '#f2efff' },
        midnight: { bg: '#101018', surface: '#191923', text: '#f4f1fc', muted: '#b8b3c9', line: '#373447', accent: '#a99aff', soft: '#28233a' },
        matcha: { bg: '#f1f5eb', surface: '#fffef8', text: '#26392a', muted: '#5d705f', line: '#d7e1d2', accent: '#456f4b', soft: '#e7efe1' },
        sunset: { bg: '#fff5ef', surface: '#fffdfa', text: '#452d32', muted: '#81696e', line: '#efd9d1', accent: '#ad4556', soft: '#ffebe3' }
      };
      const colors = palettes[theme] || palettes.midnight;
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = colors.accent; ctx.fillRect(0, 0, canvas.width, 14);
      ctx.fillStyle = colors.text; ctx.font = '800 58px system-ui, sans-serif'; ctx.fillText('NaPiTA', 76, 102);
      ctx.fillStyle = colors.muted; ctx.font = '700 19px system-ui, sans-serif'; ctx.fillText('NAME  ·  PLACE  ·  ANIMAL  ·  THING', 78, 145);
      ctx.strokeStyle = colors.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(76, 182); ctx.lineTo(1004, 182); ctx.stroke();
      ctx.fillStyle = colors.text; ctx.font = '800 42px system-ui, sans-serif'; ctx.fillText(finalMatch ? 'THE FINAL SHEET' : `ROUND ${room?.round} RECEIPT`, 76, 250);
      ctx.fillStyle = colors.muted; ctx.font = '600 20px system-ui, sans-serif';
      ctx.fillText(`${room?.settings?.mode === 'chaos' ? 'CHAOS' : room?.settings?.mode === 'speed' ? 'SPEED RUN' : 'CLASSIC'}  ·  LETTER ${room?.letter || '—'}`, 78, 290);
      if (room?.settings?.promptPack && room.settings.promptPack !== 'classic') {
        const packName = promptPacks[room.settings.promptPack]?.label || 'Prompt pack';
        ctx.fillStyle = colors.soft; ctx.fillRect(690, 213, 312, 54);
        ctx.fillStyle = colors.accent; ctx.font = '700 18px system-ui, sans-serif'; ctx.fillText(packName.toUpperCase(), 710, 247);
      }
      let y = 340;
      ctx.fillStyle = colors.muted; ctx.font = '800 17px system-ui, sans-serif'; ctx.fillText(finalMatch ? 'FINAL LEADERBOARD' : 'ROUND POINTS', 78, y);
      y += 25;
      receiptPlayers.slice(0, 12).forEach((player, index) => {
        y += 52;
        ctx.fillStyle = colors.surface; ctx.fillRect(76, y - 32, 928, 44);
        ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.strokeRect(76, y - 32, 928, 44);
        ctx.fillStyle = colors.accent; ctx.font = '800 18px system-ui, sans-serif'; ctx.fillText(String(index + 1).padStart(2, '0'), 96, y - 4);
        ctx.fillStyle = colors.text; ctx.font = '700 21px system-ui, sans-serif'; ctx.fillText(String(player.name).slice(0, 24), 154, y - 4);
        ctx.fillStyle = colors.accent; ctx.font = '800 21px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${finalMatch ? '' : '+'}${player.score} PTS`, 976, y - 4); ctx.textAlign = 'left';
      });
      y += 28;
      ctx.strokeStyle = colors.line; ctx.beginPath(); ctx.moveTo(76, y); ctx.lineTo(1004, y); ctx.stroke();
      y += 44;
      ctx.fillStyle = colors.text; ctx.font = '800 21px system-ui, sans-serif'; ctx.fillText('ROOM LORE', 78, y);
      y += 38;
      ctx.fillStyle = colors.muted; ctx.font = '600 18px system-ui, sans-serif';
      if (wildcard) {
        const wildcardLine = `Wildcard: “${wildcard.answer}” · ${wildcard.category} · ${wildcard.playerName}`;
        ctx.fillText(wildcardLine.slice(0, 72), 78, y); y += 34;
      } else { ctx.fillText('Wildcard: no unique answer this time.', 78, y); y += 34; }
      if (clutch) ctx.fillText(`Last-second save: ${clutch.name}${clutch.round ? ` · Round ${clutch.round}` : ''}`.slice(0, 72), 78, y);
      else ctx.fillText('No last-second save this time. Plenty of rematch material.', 78, y);
      ctx.fillStyle = colors.accent; ctx.fillRect(76, 1254, 928, 2);
      ctx.fillStyle = colors.text; ctx.font = '800 20px system-ui, sans-serif'; ctx.fillText('PEN, PAPER, ZERO CHILL.', 78, 1298);
      ctx.fillStyle = colors.muted; ctx.font = '500 15px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('Created by CherryLoneWolf', 1002, 1298); ctx.textAlign = 'left';
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not create the result image.');
      const file = new File([blob], `napita-${finalMatch ? 'match' : `round-${room?.round}`}-${room?.code || 'results'}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'NaPiTA result card', text });
        showNotice('Result card shared!');
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = objectUrl; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      try { await navigator.clipboard.writeText(text); showNotice('Result card downloaded as PNG. Score summary copied too.'); }
      catch { showNotice('Result card downloaded as PNG.'); }
    } catch (error) {
      console.error('[NaPiTA] Could not create/share result card:', error);
      try {
        if (navigator.share) await navigator.share({ title: 'NaPiTA results', text });
        else { await navigator.clipboard.writeText(text); showNotice('Score summary copied to clipboard.'); }
      } catch { showNotice('Could not share automatically. Copy your scores from the results screen.'); }
    }
  };
  const createRoom = () => {
    playTone(740, 105);
    if (!name.trim()) return showNotice('Add your name first.');
    socket.emit('room:create', { name, settings:{ duration, rounds, mode, letterDifficulty, promptPack, fixedLetter: dailyChallenge ? dailyLetter : null } }, res => { if (!res?.ok) return showNotice('Could not create room. Try again.'); setRoom(res.room); setPlayerId(res.playerId); setSessionToken(res.token); localStorage.setItem('napita-session', JSON.stringify({ code:res.room.code, token:res.token, playerId:res.playerId })); setView('lobby'); });
  };
  const joinRoom = () => {
    playTone(620, 85);
    if (!name.trim()) return showNotice('Add your name first.');
    if (roomCode.trim().length < 4) return showNotice('Enter a 4-character room code.');
    socket.emit('room:join', { code:roomCode.trim().toUpperCase(), name }, res => { if (!res?.ok) return showNotice(res?.error || 'Could not join room.'); setRoom(res.room); setPlayerId(res.playerId); setSessionToken(res.token); localStorage.setItem('napita-session', JSON.stringify({ code:res.room.code, token:res.token, playerId:res.playerId })); setView('lobby'); });
  };
  const copyInvite = async () => { const invite = `${window.location.origin}?room=${room.code}`; try { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(()=>setCopied(false),1800); } catch { showNotice(`Room code: ${room.code}`); } };
  useEffect(() => { const params = new URLSearchParams(window.location.search); const invite = params.get('room'); if (invite) { setRoomCode(invite.toUpperCase()); setView('home'); } }, []);
  const startGame = () => socket.emit('game:start', { code:room.code }, res => { if (!res?.ok) showNotice(res?.error || 'Could not start game.'); });
  const submit = () => { playTone(880,120); return socket.emit('answers:submit', { code:room.code, answers }, res => { if (!res?.ok) showNotice(res?.error || 'Could not submit answers.'); }); };
  const nextRound = () => socket.emit('game:next', { code:room.code }, res => { if (!res?.ok) showNotice(res?.error || 'Could not continue.'); });
  const rematch = () => socket.emit('game:rematch', { code:room.code }, res => { if (!res?.ok) showNotice(res?.error || 'Could not start rematch.'); });
  const backHome = () => { if (room?.code) socket.emit('room:leave', { code:room.code }); localStorage.removeItem('napita-session'); setRoom(null); setPlayerId(''); setSessionToken(''); setAnswers({name:'',place:'',animal:'',thing:''}); setDailyChallenge(false); setView('home'); window.history.replaceState({},'',window.location.pathname); };
  const ready = () => socket.emit('player:ready', { code:room.code, ready:!me?.ready });
  const changeAnswer = (key, value) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    const suggestion = suggestSpelling(value, key, room?.letter || value[0] || '');
    setSpellSuggestions(previous => ({ ...previous, [key]: suggestion && suggestion.toLowerCase() !== String(value).trim().toLowerCase() ? suggestion : '' }));
    socket.emit('answers:update', { code: room.code, answers: next });
  };
  const useSpellingSuggestion = (key, suggestion) => {
    const next = { ...answers, [key]: suggestion };
    setAnswers(next); setSpellSuggestions(previous => ({ ...previous, [key]: '' }));
    if (room?.code) socket.emit('answers:update', { code: room.code, answers: next });
  };
  const appealAnswer = (category) => socket.emit('answer:appeal', { code: room.code, category }, response => { if (!response?.ok) showNotice(response?.error || 'Could not open an appeal.'); else showNotice('Appeal opened. The room can vote on it.'); });
  const voteOnAppeal = (targetId, category, valid) => socket.emit('answer:vote', { code: room.code, playerId: targetId, category, valid }, response => { if (!response?.ok) showNotice(response?.error || 'Could not submit vote.'); else showNotice(valid ? 'Vote submitted: valid answer.' : 'Vote submitted: not valid.'); });

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={backHome} aria-label="NaPiTA home"><span className="brand-mark"><span>N</span><span>P</span><span>T</span></span><span className="brand-name">NaPiTA<span className="brand-dot">.</span></span></button><nav className="top-links"><span className="online-dot"/> Name, Place, Animal, Thing — play together{connectionState==='reconnecting'&&<span className="connection-note"> · Reconnecting…</span>}</nav><div className="top-actions"><label className="theme-select-label">Theme <select aria-label="Theme" value={theme} onChange={e=>setTheme(e.target.value)}><option value="midnight">Midnight</option><option value="classic">Classic</option><option value="matcha">Matcha</option><option value="sunset">Sunset</option></select></label><button className="quiet-button sound-toggle" onClick={()=>{const next=!soundOn;setSoundOn(next);localStorage.setItem('napita-sound',next?'on':'off');if(next)playTone();}}>{soundOn?'♫ Sound on':'♪ Sound off'}</button><button className="help-button" onClick={()=>showNotice('Pick a letter, fill Name, Place, Animal and Thing before time runs out. Unique valid answers earn 10 points; matching answers earn 5. Prompt packs are just inspiration — category and starting letter still decide validity.')}><CircleHelp size={17}/><span>How to play</span></button></div></header>
    <main>
      {view === 'home' && <div className="home-view">
        <div className="hero"><div className="eyebrow"><BookOpen size={14}/> THE CLASSIC WORD SHEET, ONLINE</div><h1>NAME. PLACE.<br/><span>ANIMAL. THING.</span></h1><p className="hero-copy">Pick a letter, fill the sheet, and see who gets bragging rights. The game from the back of your notebook. Now your whole group can play.</p><div className="category-ribbon">{categories.map(c=><div className={`category-stamp ${c.color}`} key={c.key}><img className="category-ribbon-icon" src={`/icon-${c.key}.png`} alt=""/><span>{c.label}</span></div>)}</div><div className="hero-cta"><button className="primary-button" onClick={()=>document.getElementById('create-room')?.scrollIntoView({behavior:'smooth',block:'center'})}>Create a room <ArrowRight size={18}/></button><button className="text-button" onClick={()=>document.getElementById('join-room')?.scrollIntoView({behavior:'smooth',block:'center'})}>I have a code <ArrowDownRight size={17}/></button></div><div className="hero-social"><BookOpen size={16} strokeWidth={1.7}/><span>Four categories. One letter. Zero chill when someone says that counts.</span></div>
          <div className="doodle doodle-star">✳</div><div className="doodle doodle-spark">✦</div><div className="doodle doodle-loop">↗</div><div className="category-doodles" aria-hidden="true"><img className="doodle-book" src="/doodle-book.png" alt=""/><img className="doodle-map" src="/doodle-map.png" alt=""/><img className="doodle-paw" src="/doodle-paw.png" alt=""/><img className="doodle-pencil" src="/doodle-pencil.png" alt=""/></div>
        </div>
        <div className="daily-card"><div className="daily-letter">{dailyLetter}</div><div><strong>Daily Letter</strong><p>Same letter for everyone today. Can your group beat the clock?</p></div><button className="secondary-button" onClick={()=>{setMode('classic');setDuration(45);setLetterDifficulty('standard');setDailyChallenge(true);showNotice(`Today's letter challenge: ${dailyLetter}. Start a room and play a 45-second challenge!`);document.getElementById('create-room')?.scrollIntoView({behavior:'smooth',block:'center'});}}>Play today <ArrowRight size={15}/></button></div>
        <div className="setup-grid"><section className="panel create-panel" id="create-room"><div className="panel-icon icon-lilac"><Plus size={21}/></div><div className="panel-heading"><h2>Start a new room</h2><p>Make the room. Drop the code. Let the chaos begin.</p></div><label className="field-label" htmlFor="player-name">YOUR NAME</label><input id="player-name" className="text-input" value={name} maxLength={18} onChange={e=>setName(e.target.value)} placeholder="What should we call you?"/><div className="settings-row"><div><label className="field-label" htmlFor="duration">ROUND TIMER</label><div className="select-wrap"><Timer size={16}/><select id="duration" value={duration} disabled={mode==='speed'} onChange={e=>setDuration(Number(e.target.value))}><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds</option><option value={90}>90 seconds</option><option value={120}>2 minutes</option></select><ChevronDown size={15}/></div></div><div><label className="field-label" htmlFor="rounds">NUMBER OF ROUNDS</label><div className="select-wrap"><Zap size={16}/><select id="rounds" value={rounds} onChange={e=>setRounds(Number(e.target.value))}><option value={1}>1 round</option><option value={3}>3 rounds</option><option value={5}>5 rounds</option><option value={7}>7 rounds</option><option value={10}>10 rounds</option></select><ChevronDown size={15}/></div></div></div><div className="settings-row extra-settings-row"><div><label className="field-label" htmlFor="letter-difficulty">LETTER MIX</label><div className="select-wrap"><Hash size={16}/><select id="letter-difficulty" value={letterDifficulty} onChange={e=>setLetterDifficulty(e.target.value)}><option value="easy">Easy letters</option><option value="standard">Full alphabet</option><option value="challenge">Challenge letters</option></select><ChevronDown size={15}/></div></div><div><label className="field-label" htmlFor="prompt-pack">OPTIONAL PROMPT</label><div className="select-wrap"><BookOpen size={16}/><select id="prompt-pack" value={promptPack} onChange={e=>setPromptPack(e.target.value)}><option value="classic">Classic</option><option value="india">Around India</option><option value="movies">Movie Night</option><option value="food">Food & Brands</option></select><ChevronDown size={15}/></div></div></div><label className="field-label" htmlFor="game-mode">GAME MODE</label><div className="select-wrap mode-select"><Zap size={16}/><select id="game-mode" value={mode} onChange={e=>{setMode(e.target.value);if(e.target.value==='speed')setDuration(30);}}><option value="classic">Classic · standard scoring</option><option value="chaos">Chaos · random category double points</option><option value="speed">Speed Run · 30 seconds</option></select><ChevronDown size={15}/></div><button className="primary-button full-button" onClick={createRoom}>Create private room <ArrowRight size={18}/></button><div className="secure-note"><LockKeyhole size={13}/> Private by default · Up to 12 players</div></section>
          <section className="panel join-panel" id="join-room"><div className="panel-icon icon-mint"><DoorOpen size={20}/></div><div className="panel-heading"><h2>Join your people</h2><p>Got the code? Don’t leave the group on read.</p></div><label className="field-label" htmlFor="join-name">YOUR NAME</label><input id="join-name" className="text-input" value={name} maxLength={18} onChange={e=>setName(e.target.value)} placeholder="What should we call you?"/><label className="field-label room-label" htmlFor="room-code">ROOM CODE</label><div className="code-input-wrap"><Hash size={18}/><input id="room-code" value={roomCode} maxLength={4} onChange={e=>setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} placeholder="E.G. A7KP" onKeyDown={e=>e.key==='Enter'&&joinRoom()}/><span>{roomCode.length}/4</span></div><button className="secondary-button full-button" onClick={joinRoom}>Join room <ArrowRight size={18}/></button><div className="secure-note"><Heart size={13}/> No account needed. Just good company.</div></section></div>
        <section className="how-section"><div className="section-title"><span className="eyebrow">SIMPLE AS 1, 2, 3</span><h2>Remember this one?</h2><p>Same rules. A few lovely upgrades.</p></div><div className="steps-grid"><div className="step-card"><span className="step-number number-lilac">01</span><div className="step-illustration letter-illustration">A<span className="letter-spark">✦</span></div><h3>Pick a letter</h3><p>Everyone gets the same random letter. Ready, set, think!</p></div><div className="step-card"><span className="step-number number-peach">02</span><div className="step-illustration category-illustration"><span><img src="/icon-name.png" alt=""/>NAME</span><span><img src="/icon-place.png" alt=""/>PLACE</span><span><img src="/icon-animal.png" alt=""/>ANIMAL</span><span><img src="/icon-thing.png" alt=""/>THING</span></div><h3>Fill it in</h3><p>Race the clock to find an answer for every category.</p></div><div className="step-card"><span className="step-number number-mint">03</span><div className="step-illustration trophy-illustration"><Trophy size={43} strokeWidth={1.6}/><span>+10</span></div><h3>Claim your points</h3><p>Unique valid answers score more. Try not to yell at the screen.</p></div></div></section>
      </div>}
      {view === 'lobby' && room && <div className="room-view"><button className="back-link" onClick={backHome}><ArrowLeft size={16}/> Leave room</button><div className="room-heading"><div className="eyebrow"><span className="online-dot"/> YOUR PRIVATE ROOM</div><h1>Bring the crew <span>in.</span></h1><p>Drop the room code in chat. Everyone gets the same letter.</p></div><div className="lobby-layout"><section className="panel room-code-panel"><div className="room-code-label">YOUR ROOM CODE</div><button className="big-code" onClick={copyInvite} title="Copy invite link">{room.code.split('').map((c,i)=><span key={i}>{c}</span>)}</button><button className="secondary-button copy-button" onClick={copyInvite}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Invite link copied!':'Copy invite link'}</button><div className="divider-label"><span/>OR SHARE THE CODE<span/></div><div className="room-share-hint"><Link2 size={15}/> Friends can join at any time before the game starts.</div><div className="room-settings-summary"><div><Timer size={16}/><span>{room.settings.duration}s per round</span></div><div><RotateCcw size={16}/><span>{room.settings.rounds} rounds</span></div><div><Zap size={16}/><span>{({classic:'Classic',chaos:'Chaos',speed:'Speed Run'})[room.settings.mode] || 'Classic'} · {letterDifficultyLabels[room.settings.letterDifficulty] || 'Full alphabet'}</span></div><div><BookOpen size={16}/><span>{promptPacks[room.settings.promptPack]?.label || 'Classic'} prompt</span></div><div><Users size={16}/><span>Up to 12 players</span></div></div></section><section className="panel players-panel"><div className="players-header"><div><h2>The crew <span className="player-count">{room.players.length}</span></h2><p>At least 2 players to start</p></div><span className="live-pill"><span/> LIVE</span></div><div className="player-list">{room.players.map((p,i)=><div className="player-row" key={p.id}><div className={`player-avatar avatar-${i%5}`}>{initials(p.name)}{p.id===room.hostId&&<span className="crown-badge"><Crown size={10}/></span>}</div><div className="player-name">{p.name}{p.id===playerId&&<span className="you-tag">YOU</span>}{p.id===room.hostId&&<span className="host-tag">HOST</span>}</div><span className={`ready-status ${p.ready?'is-ready':''}`}>{!p.connected?<><span className="status-ring"/> Reconnecting</>:p.ready?<><CheckCircle2 size={14}/> Ready</>:<><span className="status-ring"/> Not ready</>}</span></div>)}{room.players.length<12&&<div className="waiting-row"><div className="waiting-plus"><Plus size={18}/></div><span>Waiting for your friends to join...</span><span className="waiting-dots">•••</span></div>}</div><div className="lobby-footer">{isHost?<button className="primary-button full-button" onClick={startGame}>Start the game <ArrowRight size={18}/></button>:<button className={`secondary-button full-button ${me?.ready?'ready-button':''}`} onClick={ready}>{me?.ready?<><Check size={17}/> You’re ready!</>:<>I’m ready <Check size={17}/></>}</button>}<p className="host-hint">{isHost?'You’re the host — start when everyone is ready.':'The host will start the game once everyone is ready.'}</p></div></section></div></div>}
      {view === 'game' && room && <div className="game-view"><div className="game-topline"><div className="round-chip">ROUND {room.round} <span>OF {room.settings.rounds}</span></div><div className={`timer-chip ${seconds<=10?'timer-urgent':''}`}><Timer size={16}/><span>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</span></div><button className="quiet-button" onClick={copyInvite}><Users size={16}/>{room.players.length} players</button></div><div className="game-prompt"><span className="eyebrow">YOUR LETTER IS</span><div className="letter-orb">{room.letter}</div><h1>Fill the sheet. <span>Beat the clock.</span></h1><p>Every answer starts with <strong>{room.letter}</strong>. Unique answers earn 10 points.{room.settings.mode==='chaos'&&room.bonusCategory&&<> <strong>Chaos bonus: {categories.find(c=>c.key===room.bonusCategory)?.label} scores double!</strong></>}{room.settings.mode==='speed'&&<> Speed Run: no time to overthink.</>}</p>{room.settings.promptPack&&room.settings.promptPack!=='classic'&&<div className="game-prompt-vibe"><Sparkles size={14}/><span><strong>{promptPacks[room.settings.promptPack]?.label || 'Prompt pack'}:</strong> {promptPacks[room.settings.promptPack]?.description || 'Use the theme for inspiration.'} <em>Just a nudge — the four category and letter rules still decide points.</em></span></div>}</div><div className="answer-grid">{categories.map(c=><div className={`answer-card ${c.color}`} key={c.key}><span className="answer-icon"><c.Icon size={21} strokeWidth={1.7}/></span><label className="answer-label" htmlFor={`answer-${c.key}`}>{c.label}</label><span className="answer-hint">{c.hint}</span><input id={`answer-${c.key}`} disabled={submitted||seconds<=0} value={answers[c.key]} onChange={e=>changeAnswer(c.key,e.target.value)} placeholder={`${room.letter}...`} autoCapitalize="words" autoCorrect="on" spellCheck={true} aria-label={`${c.label} answer starting with ${room.letter}`} onKeyDown={e=>{if(e.key==='Enter'&&!submitted)submit();}}/><span className="answer-prefix">{room.letter}</span>{spellSuggestions[c.key]&&!submitted&&seconds>0&&<button type="button" className="spelling-hint" onClick={()=>useSpellingSuggestion(c.key,spellSuggestions[c.key])}><CheckSquare size={13}/> Did you mean <strong>{spellSuggestions[c.key]}</strong>? Use it</button>}</div>)}</div><div className="game-submit-row"><div className="submit-progress"><div className="progress-avatars">{room.players.map((p,i)=><span key={p.id} className={`progress-avatar avatar-${i%5} ${submittedIds.includes(p.id)?'progress-done':''}`}>{submittedIds.includes(p.id)?<Check size={12}/>:initials(p.name)}</span>)}</div><span>{submittedIds.length} of {room.players.length} submitted</span></div><button className="primary-button submit-button" disabled={submitted} onClick={submit}>{submitted?'Answers submitted':seconds<=0?'Submit answers':'Lock in answers'} {submitted?<Check size={17}/>:<ArrowRight size={17}/>}</button></div><p className="game-footnote"><LockKeyhole size={13}/> Your answers stay hidden until the round ends.</p></div>}
      {view === 'validating' && room && <div className="validating-view"><div className="validation-sheet"><div className="validation-spinner"/><div className="eyebrow"><CheckSquare size={14}/> CHECKING THE SHEET</div><h1>Giving every answer <span>a fair look.</span></h1><p>Checking the letter, category, common spellings and regional answers. This should only take a moment.</p><div className="validation-steps"><span>Letter check</span><span>Category check</span><span>Score check</span></div></div></div>}
      {view === 'results' && room && <div className="results-view"><div className="results-confetti">✳ <span>✦</span> ✳</div><div className="eyebrow"><Trophy size={14}/> ROUND {room.round} COMPLETE</div><h1>The sheet is <span>closed.</span></h1><p className="results-subtitle">Let's see which answers counted — and why.</p><div className="results-layout"><section className="panel score-panel"><div className="results-panel-title"><h2>Round scores</h2><span className="live-pill">UPDATED LIVE</span></div>{[...(room.results||[])].sort((a,b)=>b.roundPoints-a.roundPoints).map((r,i)=><div className={`score-row ${i===0?'score-winner':''}`} key={r.id}><span className="rank-number">{i===0?<Crown size={16}/>:String(i+1).padStart(2,'0')}</span><div className={`player-avatar avatar-${i%5}`}>{initials(r.name)}</div><div className="score-person"><strong>{r.name}{r.id===playerId?' (you)':''}</strong><span>{r.clutch?'Last-second save ⚡':r.roundPoints===(room.settings.mode==='chaos'?50:40)?'Perfect round!':r.roundPoints>=20?'Nice thinking!':'Good effort!'}</span></div><strong className="round-points">+{r.roundPoints}<small> pts</small></strong></div>)}<div className="scoring-note"><Sparkles size={15}/><span>Valid unique: 10 · valid duplicate: 5 · invalid or empty: 0{room.settings.mode==='chaos'&&room.bonusCategory?` · ${categories.find(c=>c.key===room.bonusCategory)?.label} doubled`:''}</span></div><div className="round-category-points"><strong>Points by category</strong>{categories.map(c=><div key={c.key}><span><c.Icon size={14}/>{c.label}</span><span>{[...(room.results||[])].reduce((sum,r)=>sum+(r.categoryPoints?.[c.key]||0),0)} pts</span></div>)}</div></section><section className="panel answers-panel"><h2>Answer reveal</h2><p>See what everyone came up with.</p><div className="answer-reveal-grid">{categories.map(c=><div className="reveal-category" key={c.key}><div className={`reveal-heading ${c.color}`}><c.Icon size={16} strokeWidth={1.8}/>{c.label}</div>{room.results?.map(r=>{const validation=r.validations?.[c.key];const appeal=room.appeals?.find(item=>item.playerId===r.id&&item.category===c.key);const answer=r.answers?.[c.key];const canVote=appeal?.status==='open'&&r.id!==playerId&&!Object.prototype.hasOwnProperty.call(appeal.votes||{},playerId);return <div className="reveal-answer-wrap" key={r.id}><div className="reveal-answer"><span>{r.name}</span><strong>{answer||'—'}</strong></div>{answer&&validation&&<div className={`validation-message ${validation.status}`}><span className="validation-pill">{validation.status==='valid'?'Accepted':validation.status==='invalid'?'Not accepted':'Needs a look'}</span><span className="validation-reason">{validation.reason}</span>{validation.suggestion&&<span className="validation-suggestion">Try: {validation.suggestion}</span>}{r.id===playerId&&validation.status!=='valid'&&!String(validation.reason||'').startsWith('Start your answer with ')&&!appeal&&<button className="micro-action" onClick={()=>appealAnswer(c.key)}>Appeal answer</button>}{appeal?.status==='open'&&r.id===playerId&&<span className="appeal-status">Appeal open · waiting for the crew</span>}{canVote&&<div className="appeal-votes"><button onClick={()=>voteOnAppeal(r.id,c.key,true)}>Counts</button><button onClick={()=>voteOnAppeal(r.id,c.key,false)}>Doesn’t count</button></div>}{appeal&&appeal.status!=='open'&&<span className={`appeal-status ${appeal.status}`}>Room vote: {appeal.status}</span>}</div>}</div>})}</div>)}</div></section></div><div className="awards-strip"><strong>🏆 Round lore</strong><span>Most valid · {roundInsights.mostValid?`${roundInsights.mostValid.name} (${roundInsights.mostValid.validCount})`:'No accepted answers yet'}</span><span>Copy-paste · {roundInsights.mostDuplicates?`${roundInsights.mostDuplicates.name} (${roundInsights.mostDuplicates.duplicates})`:'No duplicate answers'}</span><span>Clutch · {roundInsights.clutch?.name || 'No last-second saves'}</span><span>Wildcard · {roundInsights.wildcard?`${roundInsights.wildcard.answer} · ${roundInsights.wildcard.playerName}`:'No unique answer this round'}</span></div><div className="results-actions"><button className="secondary-button" onClick={shareResults}><Heart size={15}/> Share results</button>{isHost?<button className="primary-button" onClick={nextRound}>{room.round>=room.settings.rounds?'See final results':'Next round'} <ArrowRight size={18}/></button>:<p>Waiting for the host to continue...</p>}<button className="text-button" onClick={copyInvite}><Copy size={16}/> Invite someone else</button></div></div>}
      {view === 'finished' && room && <div className="finished-view"><div className="winner-emoji">🏆</div><div className="eyebrow">THAT’S A WRAP</div><h1>That’s the <span>final sheet.</span></h1><p className="results-subtitle">Keep the score. Bring the receipts. Run it back.</p><section className="panel final-leaderboard"><h2>Final leaderboard</h2>{sortedPlayers.map((p,i)=><div className={`score-row ${i===0?'score-winner':''}`} key={p.id}><span className="rank-number">{i===0?<Crown size={16}/>:String(i+1).padStart(2,'0')}</span><div className={`player-avatar avatar-${i%5}`}>{initials(p.name)}</div><div className="score-person"><strong>{p.name}{p.id===playerId?' (you)':''}</strong><span>{i===0?'Word wizard':i===1?'Strong finish':'Thanks for playing!'}</span></div><strong className="round-points">{p.score}<small> pts</small></strong></div>)}</section><section className="panel match-insights"><div className="insights-heading"><div><div className="eyebrow"><BarChart3 size={14}/> THE MATCH RECAP</div><h2>What actually happened</h2><p>Stats from the answers this room submitted — no made-up lore.</p></div><span className="insights-rounds">{matchInsights.rounds} round{matchInsights.rounds===1?'':'s'}</span></div><div className="insights-grid"><div className="insight-tile"><span className="insight-label">Most unique answers</span><strong>{matchInsights.mostUnique?.name||'—'}</strong><small>{matchInsights.mostUnique?.unique||0} unique answers</small></div><div className="insight-tile"><span className="insight-label">Duplicate merchant</span><strong>{matchInsights.mostDuplicates?.name||'—'}</strong><small>{matchInsights.mostDuplicates?.duplicates||0} matching answers</small></div><div className="insight-tile"><span className="insight-label">Wildest valid answer</span><strong>{matchInsights.bestUnique?.answer||'—'}</strong><small>{matchInsights.bestUnique?`${matchInsights.bestUnique.category} · ${matchInsights.bestUnique.playerName}`:'No unique answers this match'}</small></div><div className="insight-tile"><span className="insight-label">Last-second save</span><strong>{matchInsights.clutchMoment?.name||'No clutch yet'}</strong><small>{matchInsights.clutchMoment?`Round ${matchInsights.clutchMoment.round} · ${matchInsights.clutchMoment.points} points`:'No submission in the final 5 seconds'}</small></div></div><div className="category-insight-list"><strong>Category score sheet</strong>{matchInsights.categoryLeaders.map(item=><div className="category-insight-row" key={item.key}><span>{categories.find(c=>c.key===item.key)?.Icon&&React.createElement(categories.find(c=>c.key===item.key).Icon,{size:15})}{item.label}</span><div className="insight-bar"><i style={{width:`${Math.max(0,Math.min(100,Math.round(item.points/Math.max(1,...matchInsights.categoryLeaders.map(value=>value.points))*100)))}%`}}/></div><strong>{item.leader?.name||'—'}</strong><small>{item.points} pts</small></div>)}</div><div className="player-insights-list"><strong>Player receipts</strong>{matchInsights.playerStats.map(stats=><div className="player-insight-card" key={stats.id}><div className="player-insight-head"><strong>{stats.name}{stats.id===playerId?' (you)':''}</strong><span>Strongest category: {categories.find(c=>c.key===stats.strongestCategory)?.label||'—'}</span></div><div className="player-insight-metrics"><span>{stats.unique} unique</span><span>{stats.duplicates} duplicates</span><span>{stats.clutch} clutch</span></div><div className="round-score-history">{stats.roundPoints.map(entry=><span key={entry.round}>R{entry.round}: {entry.points} pts</span>)}</div></div>)}</div><p className="insights-footnote">{matchInsights.totalAccepted} accepted answers · {matchInsights.needsReview} answer{matchInsights.needsReview===1?'':'s'} still need a look</p></section><div className="finished-actions"><button className="secondary-button" onClick={shareResults}><Heart size={15}/> Share result card</button>{isHost&&<button className="primary-button" onClick={rematch}><RotateCcw size={17}/> Play again</button>}<button className="secondary-button" onClick={copyInvite}><Copy size={16}/> Invite friends</button><button className="text-button" onClick={backHome}>Back to home <ArrowRight size={16}/></button></div></div>}
    </main>
    <footer className="footer"><button className="footer-brand" onClick={backHome}><span className="footer-mark">N.</span> NaPiTA</button><span>Pen, paper, zero chill.</span><span className="footer-right">Created by CherryLoneWolf <Heart size={13}/></span></footer>
    {notice && <div className="toast" role="status"><span className="toast-dot"/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
