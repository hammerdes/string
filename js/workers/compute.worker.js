import { runGreedyLoop } from '../engine.js';

let paused = false, canceled = false;
const pauseResolvers = [];

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
      maxSteps: data.maxSteps,
      progressThrottle: 0.02,
      waitWhilePaused,
      shouldCancel: () => canceled,
    };
    const onProgress = (step, score, stepsSnapshot) => {
      if (paused || canceled) return;
      self.postMessage({
        type: 'progress',
        data: {
          step,
          max: opts.maxSteps,
          score,
          progress: step / opts.maxSteps,
          steps: stepsSnapshot,
          size: opts.size,
        },
      });
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
