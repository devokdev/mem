import { MCPServer } from './server.js';
import { StateModule } from '../core/state-module.js';
import { GarbageCollector } from '../core/garbage-collector.js';
import { HybridRetrievalEngine } from '../core/retrieval-engine.js';
import { ClaimScanner } from '../core/claim-scanner.js';
import path from 'node:path';

function main() {
  const dbPath = process.env.MEMGC_DB_PATH || path.join(process.cwd(), 'data', 'state_store.db');
  const state = new StateModule(dbPath);
  const retrieval = new HybridRetrievalEngine();
  const scanner = new ClaimScanner(process.cwd());
  const gc = new GarbageCollector(state, {}, process.cwd());

  const server = new MCPServer(state, gc, retrieval, scanner);
  server.startStdio();
}

main();
