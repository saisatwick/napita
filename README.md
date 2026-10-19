# NaPiTA

A real-time multiplayer **Name, Place, Animal, Thing** party game built with React, Vite, Express and Socket.IO.

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

Run the automated unit tests with:

```bash
npm test
```

## Deploy on Render

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Keep the app as one Node web service so Socket.IO and the built frontend share the same origin.

## Optional AI-assisted validation

The game works without an AI key using its local answer dictionary and room-review flow. To enable AI fallback for unfamiliar answers:

1. Create an API key through the OpenAI API platform.
2. In Render, open the NaPiTA service **Environment** settings and add `OPENAI_API_KEY`.
3. Optionally add `OPENAI_VALIDATOR_MODEL` (default: `gpt-4o-mini`).
4. Redeploy the service.

The key is read only by the Node server. **Do not put it in React/Vite frontend code, commit it to Git, or expose it in `VITE_*` variables.** API usage is billed separately from a ChatGPT subscription. The validator sends a batch of unfamiliar answers, uses `store: false`, times out quickly, and falls back to review if the service is unavailable. An AI response is not a perfect authority; room appeals exist for disputed answers.

## Current features

- Private rooms for up to 12 players, invite links/codes, ready state, reconnect grace period, real-time timer and hidden answers until reveal.
- Classic, Chaos (one random category earns double points) and Speed Run (30-second rounds) modes. Speed Run locks the timer to 30 seconds in both UI and server settings.
- Letter mix: Easy (common letters), Full alphabet, or Challenge (rarer letters). Daily Letter overrides the random letter.
- Optional prompt packs: Around India, Movie Night, and Food & Brands. These are creative nudges only; they do not change the four categories or silently add stricter scoring rules.
- Date-based Daily Letter challenge.
- Category-aware dictionary for Name, Place, Animal and Thing, including Indian names such as Jhansi and animals such as Quail.
- Spelling suggestions for likely typos; suggestions are not silently applied.
- Optional AI fallback for unfamiliar answers and post-round room appeals for disputed category decisions. Wrong-letter answers cannot be appealed.
- Theme selector (Midnight, Classic, Matcha, Sunset) with saved preference and theme-aware contrast for inputs, labels, scores, reveal cards and result panels.
- Optional short sounds, including final-five-second countdown tones and submit confirmation.
- Per-answer validation reasons, round/category score breakdowns, duplicate scoring and Chaos bonus.
- Post-match recap based on actual recorded answers: accepted unique answers, duplicates, category points, per-player receipts, round score history and last-second submissions. Round awards are calculated from validated answers, not only total score.
- Current-round draft answers are not included in public room broadcasts before the reveal. A reconnect response only includes the reconnecting player’s own draft.
- Shareable result summary, rematch flow, responsive category UI with notebook, map, paw and pencil motifs.

## Scoring rules

- Valid unique answer: 10 points.
- Valid duplicate in the same category: 5 points for each player who entered that accepted answer.
- Invalid, wrong-letter, blank, or unverified answer: 0 points until it is accepted through a room appeal (unverified answers are shown as needing review, not silently presented as confirmed wrong).
- In Chaos mode, the selected category's points are doubled.

## Limitations

- Room state is in memory. Active rooms disappear when the server restarts; multi-instance hosting needs shared storage.
- Daily Letter is a date-based challenge, not a cross-player global ranking or persistent streak service.
- The local dictionary is deliberately incomplete. Without an AI key, unknown-but-plausible answers enter review/appeal instead of receiving automatic acceptance. AI can also make mistakes, so use the review flow for disputed answers.
- Browser spelling hints depend on a local word list and are not a full spellchecker for every regional language.

## Player memory and profile stats

The home screen now remembers visits and daily streaks, plus completed matches, wins, losses, and recent result lore in `localStorage` under `napita-profile-v1`. These stats are private to the same browser/device and are not synced between devices or players. Clearing browser storage resets them. Do not present these local stats as a global account or leaderboard.

## Important persistence limitation

Active multiplayer rooms still live in server memory. Socket.IO reconnect works while the server process and room still exist, but a server restart/deploy can clear active rooms. For true cross-restart recovery, add a persistent database (for example, a free-tier PostgreSQL provider) and store room/player/match state there before enabling multi-instance hosting.
