# Buzzy the Bee

A Chrome extension: a cartoon bee flies around your pages and carries chat
messages between you and a small circle of close friends.

## Parts

- `manifest.json`, `content.js`, `background.js`, `popup.*`, `icons/` — the extension
- `bee-art.js` — draws the bee from a skin (colors, hat, glasses, outfit, wings, pattern); shared by the page and the popup's Style tab
- `server/` — a tiny WebSocket relay both extensions connect to

## Server secret (required)

Bee codes are made by the server from each browser's secret id using a private key,
so nobody can work out someone else's code offline. The server refuses to start without it.

Generate one once:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep it private (never commit it). **Changing it gives everyone a new code.**

## Run the server locally (for testing)

```sh
cd server
npm install
SERVER_SECRET=<your key> npm start   # listens on ws://localhost:8080 (set PORT to change)
```

## Deploy the server (so your friend can reach it)

Any host that runs Node and supports WebSockets works (Render, Railway, Fly.io, a VPS).
Point it at the `server/` folder, with start command `npm start`, and add
`SERVER_SECRET` in the host's environment settings (on Render: **Environment**).
Hosts provide `PORT` automatically. Your server URL will look like
`wss://your-app.onrender.com` (use `wss://`, not `https://`).

Free tiers often sleep when idle; while asleep, presence and messages pause until
it wakes, and held messages are lost. Use an always-on plan if that matters.

The server only accepts connections from the extension (not websites), and limits
connections per IP, message rate, and how many messages anyone can leave waiting.

## Connect

The extension connects to `wss://bee-onscreen-character.onrender.com`
(set in `SERVER_URL` at the top of `background.js`).

1. Both people load the extension (`chrome://extensions` → Developer mode → Load unpacked).
2. Open the Buzzy popup → **Chat**:
   - **Your name** — what your friends see
   - **Your bee code** — appears after the bee first connects. It's made by the server
     from this browser's saved ID, so it never changes; click **Copy** and send it to
     your close ones
   - **Your circle** — up to 3 close ones. Paste a friend's bee code (and, optionally, the
     name you want to save them as) and click **Add friend**. **Both of you must add each other** before
     you can see each other online or chat; until then they show as
     "⏳ Send them your code to connect". Someone who only knows your code can't
     message you or see when you're online. Removing a friend cuts them off the same way.
3. When a friend is online, the dot next to them turns green, the bee's antennae glow,
   and it announces "*name* is online now 👋".
4. Hover the bee, choose who to message in the **To:** picker above the box, type,
   press **Enter**. When a message arrives, the picker switches to that friend so you
   can reply straight away. Messages sent to an offline friend are held by the server
   and delivered when they come online (until the server restarts).
