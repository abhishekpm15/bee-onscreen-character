# Buzzy the Bee

A Chrome extension: a cartoon bee flies around your pages and carries chat
messages between you and one friend.

## Parts

- `manifest.json`, `content.js`, `background.js`, `popup.*`, `icons/` — the extension
- `server/` — a tiny WebSocket relay both extensions connect to

## Run the server locally (for testing)

```sh
cd server
npm install
npm start          # listens on ws://localhost:8080 (set PORT to change)
```

## Deploy the server (so your friend can reach it)

Any host that runs Node and supports WebSockets works (Render, Railway, Fly.io, a VPS).
Point it at the `server/` folder, with start command `npm start`. Hosts provide
`PORT` automatically. Your server URL will look like `wss://your-app.onrender.com`
(use `wss://`, not `https://`).

Free tiers often sleep when idle; while asleep, presence and messages pause until
it wakes. Use an always-on plan if that matters.

## Connect

1. Both people load the extension (`chrome://extensions` → Developer mode → Load unpacked).
2. Open the Buzzy popup → **Chat**:
   - **Your name** — what your friend sees
   - **Room code** — click **New**, then send the code to your friend; they paste the same code
   - **Server** — your deployed `wss://…` URL
3. Click **Save & connect**. When both are connected, each bee's antennae glow green
   and it announces "*name* is online now 👋".
4. Hover the bee, type, press **Enter**. Messages sent while your friend is offline
   are held by the server and delivered when they come online (until the server restarts).
