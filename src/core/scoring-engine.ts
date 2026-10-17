import { MemoryRecord, GCConfig } from './types.js';

export class ScoringEngine {
  private config: GCConfig;

  constructor(config?: Partial<GCConfig>) {
    this.config = {
      maxTokenBudget: 2000,
      protectThreshold: 0.85,
      recencyWeight: 0.35,
      frequencyWeight: 0.25,
      semanticWeight: 0.25,
      graphWeight: 0.15,
      ...config
    };
  }

  /**
   * Utility Score U in [0, 1]
   * U = wr * Recency + wf * Frequency + ws * SemanticRelevance + wg * GraphCentrality
   */
  public computeUtility(
    memory: MemoryRecord,
    options: {
      now?: number;
      semanticRelevance?: number;
      graphCentrality?: number;
      maxAccessCount?: number;
      maxAgeMs?: number;
    } = {}
  ): number {
    const now = options.now || Date.now();
    const maxAgeMs = options.maxAgeMs || 1000 * 60 * 60 * 24 * 7; // 7 days baseline
    const maxAccess = Math.max(options.maxAccessCount || 10, 1);

    // Recency: normalized exponential decay from last access or creation
    const age = Math.max(0, now - (memory.lastAccessedAt || memory.createdAt));
    const recency = Math.exp(-age / maxAgeMs);

    // Frequency: access count ratio
    const frequency = Math.min(1.0, (memory.accessCount || 0) / maxAccess);

    // Semantic relevance: passed or default based on tier
    const semantic = options.semanticRelevance !== undefined 
      ? options.semanticRelevance 
      : (memory.tier >= 2 ? 0.75 : 0.4);

    // Graph centrality: passed or derived from number of file/symbol/tags references
    const refsCount = (memory.fileRefs?.length || 0) + (memory.symbolRefs?.length || 0) + (memory.tags?.length || 0);
    const graphCentrality = options.graphCentrality !== undefined 
      ? options.graphCentrality 
      : Math.min(1.0, refsCount / 6.0);

    const U =
      this.config.recencyWeight * recency +
      this.config.frequencyWeight * frequency +
      this.config.semanticWeight * semantic +
      this.config.graphWeight * graphCentrality;

    return Math.max(0.0, Math.min(1.0, Number(U.toFixed(4))));
  }

  /**
   * Deletion Risk R in [0, 1]
   * R = max(ArchitecturalConstraint, ExplicitInstruction, SecurityRule, CodeVerificationStatus)
   */
  public computeDeletionRisk(memory: MemoryRecord): number {
    // Architectural constraints (Tier 3 or explicit constraint) -> very high risk to delete
    const archConstraintScore = memory.tier === 3 || memory.architecturalConstraint ? 0.95 : 0.0;
    
    // Explicit user instructions ("remember this rule", etc.)
    const explicitInstructionScore = memory.explicitInstruction ? 0.90 : 0.0;

    // Security rules, credentials/compliance policy
    const securityRuleScore = memory.securityRule ? 0.98 : 0.0;

    // Code verification status
    let verificationScore = 0.5;
    if (memory.verificationStatus === 'verified') {
      verificationScore = 0.80;
    } else if (memory.verificationStatus === 'superseded') {
      verificationScore = 0.30;
    } else if (memory.verificationStatus === 'stale') {
      verificationScore = 0.10;
    }

    // Ephemeral / Tier 0 has lower baseline risk
    if (memory.tier === 0) {
      verificationScore = Math.min(verificationScore, 0.25);
    }

    const R = Math.max(
      archConstraintScore,
      explicitInstructionScore,
      securityRuleScore,
      verificationScore
    );

    return Math.max(0.0, Math.min(1.0, Number(R.toFixed(4))));
  }

  /**
   * Golden Rule:
   * If R > tau_protect (0.85), memory CANNOT be evicted under any context pressure.
   */
  public isProtected(deletionRisk: number): boolean {
    return deletionRisk >= this.config.protectThreshold;
  }
}
