export class RuntimeMetrics {
  constructor(capacity = 300) {
    this.capacity = Math.max(1, Math.floor(capacity) || 1);
    this.frameTimes = new Float64Array(this.capacity);
    this.nextIndex = 0;
    this.samples = 0;
    this.drawCalls = 0;
    this.geometries = 0;
    this.textures = 0;
  }

  record(frameTimeMs, rendererInfo) {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) return;

    this.frameTimes[this.nextIndex] = frameTimeMs;
    this.nextIndex = (this.nextIndex + 1) % this.capacity;
    this.samples = Math.min(this.capacity, this.samples + 1);
    this.drawCalls = rendererInfo?.render?.calls ?? 0;
    this.geometries = rendererInfo?.memory?.geometries ?? 0;
    this.textures = rendererInfo?.memory?.textures ?? 0;
  }

  snapshot() {
    const sorted = Array.from(this.frameTimes.slice(0, this.samples)).sort((a, b) => a - b);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / (this.samples || 1);
    const percentile = (p) => sorted[Math.max(0, Math.ceil(this.samples * p) - 1)] || 0;

    return {
      samples: this.samples,
      fps: Number((1000 / mean).toFixed(1)),
      frameTimeMs: {
        p50: Number(percentile(0.5).toFixed(2)),
        p95: Number(percentile(0.95).toFixed(2)),
        p99: Number(percentile(0.99).toFixed(2)),
      },
      drawCalls: this.drawCalls,
      geometries: this.geometries,
      textures: this.textures,
    };
  }
}
