/**
 * Ken Perlin's Improved Noise (3D) implementation.
 * Used for procedural organic terrain and wave displacement on 3D meshes.
 */

const FADE = (t: number): number => t * t * t * (t * (6 * t - 15) + 10)

const GRAD = (hash: number, x: number, y: number, z: number): number => {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

const PERMUTATION: number[] = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142,
  8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203,
  117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74,
  165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220,
  105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132,
  187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3,
  64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59,
  227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70,
  221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
  178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162,
  241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204,
  176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243,
  141, 128, 195, 78, 66, 215, 61, 156, 180,
]

// Double the table to avoid index overflow wrapping
const P: Uint8Array = new Uint8Array(512)
for (let i = 0; i < 256; i++) {
  P[i] = P[i + 256] = PERMUTATION[i]
}

/**
 * 3D Improved Perlin noise.
 * Returns normalized value in range [0, 1].
 */
export const perlinNoise3D = (x: number, y: number, z: number): number => {
  let xi = Math.floor(x) & 255
  let yi = Math.floor(y) & 255
  let zi = Math.floor(z) & 255

  x -= Math.floor(x)
  y -= Math.floor(y)
  z -= Math.floor(z)

  const u = FADE(x)
  const v = FADE(y)
  const w = FADE(z)

  const a0 = P[xi] + yi
  const aa0 = P[a0] + zi
  const ab0 = P[a0 + 1] + zi
  const b0 = P[xi + 1] + yi
  const ba0 = P[b0] + zi
  const bb0 = P[b0 + 1] + zi

  const g0 = GRAD(P[aa0], x, y, z)
  const g1 = GRAD(P[ba0], x - 1, y, z)
  const x1 = g0 + u * (g1 - g0)

  const g2 = GRAD(P[ab0], x, y - 1, z)
  const g3 = GRAD(P[bb0], x - 1, y - 1, z)
  const x2 = g2 + u * (g3 - g2)

  const y1 = x1 + v * (x2 - x1)

  const g4 = GRAD(P[aa0 + 1], x, y, z - 1)
  const g5 = GRAD(P[ba0 + 1], x - 1, y, z - 1)
  const x3 = g4 + u * (g5 - g4)

  const g6 = GRAD(P[ab0 + 1], x, y - 1, z - 1)
  const g7 = GRAD(P[bb0 + 1], x - 1, y - 1, z - 1)
  const x4 = g6 + u * (g7 - g6)

  const y2 = x3 + v * (x4 - x3)

  const result = y1 + w * (y2 - y1)
  return 0.5 + 0.5 * result
}
