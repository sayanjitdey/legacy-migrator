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
  // The original file's own import declarations, verbatim. Without this
  // the model only ever sees the isolated class body and has no way to
  // know the real paths for sibling components/helpers/styles it
  // references — it ends up guessing plausible-looking imports (wrong
  // relative paths, invented package names) instead of reusing the real
  // ones. Empty string when unavailable to the caller.
  existingImports: string;
}

export type MigrationLLM = (request: MigrationRequest) => Promise<string>;
