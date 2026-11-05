import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playBoard} from '../dist/modules/play.js';
import {status,validateBoard} from '../dist/modules/game.js';
import {buildJevRequest} from '../dist/modules/ai.js';
test('AI moves require a player key and never substitute a browser opponent',async()=>{
 await assert.rejects(playBoard(['X',null,null,null,null,null,null,null,null],'X','',undefined,async()=>assert.fail('must not fetch without a key')),{message:'Add your Jev API key in Key settings.'});
});
test('invalid, unreachable and wrong-turn boards are rejected',()=>{
 for(const input of [[],Array(9).fill(null),['x',null,null,null,null,null,null,null,null],['X','X','X','O','O','O',null,null,null],['X','X','X','O','O',null,'O',null,null]])assert.throws(()=>validateBoard(input));
 assert.throws(()=>validateBoard(Array(9).fill(null),'Z'),{message:'startingPlayer must be X or O.'});
});
test('terminal boards never call Jev',async()=>{
 for(const [board,result] of [[['X','X','X','O','O',null,null,null,null],'X_wins'],[['X','X','O','X','O',null,'O',null,null],'O_wins'],[['X','O','X','X','O','O','O','X','X'],'draw']]){
 assert.deepEqual(await playBoard(board,'X','sample-key',undefined,async()=>assert.fail('must not fetch')),{board,status:result,nextPlayer:null,move:null,provider:null,fallback:false});
 }
});
test('human-first and Jev-first rounds both use the Jev chooser',async()=>{
 const choose=move=>async()=>Response.json({answers:{move:{type:'choice',choice:String(move)}}});
 assert.deepEqual(await playBoard(['X',null,null,null,null,null,null,null,null],'X','sample-key',undefined,choose(4)),{board:['X',null,null,null,'O',null,null,null,null],move:4,status:'in_progress',nextPlayer:'X',provider:'jev',fallback:false});
 assert.deepEqual(await playBoard(Array(9).fill(null),'O','sample-key',undefined,choose(0)),{board:['O',null,null,null,null,null,null,null,null],move:0,status:'in_progress',nextPlayer:'X',provider:'jev',fallback:false});
});
test('Jev choice uses direct request with exact legal squares and no silent fallback',async()=>{
 const board=['X',null,null,null,null,null,null,null,null];
 const response=await playBoard(board,'X','sample-key',undefined,async(url,options)=>{
 assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.deepEqual(Object.keys(JSON.parse(options.body).questions.move.criteria),['1','2','3','4','5','6','7','8']);return Response.json({answers:{move:{type:'choice',choice:'4'}}});
 });assert.deepEqual(response,{board:['X',null,null,null,'O',null,null,null,null],move:4,status:'in_progress',nextPlayer:'X',provider:'jev',fallback:false});
 await assert.rejects(playBoard(board,'X','sample-key',undefined,async()=>Response.json({answers:{move:{type:'choice',choice:'0'}}})),{message:'Invalid Jev choice.'});
 await assert.rejects(playBoard(board,'X','sample-key',undefined,async()=>new Response('',{status:401})),{message:'Jev rejected this key. Update it in Key settings.'});
});
test('Jev receives immediate win and threat facts',()=>{
 const win=buildJevRequest(['O','O',null,'X','X',null,'X',null,null],[2,5,7,8],'jev-latest');assert.equal(win.questions.move.criteria['2'].winsNow,true);assert.deepEqual(win.questions.move.criteria['2'].immediateWinningRepliesForX,[]);
 const block=buildJevRequest(['X','X',null,null,'O',null,null,null,null],[2,3,5,6,7,8],'jev-latest');assert.deepEqual(block.questions.move.criteria['2'].immediateWinningRepliesForX,[]);assert.deepEqual(block.questions.move.criteria['3'].immediateWinningRepliesForX,[2]);
});
