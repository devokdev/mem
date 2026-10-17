/**
 * Core type definitions for MemGC
 */

export type MemoryTier = 0 | 1 | 2 | 3;

export interface MemoryRecord {
  id: string;
  tier: MemoryTier;
  title: string;
  content: string;
  rawContent?: string;
  tags: string[];
  sessionRef?: string;
  fileRefs: string[];
  symbolRefs: string[];
  tokenCount: number;
  utilityScore: number;
  deletionRisk: number;
  verificationStatus: 'unverified' | 'verified' | 'stale' | 'superseded';
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  architecturalConstraint: boolean;
  explicitInstruction: boolean;
  securityRule: boolean;
  metadata?: Record<string, any>;
}

export interface ObservationLog {
  id: string;
  sessionId: string;
  eventType: string;
  source: string;
  payload: Record<string, any>;
  sanitized: boolean;
  timestamp: number;
}

export interface SessionRecord {
  id: string;
  title: string;
  agentName: string;
  startedAt: number;
  endedAt?: number;
  status: 'active' | 'completed' | 'abandoned';
  tokenUsage: number;
  contextBudget: number;
  summary?: string;
  metadata?: Record<string, any>;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'file' | 'symbol' | 'concept' | 'session' | 'decision' | 'rule';
  properties: Record<string, any>;
  createdAt: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string; // e.g. "implements", "references", "modified_in", "governs"
  weight: number;
  createdAt: number;
}

export interface GCConfig {
  maxTokenBudget: number;
  protectThreshold: number; // default 0.85
  recencyWeight: number;    // wr
  frequencyWeight: number;  // wf
  semanticWeight: number;   // ws
  graphWeight: number;      // wg
}

export interface GCAnalysisResult {
  totalItems: number;
  totalTokens: number;
  budgetLimit: number;
  itemsToEvict: string[];
  itemsToConsolidate: string[];
  itemsProtected: string[];
  tokensFreedEstimate: number;
  riskSummary: {
    highRiskProtected: number;
    staleEligible: number;
    ephemeralEligible: number;
  };
}

export interface GCRunResult {
  success: boolean;
  evictedCount: number;
  consolidatedCount: number;
  protectedCount: number;
  tokensBefore: number;
  tokensAfter: number;
  tokensFreed: number;
  evictedItemIds: string[];
  consolidatedItemIds: string[];
  auditLogId: string;
  timestamp: number;
}

export interface AuditRecord {
  id: string;
  action: string;
  actor: string;
  targetId: string;
  details: Record<string, any>;
  timestamp: number;
}
