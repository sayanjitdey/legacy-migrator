/**
 * The retry loop (retry-loop.ts) only depends on this function shape — it
 * never imports the Anthropic SDK directly. That's deliberate: it means
 * the loop's logic (attempt, validate, retry-with-error-feedback, give up)
 * can be tested completely deterministically with a stub, and swapped for
 * a real API call, or even a different provider, without touching the
 * loop itself.
 */
export interface MigrationRequest {
  classSourceText: string;
  reasonsForLLMTier: string[];
  previousAttemptError?: string;
}

export type MigrationLLM = (request: MigrationRequest) => Promise<string>;
