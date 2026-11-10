// Smoke test for the packed `langcoach` package.
//
// Usage: node scripts/smoke-stdio.mjs <install-dir>
//   <install-dir> is a folder where `npm i <langcoach-*.tgz>` was run.
//
// Starts the installed bin over stdio with LANGCOACH_HOME set to an empty temp folder, sends
// MCP initialize + tools/list + bridge_prepare_extension, and checks: every stdout line is JSON-RPC,
// tools/list returns 14 tools, the package ships extension/manifest.json but no pairing.json,
// bridge_prepare_extension copies it into LANGCOACH_HOME with a pairing.json, the token is never
// printed, stderr is empty, the process exits 0 once stdin closes, and no data.json was written.
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
// The pairing secret is written only into the learner's copy, never shipped in the package.
if (existsSync(join(pkgDir, 'extension', 'pairing.json'))) fail('package ships extension/pairing.json');
if (!existsSync(join(pkgDir, 'extension', 'manifest.json'))) fail('package is missing extension/manifest.json');

home = mkdtempSync(join(tmpdir(), 'langcoach-smoke-'));
const child = spawn(process.execPath, [binPath], {
  // Port 0: the bridge binds a free port, so a LangCoach session already owning 47821 cannot make stderr non-empty.
  env: { ...process.env, LANGCOACH_HOME: home, LANGCOACH_BRIDGE_PORT: '0' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
let sent2 = false;
let sent3 = false;
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
  if (msgs.some((m) => m?.id === 2) && !sent3) {
    sent3 = true;
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'bridge_prepare_extension', arguments: {} } });
  }
  if (msgs.some((m) => m?.id === 3) && !sentClose) {
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
    if (tools.length !== 14) fail(`expected 14 tools, got ${tools.length}`);
    if (!tools.some((t) => t.name === 'bridge_prepare_extension')) fail('bridge_prepare_extension is not listed');
    const call = msgs.find((m) => m.id === 3)?.result;
    if (!call || call.isError) fail(`bridge_prepare_extension failed: ${JSON.stringify(call)}`);
    const prepared = JSON.parse(call.content[0].text);
    if (resolve(prepared.path) !== resolve(home, 'extension')) fail(`unexpected extension path: ${prepared.path}`);
    if (!existsSync(join(prepared.path, 'manifest.json'))) fail('prepared folder has no manifest.json');
    const tokenFile = join(home, 'bridge-token');
    if (!existsSync(tokenFile)) fail('no bridge-token was created');
    const token = readFileSync(tokenFile, 'utf8').trim();
    const pairing = JSON.parse(readFileSync(join(prepared.path, 'pairing.json'), 'utf8'));
    if (pairing.token !== token || pairing.v !== 1) fail('pairing.json does not hold the bridge token');
    if (stdout.includes(token) || stderr.includes(token)) fail('the pairing token was printed');
    if (stderr !== '') fail(`stderr is not empty: ${stderr}`);
    if (code !== 0) fail(`exit code ${code} (signal ${signal})`);
    const left = readdirSync(home).sort().join(', ');
    if (left !== 'bridge-token, extension') fail(`unexpected files in LANGCOACH_HOME: ${left}`);
    if (existsSync(join(home, 'data.json'))) fail('data.json was created');
    console.log(
      `SMOKE OK: ${init.result.serverInfo.name}@${init.result.serverInfo.version}, ` +
        `${tools.length} tools (${tools.map((t) => t.name).join(', ')}), extension ${prepared.version} prepared ` +
        'with pairing.json, token never printed, exit 0, stderr empty, no data.json',
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
