import { DiffEditor, Editor } from "@monaco-editor/react";
import type { JobEntry } from "./types";

interface Props {
  job: JobEntry;
  onApprove: (key: string) => void;
  onReject: (key: string) => void;
}

export function DiffView({ job, onApprove, onReject }: Props) {
  const isReviewable = job.status === "done" && job.generatedCode !== null;
  const isHardStop = job.status === "skipped_hard_stop";

  return (
    <div className="main-pane">
      <div className="main-header">
        <div>
          <div className="main-header-title">{job.className}</div>
          <div className="main-header-path">{job.filePath}</div>
        </div>
        {isReviewable && !job.reviewDecision && (
          <div className="actions">
            <button className="reject" onClick={() => onReject(job.key)}>
              Reject
            </button>
            <button className="primary" onClick={() => onApprove(job.key)}>
              Approve
            </button>
          </div>
        )}
        {job.reviewDecision && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {job.reviewDecision === "approved" ? "Approved" : "Rejected"} — not yet
            wired to git (Week 7)
          </div>
        )}
      </div>

      <div className="diff-container">
        {isReviewable ? (
          <DiffEditor
            original={job.originalCode}
            modified={job.generatedCode ?? ""}
            originalLanguage="typescript"
            modifiedLanguage="typescript"
            theme="vs"
            options={{ readOnly: true, renderSideBySide: true, fontSize: 13 }}
          />
        ) : (
          <Editor
            value={job.originalCode}
            language="typescript"
            theme="vs"
            options={{ readOnly: true, fontSize: 13 }}
          />
        )}
      </div>

      {isHardStop && (
        <div className="diagnostics-panel" style={{ color: "var(--text)" }}>
          <div className="reasons-label">Why this needs manual migration</div>
          {job.diagnostics.map((reason, i) => (
            <div key={i}>{reason}</div>
          ))}
        </div>
      )}

      {job.status === "needs_human" && !isHardStop && (
        <div className="diagnostics-panel">
          <div className="reasons-label" style={{ color: "var(--needs-human)" }}>
            Automated migration failed validation ({job.attempts} attempt
            {job.attempts === 1 ? "" : "s"})
          </div>
          {job.diagnostics.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
      )}
    </div>
  );
}
