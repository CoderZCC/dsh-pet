'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { mapEvent, endpoint, sendEvent, config, EVENTS } = require('./hook.cjs');

test('lifecycle states and non-actionable notifications', () => {
  const expected = ['thinking', 'working', 'thinking', 'error', 'waiting', undefined, 'result', 'success', 'error', null];
  EVENTS.forEach((event, i) => assert.equal(mapEvent({ hook_event_name: event })?.state ?? (event === 'SessionEnd' ? null : undefined), expected[i]));
  assert.equal(mapEvent({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' }).state, 'waiting');
  assert.equal(mapEvent({ hook_event_name: 'Notification', notification_type: 'permission_prompt' }).state, 'waiting');
  assert.equal(mapEvent({ hook_event_name: 'SubagentStop' }), undefined);
});

test('posts only status and clears on session end over HTTP', async t => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body });
    res.writeHead(req.method === 'DELETE' ? 204 : 200, { 'content-type': 'application/json' });
    res.end(req.method === 'DELETE' ? undefined : body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  await sendEvent({ hook_event_name: 'UserPromptSubmit', prompt: 'SECRET' }, base);
  await sendEvent({ hook_event_name: 'SessionEnd' }, base);
  assert.deepEqual(requests, [
    { method: 'POST', url: '/dsh-pet-7340/work-status', body: JSON.stringify({ state: 'thinking', task: 'Claude：思考中' }) },
    { method: 'DELETE', url: '/dsh-pet-7340/work-status', body: '' },
  ]);
});

test('rejects remote origins and reports API rejection', async () => {
  for (const base of ['https://127.0.0.1', 'http://example.com', 'http://localhost/path']) {
    assert.throws(() => endpoint(base));
  }
  await assert.rejects(sendEvent({ hook_event_name: 'Stop' }, 'http://localhost:3080', async () => ({ ok: true, json: async () => ({ ok: false, reason: 'bad-request' }) })), /bad-request/);
});

test('generated config covers events; malformed input never blocks Claude', () => {
  assert.deepEqual(Object.keys(config('http://localhost:3080').hooks), EVENTS);
  const result = spawnSync(process.execPath, [require.resolve('./hook.cjs')], { input: '{', encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /dsh-pet/);
});
