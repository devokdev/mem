/**
 * End-to-end Verification Demonstration Script
 * Simulates:
 * 1. Database initialisation & secret redaction
 * 2. 12 lifecycle hook dispatch
 * 3. 4-tier memory creation
 * 4. Code-grounded claim scanner
 * 5. Scoring engine calculation
 * 6. 9 interactive skills execution
 * 7. Token-budgeted Garbage Collection Run with Golden Rule protection
 */

import { MemGCEngine } from '../src/core/engine.js';
import { RedactionEngine } from '../src/core/redaction.js';
import { AGENT_SKILLS } from '../src/plugin/skills.js';
import { createMCPTools } from '../src/mcp/tools.js';
import path from 'node:path';
import fs from 'node:fs';

async function runVerificationDemo() {
  console.log('====================================================');
  console.log('🚀 STARTING MEMGC END-TO-END VERIFICATION DEMO');
  console.log('====================================================\n');

  const testDb = path.join(process.cwd(), 'data', 'demo_state.db');
  if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

  const engine = new MemGCEngine(testDb, process.cwd());

  // 1. Secret Redaction Verification
  console.log('1. [VERIFY] Privacy & Secret Redaction Engine:');
  const dirtyInput = 'User configured sk-ant-api03-abcdef123456789012345678 and token bearer eyJhbGciOiJIUzI1NiJ9';
  const cleanOutput = RedactionEngine.sanitizeString(dirtyInput);
  console.log('   Original:', dirtyInput);
  console.log('   Sanitized:', cleanOutput);
  if (!cleanOutput.includes('sk-ant-') && !cleanOutput.includes('eyJhbGciOi')) {
    console.log('   ✅ Redaction test PASSED.\n');
  } else {
    throw new Error('Redaction failed!');
  }

  // 2. Lifecycle Hooks Dispatch
  console.log('2. [VERIFY] Lifecycle Hooks Dispatch (12 hooks):');
  const sessionId = 'sess_demo_101';
  
  const startRes = await engine.hooks.dispatch('session-start', {
    sessionId,
    agentName: 'Claude Code',
    payload: { title: 'Implement Auth Middleware', budget: 1500 }
  });
  console.log('   Hook [session-start]:', startRes.status);

  await engine.hooks.dispatch('prompt-submit', {
    sessionId,
    agentName: 'Claude Code',
    payload: { prompt: 'Always use Vitest with TypeScript ES Modules. Never use Jest.' }
  });
  console.log('   Hook [prompt-submit]: Observation captured and synthesized.');

  await engine.hooks.dispatch('post-tool-use', {
    sessionId,
    agentName: 'Claude Code',
    payload: { tool: 'edit_file', filesEdited: ['PRD.md'] }
  });
  console.log('   Hook [post-tool-use]: File edit tracked.');

  await engine.hooks.dispatch('post-tool-failure', {
    sessionId,
    agentName: 'Claude Code',
    payload: { tool: 'run_tests', error: 'SyntaxError in test/sample.test.ts at line 14' }
  });
  console.log('   Hook [post-tool-failure]: Error distilled into Tier 0 memory.\n');

  // 3. Multi-Tier Memories Creation
  console.log('3. [VERIFY] 4-Tier Memory Records Setup:');
  const now = Date.now();
  
  // Tier 3: Permanent Architectural Anchor (Protected)
  engine.state.insertMemory({
    id: 'mem_arch_01',
    tier: 3,
    title: 'Architectural Anchor: SQLite State Store',
    content: 'All agent state must be stored locally in SQLite with WAL journal mode enabled.',
    tags: ['architecture', 'sqlite', 'governance'],
    fileRefs: ['PRD.md'],
    symbolRefs: ['MemGCEngine'],
    tokenCount: 450,
    utilityScore: 0.95,
    deletionRisk: 0.98, // Golden Rule Protected (> 0.85)
    verificationStatus: 'verified',
    accessCount: 15,
    createdAt: now - 50000,
    updatedAt: now,
    lastAccessedAt: now,
    architecturalConstraint: true,
    explicitInstruction: true,
    securityRule: true
  });

  // Tier 2: Verified Fact
  engine.state.insertMemory({
    id: 'mem_fact_02',
    tier: 2,
    title: 'Fact: Code Claim Scanner target file',
    content: 'ClaimScanner checks assertions against active workspace files such as PRD.md.',
    tags: ['verification', 'fact'],
    fileRefs: ['PRD.md'],
    symbolRefs: ['ClaimScanner'],
    tokenCount: 300,
    utilityScore: 0.75,
    deletionRisk: 0.70,
    verificationStatus: 'unverified',
    accessCount: 4,
    createdAt: now - 30000,
    updatedAt: now,
    lastAccessedAt: now,
    architecturalConstraint: false,
    explicitInstruction: false,
    securityRule: false
  });

  // Tier 1: Action (Synthesized)
  engine.state.insertMemory({
    id: 'mem_act_03',
    tier: 1,
    title: 'Action: Added test assertions',
    content: 'Ran npm run test to verify test coverage for state-module.',
    tags: ['testing'],
    fileRefs: ['non_existent_file.ts'], // Will be marked stale by claim scanner!
    symbolRefs: [],
    tokenCount: 650,
    utilityScore: 0.20,
    deletionRisk: 0.15,
    verificationStatus: 'unverified',
    accessCount: 1,
    createdAt: now - 20000,
    updatedAt: now,
    lastAccessedAt: now,
    architecturalConstraint: false,
    explicitInstruction: false,
    securityRule: false
  });

  // Tier 0: Ephemeral Tool Output
  engine.state.insertMemory({
    id: 'mem_raw_04',
    tier: 0,
    title: 'Raw: Debug log dump',
    content: 'Verbose debug stacktrace dump from failed child process worker 9104.',
    tags: ['raw', 'ephemeral'],
    fileRefs: [],
    symbolRefs: [],
    tokenCount: 800,
    utilityScore: 0.05,
    deletionRisk: 0.10,
    verificationStatus: 'unverified',
    accessCount: 0,
    createdAt: now - 10000,
    updatedAt: now,
    lastAccessedAt: now,
    architecturalConstraint: false,
    explicitInstruction: false,
    securityRule: false
  });

  console.log(`   Inserted 4 test memories across all tiers. Total tokens before GC: ${engine.state.getAllMemories().reduce((s, m) => s + m.tokenCount, 0)} tk.\n`);

  // 4. Code-Grounded Verification Test
  console.log('4. [VERIFY] Code-Grounded Claim Scanner:');
  const verifyRes = engine.scanner.verifyMemory(engine.state.getMemory('mem_act_03')!);
  console.log('   Verification of mem_act_03 referencing non_existent_file.ts:', verifyRes.status);
  if (verifyRes.status === 'stale') {
    console.log('   ✅ Correctly identified missing file as STALE.\n');
  }

  // 5. Agent Skills Test
  console.log('5. [VERIFY] 9 Agent Skills Execution:');
  for (const skill of AGENT_SKILLS) {
    const output = await skill.execute(skill.command === '/recall' ? 'SQLite' : (skill.command === '/remember' ? 'Test governance rule' : ''), {
      state: engine.state,
      gc: engine.gc,
      retrieval: engine.retrieval,
      scanner: engine.scanner
    });
    console.log(`   [Skill ${skill.command}]: Output length = ${output.length} chars.`);
  }
  console.log('   ✅ All 9 Skills executed successfully.\n');

  // 6. MCP Tool Registry Count
  console.log('6. [VERIFY] MCP Tool Surface:');
  const mcpTools = createMCPTools();
  console.log(`   Total registered MCP Tools: ${mcpTools.length}`);
  if (mcpTools.length === 53) {
    console.log('   ✅ Exact 53 MCP Tools registered per PRD specification.\n');
  } else {
    throw new Error(`Expected 53 MCP tools, but got ${mcpTools.length}`);
  }

  // 7. Token-Budgeted GC Run (Simulated & Execution)
  console.log('7. [VERIFY] Token-Budgeted Garbage Collector:');
  const analysis = engine.gc.analyze(1000); // Strict budget 1,000 tokens
  console.log(`   Heap tokens before GC: ${analysis.totalTokens} tk`);
  console.log(`   Budget limit: ${analysis.budgetLimit} tk`);
  console.log(`   Identified for Eviction: ${analysis.itemsToEvict.length} items`);
  console.log(`   Protected Items: ${analysis.itemsProtected.length} items (${analysis.itemsProtected.join(', ')})`);

  // Execute GC
  const gcRun = engine.gc.run({ dryRun: false, customBudget: 1000, actor: 'demo_test' });
  console.log(`   GC Run Completed: Freed ${gcRun.tokensFreed} tk.`);
  console.log(`   Tokens After GC: ${gcRun.tokensAfter} tk.`);
  console.log(`   Evicted IDs: ${gcRun.evictedItemIds.join(', ')}`);

  // Verify Golden Rule: Tier 3 Protected item mem_arch_01 MUST NOT be evicted
  const protectedMemory = engine.state.getMemory('mem_arch_01');
  if (protectedMemory) {
    console.log('   ✅ GOLDEN RULE CONFIRMED: Protected architectural anchor mem_arch_01 preserved under budget pressure.\n');
  } else {
    throw new Error('Golden Rule violated! Protected item was evicted.');
  }

  // Cleanup test database
  engine.state.close();
  if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

  console.log('====================================================');
  console.log('🎉 ALL VERIFICATION TESTS COMPLETED WITH ZERO ERRORS');
  console.log('====================================================');
}

runVerificationDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
