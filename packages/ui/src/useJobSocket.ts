import { useEffect, useRef, useState } from "react";
import type { JobEntry, WsMessage } from "./types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";

export function useJobSocket() {
  const [jobs, setJobs] = useState<Record<string, JobEntry>>({});
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const message: WsMessage = JSON.parse(event.data);

      if (message.type === "job_active") {
        // We don't know the class name(s) yet — job_active only carries
        // the file path. Show a placeholder row keyed by the file path
        // alone; job_completed below replaces it with real per-class
        // entries once the actual classification/transform result exists.
        setJobs((prev) => ({
          ...prev,
          [message.filePath]: {
            key: message.filePath,
            filePath: message.filePath,
            className: "Analyzing…",
            tier: null,
            status: "processing",
            attempts: 0,
            diagnostics: [],
            originalCode: "",
            generatedCode: null,
            reviewDecision: null,
          },
        }));
      }

      if (message.type === "job_completed") {
        setJobs((prev) => {
          const next = { ...prev };
          delete next[message.filePath]; // remove the "Analyzing…" placeholder
          for (const result of message.results) {
            const key = `${result.filePath}::${result.className}`;
            next[key] = {
              key,
              filePath: result.filePath,
              className: result.className,
              tier: result.tier,
              status: result.status,
              attempts: result.attempts,
              diagnostics: result.diagnostics,
              originalCode: result.originalCode,
              generatedCode: result.generatedCode,
              reviewDecision: null,
            };
          }
          return next;
        });
      }

      if (message.type === "job_failed") {
        setJobs((prev) => {
          const next = { ...prev };
          delete next[message.filePath];
          return next;
        });
        console.error(`Job failed for ${message.filePath}: ${message.reason}`);
      }
    };

    return () => ws.close();
  }, []);

  function setReviewDecision(key: string, decision: "approved" | "rejected") {
    setJobs((prev) => {
      const entry = prev[key];
      if (!entry) return prev;
      return { ...prev, [key]: { ...entry, reviewDecision: decision } };
    });
  }

  return { jobs: Object.values(jobs), connected, setReviewDecision };
}
