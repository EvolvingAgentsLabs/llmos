/**
 * Smart Token Estimator
 *
 * Provides more accurate token estimation than simple character-based math.
 * Uses content-type-aware heuristics and pattern matching to better
 * estimate tokens for different types of content.
 *
 * Key improvements over simple 0.25 tokens/char:
 * - Code has higher token density (more symbols, shorter words)
 * - Non-English text often has different tokenization
 * - JSON/structured data has predictable overhead
 * - Whitespace and repeated characters compress well
 */

// =============================================================================
// Token Estimation Constants by Content Type
// =============================================================================

/**
 * Token ratios per character for different content types
 * Based on empirical analysis of Claude/GPT tokenizers
 */
export const TOKEN_RATIOS = {
  // Natural language (English) - ~4 chars per token average
  prose: 0.25,

  // Code has more symbols and shorter identifiers - ~3.5 chars per token
  code: 0.29,

  // JSON/structured data - includes lots of punctuation - ~3 chars per token
  json: 0.33,

  // Markdown with formatting - ~3.8 chars per token
  markdown: 0.26,

  // URLs and paths - lots of special chars - ~2.5 chars per token
  urls: 0.40,

  // Numbers and IDs - high density - ~2 chars per token
  numeric: 0.50,

  // Non-English text (CJK, etc.) - often 1 char per token or more
  nonEnglish: 0.80,

  // Whitespace-heavy content - compresses well
  whitespace: 0.10,

  // Base64/encoded data - very high density
  encoded: 0.35,
} as const;

// Language detection patterns
const CODE_PATTERNS = [
  /^(import|export|const|let|var|function|class|interface|type|async|await)\s/m,
  /[{}[\]();]/g,
  /^\s*(if|else|for|while|return|try|catch)\s*[({]/m,
  /\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|rb|php)$/,
  /```(typescript|javascript|python|java|go|rust|cpp|c|ruby|php)/,
];

const JSON_PATTERNS = [
  /^\s*[{\[]/,
  /"[^"]+"\s*:/,
  /^\s*\[\s*\{/,
];

const MARKDOWN_PATTERNS = [
  /^#+\s/m,
  /\*\*[^*]+\*\*/,
  /\[.+\]\(.+\)/,
  /^[-*]\s/m,
  /^```/m,
];

const URL_PATTERNS = [
  /https?:\/\/[^\s]+/g,
  /\/[\w-]+\/[\w-]+/g,
  /\.(com|org|net|io|dev|ai|app)/g,
];

const NON_ENGLISH_PATTERNS = [
  /[\u4e00-\u9fff]/,  // Chinese
  /[\u3040-\u30ff]/,  // Japanese
  /[\uac00-\ud7af]/,  // Korean
  /[\u0600-\u06ff]/,  // Arabic
  /[\u0400-\u04ff]/,  // Cyrillic
  /[\u0900-\u097f]/,  // Hindi
];

// =============================================================================
// Content Type Detection
// =============================================================================

export interface ContentAnalysis {
  type: keyof typeof TOKEN_RATIOS;
  confidence: number;
  subTypes: {
    codeRatio: number;
    jsonRatio: number;
    urlRatio: number;
    numericRatio: number;
    nonEnglishRatio: number;
    whitespaceRatio: number;
  };
}

/**
 * Analyze content to determine its type and characteristics
 */
export function analyzeContent(text: string): ContentAnalysis {
  const length = text.length;
  if (length === 0) {
    return {
      type: 'prose',
      confidence: 1,
      subTypes: { codeRatio: 0, jsonRatio: 0, urlRatio: 0, numericRatio: 0, nonEnglishRatio: 0, whitespaceRatio: 0 }
    };
  }

  // Calculate ratios
  const codeMatches = CODE_PATTERNS.reduce((count, pattern) => {
    const matches = text.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);
  const codeRatio = Math.min(1, codeMatches / (length / 100));

  const jsonMatches = JSON_PATTERNS.reduce((count, pattern) => {
    const matches = text.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);
  const jsonRatio = Math.min(1, jsonMatches / (length / 500));

  // Count URLs
  const urlMatches = URL_PATTERNS.reduce((count, pattern) => {
    const matches = text.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);
  const urlRatio = Math.min(1, urlMatches / (length / 200));

  // Count numeric content
  const numericMatches = (text.match(/\d+/g) || []).join('').length;
  const numericRatio = numericMatches / length;

  // Count non-English characters
  const nonEnglishMatches = NON_ENGLISH_PATTERNS.reduce((count, pattern) => {
    const matches = text.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);
  const nonEnglishRatio = nonEnglishMatches / length;

  // Count whitespace
  const whitespaceMatches = (text.match(/\s/g) || []).length;
  const whitespaceRatio = whitespaceMatches / length;

  // Determine primary type
  let type: keyof typeof TOKEN_RATIOS = 'prose';
  let confidence = 0.5;

  if (nonEnglishRatio > 0.3) {
    type = 'nonEnglish';
    confidence = Math.min(1, 0.5 + nonEnglishRatio);
  } else if (jsonRatio > 0.5 || (text.trim().startsWith('{') && text.trim().endsWith('}'))) {
    type = 'json';
    confidence = Math.min(1, 0.5 + jsonRatio);
  } else if (codeRatio > 0.3) {
    type = 'code';
    confidence = Math.min(1, 0.4 + codeRatio);
  } else if (urlRatio > 0.2) {
    type = 'urls';
    confidence = Math.min(1, 0.5 + urlRatio);
  } else if (numericRatio > 0.4) {
    type = 'numeric';
    confidence = Math.min(1, 0.5 + numericRatio);
  } else if (whitespaceRatio > 0.5) {
    type = 'whitespace';
    confidence = Math.min(1, 0.5 + whitespaceRatio);
  } else if (MARKDOWN_PATTERNS.some(p => p.test(text))) {
    type = 'markdown';
    confidence = 0.7;
  }

  return {
    type,
    confidence,
    subTypes: {
      codeRatio,
      jsonRatio,
      urlRatio,
      numericRatio,
      nonEnglishRatio,
      whitespaceRatio,
    },
  };
}

// =============================================================================
// Smart Token Estimation
// =============================================================================

export interface TokenEstimate {
  tokens: number;
  confidence: 'high' | 'medium' | 'low';
  breakdown: {
    baseEstimate: number;
    adjustedEstimate: number;
    contentType: keyof typeof TOKEN_RATIOS;
    adjustmentFactors: string[];
  };
}

/**
 * Estimate tokens with content-aware heuristics
 */
export function estimateTokensSmart(text: string): TokenEstimate {
  const length = text.length;

  if (length === 0) {
    return {
      tokens: 0,
      confidence: 'high',
      breakdown: {
        baseEstimate: 0,
        adjustedEstimate: 0,
        contentType: 'prose',
        adjustmentFactors: [],
      },
    };
  }

  const analysis = analyzeContent(text);
  const adjustmentFactors: string[] = [];

  // Start with base ratio for detected type
  let ratio = TOKEN_RATIOS[analysis.type];
  adjustmentFactors.push(`base ${analysis.type}: ${ratio}`);

  // Apply weighted adjustments based on sub-type ratios
  let adjustment = 0;

  // Code content increases token density
  if (analysis.subTypes.codeRatio > 0.1) {
    const codeAdjust = analysis.subTypes.codeRatio * (TOKEN_RATIOS.code - ratio);
    adjustment += codeAdjust;
    adjustmentFactors.push(`code content: +${codeAdjust.toFixed(3)}`);
  }

  // JSON increases density
  if (analysis.subTypes.jsonRatio > 0.1) {
    const jsonAdjust = analysis.subTypes.jsonRatio * (TOKEN_RATIOS.json - ratio);
    adjustment += jsonAdjust;
    adjustmentFactors.push(`json structure: +${jsonAdjust.toFixed(3)}`);
  }

  // URLs increase density
  if (analysis.subTypes.urlRatio > 0.05) {
    const urlAdjust = analysis.subTypes.urlRatio * (TOKEN_RATIOS.urls - ratio);
    adjustment += urlAdjust;
    adjustmentFactors.push(`urls/paths: +${urlAdjust.toFixed(3)}`);
  }

  // High whitespace decreases density
  if (analysis.subTypes.whitespaceRatio > 0.3) {
    const wsAdjust = (analysis.subTypes.whitespaceRatio - 0.3) * (TOKEN_RATIOS.whitespace - ratio) * 0.5;
    adjustment += wsAdjust;
    adjustmentFactors.push(`whitespace: ${wsAdjust.toFixed(3)}`);
  }

  // Non-English significantly increases density
  if (analysis.subTypes.nonEnglishRatio > 0.1) {
    const neAdjust = analysis.subTypes.nonEnglishRatio * (TOKEN_RATIOS.nonEnglish - ratio);
    adjustment += neAdjust;
    adjustmentFactors.push(`non-English: +${neAdjust.toFixed(3)}`);
  }

  const adjustedRatio = Math.max(0.1, Math.min(1.0, ratio + adjustment));
  const baseEstimate = Math.ceil(length * ratio);
  const adjustedEstimate = Math.ceil(length * adjustedRatio);

  // Determine confidence based on analysis
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (analysis.confidence > 0.8) {
    confidence = 'high';
  } else if (analysis.confidence < 0.5) {
    confidence = 'low';
  }

  return {
    tokens: adjustedEstimate,
    confidence,
    breakdown: {
      baseEstimate,
      adjustedEstimate,
      contentType: analysis.type,
      adjustmentFactors,
    },
  };
}

/**
 * Simple token estimation for backwards compatibility
 * Uses smart estimation internally
 */
export function estimateTokens(text: string): number {
  return estimateTokensSmart(text).tokens;
}

/**
 * Estimate tokens for a message array (e.g., chat messages)
 */
export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;

  for (const msg of messages) {
    // Add overhead for message structure (~4 tokens per message)
    total += 4;

    // Add role token
    total += 1;

    // Add content tokens
    total += estimateTokens(msg.content);
  }

  // Add ~3 tokens for priming
  total += 3;

  return total;
}

// =============================================================================
// Batch Estimation for Large Content
// =============================================================================

/**
 * Estimate tokens for large content by sampling
 * More efficient for very large texts
 */
export function estimateTokensLargeContent(
  text: string,
  sampleSize: number = 10000,
  sampleCount: number = 5
): TokenEstimate {
  const length = text.length;

  // For small content, just use full estimation
  if (length <= sampleSize * sampleCount) {
    return estimateTokensSmart(text);
  }

  // Sample multiple sections of the text
  const samples: string[] = [];
  const step = Math.floor(length / sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const start = i * step;
    const end = Math.min(start + sampleSize, length);
    samples.push(text.slice(start, end));
  }

  // Estimate each sample
  const estimates = samples.map(s => estimateTokensSmart(s));

  // Calculate average ratio
  const totalSampleLength = samples.reduce((sum, s) => sum + s.length, 0);
  const totalSampleTokens = estimates.reduce((sum, e) => sum + e.tokens, 0);
  const avgRatio = totalSampleTokens / totalSampleLength;

  // Extrapolate to full content
  const fullEstimate = Math.ceil(length * avgRatio);

  // Combine adjustment factors
  const allFactors = new Set<string>();
  estimates.forEach(e => e.breakdown.adjustmentFactors.forEach(f => allFactors.add(f)));

  return {
    tokens: fullEstimate,
    confidence: 'medium', // Sampling reduces confidence
    breakdown: {
      baseEstimate: Math.ceil(length * 0.25),
      adjustedEstimate: fullEstimate,
      contentType: 'prose', // Mixed content
      adjustmentFactors: [`sampled ${sampleCount} sections`, ...Array.from(allFactors)],
    },
  };
}

// =============================================================================
// Export Default Instance
// =============================================================================

export const smartTokenEstimator = {
  estimate: estimateTokens,
  estimateSmart: estimateTokensSmart,
  estimateLarge: estimateTokensLargeContent,
  estimateMessages: estimateMessagesTokens,
  analyzeContent,
  TOKEN_RATIOS,
};
