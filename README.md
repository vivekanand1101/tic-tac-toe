# Cross & Circle — Tic-tac-toe

Play tic-tac-toe against Jev with **your own Jev API key**, or use the free, unbeatable local AI.

Live: [anandvivek.in/slops/tic-tac-toe](https://anandvivek.in/slops/tic-tac-toe/) · [Cloudflare Workers](https://tic-tac-toe.vivekanand1101.workers.dev)

Open the game, enter your key, and select **Save key & play**. The key stays in this tab by default. **Remember on this device** optionally saves it in this browser; **Key settings** lets you replace or clear it. Never use a personal key on an untrusted site or device. Jev usage is charged to the key's owner according to their provider plan.

The game sends each move through a small same-origin API to avoid Jev's browser CORS restriction. That API forwards the player's key to Jev for that request only; it does not persist it. No owner key or server secret is configured or required. **Play with local AI** makes no AI API requests.

## Run locally

Use Node 24 LTS (Node 22.9+ supported).

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://127.0.0.1:3039. No `.env` file is needed. Local preview and web deployment both ask players for their own keys. The preview never reads keys from another project or from environment variables.

## Deploy on Cloudflare Workers Free

```sh
npm ci --ignore-scripts
npm run deploy:check
npx wrangler login
npm run deploy
```

The checked-in configuration targets the owner’s Cloudflare account and the `anandvivek.in/slops/tic-tac-toe` routes. When deploying a fork, replace `account_id` with your own and remove or update `routes`. The Worker normalizes this path so relative game assets and API calls work there and at the `workers.dev` root. The personal website remains hosted by Pages; these Worker routes serve only the game path.

Use the Free plan and its provided `workers.dev` address. Do **not** upload a `JEV_API_KEY` secret: the app deliberately ignores server environment keys. `wrangler.jsonc` packages static assets with the board-only API, using no database or dedicated server. It applies an approximate 12-moves/minute per-IP limit at each Cloudflare location.

Cloudflare currently provides unlimited free static asset requests and 100,000 Worker requests/day on its Free plan, subject to CPU and other platform limits. Hosting can remain free within those limits. Jev inference is separate and uses each player's own credits. Local AI has no API cost.

The live deployment can also be published with the connected Sites workflow. `scripts/prepare-sites.mjs` bundles the same browser assets and board-only API into the Sites Worker ESM starter at `.sites/tic-tac-toe/worker/index.js`. The Sites checkout is separate from this source repository and contains no runtime keys. It requires no database, storage binding, or owner secret.

References: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [static assets](https://developers.cloudflare.com/workers/static-assets/), [rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Static-only hosting

`npm run build` produces `dist/`. Uploading that folder to a static host supports local AI. Personal keys on a static-only host call Jev directly and require its CORS permission. Use the Worker deployment above for browser-independent Jev connectivity.

## Checks

`npm test` checks game rules, minimax, credential storage/cancellation, per-player key isolation, request validation, upstream errors and redaction, and Worker routing. Tests mock Jev. `npm run deploy:check` validates deployment packaging without publishing. See `SECURITY.md` for key-storage details.
