# Player-supplied API keys

Every player supplies their own Jev key. No owner key is shipped in source or browser assets, configured at deployment, or loaded by local preview. The server ignores any `JEV_API_KEY` environment value. No `.env` file is needed.

In the Worker deployment, the browser sends the player's key in an Authorization header to the same-origin `/api/play` endpoint. The endpoint accepts only a board and starting player, validates legal play, builds a fixed-model game request, and forwards the player's key to Jev over HTTPS. Keys are used only for that request and are never persisted server-side. The API rejects cross-origin requests, non-JSON content, oversized bodies and arbitrary prompt fields. Errors omit upstream response bodies and internal exception details. Provider calls reject redirects and time out after four seconds.

Browser keys use sessionStorage by default, or localStorage when the player selects Remember. Storage is not encrypted secret storage; same-origin scripts, extensions, or anyone with access to the profile may read it. Use personal, revocable keys on a trusted, dedicated origin. Settings clears the password input on close. Opening settings or replacing/clearing keys cancels pending browser requests and stale results cannot update the board.

Static-only hosting calls Jev directly with the player's key and requires provider CORS permission. Choosing local AI makes no AI API requests. Neither deployment mode supplies free Jev credits; each player's usage belongs to their own key.

The local preview binds only to 127.0.0.1 and validates Host. The direct Cloudflare configuration adds an approximate 12-moves/minute per-IP rate limit per location; the Sites artifact does not require that binding. Rate limits are not authentication or a spending cap. No general-purpose AI proxy is exposed.

The CSP permits only local scripts/styles and connections to this origin and Jev. Requests omit cookies and referrers. Keys must never appear in source, URLs, logs, configuration, screenshots, or Git. `.env*`, `.dev.vars*`, build output and local deployment state are ignored.
