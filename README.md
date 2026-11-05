# Cross & Circle — Tic-tac-toe

Play tic-tac-toe against Jev with **your own Jev API key**. Every AI move is chosen by Jev; a key is required to play.

Live: [anandvivek.in/slops/tic-tac-toe](https://anandvivek.in/slops/tic-tac-toe/) · [Cloudflare Workers](https://tic-tac-toe.vivekanand1101.workers.dev)

Open the game, enter your key, and select **Save key & play**. The key stays in this tab by default. **Remember on this device** optionally saves it in this browser; **Key settings** lets you replace or clear it. Never use a personal key on an untrusted site or device. Jev usage is charged to the key's owner according to their provider plan.

The game sends Jev moves through the hosted game API. On anandvivek.in it calls the dedicated Cloudflare Worker directly, so a missing Pages API route cannot switch the browser to Jev. That API forwards the player's key to Jev for that request only; it does not persist it. No owner key or server secret is configured or required.

## Run locally

Use Node 24 LTS (Node 22.9+ supported).

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://127.0.0.1:3039. No `.env` file is needed. Local preview and web deployment both ask players for their own keys. When Jev rejects a key as invalid or expired, the frontend clears it and reopens the key dialog; the player must enter a replacement before continuing. The preview never reads keys from another project or from environment variables.

## Deploy on Cloudflare Workers Free

```sh
npm ci --ignore-scripts
npm run deploy:check
npx wrangler login
npm run deploy
```

The checked-in configuration targets the owner’s Cloudflare account. When deploying a fork, replace `account_id` with your own. Pages serves the personal website’s static game files; no game Worker route intercepts page loads. The Worker’s assets are also served without executing its API handler. Before publishing frontend changes, run `npm run sync:website -- /path/to/website-source`, then commit and publish the website’s `public/slops/tic-tac-toe/` files.

Use the Free plan and its provided `workers.dev` address. Do **not** upload a `JEV_API_KEY` secret: the app deliberately ignores server environment keys. `wrangler.jsonc` packages static assets with the board-only API, using no database or dedicated server. Its three rate-limit bindings allow approximately 30 API requests/IP/minute, 12 move attempts/IP/minute, and 24 move attempts/key/minute, per Cloudflare location. Limits include rejected attempts. Production fails closed if a binding is missing or fails; the loopback preview has no bindings.

The frontend calls the API only after a player supplies a key and starts a move; saving a key does not call the API. Jev must receive the first attempted move to determine whether a key is valid. Invalid keys receive an error and cannot play. Public endpoints can still receive unwanted traffic, and these approximate local limits cannot guarantee protection against distributed attacks or exhaustion of the free Worker quota.

Cloudflare currently provides unlimited free static asset requests and 100,000 Worker requests/day on its Free plan, subject to CPU and other platform limits. Hosting can remain free within those limits. Jev inference is separate and uses each player's own credits.

The live deployment can also be published with the connected Sites workflow. `scripts/prepare-sites.mjs` bundles the same browser assets and board-only API into the Sites Worker ESM starter at `.sites/tic-tac-toe/worker/index.js`. The Sites checkout is separate from this source repository and contains no runtime keys. It requires no database, storage binding, or owner secret.

References: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [static assets](https://developers.cloudflare.com/workers/static-assets/), [rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Static-only hosting

`npm run build` produces `dist/`. The static frontend requires the game API for all AI moves. The personal site uses its dedicated Worker endpoint with an explicit allowed origin. Other static hosts must configure their own game API; the frontend never falls back to calling Jev directly.

## Checks

`npm test` checks game rules, required player keys, credential storage/cancellation, per-player key isolation, request validation, upstream errors and redaction, and Worker routing. Tests mock Jev. `npm run deploy:check` validates deployment packaging without publishing. See `SECURITY.md` for key-storage details.
