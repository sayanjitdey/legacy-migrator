import { useState } from "react";
import { useJobSocket } from "./useJobSocket";
import { JobList } from "./JobList";
import { DiffView } from "./DiffView";

function App() {
  const { jobs, connected, setReviewDecision } = useJobSocket();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedJob = jobs.find((j) => j.key === selectedKey) ?? jobs[0] ?? null;

  return (
    <div className="app-shell">
      <JobList
        jobs={jobs}
        selectedKey={selectedJob?.key ?? null}
        onSelect={setSelectedKey}
      />
      {selectedJob ? (
        <DiffView
          job={selectedJob}
          onApprove={(key) => setReviewDecision(key, "approved")}
          onReject={(key) => setReviewDecision(key, "rejected")}
        />
      ) : (
        <div className="empty-state">
          {connected ? "Waiting for jobs…" : "Connecting to server…"}
        </div>
      )}
    </div>
  );
}

export default App;
