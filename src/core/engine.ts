import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { StateModule } from './state-module.js';
import { GarbageCollector } from './garbage-collector.js';
import { HybridRetrievalEngine } from './retrieval-engine.js';
import { ClaimScanner } from './claim-scanner.js';
import { ObservationPipeline } from './observation-pipeline.js';
import { LifecycleHookManager } from '../plugin/hooks.js';
import { AGENT_SKILLS } from '../plugin/skills.js';
import { createMCPTools } from '../mcp/tools.js';

export class MemGCEngine {
  public state: StateModule;
  public gc: GarbageCollector;
  public retrieval: HybridRetrievalEngine;
  public scanner: ClaimScanner;
  public pipeline: ObservationPipeline;
  public hooks: LifecycleHookManager;
  private apiServer?: http.Server;
  private wss?: WebSocketServer;
  private wsClients: Set<WebSocket> = new Set();

  constructor(dbPath: string = './data/state_store.db', workspaceRoot: string = process.cwd()) {
    this.state = new StateModule(dbPath);
    this.retrieval = new HybridRetrievalEngine();
    this.scanner = new ClaimScanner(workspaceRoot);
    this.gc = new GarbageCollector(this.state, {}, workspaceRoot);
    this.pipeline = new ObservationPipeline(this.state);
    this.hooks = new LifecycleHookManager(this.state, this.pipeline, this.gc);
  }

  public broadcast(event: string, data: any): void {
    const payload = JSON.stringify({ event, data, timestamp: Date.now() });
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  public async start(apiPort: number = 3111, wsPort: number = 49134): Promise<void> {
    // 1. WebSocket Server (Port 49134)
    this.wss = new WebSocketServer({ port: wsPort });
    this.wss.on('connection', (ws) => {
      this.wsClients.add(ws);
      ws.send(JSON.stringify({ event: 'connected', version: '1.0.0' }));
      ws.on('close', () => this.wsClients.delete(ws));
    });

    // 2. HTTP REST Server (Port 3111)
    const mcpTools = createMCPTools();

    this.apiServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // Helper to read JSON body
      const readBody = async (): Promise<any> => {
        return new Promise((resolve) => {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              resolve(body ? JSON.parse(body) : {});
            } catch {
              resolve({});
            }
          });
        });
      };

      try {
        if (url.pathname === '/health' || url.pathname === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', name: 'MemGC', version: '1.0.0' }));
        } else if (url.pathname === '/api/memories' && req.method === 'GET') {
          const memories = this.state.getAllMemories();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(memories));
        } else if (url.pathname === '/api/sessions' && req.method === 'GET') {
          const sessions = this.state.getAllSessions();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(sessions));
        } else if (url.pathname === '/api/graph' && req.method === 'GET') {
          const graph = this.state.getAllGraph();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(graph));
        } else if (url.pathname === '/api/audit' && req.method === 'GET') {
          const audits = this.state.getAuditLogs(50);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(audits));
        } else if (url.pathname === '/api/gc/analyze' && req.method === 'POST') {
          const body = await readBody();
          const analysis = this.gc.analyze(body.budget);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(analysis));
        } else if (url.pathname === '/api/gc/run' && req.method === 'POST') {
          const body = await readBody();
          const result = this.gc.run({ dryRun: body.dryRun, customBudget: body.budget, actor: 'api' });
          this.broadcast('gc_completed', result);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else if (url.pathname === '/api/hooks/dispatch' && req.method === 'POST') {
          const body = await readBody();
          const out = await this.hooks.dispatch(body.hook, {
            sessionId: body.sessionId || 'default',
            agentName: body.agentName || 'Agent',
            payload: body.payload || {}
          });
          this.broadcast('hook_dispatched', { hook: body.hook, result: out });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(out));
        } else if (url.pathname === '/api/skills/execute' && req.method === 'POST') {
          const body = await readBody();
          const skill = AGENT_SKILLS.find(s => s.command === body.command);
          if (!skill) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Skill ${body.command} not found.` }));
            return;
          }
          const out = await skill.execute(body.input || '', {
            state: this.state,
            gc: this.gc,
            retrieval: this.retrieval,
            scanner: this.scanner
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ output: out }));
        } else if (url.pathname === '/api/mcp/tools' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mcpTools.map(t => ({ name: t.name, category: t.category, description: t.description }))));
        } else if (url.pathname === '/api/mcp/call' && req.method === 'POST') {
          const body = await readBody();
          const tool = mcpTools.find(t => t.name === body.name);
          if (!tool) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Tool ${body.name} not found` }));
            return;
          }
          const result = await tool.handler(body.arguments || {}, {
            state: this.state,
            gc: this.gc,
            retrieval: this.retrieval,
            scanner: this.scanner,
            broadcast: (e, d) => this.broadcast(e, d)
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Endpoint not found' }));
        }
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    return new Promise((resolve) => {
      this.apiServer?.listen(apiPort, () => {
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss?.close();
      this.apiServer?.close(() => {
        this.state.close();
        resolve();
      });
    });
  }
}
