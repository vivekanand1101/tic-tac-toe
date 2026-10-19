# Local security model

This is a personal, local-only game. The server binds to `127.0.0.1` and does not support public hosting, LAN exposure, or reverse proxies. Open `http://127.0.0.1:3039` on the same computer.

- Local Host allowlist and exact Origin checks reject DNS rebinding and cross-origin browser requests. Cross-site and same-site fetches are rejected. Command-line clients without an Origin can call the local API.
- A Content Security Policy permits scripts/styles from this game only, blocks framing, and restricts browser network calls to the same origin. Other headers disable MIME sniffing, referrers, and unnecessary device access.
- JSON bodies and game state are validated. Inference requests are limited per process, with at most two concurrent requests. These limits reduce accidental traffic; they are not a spending cap.
- Jev keys stay server-side. `.env` and dependencies are ignored by Git. No existing key was copied into this repository. Jev requests use HTTPS, a fixed endpoint, no redirects, and a three-second timeout.
- This does not protect against malicious software or other users already able to run programs on this computer. Do not expose the service to the Internet without adding authentication and reviewing deployment security.

Run `npm test` and `npm audit` after dependency changes. The audit is a check of known advisories at the time it runs, not a guarantee that the application has no vulnerabilities.
