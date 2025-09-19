// js/workers/compute.worker.js
import { runGreedyLoop } from '../engine.js';

let paused = false, canceled = false;
const pauseResolvers = [];
const yieldToQueue = () => new Promise((resolve) => setTimeout(resolve, 0));
const YIELD_STRIDE = 512;

const flushResolvers = () => {
  while (pauseResolvers.length) {
    const resolve = pauseResolvers.pop();
    try { resolve(); } catch (err) { console.error(err); }
  }
};

const waitWhilePaused = async () => {
  while (paused && !canceled) {
    await new Promise((resolve) => pauseResolvers.push(resolve));
  }
};

const reportStatus = (state) => {
  self.postMessage({ type: 'status', data: { state } });
};

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'run') {
    paused = false; canceled = false; flushResolvers();
    reportStatus('running');

    const opts = {
      size: data.size,
      fade: data.fade,
      minDist: data.minDist,
      maxSteps: Math.max(1, data.maxSteps | 0),
      progressThrottle: 0.02,
      waitWhilePaused,
      shouldCancel: () => canceled,
      yieldToQueue,
      yieldStride: YIELD_STRIDE,
    };

    // Önizleme gönderim aralığı (adım sayısına ve throttle'a göre)
    const previewStepStride = Math.max(
      1,
      Math.round(opts.maxSteps * Math.max(opts.progressThrottle * 2, 0.04))
    );
    let lastPreviewStep = 0;
    let sentPins = false;

    // stepsSnapshot ve opsiyonel pins'i destekle
    const onProgress = (step, score, stepsSnapshot, pins) => {
      if (paused || canceled) return;

      const payload = {
        type: 'progress',
        data: {
          step,
          max: opts.maxSteps,
          score,
          progress: step / opts.maxSteps,
        },
      };

      const hasPreviewSteps =
        stepsSnapshot && typeof stepsSnapshot.length === 'number' && stepsSnapshot.length > 0;
      const shouldSendPreview =
        hasPreviewSteps && (lastPreviewStep === 0 || step - lastPreviewStep >= previewStepStride);

      if (shouldSendPreview) {
        const stepsView =
          stepsSnapshot instanceof Uint16Array ? stepsSnapshot : Uint16Array.from(stepsSnapshot);
        payload.data.steps = stepsView;
        payload.data.size = opts.size;
        lastPreviewStep = step;

        if (!sentPins && pins) {
          payload.data.pins = pins;
          sentPins = true;
        }

        // Transferable buffer ile daha hızlı aktarım
        self.postMessage(payload, [stepsView.buffer]);
      } else {
        self.postMessage(payload);
      }
    };

    try {
      const res = await runGreedyLoop(
        new Uint8ClampedArray(data.raster),
        data.pins,
        opts,
        onProgress
      );
      if (!canceled) {
        self.postMessage({
          type: 'result',
          data: {
            steps: [0, ...res.steps.map((s) => s.to)],
            residual: res.residual,
            durationMs: res.durationMs,
            pins: res.pins,
            size: res.size,
          },
        });
      }
    } finally {
      flushResolvers();
    }

  } else if (type === 'pause') {
    if (!paused) {
      paused = true;
      reportStatus('paused');
    }

  } else if (type === 'resume') {
    if (paused) {
      paused = false;
      flushResolvers();
      reportStatus('running');
    }

  } else if (type === 'cancel') {
    if (!canceled) {
      canceled = true;
      paused = false;
      flushResolvers();
      reportStatus('canceled');
    }
  }
};
