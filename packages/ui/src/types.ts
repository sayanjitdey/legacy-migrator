export interface ComponentJobResult {
  filePath: string;
  className: string;
  tier: string;
  status: "done" | "needs_human" | "skipped_hard_stop";
  attempts: number;
  diagnostics: string[];
  originalCode: string;
  generatedCode: string | null;
}

export type WsMessage =
  | { type: "job_active"; jobId: string; filePath: string }
  | { type: "job_completed"; jobId: string; filePath: string; results: ComponentJobResult[] }
  | { type: "job_failed"; jobId: string; filePath: string; reason: string };

/**
 * The UI-facing state for one migration candidate. Keyed by
 * `${filePath}::${className}` because a single file can contain more than
 * one class component (the classifier/processFile already support this;
 * the UI needs to as well rather than assuming one-class-per-file).
 */
export interface JobEntry {
  key: string;
  filePath: string;
  className: string;
  tier: string | null;
  status: "processing" | "done" | "needs_human" | "skipped_hard_stop";
  attempts: number;
  diagnostics: string[];
  originalCode: string;
  generatedCode: string | null;
  reviewDecision: "approved" | "rejected" | null;
}
