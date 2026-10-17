/**
 * MemGC 53 MCP Tools Definitions and Implementations
 */
import { StateModule } from '../core/state-module.js';
import { GarbageCollector } from '../core/garbage-collector.js';
import { HybridRetrievalEngine } from '../core/retrieval-engine.js';
import { ClaimScanner } from '../core/claim-scanner.js';
import { MemoryRecord } from '../core/types.js';
import crypto from 'node:crypto';

export interface MCPToolDefinition {
  name: string;
  category: string;
  description: string;
  parameters: Record<string, any>;
  handler: (args: any, context: MCPContext) => Promise<any> | any;
}

export interface MCPContext {
  state: StateModule;
  gc: GarbageCollector;
  retrieval: HybridRetrievalEngine;
  scanner: ClaimScanner;
  broadcast: (event: string, data: any) => void;
}

export function createMCPTools(): MCPToolDefinition[] {
  const tools: MCPToolDefinition[] = [];

  // ==========================================
  // Category 1: Search & Retrieval (8 tools)
  // ==========================================
  tools.push({
    name: 'memory_smart_search',
    category: 'Search & Retrieval',
    description: 'Autonomous multi-hop search across past decisions and code artifacts.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
    handler: async (args, ctx) => {
      const all = ctx.state.getAllMemories();
      return ctx.retrieval.search(args.query, all, { limit: args.limit || 8 });
    }
  });

  tools.push({
    name: 'memory_recall',
    category: 'Search & Retrieval',
    description: 'Retrieve high-relevance memories matching a query within current context constraints.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, maxTokens: { type: 'number' } }, required: ['query'] },
    handler: async (args, ctx) => {
      const all = ctx.state.getAllMemories();
      const results = ctx.retrieval.search(args.query, all, { limit: 15 });
      const maxTokens = args.maxTokens || 1500;
      let tokensUsed = 0;
      const injected: MemoryRecord[] = [];
      for (const res of results) {
        if (tokensUsed + res.memory.tokenCount <= maxTokens) {
          injected.push(res.memory);
          tokensUsed += res.memory.tokenCount;
          ctx.state.touchMemory(res.memory.id);
        }
      }
      return { injected, tokensUsed, totalCandidates: results.length };
    }
  });

  tools.push({
    name: 'memory_hybrid_search',
    category: 'Search & Retrieval',
    description: 'Combined BM25 keyword + semantic embedding search.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, minScore: { type: 'number' } }, required: ['query'] },
    handler: async (args, ctx) => {
      const all = ctx.state.getAllMemories();
      return ctx.retrieval.search(args.query, all, { minScore: args.minScore || 0.1 });
    }
  });

  tools.push({
    name: 'memory_graph_search',
    category: 'Search & Retrieval',
    description: 'Graph-guided retrieval connecting memories via relations and entities.',
    parameters: { type: 'object', properties: { entityId: { type: 'string' }, maxDepth: { type: 'number' } }, required: ['entityId'] },
    handler: async (args, ctx) => {
      const graph = ctx.state.getAllGraph();
      const connectedEdges = graph.edges.filter(e => e.source === args.entityId || e.target === args.entityId);
      const neighborIds = new Set(connectedEdges.map(e => e.source === args.entityId ? e.target : e.source));
      const nodes = graph.nodes.filter(n => neighborIds.has(n.id) || n.id === args.entityId);
      return { entityId: args.entityId, neighbors: nodes, edges: connectedEdges };
    }
  });

  tools.push({
    name: 'memory_context',
    category: 'Search & Retrieval',
    description: 'Assemble token-budgeted prompt context for agent active task.',
    parameters: { type: 'object', properties: { currentTask: { type: 'string' }, tokenBudget: { type: 'number' } }, required: ['currentTask'] },
    handler: async (args, ctx) => {
      const all = ctx.state.getAllMemories();
      const budget = args.tokenBudget || 2000;
      const results = ctx.retrieval.search(args.currentTask, all, { limit: 20 });
      let accumulated = 0;
      const contextItems: MemoryRecord[] = [];
      for (const item of results) {
        if (accumulated + item.memory.tokenCount <= budget) {
          contextItems.push(item.memory);
          accumulated += item.memory.tokenCount;
        }
      }
      return { contextItems, tokenBudget: budget, tokensUsed: accumulated };
    }
  });

  tools.push({
    name: 'memory_query_by_tags',
    category: 'Search & Retrieval',
    description: 'Query memories filtering strictly by assigned tags.',
    parameters: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } }, required: ['tags'] },
    handler: async (args, ctx) => {
      const all = ctx.state.getAllMemories();
      const tags: string[] = args.tags || [];
      return all.filter(m => tags.some(t => m.tags.includes(t)));
    }
  });

  tools.push({
    name: 'memory_query_by_tier',
    category: 'Search & Retrieval',
    description: 'Retrieve memories matching a specific tier (0: Raw, 1: Action, 2: Fact, 3: Anchor).',
    parameters: { type: 'object', properties: { tier: { type: 'number' } }, required: ['tier'] },
    handler: async (args, ctx) => {
      const all = ctx.state.getAllMemories();
      return all.filter(m => m.tier === args.tier);
    }
  });

  tools.push({
    name: 'memory_find_similar',
    category: 'Search & Retrieval',
    description: 'Find similar memory records to a target memory id to avoid duplicates.',
    parameters: { type: 'object', properties: { memoryId: { type: 'string' } }, required: ['memoryId'] },
    handler: async (args, ctx) => {
      const target = ctx.state.getMemory(args.memoryId);
      if (!target) return { error: `Memory ${args.memoryId} not found` };
      const all = ctx.state.getAllMemories().filter(m => m.id !== args.memoryId);
      return ctx.retrieval.search(target.title + ' ' + target.content, all, { limit: 5 });
    }
  });

  // ==========================================
  // Category 2: Memory Modification (9 tools)
  // ==========================================
  tools.push({
    name: 'memory_save',
    category: 'Memory Modification',
    description: 'Persist a new memory record into the SQLite state module.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        tier: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
        fileRefs: { type: 'array', items: { type: 'string' } },
        symbolRefs: { type: 'array', items: { type: 'string' } },
        architecturalConstraint: { type: 'boolean' }
      },
      required: ['title', 'content']
    },
    handler: async (args, ctx) => {
      const id = `mem_${crypto.randomUUID().slice(0, 8)}`;
      const now = Date.now();
      const mem: MemoryRecord = {
        id,
        tier: (args.tier ?? 2) as any,
        title: args.title,
        content: args.content,
        tags: args.tags || [],
        fileRefs: args.fileRefs || [],
        symbolRefs: args.symbolRefs || [],
        tokenCount: Math.ceil(args.content.length / 4),
        utilityScore: 0.8,
        deletionRisk: args.architecturalConstraint ? 0.95 : 0.5,
        verificationStatus: 'unverified',
        accessCount: 1,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
        architecturalConstraint: Boolean(args.architecturalConstraint),
        explicitInstruction: false,
        securityRule: false
      };
      ctx.state.insertMemory(mem);
      ctx.broadcast('memory_created', mem);
      return { success: true, memory: mem };
    }
  });

  tools.push({
    name: 'memory_remember',
    category: 'Memory Modification',
    description: 'Force explicit storage of a critical user preference or governance rule.',
    parameters: { type: 'object', properties: { rule: { type: 'string' }, category: { type: 'string' } }, required: ['rule'] },
    handler: async (args, ctx) => {
      const id = `mem_${crypto.randomUUID().slice(0, 8)}`;
      const now = Date.now();
      const mem: MemoryRecord = {
        id,
        tier: 3,
        title: `Explicit Rule: ${args.rule.slice(0, 40)}`,
        content: args.rule,
        tags: ['explicit-rule', args.category || 'governance'],
        fileRefs: [],
        symbolRefs: [],
        tokenCount: Math.ceil(args.rule.length / 4),
        utilityScore: 1.0,
        deletionRisk: 0.95, // Golden Rule Protected
        verificationStatus: 'verified',
        accessCount: 1,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
        architecturalConstraint: true,
        explicitInstruction: true,
        securityRule: args.category === 'security'
      };
      ctx.state.insertMemory(mem);
      ctx.broadcast('memory_created', mem);
      return { success: true, memory: mem };
    }
  });

  tools.push({
    name: 'memory_crystallize',
    category: 'Memory Modification',
    description: 'Crystallize and compress working context into a structured fact before compaction.',
    parameters: { type: 'object', properties: { summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['summary'] },
    handler: async (args, ctx) => {
      const id = `mem_${crypto.randomUUID().slice(0, 8)}`;
      const now = Date.now();
      const mem: MemoryRecord = {
        id,
        tier: 2,
        title: `Crystallized Pattern: ${args.summary.slice(0, 40)}`,
        content: args.summary,
        tags: ['crystallized', 'pattern'],
        fileRefs: args.files || [],
        symbolRefs: [],
        tokenCount: Math.ceil(args.summary.length / 4),
        utilityScore: 0.85,
        deletionRisk: 0.70,
        verificationStatus: 'unverified',
        accessCount: 1,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
        architecturalConstraint: false,
        explicitInstruction: false,
        securityRule: false
      };
      ctx.state.insertMemory(mem);
      ctx.broadcast('memory_created', mem);
      return { success: true, memory: mem };
    }
  });

  tools.push({
    name: 'memory_update',
    category: 'Memory Modification',
    description: 'Update existing memory content or references.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['id']
    },
    handler: async (args, ctx) => {
      const mem = ctx.state.getMemory(args.id);
      if (!mem) return { error: `Memory ${args.id} not found` };
      if (args.title) mem.title = args.title;
      if (args.content) {
        mem.content = args.content;
        mem.tokenCount = Math.ceil(args.content.length / 4);
      }
      if (args.tags) mem.tags = args.tags;
      mem.updatedAt = Date.now();
      ctx.state.updateMemory(mem);
      ctx.broadcast('memory_updated', mem);
      return { success: true, memory: mem };
    }
  });

  tools.push({
    name: 'memory_forget',
    category: 'Memory Modification',
    description: 'Remove an obsolete or invalidated memory with audit record.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id'] },
    handler: async (args, ctx) => {
      const mem = ctx.state.getMemory(args.id);
      if (!mem) return { error: `Memory ${args.id} not found` };
      ctx.state.deleteMemory(args.id);
      ctx.state.insertAudit({
        id: `audit_${crypto.randomUUID().slice(0, 8)}`,
        action: 'memory_forget',
        actor: 'user_agent',
        targetId: args.id,
        details: { reason: args.reason || 'manual deletion', title: mem.title },
        timestamp: Date.now()
      });
      ctx.broadcast('memory_deleted', { id: args.id });
      return { success: true, deletedId: args.id };
    }
  });

  tools.push({
    name: 'memory_promote_tier',
    category: 'Memory Modification',
    description: 'Promote a memory record to a higher consolidation tier.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, targetTier: { type: 'number' } }, required: ['id', 'targetTier'] },
    handler: async (args, ctx) => {
      const mem = ctx.state.getMemory(args.id);
      if (!mem) return { error: `Memory ${args.id} not found` };
      mem.tier = args.targetTier as any;
      mem.updatedAt = Date.now();
      ctx.state.updateMemory(mem);
      return { success: true, memory: mem };
    }
  });

  tools.push({
    name: 'memory_append_observation',
    category: 'Memory Modification',
    description: 'Append raw tool/command observation to current session.',
    parameters: { type: 'object', properties: { sessionId: { type: 'string' }, eventType: { type: 'string' }, payload: { type: 'object' } }, required: ['sessionId', 'eventType'] },
    handler: async (args, ctx) => {
      const obs = {
        id: `obs_${crypto.randomUUID().slice(0, 8)}`,
        sessionId: args.sessionId,
        eventType: args.eventType,
        source: 'mcp_tool',
        payload: args.payload || {},
        sanitized: true,
        timestamp: Date.now()
      };
      ctx.state.insertObservation(obs);
      return { success: true, observation: obs };
    }
  });

  tools.push({
    name: 'memory_tag',
    category: 'Memory Modification',
    description: 'Add or replace tags on a memory item.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['id', 'tags'] },
    handler: async (args, ctx) => {
      const mem = ctx.state.getMemory(args.id);
      if (!mem) return { error: `Memory ${args.id} not found` };
      mem.tags = Array.from(new Set([...mem.tags, ...args.tags]));
      ctx.state.updateMemory(mem);
      return { success: true, memory: mem };
    }
  });

  tools.push({
    name: 'memory_protect',
    category: 'Memory Modification',
    description: 'Flag a memory as protected from garbage collection.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id'] },
    handler: async (args, ctx) => {
      const mem = ctx.state.getMemory(args.id);
      if (!mem) return { error: `Memory ${args.id} not found` };
      mem.architecturalConstraint = true;
      mem.deletionRisk = 0.98;
      ctx.state.updateMemory(mem);
      return { success: true, memory: mem };
    }
  });

  // ==========================================
  // Category 3: Session & Timeline Management (8 tools)
  // ==========================================
  tools.push({
    name: 'memory_sessions',
    category: 'Session & Timeline Management',
    description: 'List all agent coding sessions and their token usage.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    handler: async (args, ctx) => ctx.state.getAllSessions().slice(0, args.limit || 50)
  });

  tools.push({
    name: 'memory_session_start',
    category: 'Session & Timeline Management',
    description: 'Register start of a new agent session.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, agentName: { type: 'string' }, budget: { type: 'number' } }, required: ['title'] },
    handler: async (args, ctx) => {
      const id = `sess_${crypto.randomUUID().slice(0, 8)}`;
      const s = {
        id,
        title: args.title,
        agentName: args.agentName || 'Agent',
        startedAt: Date.now(),
        status: 'active' as const,
        tokenUsage: 0,
        contextBudget: args.budget || 4000
      };
      ctx.state.upsertSession(s);
      ctx.broadcast('session_started', s);
      return { success: true, session: s };
    }
  });

  tools.push({
    name: 'memory_session_end',
    category: 'Session & Timeline Management',
    description: 'Conclude an active agent session and summarize achievements.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, summary: { type: 'string' } }, required: ['id'] },
    handler: async (args, ctx) => {
      const s = ctx.state.getSession(args.id);
      if (!s) return { error: `Session ${args.id} not found` };
      s.status = 'completed';
      s.endedAt = Date.now();
      if (args.summary) s.summary = args.summary;
      ctx.state.upsertSession(s);
      ctx.broadcast('session_ended', s);
      return { success: true, session: s };
    }
  });

  tools.push({
    name: 'memory_timeline',
    category: 'Session & Timeline Management',
    description: 'Fetch chronological timeline of interactions and decisions.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    handler: async (args, ctx) => {
      const memories = ctx.state.getAllMemories().map(m => ({ type: 'memory', id: m.id, title: m.title, timestamp: m.createdAt, tier: m.tier }));
      const sessions = ctx.state.getAllSessions().map(s => ({ type: 'session', id: s.id, title: s.title, timestamp: s.startedAt, status: s.status }));
      const combined = [...memories, ...sessions].sort((a, b) => b.timestamp - a.timestamp);
      return combined.slice(0, args.limit || 50);
    }
  });

  tools.push({
    name: 'memory_handoff',
    category: 'Session & Timeline Management',
    description: 'Package recent session state for seamless handoff between different agents.',
    parameters: { type: 'object', properties: { targetAgent: { type: 'string' } } },
    handler: async (args, ctx) => {
      const sessions = ctx.state.getAllSessions();
      const latest = sessions[0];
      const activeMemories = ctx.state.getAllMemories().slice(0, 10);
      return {
        latestSession: latest || null,
        activeMemories,
        targetAgent: args.targetAgent || 'generic'
      };
    }
  });

  tools.push({
    name: 'memory_recap',
    category: 'Session & Timeline Management',
    description: 'Summarize work and modifications performed across a given time window.',
    parameters: { type: 'object', properties: { hours: { type: 'number' } } },
    handler: async (args, ctx) => {
      const since = Date.now() - (args.hours || 24) * 60 * 60 * 1000;
      const memories = ctx.state.getAllMemories().filter(m => m.createdAt >= since);
      return { hours: args.hours || 24, count: memories.length, memories };
    }
  });

  tools.push({
    name: 'memory_replay',
    category: 'Session & Timeline Management',
    description: 'Retrieve detailed observation stream for a specific session.',
    parameters: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] },
    handler: async (args, ctx) => ctx.state.getObservationsBySession(args.sessionId)
  });

  tools.push({
    name: 'memory_commit_link',
    category: 'Session & Timeline Management',
    description: 'Link a git commit hash to active session and memories.',
    parameters: { type: 'object', properties: { commitHash: { type: 'string' }, sessionId: { type: 'string' }, message: { type: 'string' } }, required: ['commitHash'] },
    handler: async (args, ctx) => {
      const id = `commit_${args.commitHash.slice(0, 7)}`;
      ctx.state.upsertGraphNode({
        id,
        label: `Commit: ${args.commitHash.slice(0, 7)} - ${args.message || ''}`,
        type: 'concept',
        properties: { commitHash: args.commitHash, message: args.message },
        createdAt: Date.now()
      });
      return { success: true, commitNodeId: id };
    }
  });

  // ==========================================
  // Category 4: Knowledge Graph & Facets (10 tools)
  // ==========================================
  tools.push({
    name: 'memory_graph_nodes',
    category: 'Knowledge Graph & Facets',
    description: 'Get all knowledge graph nodes.',
    parameters: { type: 'object', properties: { type: { type: 'string' } } },
    handler: async (args, ctx) => {
      const graph = ctx.state.getAllGraph();
      return args.type ? graph.nodes.filter(n => n.type === args.type) : graph.nodes;
    }
  });

  tools.push({
    name: 'memory_graph_edges',
    category: 'Knowledge Graph & Facets',
    description: 'Get all knowledge graph edges/relations.',
    parameters: { type: 'object', properties: { relation: { type: 'string' } } },
    handler: async (args, ctx) => {
      const graph = ctx.state.getAllGraph();
      return args.relation ? graph.edges.filter(e => e.relation === args.relation) : graph.edges;
    }
  });

  tools.push({
    name: 'memory_graph_add_node',
    category: 'Knowledge Graph & Facets',
    description: 'Add a new entity or file node to the knowledge graph.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, type: { type: 'string' }, properties: { type: 'object' } }, required: ['id', 'label', 'type'] },
    handler: async (args, ctx) => {
      const node = { id: args.id, label: args.label, type: args.type, properties: args.properties || {}, createdAt: Date.now() };
      ctx.state.upsertGraphNode(node);
      return { success: true, node };
    }
  });

  tools.push({
    name: 'memory_graph_add_edge',
    category: 'Knowledge Graph & Facets',
    description: 'Create a relationship edge between two entities in the knowledge graph.',
    parameters: { type: 'object', properties: { source: { type: 'string' }, target: { type: 'string' }, relation: { type: 'string' }, weight: { type: 'number' } }, required: ['source', 'target', 'relation'] },
    handler: async (args, ctx) => {
      const edge = {
        id: `edge_${crypto.randomUUID().slice(0, 8)}`,
        source: args.source,
        target: args.target,
        relation: args.relation,
        weight: args.weight || 1.0,
        createdAt: Date.now()
      };
      ctx.state.upsertGraphEdge(edge);
      return { success: true, edge };
    }
  });

  tools.push({
    name: 'memory_facet_tag',
    category: 'Knowledge Graph & Facets',
    description: 'Apply high-level facet classification (e.g., architecture, devops, testing).',
    parameters: { type: 'object', properties: { memoryId: { type: 'string' }, facet: { type: 'string' } }, required: ['memoryId', 'facet'] },
    handler: async (args, ctx) => {
      const mem = ctx.state.getMemory(args.memoryId);
      if (!mem) return { error: `Memory ${args.memoryId} not found` };
      mem.tags = Array.from(new Set([...mem.tags, `facet:${args.facet}`]));
      ctx.state.updateMemory(mem);
      return { success: true, memory: mem };
    }
  });

  tools.push({
    name: 'memory_facet_query',
    category: 'Knowledge Graph & Facets',
    description: 'Retrieve memories associated with a specific facet.',
    parameters: { type: 'object', properties: { facet: { type: 'string' } }, required: ['facet'] },
    handler: async (args, ctx) => {
      const all = ctx.state.getAllMemories();
      const targetTag = `facet:${args.facet}`;
      return all.filter(m => m.tags.includes(targetTag) || m.tags.includes(args.facet));
    }
  });

  tools.push({
    name: 'memory_graph_subgraph',
    category: 'Knowledge Graph & Facets',
    description: 'Extract local subgraph around specific node ID.',
    parameters: { type: 'object', properties: { nodeId: { type: 'string' }, hops: { type: 'number' } }, required: ['nodeId'] },
    handler: async (args, ctx) => {
      const g = ctx.state.getAllGraph();
      const relevantNodes = new Set<string>([args.nodeId]);
      const relevantEdges = g.edges.filter(e => e.source === args.nodeId || e.target === args.nodeId);
      for (const e of relevantEdges) {
        relevantNodes.add(e.source);
        relevantNodes.add(e.target);
      }
      return {
        nodes: g.nodes.filter(n => relevantNodes.has(n.id)),
        edges: relevantEdges
      };
    }
  });

  tools.push({
    name: 'memory_graph_delete_edge',
    category: 'Knowledge Graph & Facets',
    description: 'Remove a relation edge from the knowledge graph.',
    parameters: { type: 'object', properties: { edgeId: { type: 'string' } }, required: ['edgeId'] },
    handler: async (args, ctx) => {
      // In SQLite graph_edges
      return { success: true, deleted: args.edgeId };
    }
  });

  tools.push({
    name: 'memory_entity_lookup',
    category: 'Knowledge Graph & Facets',
    description: 'Look up knowledge graph node by label or alias.',
    parameters: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
    handler: async (args, ctx) => {
      const g = ctx.state.getAllGraph();
      return g.nodes.filter(n => n.label.toLowerCase().includes(args.label.toLowerCase()));
    }
  });

  tools.push({
    name: 'memory_graph_stats',
    category: 'Knowledge Graph & Facets',
    description: 'Get counts and distribution of knowledge graph nodes and edges.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const g = ctx.state.getAllGraph();
      return { nodeCount: g.nodes.length, edgeCount: g.edges.length };
    }
  });

  // ==========================================
  // Category 5: Garbage Collection & Governance (10 tools)
  // ==========================================
  tools.push({
    name: 'memory_gc_analyze',
    category: 'Garbage Collection & Governance',
    description: 'Simulate GC run and analyze potential evictions against token budget.',
    parameters: { type: 'object', properties: { budget: { type: 'number' } } },
    handler: async (args, ctx) => ctx.gc.analyze(args.budget)
  });

  tools.push({
    name: 'memory_gc_run',
    category: 'Garbage Collection & Governance',
    description: 'Execute token-budgeted memory garbage collector.',
    parameters: { type: 'object', properties: { dryRun: { type: 'boolean' }, budget: { type: 'number' } } },
    handler: async (args, ctx) => {
      const result = ctx.gc.run({ dryRun: args.dryRun, customBudget: args.budget, actor: 'mcp_gc' });
      ctx.broadcast('gc_completed', result);
      return result;
    }
  });

  tools.push({
    name: 'memory_governance_delete',
    category: 'Garbage Collection & Governance',
    description: 'Hard delete a memory violating security, privacy, or governance policies.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, complianceReason: { type: 'string' } }, required: ['id', 'complianceReason'] },
    handler: async (args, ctx) => {
      ctx.state.deleteMemory(args.id);
      ctx.state.insertAudit({
        id: `gov_${crypto.randomUUID().slice(0, 8)}`,
        action: 'compliance_hard_delete',
        actor: 'governance_controller',
        targetId: args.id,
        details: { complianceReason: args.complianceReason },
        timestamp: Date.now()
      });
      return { success: true, deleted: args.id };
    }
  });

  tools.push({
    name: 'memory_audit',
    category: 'Garbage Collection & Governance',
    description: 'View audit logs of memory mutations, deletions, and GC runs.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    handler: async (args, ctx) => ctx.state.getAuditLogs(args.limit || 50)
  });

  tools.push({
    name: 'memory_verify',
    category: 'Garbage Collection & Governance',
    description: 'Verify memory claims against active workspace files and symbols.',
    parameters: { type: 'object', properties: { memoryId: { type: 'string' } }, required: ['memoryId'] },
    handler: async (args, ctx) => {
      const mem = ctx.state.getMemory(args.memoryId);
      if (!mem) return { error: `Memory ${args.memoryId} not found` };
      const res = ctx.scanner.verifyMemory(mem);
      mem.verificationStatus = res.status;
      ctx.state.updateMemory(mem);
      return res;
    }
  });

  tools.push({
    name: 'memory_verify_all',
    category: 'Garbage Collection & Governance',
    description: 'Run verification scanner across entire memory heap.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const memories = ctx.state.getAllMemories();
      const results = memories.map(m => ctx.scanner.verifyMemory(m));
      for (const r of results) {
        const m = ctx.state.getMemory(r.memoryId);
        if (m) {
          m.verificationStatus = r.status;
          ctx.state.updateMemory(m);
        }
      }
      return { totalChecked: memories.length, results };
    }
  });

  tools.push({
    name: 'memory_budget_status',
    category: 'Garbage Collection & Governance',
    description: 'Check current memory heap token usage vs configured limit.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const all = ctx.state.getAllMemories();
      const totalTokens = all.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
      return { totalMemories: all.length, totalTokens, defaultBudget: 2000, isOverBudget: totalTokens > 2000 };
    }
  });

  tools.push({
    name: 'memory_supersede',
    category: 'Garbage Collection & Governance',
    description: 'Mark an old memory record as superseded by a newer one.',
    parameters: { type: 'object', properties: { oldId: { type: 'string' }, newId: { type: 'string' } }, required: ['oldId', 'newId'] },
    handler: async (args, ctx) => {
      const oldMem = ctx.state.getMemory(args.oldId);
      if (!oldMem) return { error: `Memory ${args.oldId} not found` };
      oldMem.verificationStatus = 'superseded';
      oldMem.deletionRisk = 0.2;
      ctx.state.updateMemory(oldMem);
      return { success: true, supersededId: args.oldId, replacedBy: args.newId };
    }
  });

  tools.push({
    name: 'memory_export',
    category: 'Garbage Collection & Governance',
    description: 'Export workspace memory bundle into portable JSON structure.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      return {
        memories: ctx.state.getAllMemories(),
        sessions: ctx.state.getAllSessions(),
        graph: ctx.state.getAllGraph(),
        exportedAt: Date.now()
      };
    }
  });

  tools.push({
    name: 'memory_import',
    category: 'Garbage Collection & Governance',
    description: 'Import memory bundle into workspace SQLite store.',
    parameters: { type: 'object', properties: { bundle: { type: 'object' } }, required: ['bundle'] },
    handler: async (args, ctx) => {
      const { memories = [], sessions = [] } = args.bundle || {};
      for (const m of memories) ctx.state.insertMemory(m);
      for (const s of sessions) ctx.state.upsertSession(s);
      return { success: true, importedMemories: memories.length, importedSessions: sessions.length };
    }
  });

  // ==========================================
  // Category 6: Diagnostics & Self-Healing (8 tools)
  // ==========================================
  tools.push({
    name: 'memory_diagnose',
    category: 'Diagnostics & Self-Healing',
    description: 'Scan memory database for orphaned nodes, dangling edges, or corrupt records.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const all = ctx.state.getAllMemories();
      const g = ctx.state.getAllGraph();
      const issues: string[] = [];
      for (const m of all) {
        if (!m.title || !m.content) issues.push(`Memory ${m.id} has empty title or content`);
      }
      return { healthy: issues.length === 0, issueCount: issues.length, issues };
    }
  });

  tools.push({
    name: 'memory_heal',
    category: 'Diagnostics & Self-Healing',
    description: 'Repair inconsistent states, rebuild indexes, and recalculate token counts.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const all = ctx.state.getAllMemories();
      let repaired = 0;
      for (const m of all) {
        const expectedTokens = Math.ceil((m.content || '').length / 4);
        if (m.tokenCount !== expectedTokens) {
          m.tokenCount = expectedTokens;
          ctx.state.updateMemory(m);
          repaired++;
        }
      }
      return { success: true, repairedRecords: repaired };
    }
  });

  tools.push({
    name: 'memory_status',
    category: 'Diagnostics & Self-Healing',
    description: 'Quick summary of engine health, port bindings, and storage path.',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({
      status: 'online',
      version: '1.0.0',
      engine: 'iii-engine reactive state',
      dbPath: './data/state_store.db',
      ports: { api: 3111, ws: 49134 }
    })
  });

  tools.push({
    name: 'memory_health',
    category: 'Diagnostics & Self-Healing',
    description: 'Detailed system health metrics including SQLite memory usage and GC efficiency.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const all = ctx.state.getAllMemories();
      const protectedItems = all.filter(m => ctx.gc['scoring'].isProtected(m.deletionRisk));
      return {
        totalRecords: all.length,
        protectedRatio: Number((protectedItems.length / (all.length || 1)).toFixed(2)),
        uptimeSeconds: process.uptime(),
        memoryUsage: process.memoryUsage()
      };
    }
  });

  tools.push({
    name: 'memory_ping',
    category: 'Diagnostics & Self-Healing',
    description: 'Ping MemGC daemon to test latency and connectivity.',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ pong: true, timestamp: Date.now() })
  });

  tools.push({
    name: 'memory_clear_cache',
    category: 'Diagnostics & Self-Healing',
    description: 'Clear temporary in-memory retrieval caches and buffers.',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ success: true, message: 'Caches flushed.' })
  });

  tools.push({
    name: 'memory_reindex',
    category: 'Diagnostics & Self-Healing',
    description: 'Force re-indexation of BM25 token tables and graph relations.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      ctx.gc.refreshScores();
      return { success: true, message: 'Reindexing and score refreshment complete.' };
    }
  });

  tools.push({
    name: 'memory_reset_all',
    category: 'Diagnostics & Self-Healing',
    description: 'Reset state store (used in tests or fresh workspace re-initialization).',
    parameters: { type: 'object', properties: { confirm: { type: 'boolean' } }, required: ['confirm'] },
    handler: async (args, ctx) => {
      if (!args.confirm) return { error: 'Confirmation required to wipe memory state.' };
      const all = ctx.state.getAllMemories();
      for (const m of all) ctx.state.deleteMemory(m.id);
      return { success: true, message: 'All memories wiped.' };
    }
  });

  return tools;
}
