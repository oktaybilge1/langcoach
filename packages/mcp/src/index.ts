import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Coach, JsonFileStore, defaultDataPath } from '@langcoach/core';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const coach = new Coach(new JsonFileStore(defaultDataPath()));
  const server = createServer(coach);
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('langcoach failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
