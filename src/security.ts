import type { RequestHandler } from 'express';

/** Restrict these unauthenticated games to same-origin requests on loopback hosts. */
export function localBrowserSecurity(): RequestHandler {
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cache-Control': 'no-store'
    });
    const host = req.get('host') || '';
    if (!/^(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/.test(host)) {
      res.status(403).json({ error: 'Local host required.' }); return;
    }
    const origin = req.get('origin');
    if ((origin && origin !== `http://${host}`) || req.get('sec-fetch-site') === 'cross-site' || req.get('sec-fetch-site') === 'same-site') {
      res.status(403).json({ error: 'Same-origin requests required.' }); return;
    }
    next();
  };
}

/** Bound local inference traffic and concurrent calls without trusting forwarded IP headers. */
export function inferenceLimit(maxRequests = 300, maxConcurrent = 2, now = Date.now): RequestHandler {
  let windowStart = now(), count = 0, active = 0;
  return (_req, res, next) => {
    const time = now();
    if (time - windowStart >= 60_000) { windowStart = time; count = 0; }
    if (count >= maxRequests || active >= maxConcurrent) {
      res.set('Retry-After', '60');
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' }); return;
    }
    count++; active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}
