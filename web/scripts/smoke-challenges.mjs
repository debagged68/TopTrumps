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
