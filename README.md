# NaPiTA — multiplayer Name, Place, Animal, Thing

A responsive React/Vite frontend with an Express + Socket.IO server for real-time private rooms.

## Requirements
- Node.js 18 or newer
- npm

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:5173. Open another browser window or an incognito window to test a second player. The Vite dev server proxies Socket.IO requests to the Express server on port 3000.

For a production-style local run:
```bash
npm run build
npm start
```
Then open http://localhost:3000.

## Multiplayer improvements
- Four-character private room codes, lobby-only joins, 12-player limit and host-only controls.
- Random session tokens let a player reclaim their seat after a refresh or brief connection drop. Seats are reserved for 60 seconds.
- Socket.IO reconnects automatically; the client restores the room, current phase and saved answers from the server snapshot.
- The server owns the round deadline (`endsAt`) and computes remaining time from its clock. Clients cannot extend the timer by changing their local clock.
- The server sanitizes player names and answers, limits answer length, rejects edits after submission/time-out, and awards zero for answers that do not begin with the round letter.
- Answers are normalized case-insensitively for duplicate detection. Valid unique answers earn 10 points; matching answers earn 5 points each.
- The host can advance rounds, finish the game and reset scores for a rematch.

Automatic scoring checks the starting letter and duplicate answers. It does **not** verify whether an answer is factually correct for its category (for example, whether a word is actually an animal); that would require a curated dictionary or moderation step.

## Tests
```bash
npm test
```
The integration test checks room creation and joining, host permissions, ready/start flow, synchronized game state, answer scoring, wrong-letter handling, rematch reset, and reconnecting with the same session token.

## Deploy
Deploy the Node server to a service that supports long-lived WebSocket connections (for example Render, Railway, or Fly.io). Set the build command to `npm install && npm run build` and the start command to `npm start`. Configure `CLIENT_ORIGIN` to your public frontend origin(s) if hosting the frontend separately. If frontend and server use separate domains, set `VITE_SOCKET_URL` at frontend build time to the server's public URL.

## Current scope
Room data is kept in server memory. A server restart clears active rooms, and this setup is intended for an initial release rather than multi-instance scale. Before a large public launch, add persistent storage, rate limiting, monitoring, and a stronger category-validation dictionary.

## UI polish update
- Subtle entrance transitions and staggered card reveals.
- Tactile button states, hover feedback and smoother focus styling.
- Animated letter orb and round timer urgency cue.
- More consistent small-screen spacing, safe-area toast placement, and narrow-phone layouts.
- Honors `prefers-reduced-motion` for accessibility.


## Dark theme and creator credit
- Deep charcoal background with lavender accents and dark cards/inputs.
- Footer credit: “Created by CherryLoneWolf”.
- Responsive footer layout for narrow screens.

## Publish on Render
1. Push this project folder to a GitHub repository.
2. In Render, create a **New Web Service** and connect the repository.
3. Use build command: `npm install && npm run build`.
4. Use start command: `npm start`.
5. Choose a Node runtime and deploy. Render sets `PORT` automatically; the server reads it.
6. Open the Render URL and test room creation and joining in two separate browsers.

The Express server serves the built `dist` folder and handles Socket.IO on the same origin, so you can deploy the frontend and multiplayer server together as one service. Active rooms are kept in memory and are cleared if the service restarts.

## Feature pack update
- Optional Chaos mode doubles the points earned in one server-selected category each round.
- Optional Telugu category labels (the game still accepts free-text answers; it does not automatically verify Telugu spelling or category truth).
- Countdown tones and submit confirmation tones, with a user-controlled sound toggle.
- STOP / lock-answers action, round reveal, and animated urgency styling for the final seconds.
- Local player card tracks games, wins, and best total score in that browser only.
- Players can flag another player's answer during results for host review. A flag does not automatically alter scores; there is no automated dictionary verification or formal vote-to-overturn system yet.

## Remaining before a wider launch
- Room state is still in memory and will clear on a server restart. Use a managed database (for example Postgres) before implementing persistent profiles, cross-device stats, daily challenges, or room recovery across deploys.
- Category correctness needs a curated multilingual dictionary or a moderation/consensus workflow. The current scoring rule checks starting letter and duplicate answers, not factual category membership.
- Test and build in the target deployment environment after pushing changes. Dependency installation could not be completed in the authoring environment, so the full production build and integration suite were not verified here.
