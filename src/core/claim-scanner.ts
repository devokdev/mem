import fs from 'node:fs';
import path from 'node:path';
import { MemoryRecord } from './types.js';

export interface VerificationResult {
  memoryId: string;
  status: 'verified' | 'stale' | 'superseded';
  checkedFiles: { path: string; exists: boolean }[];
  checkedSymbols: { symbol: string; found: boolean; inPath?: string }[];
  notes: string;
}

export class ClaimScanner {
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Verify claim against active workspace file tree and code symbols
   */
  public verifyMemory(memory: MemoryRecord): VerificationResult {
    const checkedFiles: { path: string; exists: boolean }[] = [];
    const checkedSymbols: { symbol: string; found: boolean; inPath?: string }[] = [];

    let hasFileRefs = memory.fileRefs && memory.fileRefs.length > 0;
    let anyFileMissing = false;
    let anyFileExists = false;

    if (hasFileRefs) {
      for (const relPath of memory.fileRefs) {
        const fullPath = path.isAbsolute(relPath) ? relPath : path.join(this.workspaceRoot, relPath);
        const exists = fs.existsSync(fullPath);
        checkedFiles.push({ path: relPath, exists });
        if (exists) {
          anyFileExists = true;
        } else {
          anyFileMissing = true;
        }
      }
    }

    // Symbol checks
    if (memory.symbolRefs && memory.symbolRefs.length > 0) {
      for (const symbol of memory.symbolRefs) {
        let found = false;
        let foundIn: string | undefined;

        // Check in existing referenced files first
        for (const fileCheck of checkedFiles) {
          if (fileCheck.exists) {
            try {
              const fullPath = path.isAbsolute(fileCheck.path) ? fileCheck.path : path.join(this.workspaceRoot, fileCheck.path);
              const stat = fs.statSync(fullPath);
              if (stat.isFile()) {
                const content = fs.readFileSync(fullPath, 'utf8');
                if (content.includes(symbol)) {
                  found = true;
                  foundIn = fileCheck.path;
                  break;
                }
              }
            } catch {
              // ignore read errors
            }
          }
        }

        checkedSymbols.push({ symbol, found, inPath: foundIn });
      }
    }

    let status: 'verified' | 'stale' | 'superseded' = 'verified';
    let notes = 'All assertions verified against workspace.';

    if (hasFileRefs && anyFileMissing) {
      if (!anyFileExists) {
        status = 'stale';
        notes = 'All referenced files are missing from workspace.';
      } else {
        status = 'superseded';
        notes = 'Some referenced files were renamed or removed.';
      }
    }

    const missingSymbols = checkedSymbols.filter(s => !s.found);
    if (checkedSymbols.length > 0 && missingSymbols.length === checkedSymbols.length && anyFileExists) {
      status = 'stale';
      notes = `Referenced symbols (${missingSymbols.map(s => s.symbol).join(', ')}) not found in target files.`;
    }

    return {
      memoryId: memory.id,
      status,
      checkedFiles,
      checkedSymbols,
      notes
    };
  }
}
