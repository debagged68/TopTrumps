import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const dataset=JSON.parse(fs.readFileSync('data/donald.json','utf8'));
const rows=new Map();
const env={DB:{prepare(sql){return {bind(...v){return {async first(){return rows.has(v[0])?{state:rows.get(v[0])}:null},async run(){if(sql.startsWith('insert'))rows.set(v[0],v[1]);else if(rows.get(v[1])===v[2])rows.set(v[1],v[0]);return {success:true}}}}}}}};
let source=fs.readFileSync('app/api/game/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
source=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext});
const ctx=vm.createContext({env,dataset,crypto,Response,Request,URL,Uint32Array});
vm.runInContext(source+';globalThis.api={GET,POST}',ctx);
let cookie='';
async function post(body){return ctx.api.POST(new Request('https://game.test/api/game',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(body)}))}
for(let i=0;i<50;i++){
const mode=i%2?'first':'second';const deal=await post({action:'deal',mode});assert.equal(deal.status,200);cookie=deal.headers.get('set-cookie').split(';')[0];const front=await deal.json();
assert.equal(front.cards.length,2);assert.notEqual(front.cards[0].id,front.cards[1].id);assert(!('opponent' in front));assert(!('result' in front));assert(front.cards.every(c=>Object.keys(c.scores).length===6&&!('rationale'in c)));
const state=JSON.parse(rows.get(cookie.split('=')[1]));assert(!state.cards.includes(state.opponent));assert(!dataset.cards.find(c=>c.id===state.opponent).status.includes('hold'));
if(mode==='second'){assert.equal(front.hints.length,2);assert(front.hints.includes(state.sin));}
const retry=await (await post({action:'deal',mode})).json();assert.deepEqual(retry,front);
const forged=await post({action:'play',card:state.opponent,category:'Pride'});assert.equal(forged.status,400);
const result=await (await post({action:'play',card:front.cards[0].id,category:'Pride'})).json();assert(result.done);assert.equal(result.result.category,mode==='second'?state.sin:'Pride');
const expected=result.result.yours>result.result.theirs?'You win':result.result.yours<result.result.theirs?'Computer wins':'Draw';assert.equal(result.result.outcome,expected);
const repeated=await(await post({action:'play',card:front.cards[1].id,category:'Lust'})).json();assert.deepEqual(repeated,result);
const restored=await(await ctx.api.GET(new Request('https://game.test/api/game',{headers:{cookie}}))).json();assert.deepEqual(restored,result);
}
console.log('50 rounds passed: both modes, distinct cards, player scores and hidden opponent, locked hints, invalid-card rejection, duplicate actions, result restoration.');
