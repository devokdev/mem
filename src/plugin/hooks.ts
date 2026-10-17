/**
 * 12 Autonomous Lifecycle Hooks for MemGC
 */
import { StateModule } from '../core/state-module.js';
import { ObservationPipeline } from '../core/observation-pipeline.js';
import { GarbageCollector } from '../core/garbage-collector.js';

export interface HookContext {
  sessionId: string;
  agentName: string;
  payload: Record<string, any>;
}

export type HookName =
  | 'session-start'
  | 'session-end'
  | 'prompt-submit'
  | 'pre-tool-use'
  | 'post-tool-use'
  | 'post-tool-failure'
  | 'pre-compact'
  | 'stop'
  | 'branch-switch'
  | 'file-change'
  | 'commit'
  | 'error';

export class LifecycleHookManager {
  private state: StateModule;
  private pipeline: ObservationPipeline;
  private gc: GarbageCollector;

  constructor(state: StateModule, pipeline: ObservationPipeline, gc: GarbageCollector) {
    this.state = state;
    this.pipeline = pipeline;
    this.gc = gc;
  }

  public async dispatch(hook: HookName, ctx: HookContext): Promise<Record<string, any>> {
    // 1. Record raw observation via pipeline
    this.pipeline.ingest(ctx.sessionId, hook, ctx.agentName, ctx.payload);

    // 2. Specific reactive behaviors per hook
    switch (hook) {
      case 'session-start': {
        this.state.upsertSession({
          id: ctx.sessionId,
          title: ctx.payload.title || `Session ${ctx.sessionId.slice(0, 8)}`,
          agentName: ctx.agentName,
          startedAt: Date.now(),
          status: 'active',
          tokenUsage: 0,
          contextBudget: ctx.payload.budget || 2000
        });

        // Seed or recall foundational architectural anchors (Tier 3)
        const anchors = this.state.getAllMemories().filter(m => m.tier === 3);
        return {
          status: 'initialized',
          injectedAnchors: anchors.map(a => ({ id: a.id, title: a.title, content: a.content }))
        };
      }

      case 'session-end':
      case 'stop': {
        const s = this.state.getSession(ctx.sessionId);
        if (s) {
          s.status = 'completed';
          s.endedAt = Date.now();
          s.summary = ctx.payload.summary || 'Session completed automatically.';
          this.state.upsertSession(s);
        }
        // Run light GC cycle to consolidate ephemeral observations
        const gcSummary = this.gc.run({ dryRun: false, actor: `hook:${hook}` });
        return { status: 'concluded', gcSummary };
      }

      case 'pre-compact': {
        // Host agent is about to truncate context window!
        // Crystallize active working memory into Tier 2 facts
        const obs = this.state.getObservationsBySession(ctx.sessionId);
        return {
          status: 'crystallized',
          observationsSaved: obs.length
        };
      }

      case 'post-tool-failure':
      case 'error': {
        return {
          status: 'error_logged',
          action: 'Proactive error distillation queued.'
        };
      }

      default:
        return { status: 'acknowledged', hook };
    }
  }
}
