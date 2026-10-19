# NaPiTA

A real-time multiplayer Name, Place, Animal, Thing game built with React, Vite, Express and Socket.IO.

## Run locally

```bash
npm install
npm run dev
```

Vite serves the client and the Socket.IO server runs alongside it. For a production-like local run:

```bash
npm install
npm run build
npm start
```

## Deploy on Render

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Keep the app as one Node web service so Socket.IO and the built frontend share the same origin.

## Current features

- Private rooms for up to 12 players, invite links/codes, ready state, reconnect grace period, real-time timer and hidden answers until reveal.
- Classic, Chaos (random category earns double points) and Speed Run (30-second rounds) modes.
- Optional Daily Letter room: uses the same date-based letter for players who start the daily challenge that day.
- Category-aware common-answer dictionary for Name, Place, Animal and Thing, including common Indian names such as Jhansi and animals such as Quail. Unknown entries are handled conservatively; this is not an AI-powered dictionary and can still reject unusual valid answers.
- Theme selector (Midnight, Classic, Matcha, Sunset) with saved preference and theme-aware form/input contrast.
- Optional lightweight sound effects, including final-five-second countdown tones and submission confirmation.
- Results reveal, round lore awards (top scorer / wildcard answer / last-second save), shareable results text, and host rematch flow.
- Responsive category UI with notebook, map, paw and pencil motifs.

## Notes / limitations

- Room state is in memory. Active rooms disappear when the server restarts, and multi-instance hosting would need shared storage.
- Daily Letter is a simple date-based challenge. It does not maintain global streaks or a cross-player daily leaderboard.
- The answer dictionary is a starter list, not a complete authority. For a production AI fallback, add a server-side provider integration and API key via Render environment variables; never put a secret API key in frontend code or commit it to Git.
- Browser speech/spell correction is device-dependent. The game uses native input hints rather than a separate spellchecking service.
