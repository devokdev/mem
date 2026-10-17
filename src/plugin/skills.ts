/**
 * 9 Universal Agent Skills (Slash Commands)
 */
import { StateModule } from '../core/state-module.js';
import { GarbageCollector } from '../core/garbage-collector.js';
import { HybridRetrievalEngine } from '../core/retrieval-engine.js';
import { ClaimScanner } from '../core/claim-scanner.js';
import crypto from 'node:crypto';

export interface SkillHandler {
  name: string;
  command: string;
  description: string;
  execute: (input: string, context: { state: StateModule; gc: GarbageCollector; retrieval: HybridRetrievalEngine; scanner: ClaimScanner }) => Promise<string> | string;
}

export const AGENT_SKILLS: SkillHandler[] = [
  {
    name: 'Recall',
    command: '/recall',
    description: 'Hybrid search across past decisions, patterns, and lessons.',
    execute: (input, ctx) => {
      const query = input.trim();
      if (!query) return 'Please specify a search query: `/recall <query>`';
      const all = ctx.state.getAllMemories();
      const results = ctx.retrieval.search(query, all, { limit: 5 });
      if (results.length === 0) return `No memories found matching "${query}".`;

      const lines = results.map((r, i) =>
        `${i + 1}. **${r.memory.title}** (Tier ${r.memory.tier}, Score: ${r.score})\n   ${r.memory.content}`
      );
      return `### MemGC Recall: "${query}"\n\n` + lines.join('\n\n');
    }
  },
  {
    name: 'Remember',
    command: '/remember',
    description: 'Directly forces persistent storage of critical knowledge or secrets policy.',
    execute: (input, ctx) => {
      const text = input.trim();
      if (!text) return 'Please provide text to remember: `/remember <rule or decision>`';
      const id = `mem_${crypto.randomUUID().slice(0, 8)}`;
      const now = Date.now();
      ctx.state.insertMemory({
        id,
        tier: 3,
        title: `Direct Decision: ${text.slice(0, 40)}`,
        content: text,
        tags: ['explicit-decision', 'protected'],
        fileRefs: [],
        symbolRefs: [],
        tokenCount: Math.ceil(text.length / 4),
        utilityScore: 1.0,
        deletionRisk: 0.95,
        verificationStatus: 'verified',
        accessCount: 1,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
        architecturalConstraint: true,
        explicitInstruction: true,
        securityRule: false
      });
      return `Saved architectural anchor to MemGC (Protected from eviction):\nID: \`${id}\`\n"${text}"`;
    }
  },
  {
    name: 'Handoff',
    command: '/handoff',
    description: 'Seamlessly loads and resumes the most recent active session in the workspace.',
    execute: (_input, ctx) => {
      const sessions = ctx.state.getAllSessions();
      if (sessions.length === 0) return 'No previous sessions found in workspace.';
      const latest = sessions[0];
      const memories = ctx.state.getAllMemories().slice(0, 5);
      return `### MemGC Session Handoff\n- **Resumed Session:** ${latest.title} (\`${latest.id}\`)\n- **Agent:** ${latest.agentName}\n- **Tokens Tracked:** ${latest.tokenUsage}\n\n**Active Anchors:**\n` +
        memories.map(m => `- [Tier ${m.tier}] ${m.title}`).join('\n');
    }
  },
  {
    name: 'Recap',
    command: '/recap',
    description: 'Summarizes recent work, commits, and modifications across days or weeks.',
    execute: (input, ctx) => {
      const hours = parseInt(input.trim(), 10) || 24;
      const since = Date.now() - hours * 60 * 60 * 1000;
      const memories = ctx.state.getAllMemories().filter(m => m.createdAt >= since);
      if (memories.length === 0) return `No activity recorded in the past ${hours} hours.`;
      return `### MemGC Recap (Past ${hours}h)\nTotal records created: ${memories.length}\n` +
        memories.slice(0, 8).map(m => `- **${m.title}** (${new Date(m.createdAt).toLocaleTimeString()}): ${m.content.slice(0, 80)}...`).join('\n');
    }
  },
  {
    name: 'Session History',
    command: '/session-history',
    description: 'Displays visual chronological timeline of past agent interactions.',
    execute: (_input, ctx) => {
      const sessions = ctx.state.getAllSessions().slice(0, 10);
      if (sessions.length === 0) return 'No sessions recorded yet.';
      return `### Chronological Session Timeline\n\n` +
        sessions.map(s => `- **${s.title}** [${s.status.toUpperCase()}] by *${s.agentName}* (${new Date(s.startedAt).toLocaleString()})`).join('\n');
    }
  },
  {
    name: 'Commit Context',
    command: '/commit-context',
    description: 'Traces exact source lines or files back to the agent session that wrote them.',
    execute: (input, ctx) => {
      const file = input.trim();
      if (!file) return 'Please specify a target file: `/commit-context <filename>`';
      const all = ctx.state.getAllMemories();
      const matching = all.filter(m => m.fileRefs.some(f => f.includes(file)));
      if (matching.length === 0) return `No memory records found referencing file: ${file}`;
      return `### Context for file: \`${file}\`\n\n` +
        matching.map(m => `- **${m.title}** (Session: \`${m.sessionRef || 'N/A'}\`):\n  ${m.content}`).join('\n\n');
    }
  },
  {
    name: 'Commit History',
    command: '/commit-history',
    description: 'Lists git commits linked to agent tasks, rationales, and tests.',
    execute: (_input, ctx) => {
      const graph = ctx.state.getAllGraph();
      const commitNodes = graph.nodes.filter(n => n.type === 'concept' && n.id.startsWith('commit_'));
      if (commitNodes.length === 0) return 'No git commits linked to agent tasks in state store.';
      return `### Linked Git Commit History\n\n` + commitNodes.map(c => `- **${c.label}**`).join('\n');
    }
  },
  {
    name: 'Forget',
    command: '/forget',
    description: 'Removes obsolete or sensitive observations with audit tracking.',
    execute: (input, ctx) => {
      const target = input.trim();
      if (!target) return 'Specify memory ID to forget: `/forget <id>`';
      const mem = ctx.state.getMemory(target);
      if (!mem) return `Memory record \`${target}\` not found.`;
      ctx.state.deleteMemory(target);
      return `Memory record \`${target}\` ("${mem.title}") removed with audit record.`;
    }
  },
  {
    name: 'GC Run',
    command: '/gc-run',
    description: 'Triggers the token-budgeted memory garbage collector to compact state.',
    execute: (input, ctx) => {
      const dryRun = input.includes('--dry-run');
      const result = ctx.gc.run({ dryRun, actor: 'skill:/gc-run' });
      return `### MemGC Garbage Collection Run ${dryRun ? '(Dry Run)' : ''}\n` +
        `- **Tokens Before:** ${result.tokensBefore}\n` +
        `- **Tokens After:** ${result.tokensAfter}\n` +
        `- **Tokens Freed:** ${result.tokensFreed}\n` +
        `- **Evicted Items:** ${result.evictedCount}\n` +
        `- **Consolidated Items:** ${result.consolidatedCount}\n` +
        `- **Protected Items:** ${result.protectedCount}\n` +
        `- **Audit Log ID:** \`${result.auditLogId}\``;
    }
  }
];
