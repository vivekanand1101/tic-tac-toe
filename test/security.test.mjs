import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { inferenceLimit, localBrowserSecurity } from '../dist/security.js';

function app() {
  const result = express(); result.disable('x-powered-by');
  result.use(localBrowserSecurity());
  result.get('/health', (_req,res) => res.json({status:'ok'}));
  return result;
}
test('only local hosts and same-origin browsers may access the game', async () => {
  for (const [headers, status, body] of [
    [{Host:'evil.example'},403,{error:'Local host required.'}],
    [{Host:'127.0.0.1:3038',Origin:'https://evil.example'},403,{error:'Same-origin requests required.'}],
    [{Host:'localhost:3038',Origin:'http://localhost:3039'},403,{error:'Same-origin requests required.'}],
    [{Host:'localhost:3038',Origin:'null'},403,{error:'Same-origin requests required.'}],
    [{'Sec-Fetch-Site':'cross-site'},403,{error:'Same-origin requests required.'}],
    [{'Sec-Fetch-Site':'same-site'},403,{error:'Same-origin requests required.'}],
    [{Host:'localhost:3038',Origin:'http://localhost:3038'},200,{status:'ok'}],
    [{Host:'127.0.0.1:3038',Origin:'http://127.0.0.1:3038'},200,{status:'ok'}],
    [{},200,{status:'ok'}]
  ]) {
    const response = await request(app()).get('/health').set(headers);
    assert.equal(response.status,status); assert.deepEqual(response.body,body);
    assert.equal(response.headers['x-powered-by'],undefined);
    assert.equal(response.headers['x-content-type-options'],'nosniff');
    assert.equal(response.headers['x-frame-options'],'DENY');
    assert.equal(response.headers['referrer-policy'],'no-referrer');
    assert.equal(response.headers['cross-origin-resource-policy'],'same-origin');
    assert.equal(response.headers['cross-origin-opener-policy'],'same-origin');
    assert.equal(response.headers['permissions-policy'],'camera=(), microphone=(), geolocation=()');
    assert.equal(response.headers['cache-control'],'no-store');
    assert.equal(response.headers['content-security-policy'],"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  }
});
test('inference limit resets its window and releases completed requests', async () => {
  let now = 0;
  const limited = express(); limited.use(inferenceLimit(1,1,()=>now));
  limited.post('/api',(_req,res)=>res.json({ok:true}));
  const first=await request(limited).post('/api'); assert.equal(first.status,200); assert.deepEqual(first.body,{ok:true});
  const blocked=await request(limited).post('/api'); assert.equal(blocked.status,429);
  assert.deepEqual(blocked.body,{error:'Too many requests. Please try again shortly.'}); assert.equal(blocked.headers['retry-after'],'60');
  now=60_000;
  const reset=await request(limited).post('/api'); assert.equal(reset.status,200); assert.deepEqual(reset.body,{ok:true});
});
test('inference limit rejects concurrent calls and releases after completion', async () => {
  const limited=express(); limited.use(inferenceLimit(10,1));
  let release; let entered;
  const ready=new Promise(resolve=>{entered=resolve});
  limited.post('/api',(_req,res)=>{ release=()=>res.json({ok:true}); entered(); });
  const first=request(limited).post('/api').then(response=>response);
  await ready;
  try {
    const blocked=await request(limited).post('/api'); assert.equal(blocked.status,429);
    assert.deepEqual(blocked.body,{error:'Too many requests. Please try again shortly.'});
  } finally { release(); }
  assert.equal((await first).status,200);
});
