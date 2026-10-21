/** Internal playback policy. Milliseconds except maxPlaybackRate and maxFrames.
 * Keep tuning here; these values are not part of the caller-facing player options.
 */
export const WEBCODECS_LIVE_CONFIG = Object.freeze({
  delayMs: 200, // Startup / rebuffer wait; favor lower live latency.
  targetLatencyMs: 150, // Target behind the received video edge (not capture time).
  maxLatencyMs: 500, // Move the presentation clock forward above this lag.
  maxPlaybackRate: 1.25, // Upper bound for gradual catch-up.
  maxBufferedMs: 400, // Decoded frame queue duration limit.
  maxFrames: 16, // Decoded frame queue count limit.
});

// Preserve the existing startup wait for finite files; live catch-up stays disabled.
export const WEBCODECS_FILE_CONFIG = Object.freeze({
  ...WEBCODECS_LIVE_CONFIG,
  delayMs: 100,
});
