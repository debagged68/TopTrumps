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
const locked = await ann('POST', `/api/challenges/${id}/lock`, { category: 'Wrath' });
check(locked.data.status === 'awaiting_reply', 'locked');
const inv = await ann('GET', `/api/challenges/${id}/invitation`);
const invite = inv.data.path.split('#invite=')[1];
check(!!invite, 'invitation issued');
const pv = await eve('GET', `/api/challenges/${id}/preview`);
check(!JSON.stringify(pv.data).includes('Ann'), 'preview is generic');
const insp = await bob('POST', `/api/challenges/${id}/inspect-invitation`, { invite });
check(insp.data.availability === 'available' && insp.data.senderName === 'Ann' && !insp.data.card, 'inspection read-only');
const peek = await eve('GET', `/api/challenges/${id}`);
check(peek.status === 404, 'stranger cannot read challenge');
const acc = await bob('POST', `/api/challenges/${id}/accept`, { invite, nickname: 'Bob' });
check(acc.status === 200 && acc.data.hints.length === 2 && !('chosen' in acc.data), 'accepted with two hints, no locked sin');
const late = await eve('POST', `/api/challenges/${id}/accept`, { invite, nickname: 'Eve' });
check(late.status === 409 && late.data.code === 'already_accepted', 'second accept refused');
const resp = await bob('POST', `/api/challenges/${id}/respond`, { card: acc.data.card.id });
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

// ---- live challenge back: both players present, request, accept, play the rematch ----
const live = (who, action) => who('POST', `/api/challenges/${id}/live`, { action });
const early = await live(eve, 'ping');
check(early.status === 404, 'stranger cannot ping live state');
const pa = await live(ann, 'ping');
check(pa.status === 200 && pa.data.opponentHere === false, 'alone: opponent not here yet');
const askAlone = await live(ann, 'request');
check(askAlone.status === 409 && askAlone.data.code === 'opponent_left', 'cannot challenge back when the other player has left');
const pb = await live(bob, 'ping');
check(pb.data.opponentHere === true, 'both present');
const ask = await live(ann, 'request');
check(ask.data.rematch?.from === 'you' && ask.data.rematch.state === 'pending', 'request pending for requester');
const seen = await live(bob, 'ping');
check(seen.data.rematch?.from === 'them' && seen.data.rematch.state === 'pending', 'pop-up state shown to the other player');
const own = await live(ann, 'accept');
check(own.status === 409, 'requester cannot accept their own request');
const yes = await live(bob, 'accept');
const next = yes.data.rematch?.challengeId;
check(yes.data.rematch?.state === 'accepted' && !!next, 'accepted creates a new challenge');
const polled = await live(ann, 'ping');
check(polled.data.rematch?.challengeId === next, 'requester learns of the new challenge');
const nv = await ann('GET', `/api/challenges/${next}`);
check(nv.data.status === 'draft' && nv.data.opponentName === 'Bob', 'rematch draft has opponent seated');
const bv = await bob('GET', `/api/challenges/${next}`);
check(bv.data.status === 'waiting_for_sender', 'accepter waits for the sender’s sin');
const nl = await ann('POST', `/api/challenges/${next}/lock`, { category: 'Greed' });
check(nl.data.status === 'accepted', 'lock goes straight to accepted, no invite needed');
const ninv = await ann('GET', `/api/challenges/${next}/invitation`);
check(ninv.status === 409, 'no invitation link for a rematch');
const bt = await bob('GET', `/api/challenges/${next}`);
check(bt.data.status === 'your_turn', 'accepter now has their turn');
