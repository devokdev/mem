import { MemGCEngine } from './core/engine.js';
import path from 'node:path';

async function bootstrap() {
  const dbPath = process.env.MEMGC_DB_PATH || path.join(process.cwd(), 'data', 'state_store.db');
  const engine = new MemGCEngine(dbPath, process.cwd());

  const apiPort = parseInt(process.env.MEMGC_PORT || '3111', 10);
  const wsPort = parseInt(process.env.MEMGC_WS_PORT || '49134', 10);

  await engine.start(apiPort, wsPort);

  console.log(`
┌────────────────────────────────────────────────────────┐
│  ⚡ MemGC: Memory Garbage Collector Daemon v1.0.0      │
│  • Core API & Triggers:    http://localhost:${apiPort}        │
│  • Real-time WebSocket:    ws://localhost:${wsPort}       │
│  • State Database:         ${dbPath}
└────────────────────────────────────────────────────────┘
`);
}

bootstrap().catch((err) => {
  console.error('Fatal MemGC start failure:', err);
  process.exit(1);
});
