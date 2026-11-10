import { dirname } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Coach, JsonFileStore, defaultDataPath } from '@langcoach/core';
import pkg from '../package.json' with { type: 'json' };
import { DEFAULT_BRIDGE_PORT, createBridgeController } from './bridge.js';
import { createServer } from './server.js';

// stdout is the MCP protocol channel: everything here logs to stderr only.
function bridgePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_BRIDGE_PORT;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0 && n <= 65535) return n;
  console.error(`langcoach: ignoring invalid LANGCOACH_BRIDGE_PORT "${raw}", using ${DEFAULT_BRIDGE_PORT}`);
  return DEFAULT_BRIDGE_PORT;
}

async function main(): Promise<void> {
  const dataPath = defaultDataPath();
  const dataDir = dirname(dataPath);
  const coach = new Coach(new JsonFileStore(dataPath));
  // Opt-in: listens only once an extension was paired (token file) or with LANGCOACH_BRIDGE=on.
  const bridge = createBridgeController(coach, {
    dataDir,
    mode: process.env.LANGCOACH_BRIDGE,
    port: bridgePort(process.env.LANGCOACH_BRIDGE_PORT),
    version: pkg.version,
  });
  const server = createServer(coach, { bridge, dataDir });
  // The bridge server is unref'd; closing it on stdin end also drops open keep-alive sockets.
  process.stdin.once('end', () => void bridge.close());
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('langcoach failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
