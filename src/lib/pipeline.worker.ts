// Runs the paint-by-number pipeline off the main thread, so the page stays responsive (and
// its progress spinner keeps turning) while shapes are being built.

import { runPipeline, type PipelineInput, type PipelineParams } from "@/lib/pipeline";

self.onmessage = (e: MessageEvent<{ id: number; input: PipelineInput; params: PipelineParams }>) => {
  const { id, input, params } = e.data;
  try {
    self.postMessage({ id, result: runPipeline(input, params) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
