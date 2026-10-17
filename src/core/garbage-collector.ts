import {
  MemoryRecord,
  GCConfig,
  GCAnalysisResult,
  GCRunResult
} from './types.js';
import { StateModule } from './state-module.js';
import { ScoringEngine } from './scoring-engine.js';
import { ClaimScanner } from './claim-scanner.js';
import crypto from 'node:crypto';

export class GarbageCollector {
  private state: StateModule;
  private scoring: ScoringEngine;
  private scanner: ClaimScanner;
  private config: GCConfig;

  constructor(
    state: StateModule,
    config?: Partial<GCConfig>,
    workspaceRoot?: string
  ) {
    this.state = state;
    this.config = {
      maxTokenBudget: 2000,
      protectThreshold: 0.85,
      recencyWeight: 0.35,
      frequencyWeight: 0.25,
      semanticWeight: 0.25,
      graphWeight: 0.15,
      ...config
    };
    this.scoring = new ScoringEngine(this.config);
    this.scanner = new ClaimScanner(workspaceRoot);
  }

  /**
   * Run Claim Verification and recalculate Utility / Deletion Risk for all records
   */
  public refreshScores(): MemoryRecord[] {
    const all = this.state.getAllMemories();
    const now = Date.now();
    const maxAccess = Math.max(...all.map(m => m.accessCount), 1);

    for (const mem of all) {
      // 1. Verify claims against file system
      if (mem.fileRefs?.length > 0 || mem.symbolRefs?.length > 0) {
        const v = this.scanner.verifyMemory(mem);
        mem.verificationStatus = v.status;
      }

      // 2. Compute Risk R
      mem.deletionRisk = this.scoring.computeDeletionRisk(mem);

      // 3. Compute Utility U
      mem.utilityScore = this.scoring.computeUtility(mem, {
        now,
        maxAccessCount: maxAccess
      });

      this.state.updateMemory(mem);
    }

    return this.state.getAllMemories();
  }

  /**
   * Pre-GC Analysis (Dry Run)
   */
  public analyze(customBudget?: number): GCAnalysisResult {
    const memories = this.refreshScores();
    const budgetLimit = customBudget !== undefined ? customBudget : this.config.maxTokenBudget;
    
    let totalTokens = memories.reduce((acc, m) => acc + (m.tokenCount || 0), 0);
    const itemsProtected: string[] = [];
    const itemsToEvict: string[] = [];
    const itemsToConsolidate: string[] = [];
    let highRiskProtected = 0;
    let staleEligible = 0;
    let ephemeralEligible = 0;

    for (const m of memories) {
      if (this.scoring.isProtected(m.deletionRisk)) {
        itemsProtected.push(m.id);
        highRiskProtected++;
      } else if (m.verificationStatus === 'stale' || m.verificationStatus === 'superseded') {
        staleEligible++;
      } else if (m.tier === 0) {
        ephemeralEligible++;
      }
    }

    // Sort candidate items for eviction: lowest Utility first, lowest Deletion Risk first
    const evictableCandidates = memories
      .filter(m => !this.scoring.isProtected(m.deletionRisk))
      .sort((a, b) => {
        // Prioritize stale items for eviction
        if (a.verificationStatus === 'stale' && b.verificationStatus !== 'stale') return -1;
        if (b.verificationStatus === 'stale' && a.verificationStatus !== 'stale') return 1;
        // Then by Utility (lower utility evicted first)
        if (a.utilityScore !== b.utilityScore) {
          return a.utilityScore - b.utilityScore;
        }
        return a.deletionRisk - b.deletionRisk;
      });

    let currentTokens = totalTokens;
    let tokensFreedEstimate = 0;

    // Check if over budget or if stale/superseded items can be cleaned up
    for (const item of evictableCandidates) {
      if (currentTokens > budgetLimit || item.verificationStatus === 'stale') {
        itemsToEvict.push(item.id);
        currentTokens -= item.tokenCount;
        tokensFreedEstimate += item.tokenCount;
      } else if (item.tier === 0 && item.accessCount > 2) {
        // Candidate for Tier 0 -> Tier 1 consolidation
        itemsToConsolidate.push(item.id);
      }
    }

    return {
      totalItems: memories.length,
      totalTokens,
      budgetLimit,
      itemsToEvict,
      itemsToConsolidate,
      itemsProtected,
      tokensFreedEstimate,
      riskSummary: {
        highRiskProtected,
        staleEligible,
        ephemeralEligible
      }
    };
  }

  /**
   * Execute Garbage Collection
   */
  public run(options: { dryRun?: boolean; customBudget?: number; actor?: string } = {}): GCRunResult {
    const analysis = this.analyze(options.customBudget);
    const auditLogId = `audit_${crypto.randomUUID().slice(0, 8)}`;
    const timestamp = Date.now();

    if (options.dryRun) {
      return {
        success: true,
        evictedCount: analysis.itemsToEvict.length,
        consolidatedCount: analysis.itemsToConsolidate.length,
        protectedCount: analysis.itemsProtected.length,
        tokensBefore: analysis.totalTokens,
        tokensAfter: analysis.totalTokens - analysis.tokensFreedEstimate,
        tokensFreed: analysis.tokensFreedEstimate,
        evictedItemIds: analysis.itemsToEvict,
        consolidatedItemIds: analysis.itemsToConsolidate,
        auditLogId,
        timestamp
      };
    }

    // Actual Eviction
    let actualTokensFreed = 0;
    const evictedIds: string[] = [];

    for (const id of analysis.itemsToEvict) {
      const mem = this.state.getMemory(id);
      if (mem && !this.scoring.isProtected(mem.deletionRisk)) {
        this.state.deleteMemory(id);
        actualTokensFreed += mem.tokenCount;
        evictedIds.push(id);
      }
    }

    // Tier Consolidation (Tier 0 -> Tier 1)
    const consolidatedIds: string[] = [];
    for (const id of analysis.itemsToConsolidate) {
      const mem = this.state.getMemory(id);
      if (mem && mem.tier === 0) {
        mem.tier = 1;
        mem.title = `[Consolidated] ${mem.title}`;
        mem.content = `Synthesized Action: ${mem.content.slice(0, 150)}...`;
        mem.tokenCount = Math.ceil(mem.content.length / 4);
        mem.updatedAt = Date.now();
        this.state.updateMemory(mem);
        consolidatedIds.push(id);
      }
    }

    // Write audit record
    this.state.insertAudit({
      id: auditLogId,
      action: 'gc_run',
      actor: options.actor || 'memgc_engine',
      targetId: 'workspace_heap',
      details: {
        evictedCount: evictedIds.length,
        consolidatedCount: consolidatedIds.length,
        tokensFreed: actualTokensFreed,
        budgetLimit: analysis.budgetLimit,
        evictedIds
      },
      timestamp
    });

    const tokensAfter = analysis.totalTokens - actualTokensFreed;

    return {
      success: true,
      evictedCount: evictedIds.length,
      consolidatedCount: consolidatedIds.length,
      protectedCount: analysis.itemsProtected.length,
      tokensBefore: analysis.totalTokens,
      tokensAfter,
      tokensFreed: actualTokensFreed,
      evictedItemIds: evictedIds,
      consolidatedItemIds: consolidatedIds,
      auditLogId,
      timestamp
    };
  }
}
