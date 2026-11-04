import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createKeyStore} from '../dist/modules/credentials.js';
import {requestJev,JevError,JEV_ENDPOINT} from '../dist/modules/jev.js';
function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
test('key is cached for a tab, restored after reload, updated and cleared',()=>{
 const session=storage(),local=storage(),store=createKeyStore(session,local);
 assert.equal(store.key,'');assert.equal(store.remembered,false);
 const first=store.signal;assert.equal(store.save('  sample-key  ',false),true);assert.equal(first.aborted,true);
 assert.equal(store.key,'sample-key');assert.equal(store.remembered,false);assert.equal(session.getItem('jev-game-key-v1'),'sample-key');assert.equal(local.getItem('jev-game-key-v1'),null);
 assert.equal(createKeyStore(session,local).key,'sample-key');
 const second=store.signal;assert.equal(store.save('replacement-key',true),true);assert.equal(second.aborted,true);
 assert.equal(session.getItem('jev-game-key-v1'),null);assert.equal(local.getItem('jev-game-key-v1'),'replacement-key');assert.equal(createKeyStore(storage(),local).remembered,true);
 const third=store.signal;assert.equal(store.clear(),true);assert.equal(third.aborted,true);assert.equal(store.key,'');assert.equal(store.remembered,false);assert.equal(session.getItem('jev-game-key-v1'),null);assert.equal(local.getItem('jev-game-key-v1'),null);
});
test('switching from remembered to tab-only removes the persistent key',()=>{
 const session=storage(),local=storage(),store=createKeyStore(session,local);
 store.save('remembered-key',true);store.save('tab-key',false);
 assert.equal(local.getItem('jev-game-key-v1'),null);assert.equal(session.getItem('jev-game-key-v1'),'tab-key');assert.equal(createKeyStore(storage(),local).key,'');
});
test('storage failures preserve in-memory play and are reported',()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
 const store=createKeyStore(blocked,blocked);assert.equal(store.key,'');assert.equal(store.save('sample-key',false),false);assert.equal(store.key,'sample-key');assert.equal(store.clear(),false);assert.equal(store.key,'');
 const memory=createKeyStore();assert.equal(memory.save('sample-key',true),false);assert.equal(memory.key,'sample-key');
});
test('invalid keys are rejected without changing the current key',()=>{
 const store=createKeyStore();store.save('old-key',false);
 for(const invalid of ['','   ','with space','line\nbreak','x'.repeat(1025)])assert.throws(()=>store.save(invalid,false),{message:'Enter a valid API key without spaces.'});
 assert.equal(store.key,'old-key');
});
test('opening key settings cancels an existing request without forgetting the key',()=>{
 const store=createKeyStore();store.save('sample-key',false);const signal=store.signal;store.cancel();assert.equal(signal.aborted,true);assert.equal(store.signal.aborted,false);assert.equal(store.key,'sample-key');
});
test('Jev is called directly with bearer auth and without cookies, referrers, or redirects',async()=>{
 const payload={model:'jev-latest',state:'sample',questions:{}};
 const response=await requestJev('sample-key',payload,undefined,async(url,options)=>{
 assert.equal(url,JEV_ENDPOINT);assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(options.method,'POST');assert.equal(options.mode,'cors');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');assert.deepEqual(options.headers,{Authorization:'Bearer sample-key','Content-Type':'application/json'});assert.equal(options.body,JSON.stringify(payload));assert.equal(options.signal.aborted,false);
 return Response.json({answers:{}});
 });assert.deepEqual(response,{answers:{}});
});
test('authentication, rate limit, service, network and malformed response failures are actionable',async()=>{
 for(const [fetcher,message,retryable] of [
 [async()=>new Response('',{status:401}),'Jev rejected this key. Update it in Key settings.',false],
 [async()=>new Response('',{status:403}),'Jev rejected this key. Update it in Key settings.',false],
 [async()=>new Response('',{status:429}),'Jev rate limit reached. Wait before trying again.',false],
 [async()=>new Response('',{status:500}),'Jev is unavailable. Please try again later.',true],
 [async()=>{throw new TypeError('sensitive internal message')},'Cannot reach Jev from this website. Check your connection; Jev may need to allow this website’s origin (CORS).',false],
 [async()=>new Response('invalid json'),'Jev returned an invalid response.',false]
 ])await assert.rejects(requestJev('sample-key',{},undefined,fetcher),error=>{assert.equal(error instanceof JevError,true);assert.equal(error.message,message);assert.equal(error.retryable,retryable);return true});
});
test('no key makes no network request; cancellation is preserved',async()=>{
 await assert.rejects(requestJev('',{},undefined,async()=>assert.fail('must not fetch')),{message:'Add your Jev API key in Key settings.'});
 const controller=new AbortController();controller.abort();
 await assert.rejects(requestJev('sample-key',{},controller.signal,async()=>{throw Error('aborted')}),{name:'AbortError',message:'Request cancelled.'});
});
