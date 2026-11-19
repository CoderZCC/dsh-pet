#!/bin/zsh
unset ELECTRON_RUN_AS_NODE
cd "${0:A:h}/dsh-pet" || exit 1
/opt/homebrew/bin/node --input-type=module <<'JS'
import { spawn } from 'node:child_process';
import { openSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const logDir = join(homedir(), '.dsh', 'dsh-pet');
mkdirSync(logDir, { recursive: true });
const log = openSync(join(logDir, 'launch.log'), 'a', 0o600);
let running = false;
try {
  const response = await fetch('http://127.0.0.1:3080/dsh-pet-7340/config', { signal: AbortSignal.timeout(1500) });
  running = response.ok;
} catch {}
const child = spawn(process.execPath, [running ? 'scripts/start-desktop.mjs' : 'lib/standalone.js'], {
  cwd: process.cwd(), detached: true, stdio: ['ignore', log, log], env: process.env,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.unref();
console.log('桌宠已转入后台运行，可以关闭此终端窗口。');
console.log('日志：' + join(logDir, 'launch.log'));
JS
