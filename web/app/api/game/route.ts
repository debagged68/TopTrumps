import { randomBytes } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import dataset from '../../../data/donald.json';
import * as store from '../../../lib/store.mjs';
import { transact } from '../../../lib/service.mjs';
import { view } from '../../../lib/game.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, private'};
function session(req:NextRequest){const value=req.cookies.get('tt_session')?.value;return value&&/^[a-f0-9]{64}$/.test(value)?value:randomBytes(32).toString('hex');}
function respond(req:NextRequest,id:string,value:unknown,status=200){const res=NextResponse.json(value,{status,headers});res.cookies.set('tt_session',id,{httpOnly:true,secure:req.nextUrl.protocol==='https:'||req.headers.get('x-forwarded-proto')==='https',sameSite:'lax',path:'/',maxAge:86400});return res;}
export async function GET(req:NextRequest){const id=session(req);try{const record=await store.read(id);return respond(req,id,record&&record.expiresAt>Math.floor(Date.now()/1000)?view(record.round):null);}catch(e){console.error('Round storage unavailable',e instanceof Error?e.name:'error');return respond(req,id,{error:'Game storage is not ready. Please try again shortly.'},503);}}
export async function POST(req:NextRequest){const id=session(req);const origin=req.headers.get('origin');if(origin){try{const host=req.headers.get('x-forwarded-host')||req.headers.get('host');if(new URL(origin).host!==host)return respond(req,id,{error:'Invalid request origin.'},403);}catch{return respond(req,id,{error:'Invalid request origin.'},403);}}
 try{if(Number(req.headers.get('content-length')||0)>4096)return respond(req,id,{error:'Request is too large.'},413);const raw=await req.text();if(raw.length>4096)return respond(req,id,{error:'Request is too large.'},413);const input=JSON.parse(raw);const value=await transact(store,dataset,id,input);return respond(req,id,value);}catch(e){const message=e instanceof Error?e.message:'Please try again.';if(/Choose|expired|Unknown game|Play a card|round changed/.test(message))return respond(req,id,{error:message},400);console.error('Game request failed',e instanceof Error?e.name:'error');return respond(req,id,{error:'Unable to complete this action. Please try again.'},503);}}
