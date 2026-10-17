import { StateModule } from './state-module.js';
import { ObservationLog, MemoryRecord } from './types.js';
import { RedactionEngine } from './redaction.js';
import crypto from 'node:crypto';

export class ObservationPipeline {
  private state: StateModule;

  constructor(state: StateModule) {
    this.state = state;
  }

  /**
   * Ingest and sanitize an observation event
   */
  public ingest(
    sessionId: string,
    eventType: string,
    source: string,
    payload: Record<string, any>
  ): ObservationLog {
    const sanitizedPayload = RedactionEngine.sanitizeObject(payload);
    const obs: ObservationLog = {
      id: `obs_${crypto.randomUUID().slice(0, 10)}`,
      sessionId,
      eventType,
      source,
      payload: sanitizedPayload,
      sanitized: true,
      timestamp: Date.now()
    };

    this.state.insertObservation(obs);

    // Auto-Compress Gate / Synthesis Trigger for relevant tool actions or prompt submissions
    this.autoSynthesize(obs);

    return obs;
  }

  private autoSynthesize(obs: ObservationLog): void {
    // If it's a post-tool-use or error or prompt-submit, extract potential memory record
    if (obs.eventType === 'prompt-submit' && obs.payload?.prompt) {
      const promptText = String(obs.payload.prompt);
      const isInstruction = /always|never|remember|rule|standard|pattern/i.test(promptText);

      if (isInstruction || promptText.length > 50) {
        const title = `User Preference/Instruction: ${promptText.slice(0, 45)}...`;
        this.createMemoryFromObservation(obs, title, promptText, 1, {
          explicitInstruction: isInstruction,
          tags: ['prompt', 'user-preference']
        });
      }
    } else if (obs.eventType === 'post-tool-failure' && obs.payload?.error) {
      const errorText = String(obs.payload.error);
      const title = `Error Lesson: ${obs.payload?.tool || 'tool'} failure`;
      this.createMemoryFromObservation(obs, title, `Encountered error: ${errorText}`, 0, {
        tags: ['error', 'post-mortem']
      });
    } else if (obs.eventType === 'post-tool-use' && obs.payload?.filesEdited) {
      const files = Array.isArray(obs.payload.filesEdited) ? obs.payload.filesEdited : [obs.payload.filesEdited];
      const title = `Modified files: ${files.join(', ')}`;
      this.createMemoryFromObservation(
        obs,
        title,
        `Tool ${obs.payload?.tool} modified: ${files.join(', ')}`,
        0,
        {
          fileRefs: files,
          tags: ['file-edit', 'tool-action']
        }
      );
    }
  }

  private createMemoryFromObservation(
    obs: ObservationLog,
    title: string,
    content: string,
    tier: 0 | 1 | 2 | 3,
    options: Partial<MemoryRecord> = {}
  ): MemoryRecord {
    const mem: MemoryRecord = {
      id: `mem_${crypto.randomUUID().slice(0, 8)}`,
      tier,
      title: RedactionEngine.sanitizeString(title),
      content: RedactionEngine.sanitizeString(content),
      tags: options.tags || ['auto-captured'],
      sessionRef: obs.sessionId,
      fileRefs: options.fileRefs || [],
      symbolRefs: options.symbolRefs || [],
      tokenCount: Math.ceil(content.length / 4),
      utilityScore: 0.6,
      deletionRisk: options.explicitInstruction ? 0.9 : 0.2,
      verificationStatus: 'unverified',
      accessCount: 1,
      createdAt: obs.timestamp,
      updatedAt: obs.timestamp,
      lastAccessedAt: obs.timestamp,
      architecturalConstraint: Boolean(options.architecturalConstraint),
      explicitInstruction: Boolean(options.explicitInstruction),
      securityRule: Boolean(options.securityRule),
      metadata: { sourceObsId: obs.id, eventType: obs.eventType }
    };

    this.state.insertMemory(mem);
    return mem;
  }
}
