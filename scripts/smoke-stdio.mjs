// Smoke test for the packed `langcoach` package.
//
// Usage: node scripts/smoke-stdio.mjs <install-dir>
//   <install-dir> is a folder where `npm i <langcoach-*.tgz>` was run.
//
// Starts the installed bin over stdio with LANGCOACH_HOME set to an empty temp folder, sends
// MCP initialize + tools/list, and checks: every stdout line is JSON-RPC, tools/list returns 11
// tools, stderr is empty, the process exits 0 once stdin closes, and no data.json was written.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const installDir = process.argv[2];
if (!installDir) {
  console.error('usage: node scripts/smoke-stdio.mjs <install-dir>');
  process.exit(2);
}

let home;
const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}`);
  if (home) rmSync(home, { recursive: true, force: true });
  process.exit(1);
};

const pkgDir = resolve(installDir, 'node_modules', 'langcoach');
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.langcoach;
if (!binRel) fail('package.json has no "langcoach" bin');
const binPath = join(pkgDir, binRel);
if (!existsSync(binPath)) fail(`bin file missing: ${binPath}`);
const shim = join(installDir, 'node_modules', '.bin', process.platform === 'win32' ? 'langcoach.cmd' : 'langcoach');
if (!existsSync(shim)) fail(`npm did not create the bin shim: ${shim}`);
for (const f of ['README.md', 'LICENSE']) if (!existsSync(join(pkgDir, f))) fail(`package is missing ${f}`);

home = mkdtempSync(join(tmpdir(), 'langcoach-smoke-'));
const child = spawn(process.execPath, [binPath], {
  env: { ...process.env, LANGCOACH_HOME: home },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
let sent2 = false;
let sentClose = false;
const timer = setTimeout(() => {
  child.kill();
  fail(`timed out. stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`);
}, 20_000);

const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);

child.stderr.on('data', (d) => {
  stderr += d;
});
child.stdout.on('data', (d) => {
  stdout += d;
  const lines = stdout.split('\n').filter((l) => l.trim() !== '');
  const msgs = lines.map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  });
  const initDone = msgs.some((m) => m?.id === 1);
  if (initDone && !msgs.some((m) => m?.id === 2) && !sent2) {
    sent2 = true;
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  }
  if (msgs.some((m) => m?.id === 2) && !sentClose) {
    sentClose = true;
    child.stdin.end();
  }
});

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  try {
    const lines = stdout.split('\n').filter((l) => l.trim() !== '');
    const msgs = [];
    for (const l of lines) {
      let m;
      try {
        m = JSON.parse(l);
      } catch {
        fail(`stdout line is not JSON: ${l}`);
      }
      if (m?.jsonrpc !== '2.0') fail(`stdout line is not JSON-RPC 2.0: ${l}`);
      msgs.push(m);
    }
    const init = msgs.find((m) => m.id === 1);
    if (!init?.result?.serverInfo) fail(`no initialize result: ${stdout}`);
    const list = msgs.find((m) => m.id === 2);
    const tools = list?.result?.tools;
    if (!Array.isArray(tools)) fail(`no tools/list result: ${stdout}`);
    if (tools.length !== 11) fail(`expected 11 tools, got ${tools.length}`);
    if (stderr !== '') fail(`stderr is not empty: ${stderr}`);
    if (code !== 0) fail(`exit code ${code} (signal ${signal})`);
    const left = readdirSync(home);
    if (left.length !== 0) fail(`LANGCOACH_HOME is not empty after the run: ${left.join(', ')}`);
    if (existsSync(join(home, 'data.json'))) fail('data.json was created');
    console.log(
      `SMOKE OK: ${init.result.serverInfo.name}@${init.result.serverInfo.version}, ` +
        `${tools.length} tools (${tools.map((t) => t.name).join(', ')}), exit 0, stderr empty, no data.json`,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'langcoach-smoke', version: '0.0.0' },
  },
});
