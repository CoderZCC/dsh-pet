'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');

const EVENTS = [
  'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'Notification', 'PreCompact', 'Stop', 'StopFailure', 'SessionEnd',
];

function mapEvent(input) {
  switch (input.hook_event_name) {
    case 'UserPromptSubmit': return { state: 'thinking', task: 'Claude：思考中' };
    case 'PreToolUse':
      return input.tool_name === 'AskUserQuestion'
        ? { state: 'waiting', task: 'Claude：等待回答' }
        : { state: 'working', task: 'Claude：执行工具中' };
    case 'PostToolUse': return { state: 'thinking', task: 'Claude：继续思考' };
    case 'PostToolUseFailure': return { state: 'error', task: 'Claude：工具执行失败' };
    case 'PermissionRequest': return { state: 'waiting', task: 'Claude：等待授权' };
    case 'Notification':
      return ['permission_prompt', 'idle_prompt', 'elicitation_dialog'].includes(input.notification_type)
        ? { state: 'waiting', task: 'Claude：等待确认' } : undefined;
    case 'PreCompact': return { state: 'result', task: 'Claude：整理上下文' };
    case 'Stop': return { state: 'success', task: 'Claude：本轮回复完成' };
    case 'StopFailure': return { state: 'error', task: 'Claude：本轮出错' };
    case 'SessionEnd': return null;
    default: return undefined;
  }
}

function endpoint(base) {
  const url = new URL(base);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Use a local HTTP service origin, e.g. http://127.0.0.1:3080');
  }
  return new URL('/dsh-pet-7340/work-status', url);
}

async function sendEvent(input, base, fetcher = fetch) {
  const state = mapEvent(input);
  if (state === undefined) return;
  const headers = { 'content-type': 'application/json' };
  try {
    const runtime = JSON.parse(readFileSync(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet', 'standalone-runtime.json'), 'utf8'));
    if (Number(endpoint(base).port) === runtime.port && runtime.token) headers['x-dsh-pet-token'] = runtime.token;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read standalone runtime credentials');
  }
  const response = await fetcher(endpoint(base), {
    method: state === null ? 'DELETE' : 'POST',
    headers,
    body: state === null ? undefined : JSON.stringify(state),
    signal: AbortSignal.timeout(1500),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Pet service HTTP ${response.status}`);
  if (state !== null) {
    const result = await response.json();
    if (result.ok === false) throw new Error(`Pet service: ${result.reason}`);
  }
}

function config(base) {
  endpoint(base);
  // Command hooks use a POSIX shell (Git Bash on Windows).
  const quote = value => `'${value.replace(/'/g, `'"'"'`)}'`;
  const command = [process.execPath, __filename, base]
    .map(value => quote(process.platform === 'win32' ? value.replace(/\\/g, '/') : value)).join(' ');
  return { hooks: Object.fromEntries(EVENTS.map(event => [event, [{ hooks: [{ type: 'command', command, timeout: 3 }] }]])) };
}

async function main() {
  const base = process.argv[3] || process.argv[2] || 'http://127.0.0.1:3080';
  if (process.argv[2] === '--config') {
    process.stdout.write(`${JSON.stringify(config(base), null, 2)}\n`);
    return;
  }
  try {
    await sendEvent(JSON.parse(readFileSync(0, 'utf8')), base);
  } catch (error) {
    // A decorative integration must never block or alter Claude's decisions.
    process.stderr.write(`[dsh-pet] ${error.message}\n`);
  }
}

module.exports = { mapEvent, endpoint, sendEvent, config, EVENTS };
if (require.main === module) void main();
