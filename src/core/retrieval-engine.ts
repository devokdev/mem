import { MemoryRecord } from './types.js';

export interface SearchResult {
  memory: MemoryRecord;
  score: number;
  matchType: 'bm25' | 'dense' | 'graph' | 'hybrid';
  highlights: string[];
}

export class HybridRetrievalEngine {
  /**
   * Tokenize string into lowercase alphanumeric words
   */
  private tokenize(text: string): string[] {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9_\-\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
  }

  /**
   * Lexical BM25 approximation
   */
  public bm25Search(query: string, corpus: MemoryRecord[]): { memory: MemoryRecord; score: number }[] {
    const qTokens = this.tokenize(query);
    if (qTokens.length === 0) return corpus.map(m => ({ memory: m, score: 0 }));

    const N = corpus.length || 1;
    const avgdl = corpus.reduce((acc, m) => acc + (m.title + ' ' + m.content).length, 0) / N;
    const k1 = 1.5;
    const b = 0.75;

    // Document frequencies
    const df: Record<string, number> = {};
    for (const q of qTokens) {
      let count = 0;
      for (const m of corpus) {
        const docText = `${m.title} ${m.content} ${m.tags.join(' ')}`.toLowerCase();
        if (docText.includes(q)) count++;
      }
      df[q] = count;
    }

    return corpus.map(m => {
      const docStr = `${m.title} ${m.content} ${m.tags.join(' ')} ${m.fileRefs.join(' ')}`;
      const docTokens = this.tokenize(docStr);
      const dl = docStr.length;
      let score = 0;

      for (const q of qTokens) {
        const count = docTokens.filter(t => t === q).length;
        if (count > 0) {
          const docFreq = df[q] || 0;
          const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
          const tf = (count * (k1 + 1)) / (count + k1 * (1 - b + b * (dl / (avgdl || 1))));
          score += idf * tf;
        }
      }

      return { memory: m, score: Math.max(0, score) };
    });
  }

  /**
   * Simple character n-gram / semantic bag-of-words vector projection
   * Simulates dense embedding similarity (all-MiniLM proxy) without bulky native C++ models
   */
  public denseCosineSimilarity(query: string, text: string): number {
    const qTokens = new Set(this.tokenize(query));
    const tTokens = new Set(this.tokenize(text));
    if (qTokens.size === 0 || tTokens.size === 0) return 0;

    let intersection = 0;
    for (const t of qTokens) {
      if (tTokens.has(t)) intersection++;
    }

    const similarity = intersection / Math.sqrt(qTokens.size * tTokens.size);
    return Math.min(1.0, Math.max(0.0, similarity));
  }

  /**
   * Hybrid Multi-Factor Search
   */
  public search(
    query: string,
    corpus: MemoryRecord[],
    options: {
      limit?: number;
      minScore?: number;
      tagFilter?: string[];
      tierFilter?: number[];
    } = {}
  ): SearchResult[] {
    const limit = options.limit || 10;
    const bm25Results = this.bm25Search(query, corpus);
    const maxBm25 = Math.max(...bm25Results.map(r => r.score), 1.0);

    const scored: SearchResult[] = corpus.map((mem, idx) => {
      // Filter by tags if specified
      if (options.tagFilter && options.tagFilter.length > 0) {
        const hasTag = options.tagFilter.some(t => mem.tags.includes(t));
        if (!hasTag) return { memory: mem, score: -1, matchType: 'hybrid', highlights: [] };
      }

      // Filter by tier if specified
      if (options.tierFilter && options.tierFilter.length > 0) {
        if (!options.tierFilter.includes(mem.tier)) {
          return { memory: mem, score: -1, matchType: 'hybrid', highlights: [] };
        }
      }

      const bm25Norm = (bm25Results[idx]?.score || 0) / maxBm25;
      const denseScore = this.denseCosineSimilarity(query, `${mem.title} ${mem.content} ${mem.tags.join(' ')}`);
      
      // Graph boost if query touches files or symbols
      let graphBoost = 0;
      const qLower = query.toLowerCase();
      for (const f of mem.fileRefs) {
        if (qLower.includes(f.toLowerCase()) || f.toLowerCase().includes(qLower)) graphBoost += 0.2;
      }
      for (const s of mem.symbolRefs) {
        if (qLower.includes(s.toLowerCase())) graphBoost += 0.25;
      }

      // Hybrid combination
      const compositeScore = (bm25Norm * 0.45) + (denseScore * 0.40) + (Math.min(0.3, graphBoost) * 0.15);

      // Simple match highlights
      const highlights: string[] = [];
      const tokens = this.tokenize(query);
      for (const t of tokens) {
        if (mem.content.toLowerCase().includes(t)) {
          highlights.push(t);
        }
      }

      return {
        memory: mem,
        score: Number(compositeScore.toFixed(4)),
        matchType: compositeScore > 0.5 ? 'hybrid' : (bm25Norm > denseScore ? 'bm25' : 'dense'),
        highlights: [...new Set(highlights)]
      };
    });

    return scored
      .filter(r => r.score >= (options.minScore || 0.05))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
