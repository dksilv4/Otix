interface LiveFpsSnapshot {
  currentFps: number
  frameCount: number
  captureDurationMs: number
  gameId: string
}

interface FpsStats {
  avgFps: number
  onePercentLow: number
  zeroPointOnePercentLow: number
  maxFps: number
  minFps: number
  totalFrames: number
  captureDurationMs: number
}
