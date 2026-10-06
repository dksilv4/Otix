// TODO: Review this file
import './animated-shader-background.scss'
import { useEffect, useRef, useState } from 'react'
import { Scene, OrthographicCamera, WebGLRenderer, ShaderMaterial, Vector2, PlaneGeometry, Mesh } from 'three'
import { useShaderQuality } from '@/lib/providers/shader-quality'
import {
  type ShaderMode,
  PROFILES,
  QUALITY_PROFILES,
  logFallback,
  clamp,
  resolveQualityTier,
} from '@/lib/shaders/animated-background-config'

interface AnimatedShaderBackgroundProps {
  mode?: ShaderMode
}

const AnimatedShaderBackground = ({ mode = 'idle' }: AnimatedShaderBackgroundProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [useFallback, setUseFallback] = useState(() => {
    // One-time check — runs during first render, not in an effect
    if (typeof window === 'undefined') return true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      logFallback('prefers-reduced-motion is enabled')
      return true
    }
    const probeCanvas = document.createElement('canvas')
    const ctx = (
      probeCanvas.getContext('webgl2', { alpha: true }) ??
      probeCanvas.getContext('webgl', { alpha: true }) ??
      probeCanvas.getContext('experimental-webgl', { alpha: true })
    )
    if (!ctx) {
      logFallback('WebGL is unavailable in this browser/runtime')
      return true
    }
    return false
  })
  const { shaderQuality } = useShaderQuality()

  useEffect(() => {
    const container = containerRef.current
    if (!container || useFallback) return

    const hardwareConcurrency = navigator.hardwareConcurrency ?? 8
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
    const pixelRatio = window.devicePixelRatio || 1
    const viewportArea = window.innerWidth * window.innerHeight

    const probeCanvas = document.createElement('canvas')
    const webgl2Context = probeCanvas.getContext('webgl2', { alpha: true })
    const probeContext = (
      webgl2Context ??
      probeCanvas.getContext('webgl', { alpha: true }) ??
      probeCanvas.getContext('experimental-webgl', { alpha: true })
    ) as WebGL2RenderingContext | WebGLRenderingContext

    const base = PROFILES[mode]
    const autoQualityTier = resolveQualityTier({
      deviceMemory,
      hardwareConcurrency,
      maxTextureSize: probeContext.getParameter(probeContext.MAX_TEXTURE_SIZE) as number,
      pixelRatio,
      viewportArea,
      webgl2: !!webgl2Context,
    })
    const qualityTier = shaderQuality === 'auto' ? autoQualityTier : shaderQuality
    const quality = QUALITY_PROFILES[qualityTier]

    const targetFps = Math.round(base.fps * quality.fpsBoost)
    const frameInterval = 1000 / targetFps
    const resolutionScale = clamp(base.scale * quality.scaleBoost, 0.38, 0.92)
    const streakCount = Math.max(8, Math.round(base.streaks * quality.streakBoost))
    const intensity = base.intensity
    const speed = base.speed
    const shake = base.shake

    const scene = new Scene()
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({
        antialias: quality.antialias,
        alpha: true,
        powerPreference: quality.powerPreference,
      })
    } catch (error) {
      logFallback(error instanceof Error ? error.message : 'Three.js renderer creation failed')
      setTimeout(() => setUseFallback(true), 0)
      return
    }
    renderer.setPixelRatio(clamp(pixelRatio, 1, quality.pixelRatioCap))

    const getSize = () => {
      const width = container.clientWidth || window.innerWidth
      const height = container.clientHeight || window.innerHeight
      return { width, height }
    }

    const { width: w, height: h } = getSize()
    const maxTextureSize = probeContext.getParameter(probeContext.MAX_TEXTURE_SIZE) as number
    const maxDimension = Math.max(1, Math.floor(maxTextureSize / renderer.getPixelRatio()))
    const renderW = Math.min(maxDimension, Math.max(1, Math.floor(w * resolutionScale)))
    const renderH = Math.min(maxDimension, Math.max(1, Math.floor(h * resolutionScale)))

    renderer.setSize(renderW, renderH, false)
    renderer.domElement.style.width = `${w}px`
    renderer.domElement.style.height = `${h}px`
    container.appendChild(renderer.domElement)

    console.info(
      `[AnimatedShaderBackground] ${qualityTier} quality (${shaderQuality === 'auto' ? 'auto' : 'manual'}, ${hardwareConcurrency} cores, ${deviceMemory}GB RAM, DPR ${pixelRatio.toFixed(2)})`,
    )

    const streakCountStr = streakCount.toFixed(1)
    const shakeStr = shake.toFixed(4)
    const intensityStr = intensity.toFixed(2)

    const material = new ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Vector2(renderW, renderH) },
      },
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float iTime;
        uniform vec2 iResolution;

        float rand(vec2 n) {
          return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 ip = floor(p);
          vec2 u = fract(p);
          u = u*u*(3.0-2.0*u);
          float res = mix(
            mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
            mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
          return res * res;
        }

        float fbm(vec2 x) {
          float v = 0.0;
          float a = 0.3;
          vec2 shift = vec2(100.0);
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
          for (int i = 0; i < 2; ++i) {
            v += a * noise(x);
            x = rot * x * 2.0 + shift;
            a *= 0.45;
          }
          return v;
        }

        void main() {
          vec2 shake = vec2(sin(iTime * 1.2) * ${shakeStr}, cos(iTime * 2.1) * ${shakeStr});
          vec2 p = ((gl_FragCoord.xy + shake * iResolution.xy) - iResolution.xy * 0.5) / iResolution.y * mat2(5.7, -3.9, 3.9, 5.7);
          vec2 v;
          vec4 o = vec4(0.0);
          float f = 2.0 + fbm(p + vec2(iTime * 4.6, 0.0)) * 0.42;

          for (float i = 0.0; i < ${streakCountStr}; i++) {
            v = p + cos(i * i + (iTime + p.x * 0.06) * 0.024 + i * vec2(13.0, 11.0)) * 3.2;
            float trailNoise = fbm(v + vec2(iTime * 0.42, i)) * 0.25 * (1.0 - (i / ${streakCountStr}));
            vec4 starColor = vec4(
              0.14 + 0.28 * sin(i * 0.2 + iTime * 0.35),
              0.3 + 0.42 * cos(i * 0.26 + iTime * 0.4),
              0.62 + 0.28 * sin(i * 0.33 + iTime * 0.3),
              1.0
            );
            vec4 current = starColor * exp(sin(i * i + iTime * 0.72)) / length(max(v, vec2(v.x * f * 0.015, v.y * 1.4)));
            float thin = smoothstep(0.0, 1.0, i / ${streakCountStr}) * 0.56;
            o += current * (1.0 + trailNoise * 0.7) * thin;
          }

          o = tanh(pow(o / 95.0, vec4(1.55)));
          gl_FragColor = o * ${intensityStr};
        }
      `,
    })

    const geometry = new PlaneGeometry(2, 2)
    const mesh = new Mesh(geometry, material)
    scene.add(mesh)

    const resizeRenderer = () => {
      const { width, height } = getSize()
      const rw = Math.min(maxDimension, Math.max(1, Math.floor(width * resolutionScale)))
      const rh = Math.min(maxDimension, Math.max(1, Math.floor(height * resolutionScale)))
      renderer.setSize(rw, rh, false)
      renderer.domElement.style.width = `${width}px`
      renderer.domElement.style.height = `${height}px`
      material.uniforms.iResolution.value.set(rw, rh)
    }

    let frameId = 0
    let lastFrameTime = performance.now()
    const resetFrameTime = () => {
      lastFrameTime = performance.now()
    }
    const animate = (now: number) => {
      frameId = window.requestAnimationFrame(animate)
      if (document.hidden) return
      const elapsedMs = now - lastFrameTime
      if (elapsedMs < frameInterval) return
      lastFrameTime = now
      const deltaSeconds = Math.min(elapsedMs / 1000, 0.05)
      material.uniforms.iTime.value += deltaSeconds * speed
      renderer.render(scene, camera)
    }

    window.addEventListener('resize', resizeRenderer)
    document.addEventListener('visibilitychange', resetFrameTime)
    frameId = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resizeRenderer)
      document.removeEventListener('visibilitychange', resetFrameTime)
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [mode, shaderQuality, useFallback])

  return (
    <div ref={containerRef} className="dk-shader-bg__container" aria-hidden="true">
      {useFallback && (
        <div
          aria-hidden="true"
          className="dk-shader-bg__fallback"
          style={{
            background: [
              'radial-gradient(circle at 18% 18%, rgba(99, 123, 255, 0.28), transparent 42%)',
              'radial-gradient(circle at 80% 30%, rgba(62, 224, 181, 0.16), transparent 36%)',
              'radial-gradient(circle at 62% 78%, rgba(255, 120, 92, 0.16), transparent 32%)',
            ].join(', '),
          }}
        />
      )}
    </div>
  )
};

export default AnimatedShaderBackground;
