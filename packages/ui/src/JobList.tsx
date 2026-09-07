import type { JobEntry } from "./types";

interface Props {
  jobs: JobEntry[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

const TIER_LABEL: Record<string, string> = {
  MECHANICAL: "Mechanical",
  NEEDS_LLM: "LLM-assisted",
  NEEDS_HUMAN: "Needs review",
};

export function JobList({ jobs, selectedKey, onSelect }: Props) {
  return (
    <div className="job-list">
      <div className="job-list-header">Migration jobs</div>
      {jobs.map((job) => (
        <div
          key={job.key}
          className={`job-row ${job.key === selectedKey ? "selected" : ""}`}
          onClick={() => onSelect(job.key)}
        >
          <span className={`status-dot ${job.status}`} />
          <div className="job-row-text">
            <div className="job-row-name">{job.className}</div>
            <div className="job-row-tier">
              {job.tier ? TIER_LABEL[job.tier] ?? job.tier : "Analyzing…"}
            </div>
          </div>
        </div>
      ))}
      {jobs.length === 0 && (
        <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>
          No jobs yet. Enqueue a migration to see it here.
        </div>
      )}
    </div>
  );
}
