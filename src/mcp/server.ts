import readline from 'node:readline';
import { StateModule } from '../core/state-module.js';
import { GarbageCollector } from '../core/garbage-collector.js';
import { HybridRetrievalEngine } from '../core/retrieval-engine.js';
import { ClaimScanner } from '../core/claim-scanner.js';
import { createMCPTools, MCPToolDefinition, MCPContext } from './tools.js';

export class MCPServer {
  private tools: MCPToolDefinition[];
  private context: MCPContext;

  constructor(state: StateModule, gc: GarbageCollector, retrieval: HybridRetrievalEngine, scanner: ClaimScanner) {
    this.tools = createMCPTools();
    this.context = {
      state,
      gc,
      retrieval,
      scanner,
      broadcast: () => {}
    };
  }

  public getTools(): MCPToolDefinition[] {
    return this.tools;
  }

  public async executeTool(name: string, args: any): Promise<any> {
    const tool = this.tools.find(t => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return await tool.handler(args, this.context);
  }

  /**
   * Run standard JSON-RPC 2.0 stdio loop for host agents (Codex, Claude Code, Cursor)
   */
  public startStdio(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      try {
        const req = JSON.parse(line);
        const { id, method, params } = req;

        if (method === 'tools/list') {
          const list = this.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters
          }));
          console.log(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: list } }));
        } else if (method === 'tools/call') {
          const { name, arguments: toolArgs } = params || {};
          const result = await this.executeTool(name, toolArgs || {});
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            }
          }));
        } else if (method === 'initialize') {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: { name: 'memgc-mcp', version: '1.0.0' },
              capabilities: { tools: {} }
            }
          }));
        } else {
          console.log(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }));
        }
      } catch (err: any) {
        console.error('MCP Stdio Error:', err.message);
      }
    });
  }
}
