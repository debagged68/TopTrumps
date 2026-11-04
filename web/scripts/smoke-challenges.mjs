// End-to-end HTTP smoke test for the challenge API with two independent "browsers".
// Usage: node scripts/smoke-challenges.mjs http://localhost:3123
const base = process.argv[2] ?? 'http://localhost:3000';
function browser() {
  let cookie = '';
  return async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json();
    return { status: res.status, data, headers: res.headers };
  };
}
const check = (cond, label) => { if (!cond) { console.error('FAIL', label); process.exitCode = 1; } else console.log('ok  ', label); };
const ann = browser(), bob = browser(), eve = browser();

const draft = await ann('POST', '/api/challenges/draft', { nickname: 'Ann', idempotencyKey: 'smoke-' + Date.now() });
check(draft.status === 200 && draft.data.card, 'draft created');
check(draft.headers.get('cache-control')?.includes('no-store') && draft.headers.get('referrer-policy') === 'no-referrer', 'private headers');
const id = draft.data.id;
const locked = await ann('POST', `/api/challenges/${id}/lock`, { category: 'Wrath', card: draft.data.cards[1].id });
check(locked.data.status === 'awaiting_reply', 'locked');
const inv = await ann('GET', `/api/challenges/${id}/invitation`);
const invite = inv.data.path.split('#')[1];
check(inv.data.path.startsWith(`/c/${id}#`) && inv.data.path.length < 50, 'short invite link');
check(!!invite, 'invitation issued');
const pv = await eve('GET', `/api/challenges/${id}/preview`);
check(!JSON.stringify(pv.data).includes('Ann'), 'preview is generic');
const insp = await bob('POST', `/api/challenges/${id}/inspect-invitation`, { invite });
check(insp.data.availability === 'available' && insp.data.senderName === 'Ann' && insp.data.card?.front && !insp.data.card?.scores, 'inspection read-only');
const peek = await eve('GET', `/api/challenges/${id}`);
check(peek.status === 404, 'stranger cannot read challenge');
const acc = await bob('POST', `/api/challenges/${id}/accept`, { invite, nickname: 'Bob' });
check(acc.status === 200 && acc.data.cards.length === 0 && acc.data.opponentFront && !('hints' in acc.data) && !('chosen' in acc.data), 'accepted with opponent quote and no sin hints');
const late = await eve('POST', `/api/challenges/${id}/accept`, { invite, nickname: 'Eve' });
check(late.status === 409 && late.data.code === 'already_accepted', 'second accept refused');
const hand=await bob('POST', `/api/challenges/${id}/hand`, {packs:['donald','donald']});
check(hand.data.cards?.length===2,'recipient deals two cards');
const resp = await bob('POST', `/api/challenges/${id}/respond`, { card: hand.data.cards[1].id, category:'Greed' });
check(resp.data.status === 'result_ready' && resp.data.opponentFront && !resp.data.result, 'responded, result hidden');
const cancel = await ann('POST', `/api/challenges/${id}/cancel`);
check(cancel.status === 409, 'cancel after response refused');
const rb = await bob('POST', `/api/challenges/${id}/reveal`);
const ra = await ann('POST', `/api/challenges/${id}/reveal`);
check(rb.data.result && ra.data.result, 'both revealed');
const opposite = { win: 'loss', loss: 'win', draw: 'draw' };
check(opposite[ra.data.result.outcome] === rb.data.result.outcome, 'role-aware outcomes agree');
const list = await ann('GET', '/api/challenges');
check(list.data.challenges[0]?.status === 'completed' && list.data.totals, 'listed');
const cross = await fetch(base + `/api/challenges/${id}/reveal`, { method: 'POST', headers: { origin: 'https://evil.example' } });
check(cross.status === 403, 'cross-origin mutation refused');

// ---- asynchronous rematch: first request has the deal, opponent may be offline ----
const live=(who,action)=>who('POST',`/api/challenges/${id}/live`,{action});
check((await live(eve,'ping')).status===404,'stranger cannot read rematch');
const ask=await live(ann,'request');
check(ask.status===200&&ask.data.rematch.from==='you','offline rematch reserves dealer');
const next=ask.data.rematch.challengeId;
const other=await live(bob,'request');
check(other.data.rematch.challengeId===next&&other.data.rematch.from==='them','second request joins same deal');
const nv=await ann('GET',`/api/challenges/${next}`);
check(nv.data.status==='draft'&&nv.data.cards.length===0,'dealer selects packs before drawing');
const nh=await ann('POST',`/api/challenges/${next}/hand`,{packs:['donald','donald']});
const nl=await ann('POST',`/api/challenges/${next}/lock`,{category:'Greed',card:nh.data.cards[1].id});
check(nl.data.status==='accepted','rematch lock hands over turn');
const bh=await bob('POST',`/api/challenges/${next}/hand`,{packs:['donald','donald']});
await bob('POST',`/api/challenges/${next}/respond`,{card:bh.data.cards[0].id});
const br=await bob('POST',`/api/challenges/${next}/reveal`);
check(br.data.result.category==='Greed','rematch uses first player locked sin');
const image=await fetch(base+`/api/challenges/${id}/image`);
check(image.status===200&&image.headers.get('content-type')?.includes('image/png'),'actual challenge card image renders');
const preview=await (await fetch(base+`/c/${id}`)).text();
check(preview.includes(`/api/challenges/${id}/image`),'invitation has card-specific image metadata');
