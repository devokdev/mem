import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import {
  MemoryRecord,
  ObservationLog,
  SessionRecord,
  GraphNode,
  GraphEdge,
  AuditRecord
} from './types.js';

export class StateModule {
  private db: Database.Database;

  constructor(dbPath: string = './data/state_store.db') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        tier INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        raw_content TEXT,
        tags TEXT NOT NULL,
        session_ref TEXT,
        file_refs TEXT NOT NULL,
        symbol_refs TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        utility_score REAL NOT NULL,
        deletion_risk REAL NOT NULL,
        verification_status TEXT NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        architectural_constraint INTEGER NOT NULL DEFAULT 0,
        explicit_instruction INTEGER NOT NULL DEFAULT 0,
        security_rule INTEGER NOT NULL DEFAULT 0,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        payload TEXT NOT NULL,
        sanitized INTEGER NOT NULL DEFAULT 1,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        status TEXT NOT NULL,
        token_usage INTEGER NOT NULL DEFAULT 0,
        context_budget INTEGER NOT NULL DEFAULT 4000,
        summary TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        properties TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS graph_edges (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        relation TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);
      CREATE INDEX IF NOT EXISTS idx_memories_deletion_risk ON memories(deletion_risk);
      CREATE INDEX IF NOT EXISTS idx_memories_verification ON memories(verification_status);
      CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target);
    `);
  }

  // --- Memories ---
  public insertMemory(m: MemoryRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO memories (
        id, tier, title, content, raw_content, tags, session_ref, file_refs,
        symbol_refs, token_count, utility_score, deletion_risk, verification_status,
        access_count, created_at, updated_at, last_accessed_at,
        architectural_constraint, explicit_instruction, security_rule, metadata
      ) VALUES (
        @id, @tier, @title, @content, @rawContent, @tags, @sessionRef, @fileRefs,
        @symbolRefs, @tokenCount, @utilityScore, @deletionRisk, @verificationStatus,
        @accessCount, @createdAt, @updatedAt, @lastAccessedAt,
        @architecturalConstraint, @explicitInstruction, @securityRule, @metadata
      )
    `);

    stmt.run({
      id: m.id,
      tier: m.tier,
      title: m.title,
      content: m.content,
      rawContent: m.rawContent || null,
      tags: JSON.stringify(m.tags),
      sessionRef: m.sessionRef || null,
      fileRefs: JSON.stringify(m.fileRefs),
      symbolRefs: JSON.stringify(m.symbolRefs),
      tokenCount: m.tokenCount,
      utilityScore: m.utilityScore,
      deletionRisk: m.deletionRisk,
      verificationStatus: m.verificationStatus,
      accessCount: m.accessCount,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      lastAccessedAt: m.lastAccessedAt,
      architecturalConstraint: m.architecturalConstraint ? 1 : 0,
      explicitInstruction: m.explicitInstruction ? 1 : 0,
      securityRule: m.securityRule ? 1 : 0,
      metadata: m.metadata ? JSON.stringify(m.metadata) : null
    });
  }

  public updateMemory(m: MemoryRecord): void {
    const stmt = this.db.prepare(`
      UPDATE memories SET
        tier = @tier,
        title = @title,
        content = @content,
        raw_content = @rawContent,
        tags = @tags,
        session_ref = @sessionRef,
        file_refs = @fileRefs,
        symbol_refs = @symbolRefs,
        token_count = @tokenCount,
        utility_score = @utilityScore,
        deletion_risk = @deletionRisk,
        verification_status = @verificationStatus,
        access_count = @accessCount,
        updated_at = @updatedAt,
        last_accessed_at = @lastAccessedAt,
        architectural_constraint = @architecturalConstraint,
        explicit_instruction = @explicitInstruction,
        security_rule = @securityRule,
        metadata = @metadata
      WHERE id = @id
    `);

    stmt.run({
      id: m.id,
      tier: m.tier,
      title: m.title,
      content: m.content,
      rawContent: m.rawContent || null,
      tags: JSON.stringify(m.tags),
      sessionRef: m.sessionRef || null,
      fileRefs: JSON.stringify(m.fileRefs),
      symbolRefs: JSON.stringify(m.symbolRefs),
      tokenCount: m.tokenCount,
      utilityScore: m.utilityScore,
      deletionRisk: m.deletionRisk,
      verificationStatus: m.verificationStatus,
      accessCount: m.accessCount,
      updatedAt: m.updatedAt,
      lastAccessedAt: m.lastAccessedAt,
      architecturalConstraint: m.architecturalConstraint ? 1 : 0,
      explicitInstruction: m.explicitInstruction ? 1 : 0,
      securityRule: m.securityRule ? 1 : 0,
      metadata: m.metadata ? JSON.stringify(m.metadata) : null
    });
  }

  public getMemory(id: string): MemoryRecord | null {
    const row = this.db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as any;
    return row ? this.mapRowToMemory(row) : null;
  }

  public getAllMemories(): MemoryRecord[] {
    const rows = this.db.prepare(`SELECT * FROM memories ORDER BY created_at DESC`).all() as any[];
    return rows.map(r => this.mapRowToMemory(r));
  }

  public deleteMemory(id: string): boolean {
    const res = this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
    return res.changes > 0;
  }

  public touchMemory(id: string): void {
    this.db.prepare(`
      UPDATE memories SET
        access_count = access_count + 1,
        last_accessed_at = ?
      WHERE id = ?
    `).run(Date.now(), id);
  }

  // --- Observations ---
  public insertObservation(obs: ObservationLog): void {
    this.db.prepare(`
      INSERT INTO observations (id, session_id, event_type, source, payload, sanitized, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      obs.id,
      obs.sessionId,
      obs.eventType,
      obs.source,
      JSON.stringify(obs.payload),
      obs.sanitized ? 1 : 0,
      obs.timestamp
    );
  }

  public getObservationsBySession(sessionId: string): ObservationLog[] {
    const rows = this.db.prepare(`SELECT * FROM observations WHERE session_id = ? ORDER BY timestamp ASC`).all(sessionId) as any[];
    return rows.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      eventType: r.event_type,
      source: r.source,
      payload: JSON.parse(r.payload || '{}'),
      sanitized: !!r.sanitized,
      timestamp: r.timestamp
    }));
  }

  // --- Sessions ---
  public upsertSession(s: SessionRecord): void {
    this.db.prepare(`
      INSERT INTO sessions (id, title, agent_name, started_at, ended_at, status, token_usage, context_budget, summary, metadata)
      VALUES (@id, @title, @agentName, @startedAt, @endedAt, @status, @tokenUsage, @contextBudget, @summary, @metadata)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        agent_name = excluded.agent_name,
        ended_at = excluded.ended_at,
        status = excluded.status,
        token_usage = excluded.token_usage,
        context_budget = excluded.context_budget,
        summary = excluded.summary,
        metadata = excluded.metadata
    `).run({
      id: s.id,
      title: s.title,
      agentName: s.agentName,
      startedAt: s.startedAt,
      endedAt: s.endedAt || null,
      status: s.status,
      tokenUsage: s.tokenUsage,
      contextBudget: s.contextBudget,
      summary: s.summary || null,
      metadata: s.metadata ? JSON.stringify(s.metadata) : null
    });
  }

  public getSession(id: string): SessionRecord | null {
    const r = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      title: r.title,
      agentName: r.agent_name,
      startedAt: r.started_at,
      endedAt: r.ended_at || undefined,
      status: r.status,
      tokenUsage: r.token_usage,
      contextBudget: r.context_budget,
      summary: r.summary || undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined
    };
  }

  public getAllSessions(): SessionRecord[] {
    const rows = this.db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC`).all() as any[];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      agentName: r.agent_name,
      startedAt: r.started_at,
      endedAt: r.ended_at || undefined,
      status: r.status,
      tokenUsage: r.token_usage,
      contextBudget: r.context_budget,
      summary: r.summary || undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined
    }));
  }

  // --- Graph ---
  public upsertGraphNode(node: GraphNode): void {
    this.db.prepare(`
      INSERT INTO graph_nodes (id, label, type, properties, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        type = excluded.type,
        properties = excluded.properties
    `).run(node.id, node.label, node.type, JSON.stringify(node.properties), node.createdAt);
  }

  public upsertGraphEdge(edge: GraphEdge): void {
    this.db.prepare(`
      INSERT INTO graph_edges (id, source, target, relation, weight, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        relation = excluded.relation,
        weight = excluded.weight
    `).run(edge.id, edge.source, edge.target, edge.relation, edge.weight, edge.createdAt);
  }

  public getAllGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes = (this.db.prepare(`SELECT * FROM graph_nodes`).all() as any[]).map(r => ({
      id: r.id,
      label: r.label,
      type: r.type,
      properties: JSON.parse(r.properties || '{}'),
      createdAt: r.created_at
    }));

    const edges = (this.db.prepare(`SELECT * FROM graph_edges`).all() as any[]).map(r => ({
      id: r.id,
      source: r.source,
      target: r.target,
      relation: r.relation,
      weight: r.weight,
      createdAt: r.created_at
    }));

    return { nodes, edges };
  }

  // --- Audit ---
  public insertAudit(record: AuditRecord): void {
    this.db.prepare(`
      INSERT INTO audit_logs (id, action, actor, target_id, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.action,
      record.actor,
      record.targetId,
      JSON.stringify(record.details),
      record.timestamp
    );
  }

  public getAuditLogs(limit: number = 50): AuditRecord[] {
    const rows = this.db.prepare(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[];
    return rows.map(r => ({
      id: r.id,
      action: r.action,
      actor: r.actor,
      targetId: r.target_id,
      details: JSON.parse(r.details || '{}'),
      timestamp: r.timestamp
    }));
  }

  public close(): void {
    this.db.close();
  }

  private mapRowToMemory(row: any): MemoryRecord {
    return {
      id: row.id,
      tier: row.tier as any,
      title: row.title,
      content: row.content,
      rawContent: row.raw_content || undefined,
      tags: JSON.parse(row.tags || '[]'),
      sessionRef: row.session_ref || undefined,
      fileRefs: JSON.parse(row.file_refs || '[]'),
      symbolRefs: JSON.parse(row.symbol_refs || '[]'),
      tokenCount: row.token_count,
      utilityScore: row.utility_score,
      deletionRisk: row.deletion_risk,
      verificationStatus: row.verification_status,
      accessCount: row.access_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at,
      architecturalConstraint: Boolean(row.architectural_constraint),
      explicitInstruction: Boolean(row.explicit_instruction),
      securityRule: Boolean(row.security_rule),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
}
