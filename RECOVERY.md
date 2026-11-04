# Project recovery

Recovered as a standalone local repository on 19 October 2026. The initial commit contains the earlier local Express game. Later work replaced it with a browser game and a static build.

On 4 November 2026 an optional same-origin Jev API was added to avoid the provider's browser CORS restriction. The final publication uses player-supplied keys only. The preview no longer imports any external environment file, and server environment keys are ignored. Local AI remains available without a key or AI API cost.

Automated tests mock Jev. A real Jev move was verified locally before publication. Repository history and publishable source were checked for known credentials before pushing.
