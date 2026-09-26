// Runs the pipeline in a background worker, falling back to the main thread where workers
// aren't available.

import { runPipeline, type PipelineInput, type PipelineParams, type PipelineResult } from "@/lib/pipeline";

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (r: PipelineResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./pipeline.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: PipelineResult; error?: string }>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.result) job.resolve(e.data.result);
      else job.reject(new Error(e.data.error ?? "Pipeline failed"));
    };
    worker.onerror = () => {
      // A broken worker: fail what's waiting and use the main thread from now on.
      for (const job of pending.values()) job.reject(new Error("Worker failed"));
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

export async function runPipelineAsync(input: PipelineInput, params: PipelineParams): Promise<PipelineResult> {
  const w = getWorker();
  if (!w) return runPipeline(input, params);
  const id = nextId++;
  try {
    return await new Promise<PipelineResult>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, input, params });
    });
  } catch {
    return runPipeline(input, params);
  }
}
