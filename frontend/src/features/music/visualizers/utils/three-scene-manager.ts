import * as THREE from 'three'
import type { AudioFrameData, VisualizerMode, VisualizerSceneTheme, MeshPresetConfig } from '../types'
import { perlin3D } from './perlin-noise'
import { getMeshPreset, MESH_PRESETS } from './visualizer-helpers'
import { getSavedCameraPresetState, saveCameraPresetState } from './playback-persistence'

export interface VisualizerSceneController {
  update: (frame: AudioFrameData, theme: VisualizerSceneTheme, mouseX: number, mouseY: number) => void
  render?: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void
  resize?: (width: number, height: number) => void
  dispose: () => void
}

export class ThreeSceneManager {
  private canvas: HTMLCanvasElement
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private currentMode: VisualizerMode | null = null
  private activeController: VisualizerSceneController | null = null

  // Interactive 3D Orbit Drag & Zoom state
  private isDragging = false
  private lastPointerX = 0
  private lastPointerY = 0
  private orbitTarget = new THREE.Vector3(0, -3.5, 0)
  private currentAzimuth = 0.319
  private currentPolar = 1.306
  private currentRadius = 108.0
  private targetAzimuth = 0.319
  private targetPolar = 1.306
  private targetRadius = 108.0
  private wheelSaveTimeout: any = null

  private saveCurrentPresetCamera() {
    if (!this.currentMode) return
    saveCameraPresetState(this.currentMode, {
      azimuth: this.targetAzimuth,
      polar: this.targetPolar,
      radius: this.targetRadius,
      targetX: this.orbitTarget.x,
      targetY: this.orbitTarget.y,
      targetZ: this.orbitTarget.z,
    })
  }

  private onPointerDown = (e: PointerEvent) => {
    this.isDragging = true
    this.lastPointerX = e.clientX
    this.lastPointerY = e.clientY
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      // Ignore if pointer capture unsupported
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return
    const dx = e.clientX - this.lastPointerX
    const dy = e.clientY - this.lastPointerY
    this.lastPointerX = e.clientX
    this.lastPointerY = e.clientY

    // Full 360 degree unrestricted orbit in all directions
    this.targetAzimuth -= dx * 0.007
    this.targetPolar -= dy * 0.007
  }

  private onPointerUp = (e: PointerEvent) => {
    if (this.isDragging) {
      this.isDragging = false
      this.saveCurrentPresetCamera()
    }
    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId)
      }
    } catch {
      // Ignore
    }
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.targetRadius += e.deltaY * 0.08
    this.targetRadius = Math.max(35, Math.min(250, this.targetRadius))
    clearTimeout(this.wheelSaveTimeout)
    this.wheelSaveTimeout = setTimeout(() => {
      this.saveCurrentPresetCamera()
    }, 350)
  }

  private isDisposed = false

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.canvas = canvas

    // Safeguard WebGL context & patch shader precision format to prevent null pointer crashes on devices without highp fragment float
    try {
      const gl =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')

      if (gl && typeof (gl as any).getShaderPrecisionFormat === 'function') {
        const orig = (gl as any).getShaderPrecisionFormat.bind(gl)
        ;(gl as any).getShaderPrecisionFormat = function (shaderType: number, precisionType: number) {
          const res = orig(shaderType, precisionType)
          if (!res) {
            return { rangeMin: 1, rangeMax: 1, precision: 1 }
          }
          return res
        }
      }
    } catch {
      // Ignore if canvas.getContext is restricted or mocked in tests
    }

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000000)
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    this.camera.position.set(32.68, 23.56, 98.96)
    this.camera.lookAt(this.orbitTarget)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor(0x000000, 1.0)
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 1.5))

    // Attach interactive 3D orbit drag and zoom listeners
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
  }

  public setSize(width: number, height: number) {
    if (this.isDisposed || width <= 0 || height <= 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    if (this.activeController?.resize) {
      this.activeController.resize(width, height)
    }
  }

  public switchMode(mode: VisualizerMode, theme: VisualizerSceneTheme) {
    if (this.isDisposed) return
    if (this.currentMode === mode && this.activeController) return

    // Save current preset's camera position and angle before leaving it
    this.saveCurrentPresetCamera()

    // Clean up current controller
    if (this.activeController) {
      this.activeController.dispose()
      this.activeController = null
    }

    // Clear scene children
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0]
      this.scene.remove(obj)
    }

    this.currentMode = mode

    // Check if this mode is one of our 10 curated mesh grid presets (or starts with wavy-)
    if (mode in MESH_PRESETS || mode.startsWith('wavy-')) {
      const preset = getMeshPreset(mode)
      this.activeController = this.createConfiguredMeshGridScene(preset, theme)
      return
    }

    switch (mode) {
      case 'mesh-tunnel':
        this.activeController = this.createMeshTunnelScene(theme)
        break
      case 'sphere-mesh':
        this.activeController = this.createSphereMeshScene(theme)
        break
      case 'sphere-rings':
        this.activeController = this.createSphereRingsScene(theme)
        break
      case 'city-skyscrapers':
        this.activeController = this.createCitySkyscrapersScene(theme)
        break
      case 'city-horizon':
        this.activeController = this.createCityHorizonScene(theme)
        break
      case 'cosmic':
        this.activeController = this.createCosmicScene(theme)
        break
      case 'cyber':
        this.activeController = this.createCyberScene(theme)
        break
      case 'waves':
        this.activeController = this.createWavesScene(theme)
        break
      case 'radial':
        this.activeController = this.createRadialScene(theme)
        break
      case 'monolith':
        this.activeController = this.createMonolithScene(theme)
        break
      case 'ambient':
        this.activeController = this.createAmbientScene(theme)
        break
      default:
        this.activeController = this.createConfiguredMeshGridScene(getMeshPreset('wavy-19'), theme)
        break
    }
  }

  public render(frame: AudioFrameData, theme: VisualizerSceneTheme, mouseX = 0, mouseY = 0) {
    if (this.isDisposed) return
    if (this.activeController) {
      this.activeController.update(frame, theme, mouseX, mouseY)
    }
    if (this.activeController?.render) {
      this.activeController.render(this.renderer, this.scene, this.camera)
    } else {
      this.renderer.render(this.scene, this.camera)
    }
  }

  // =========================================================================
  // 1. COSMIC GALAXY (3D Particle Galaxy & Pulsing Core)
  // =========================================================================
  private createCosmicScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.camera.position.set(0, 18, 38)
    this.camera.lookAt(0, 0, 0)

    const particleCount = 3800
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const originalPositions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)

    const accentColor = new THREE.Color(theme.primaryHex)
    const surfaceColor = new THREE.Color(theme.surfaceHex)
    const whiteColor = new THREE.Color(0xffffff)

    const arms = 3
    for (let i = 0; i < particleCount; i++) {
      const r = Math.pow(Math.random(), 1.6) * 32
      const armAngle = ((i % arms) * (2 * Math.PI)) / arms
      const spiralAngle = r * 0.35 + armAngle
      const spread = (1 - r / 34) * 3.5

      const x = Math.cos(spiralAngle) * r + (Math.random() - 0.5) * spread
      const y = (Math.random() - 0.5) * (spread * 0.8)
      const z = Math.sin(spiralAngle) * r + (Math.random() - 0.5) * spread

      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z

      originalPositions[i * 3] = x
      originalPositions[i * 3 + 1] = y
      originalPositions[i * 3 + 2] = z

      // Color gradient from center (white/accent) to edge (surface/dim)
      const t = r / 32
      const mixedColor = whiteColor.clone().lerp(accentColor, t * 0.8).lerp(surfaceColor, t * 0.5)
      colors[i * 3] = mixedColor.r
      colors[i * 3 + 1] = mixedColor.g
      colors[i * 3 + 2] = mixedColor.b

      sizes[i] = Math.random() * 2.2 + 0.8
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const galaxyPoints = new THREE.Points(geometry, material)
    this.scene.add(galaxyPoints)

    // Central pulsar sphere
    const coreGeo = new THREE.SphereGeometry(2.2, 32, 32)
    const coreMat = new THREE.MeshBasicMaterial({
      color: theme.primaryHex,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    })
    const coreMesh = new THREE.Mesh(coreGeo, coreMat)
    this.scene.add(coreMesh)

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        const time = frame.position / 1000
        const rotSpeed = frame.isPlaying ? 0.003 + frame.energy * 0.008 : 0.0
        galaxyPoints.rotation.y += rotSpeed

        // Camera parallax
        this.camera.position.x += (mouseX * 8 - this.camera.position.x) * 0.05
        this.camera.position.y += (18 - mouseY * 6 - this.camera.position.y) * 0.05
        this.camera.lookAt(0, 0, 0)

        // Core pulsation with bass
        const coreScale = frame.isPlaying ? 1 + frame.bass * 0.8 + frame.beat * 0.5 : 1.0
        coreMesh.scale.set(coreScale, coreScale, coreScale)
        coreMesh.rotation.y += 0.015
        coreMesh.rotation.z += 0.01

        // Particle displacement
        const posAttr = geometry.attributes.position as THREE.BufferAttribute
        const posArray = posAttr.array as Float32Array
        const bassImpact = frame.isPlaying ? frame.bass * 2.5 + frame.beat * 2.0 : 0

        for (let i = 0; i < particleCount; i += 6) {
          const origY = originalPositions[i * 3 + 1]
          const dist = Math.sqrt(
            originalPositions[i * 3] * originalPositions[i * 3] +
              originalPositions[i * 3 + 2] * originalPositions[i * 3 + 2],
          )
          const wave = frame.isPlaying ? Math.sin(dist * 0.5 - time * 6) * bassImpact : 0
          posArray[i * 3 + 1] = origY + wave
        }
        posAttr.needsUpdate = true
      },
      dispose: () => {
        geometry.dispose()
        material.dispose()
        coreGeo.dispose()
        coreMat.dispose()
      },
    }
  }

  // =========================================================================
  // 2. CYBER HORIZON (3D Synthwave Grid & Pulsing Sun)
  // =========================================================================
  private createCyberScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.camera.position.set(0, 7, 24)
    this.camera.lookAt(0, 4, -40)

    const gridW = 60
    const gridD = 80
    const segW = 48
    const segD = 48

    const terrainGeo = new THREE.PlaneGeometry(gridW, gridD, segW, segD)
    terrainGeo.rotateX(-Math.PI / 2)

    const terrainMat = new THREE.MeshBasicMaterial({
      color: theme.primaryHex,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    })
    const terrain = new THREE.Mesh(terrainGeo, terrainMat)
    terrain.position.set(0, -3, -20)
    this.scene.add(terrain)

    // Horizon Synthwave Sun
    const sunGeo = new THREE.CircleGeometry(10, 32)
    const sunMat = new THREE.MeshBasicMaterial({
      color: theme.primaryHex,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    })
    const sun = new THREE.Mesh(sunGeo, sunMat)
    sun.position.set(0, 8, -55)
    this.scene.add(sun)

    // Horizon Sun Glow Ring
    const sunRingGeo = new THREE.RingGeometry(10.5, 12, 32)
    const sunRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    })
    const sunRing = new THREE.Mesh(sunRingGeo, sunRingMat)
    sunRing.position.set(0, 8, -55)
    this.scene.add(sunRing)

    const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute
    const origPositions = Float32Array.from(posAttr.array)

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        const time = frame.position / 1000
        const tempoScale = frame.tempo || 1.0
        const speed = frame.isPlaying ? (0.22 + frame.energy * 0.28) * tempoScale : 0.0

        // Sun scale on bass
        const sunScale = frame.isPlaying ? 1 + frame.bass * 0.45 + frame.beat * 0.3 : 1.0
        sun.scale.set(sunScale, sunScale, 1)
        sunRing.scale.set(sunScale, sunScale, 1)
        sunRing.rotation.z += frame.isPlaying ? 0.005 : 0.0

        // Undulating mountain waves with FFT bins
        const posArray = posAttr.array as Float32Array
        const numVerts = posArray.length / 3

        for (let i = 0; i < numVerts; i++) {
          const origX = origPositions[i * 3]
          const origZ = origPositions[i * 3 + 2]
          const distFromCenter = Math.abs(origX) / (gridW * 0.5)

          // Mountains rise towards the edges, road remains in center
          const binIdx = Math.min(127, Math.floor(distFromCenter * 64))
          const binVal = (frame.frequencyData[binIdx] || 0) / 255

          const wave = frame.isPlaying ? Math.sin(origZ * 0.25 - time * speed * 8) * (distFromCenter * 4.5 * binVal + frame.bass * 1.5) : 0
          posArray[i * 3 + 1] = origPositions[i * 3 + 1] + (distFromCenter > 0.2 ? wave : wave * 0.25)
        }
        posAttr.needsUpdate = true

        // Parallax
        this.camera.position.x += (mouseX * 5 - this.camera.position.x) * 0.05
        this.camera.position.y += (7 - mouseY * 3 - this.camera.position.y) * 0.05
      },
      dispose: () => {
        terrainGeo.dispose()
        terrainMat.dispose()
        sunGeo.dispose()
        sunMat.dispose()
        sunRingGeo.dispose()
        sunRingMat.dispose()
      },
    }
  }

  // =========================================================================
  // 3. HARMONIC WAVES (2D/3D Liquid Ribbons & Oscilloscopes)
  // =========================================================================
  private createWavesScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.camera.position.set(0, 0, 32)
    this.camera.lookAt(0, 0, 0)

    const ribbonCount = 5
    const pointsPerRibbon = 120
    const ribbons: Array<{ line: THREE.Line; geometry: THREE.BufferGeometry; mat: THREE.LineBasicMaterial; phase: number }> = []

    const accentColor = new THREE.Color(theme.primaryHex)
    const whiteColor = new THREE.Color(0xffffff)

    for (let r = 0; r < ribbonCount; r++) {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(pointsPerRibbon * 3)

      for (let i = 0; i < pointsPerRibbon; i++) {
        const x = (i / (pointsPerRibbon - 1) - 0.5) * 55
        positions[i * 3] = x
        positions[i * 3 + 1] = 0
        positions[i * 3 + 2] = (r - (ribbonCount - 1) / 2) * 2.8
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      const t = r / (ribbonCount - 1)
      const color = accentColor.clone().lerp(whiteColor, t * 0.6)

      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8 - r * 0.1,
        linewidth: 2,
      })

      const line = new THREE.Line(geometry, mat)
      this.scene.add(line)
      ribbons.push({ line, geometry, mat, phase: r * 0.7 })
    }

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        const time = frame.position / 1000

        ribbons.forEach(({ geometry, phase }, r) => {
          const posAttr = geometry.attributes.position as THREE.BufferAttribute
          const posArray = posAttr.array as Float32Array

          for (let i = 0; i < pointsPerRibbon; i++) {
            const normX = i / (pointsPerRibbon - 1)
            const waveIdx = Math.min(127, Math.floor(normX * 128))
            const waveVal = ((frame.waveformData[waveIdx] || 128) - 128) / 128

            const freqIdx = Math.min(127, Math.floor(normX * 64))
            const freqVal = (frame.frequencyData[freqIdx] || 0) / 255

            const envelope = Math.sin(normX * Math.PI) // Taper ends
            const y = frame.isPlaying
              ? Math.sin(normX * 12 + time * 5 + phase) * (frame.bass * 4.5 + 0.8) * envelope +
                waveVal * (frame.energy * 7 + 1.5) * envelope +
                freqVal * 2.5 * envelope
              : 0

            posArray[i * 3 + 1] = y
          }
          posAttr.needsUpdate = true
        })

        // Parallax
        this.camera.position.x += (mouseX * 4 - this.camera.position.x) * 0.05
        this.camera.position.y += (-mouseY * 4 - this.camera.position.y) * 0.05
      },
      dispose: () => {
        ribbons.forEach(({ geometry, mat }) => {
          geometry.dispose()
          mat.dispose()
        })
      },
    }
  }

  // =========================================================================
  // 4. RADIAL LOTUS (2D Kaleidoscopic Circular Spectrum & Burst Rings)
  // =========================================================================
  private createRadialScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.camera.position.set(0, 0, 32)
    this.camera.lookAt(0, 0, 0)

    const barCount = 72
    const barsGroup = new THREE.Group()
    const barMeshes: THREE.Mesh[] = []

    const barGeo = new THREE.PlaneGeometry(0.35, 1)
    barGeo.translate(0, 0.5, 0) // Anchor at bottom

    const accentColor = new THREE.Color(theme.primaryHex)
    const whiteColor = new THREE.Color(0xffffff)

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2
      const t = Math.abs(Math.sin(angle * 2))
      const mat = new THREE.MeshBasicMaterial({
        color: accentColor.clone().lerp(whiteColor, t * 0.4),
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      })

      const mesh = new THREE.Mesh(barGeo, mat)
      mesh.rotation.z = angle - Math.PI / 2
      barsGroup.add(mesh)
      barMeshes.push(mesh)
    }

    this.scene.add(barsGroup)

    // Inner Pulsing Vinyl Core
    const innerRingGeo = new THREE.RingGeometry(5.8, 6.2, 64)
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: theme.primaryHex,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    })
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat)
    this.scene.add(innerRing)

    // Outer Orbiting Star Ring
    const starCount = 300
    const starGeo = new THREE.BufferGeometry()
    const starPositions = new Float32Array(starCount * 3)

    for (let i = 0; i < starCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const rad = 10 + Math.random() * 8
      starPositions[i * 3] = Math.cos(angle) * rad
      starPositions[i * 3 + 1] = Math.sin(angle) * rad
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 4
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMat = new THREE.PointsMaterial({
      size: 1.2,
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    })
    const starRing = new THREE.Points(starGeo, starMat)
    this.scene.add(starRing)

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        const baseRadius = 6.4 + frame.bass * 2.2 + frame.beat * 1.5

        // Rotate spectrum
        barsGroup.rotation.z += frame.isPlaying ? 0.004 + frame.energy * 0.008 : 0.001
        starRing.rotation.z -= 0.003

        innerRing.scale.set(baseRadius / 6.4, baseRadius / 6.4, 1)

        barMeshes.forEach((mesh, i) => {
          const binIdx = Math.min(127, Math.floor((i / barCount) * 100))
          const freqVal = (frame.frequencyData[binIdx] || 0) / 255
          const barHeight = Math.max(0.4, freqVal * 9.5 * (frame.energy * 0.8 + 0.5))

          const angle = (i / barCount) * Math.PI * 2 + barsGroup.rotation.z
          mesh.position.set(Math.cos(angle) * baseRadius, Math.sin(angle) * baseRadius, 0)
          mesh.rotation.z = angle - Math.PI / 2
          mesh.scale.set(1, barHeight, 1)
        })

        // Parallax
        this.camera.position.x += (mouseX * 4 - this.camera.position.x) * 0.05
        this.camera.position.y += (-mouseY * 4 - this.camera.position.y) * 0.05
      },
      dispose: () => {
        barGeo.dispose()
        barMeshes.forEach((m) => (m.material as THREE.Material).dispose())
        innerRingGeo.dispose()
        innerRingMat.dispose()
        starGeo.dispose()
        starMat.dispose()
      },
    }
  }

  // =========================================================================
  // 5. MONOLITH HORIZON (3D Architectural Pillars & Neon Caps)
  // =========================================================================
  private createMonolithScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.camera.position.set(0, 8, 30)
    this.camera.lookAt(0, 4, 0)

    const pillarCount = 42
    const pillarGroup = new THREE.Group()
    const pillars: Array<{ mesh: THREE.Mesh; cap: THREE.Mesh; origY: number; binIdx: number }> = []
    const monolithMaterials: THREE.Material[] = []

    const columnGeo = new THREE.BoxGeometry(0.85, 1, 0.85)
    columnGeo.translate(0, 0.5, 0)
    const capGeo = new THREE.BoxGeometry(0.9, 0.15, 0.9)

    const accentColor = new THREE.Color(theme.primaryHex)
    const surfaceColor = new THREE.Color(theme.surfaceHex)

    const radius = 24
    for (let i = 0; i < pillarCount; i++) {
      const angle = (i / (pillarCount - 1) - 0.5) * (Math.PI * 0.85)
      const x = Math.sin(angle) * radius
      const z = Math.cos(angle) * radius - 16

      const colMat = new THREE.MeshBasicMaterial({
        color: surfaceColor,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      })
      const mesh = new THREE.Mesh(columnGeo, colMat)
      mesh.position.set(x, 0, z)

      const capMat = new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.9,
      })
      const cap = new THREE.Mesh(capGeo, capMat)
      cap.position.set(x, 1, z)

      monolithMaterials.push(colMat, capMat)

      pillarGroup.add(mesh)
      pillarGroup.add(cap)

      pillars.push({
        mesh,
        cap,
        origY: 0,
        binIdx: Math.min(127, Math.floor((i / pillarCount) * 110)),
      })
    }
    this.scene.add(pillarGroup)

    // Dark Reflective Ground Plane
    const floorGeo = new THREE.PlaneGeometry(80, 80)
    floorGeo.rotateX(-Math.PI / 2)
    const floorMat = new THREE.MeshBasicMaterial({
      color: theme.backgroundHex,
      transparent: true,
      opacity: 0.8,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.position.set(0, -0.05, 0)
    this.scene.add(floor)

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        pillars.forEach(({ mesh, cap, binIdx }) => {
          const freqVal = (frame.frequencyData[binIdx] || 0) / 255
          const height = Math.max(0.4, freqVal * 14 * (frame.energy + 0.4) + frame.bass * 2.0)

          mesh.scale.set(1, height, 1)
          cap.position.y = height + 0.08
        })

        // Parallax
        this.camera.position.x += (mouseX * 7 - this.camera.position.x) * 0.05
        this.camera.position.y += (8 - mouseY * 4 - this.camera.position.y) * 0.05
        this.camera.lookAt(0, 3, 0)
      },
      dispose: () => {
        columnGeo.dispose()
        capGeo.dispose()
        floorGeo.dispose()
        floorMat.dispose()
        monolithMaterials.forEach((m) => m.dispose())
        this.scene.remove(pillarGroup)
        this.scene.remove(floor)
      },
    }
  }

  // =========================================================================
  // 6. AMBIENT AURORA (Minimalist 3D Light Orbs)
  // =========================================================================
  private createAmbientScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.camera.position.set(0, 0, 26)
    this.camera.lookAt(0, 0, 0)

    const orbCount = 12
    const orbs: Array<{ mesh: THREE.Mesh; geo: THREE.SphereGeometry; mat: THREE.MeshBasicMaterial; speed: number; rad: number; phase: number }> = []

    const accentColor = new THREE.Color(theme.primaryHex)
    const whiteColor = new THREE.Color(0xffffff)

    for (let i = 0; i < orbCount; i++) {
      const geo = new THREE.SphereGeometry(1.4 + Math.random() * 2.2, 24, 24)
      const t = Math.random()
      const mat = new THREE.MeshBasicMaterial({
        color: accentColor.clone().lerp(whiteColor, t * 0.4),
        wireframe: true,
        transparent: true,
        opacity: 0.55 + Math.random() * 0.3,
      })
      const mesh = new THREE.Mesh(geo, mat)
      this.scene.add(mesh)

      orbs.push({
        mesh,
        geo,
        mat,
        speed: 0.4 + Math.random() * 0.6,
        rad: 6 + Math.random() * 12,
        phase: Math.random() * Math.PI * 2,
      })
    }

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        const time = frame.position / 1000

        orbs.forEach(({ mesh, speed, rad, phase }, idx) => {
          const theta = time * speed * 0.5 + phase
          const x = Math.cos(theta) * rad
          const y = Math.sin(theta * 1.3) * (rad * 0.6)
          const z = Math.sin(theta * 0.7) * 8

          mesh.position.set(x, y, z)
          mesh.rotation.y += 0.008
          mesh.rotation.x += 0.005

          const pulse = 1 + frame.bass * 0.4 * ((idx % 3 === 0) ? 1.5 : 0.6)
          mesh.scale.set(pulse, pulse, pulse)
        })

        // Parallax
        this.camera.position.x += (mouseX * 5 - this.camera.position.x) * 0.05
        this.camera.position.y += (-mouseY * 4 - this.camera.position.y) * 0.05
      },
      dispose: () => {
        orbs.forEach(({ geo, mat }) => {
          geo.dispose()
          mat.dispose()
        })
      },
    }
  }

  // =========================================================================
  // COSMIC STARFIELD HELPER: Soft, antialiased, twinkling circular stars
  // =========================================================================
  private createCosmicStarfield(starCount = 550) {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(starCount * 3)
    const sizes = new Float32Array(starCount)
    const twinkles = new Float32Array(starCount)

    for (let s = 0; s < starCount; s++) {
      const theta = (Math.random() - 0.5) * Math.PI * 1.8
      const phi = 0.05 + Math.random() * (Math.PI * 0.45)
      const r = 240 + Math.random() * 100

      positions[s * 3] = r * Math.sin(theta) * Math.cos(phi)
      positions[s * 3 + 1] = r * Math.sin(phi) + 8
      positions[s * 3 + 2] = -r * Math.cos(theta) * Math.cos(phi)

      sizes[s] = 1.0 + Math.random() * 2.2
      twinkles[s] = Math.random()
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1))

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uPixelRatio: { value: typeof window !== 'undefined' ? window.devicePixelRatio : 1.0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aTwinkle;
        uniform float uPixelRatio;
        varying float vTwinkle;

        void main() {
          vTwinkle = aTwinkle;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (280.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        varying float vTwinkle;

        void main() {
          vec2 pc = gl_PointCoord - vec2(0.5);
          float dist = length(pc);
          if (dist > 0.5) discard;

          float intensity = smoothstep(0.5, 0.04, dist);
          float twinkle = sin(uTime * 2.2 + vTwinkle * 6.28318) * 0.35 + 0.65;
          float brightness = intensity * twinkle * (1.0 + uBass * 0.6);

          gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * brightness, brightness * 0.9);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const mesh = new THREE.Points(geo, mat)
    this.scene.add(mesh)

    return {
      update: (time: number, bass: number) => {
        mat.uniforms.uTime.value = time
        mat.uniforms.uBass.value = bass
      },
      dispose: () => {
        this.scene.remove(mesh)
        geo.dispose()
        mat.dispose()
      },
    }
  }

  // =========================================================================
  // 6. MESH GRID VARIANT #1 (Curved Planetary Horizon Dome with Center Audio Fountain)
  // Matching user's exact preset from vizz.fm: config-1741367309222-608
  // =========================================================================
  private createWavy1Scene(theme: VisualizerSceneTheme): VisualizerSceneController {
    // Exact camera coordinates from vizz.fm config-1741367309222-608
    this.camera.fov = 75
    this.camera.position.set(0.044185, 17.332439, 69.005592)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()

    const gridDim = 177
    const halfDim = (gridDim - 1) / 2
    const maxRadius = gridDim / 2
    const numVerts = gridDim * gridDim

    const geometry = new THREE.PlaneGeometry(gridDim, gridDim, gridDim - 1, gridDim - 1)
    geometry.rotateX(-Math.PI / 2)

    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    const posArray = posAttr.array as Float32Array
    const planarPosArray = new Float32Array(numVerts * 2)
    const frequencyArray = new Float32Array(numVerts)
    const distNormArray = new Float32Array(numVerts)
    const thetaArray = new Float32Array(numVerts)
    const domeCurvatureArray = new Float32Array(numVerts)
    const radialBinArray = new Uint8Array(numVerts)
    const angleBinArray = new Uint8Array(numVerts)
    const lowWeightArray = new Float32Array(numVerts)
    const midWeightArray = new Float32Array(numVerts)
    const highWeightArray = new Float32Array(numVerts)

    for (let i = 0; i < numVerts; i++) {
      const l = i % gridDim
      const c = Math.floor(i / gridDim)
      const d = l - halfDim
      const m = c - halfDim
      const distNorm = Math.min(1.0, Math.sqrt(d * d + m * m) / maxRadius)
      const theta = Math.atan2(m, d)
      const normAngle = (theta + Math.PI) / (2 * Math.PI)

      distNormArray[i] = distNorm
      thetaArray[i] = theta
      domeCurvatureArray[i] = (1.0 - distNorm * distNorm * 1.5) * 2.0
      radialBinArray[i] = Math.min(127, Math.floor(distNorm * 115))
      angleBinArray[i] = Math.min(127, Math.floor(normAngle * 127))
      lowWeightArray[i] = Math.max(0, 1.0 - distNorm / 0.35)
      midWeightArray[i] = Math.sin(Math.min(1.0, Math.max(0.0, (distNorm - 0.22) / 0.50)) * Math.PI)
      highWeightArray[i] = Math.min(1.0, Math.max(0.0, (distNorm - 0.60) / 0.38))

      planarPosArray[i * 2] = posArray[i * 3]
      planarPosArray[i * 2 + 1] = posArray[i * 3 + 2]
      frequencyArray[i] = 0
    }

    geometry.setAttribute('planarPos', new THREE.BufferAttribute(planarPosArray, 2))
    geometry.setAttribute('frequency', new THREE.BufferAttribute(frequencyArray, 1))

    // Mesh Grid Wireframe Shader matching vizz.fm with album palette lighting
    const wireframeMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        gridHalf: { value: maxRadius },
        colorLow: { value: new THREE.Color(theme.primaryHex) },
        colorHigh: { value: new THREE.Color(0x38bdf8) },
        hasCustomColor: { value: theme.hasCustomPalette ? 1.0 : 0.0 },
      },
      vertexShader: `
        attribute float frequency;
        attribute vec2 planarPos;
        varying vec2 vPlanar;
        varying float vFrequency;

        void main() {
          vPlanar = planarPos;
          vFrequency = frequency;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float gridHalf;
        uniform vec3 colorLow;
        uniform vec3 colorHigh;
        uniform float hasCustomColor;
        varying vec2 vPlanar;
        varying float vFrequency;

        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
          // Circular boundary discard: circular planet dome
          float nx = vPlanar.x / gridHalf;
          float nz = vPlanar.y / gridHalf;
          if (nx * nx + nz * nz > 1.0) discard;

          float cf = clamp(vFrequency, 0.0, 1.0);
          float angle = atan(nz, nx);
          float angleWheel = fract(angle / 6.2831853 + 0.5);
          vec3 color;

          if (hasCustomColor > 0.5) {
            // Dual-tone spatial gradient: left sector has primary, right sector has secondary
            vec3 spatialWheel = mix(colorLow, colorHigh, angleWheel);
            vec3 peakWhite = vec3(0.95, 0.98, 1.0);
            color = mix(spatialWheel, peakWhite, cf * 0.85);

            if (cf > 0.35) {
              color += vec3(0.35, 0.45, 0.55) * (cf - 0.35) * 1.8;
            }
          } else {
            // Default Cosmic Horizon: electric indigo-purple on left -> radiant cyan on right
            float angleHue = mix(0.73, 0.50, angleWheel);
            float hue = mix(angleHue, 0.50, cf * 0.7);
            float saturation = mix(0.92, 0.82, cf);
            float value = mix(0.70, 1.0, cf);

            color = hsv2rgb(vec3(hue, saturation, value));

            if (cf > 0.35) {
              color = mix(color, vec3(1.0, 1.0, 1.0), (cf - 0.35) * 1.3);
            }
          }

          gl_FragColor = vec4(color, 0.95);
        }
      `,
      wireframe: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })

    const wireframeMesh = new THREE.Mesh(geometry, wireframeMat)
    this.scene.add(wireframeMesh)

    // Deep space background stars (soft, round twinkling celestial stars)
    const starfield = this.createCosmicStarfield(600)

    let clockTime = 0
    let wavePhase = 0

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        const isLive = frame.isPlaying
        const freqData = frame.frequencyData
        const dt = 0.016
        clockTime += dt

        // Ripple flow rate is dynamically calibrated to the song's BPM/tempo
        // Slow songs (e.g. 70 BPM, tempo ~0.58) flow gently (~0.9 rad/s)
        // Normal songs (120 BPM, tempo = 1.0) flow naturally (~1.6 rad/s)
        // Upbeat songs (150 BPM, tempo = 1.25) flow briskly (~2.0 rad/s)
        const tempoScale = frame.tempo || 1.0
        const flowRate = isLive ? 1.6 * tempoScale : 0.0
        wavePhase += dt * flowRate

        wireframeMat.uniforms.time.value = clockTime
        starfield.update(clockTime, isLive ? frame.bass : 0)

        // Dynamically apply album artwork colors when available
        if (curTheme) {
          wireframeMat.uniforms.hasCustomColor.value = curTheme.hasCustomPalette ? 1.0 : 0.0
          if (curTheme.hasCustomPalette) {
            wireframeMat.uniforms.colorLow.value.setRGB(
              curTheme.accentRgb.r / 255,
              curTheme.accentRgb.g / 255,
              curTheme.accentRgb.b / 255
            )
            const sec = curTheme.secondaryRgb || curTheme.surfaceRgb
            wireframeMat.uniforms.colorHigh.value.setRGB(
              Math.min(1.0, (sec.r + 40) / 255),
              Math.min(1.0, (sec.g + 60) / 255),
              Math.min(1.0, (sec.b + 80) / 255)
            )
          }
        }

        // Frequency band acoustic energy breakdown (Lows, Mids, Highs)
        let lowSum = 0
        for (let b = 0; b < 6; b++) lowSum += (freqData[b] || 0) / 255.0
        const lowEnergy = lowSum / 6.0

        let midSum = 0
        for (let b = 6; b < 36; b++) midSum += (freqData[b] || 0) / 255.0
        const midEnergy = midSum / 30.0

        let highSum = 0
        for (let b = 36; b < 128; b++) highSum += (freqData[b] || 0) / 255.0
        const highEnergy = highSum / 92.0

        const tempoSurge = (frame.tempoPulse || 0) * 0.35

        for (let i = 0; i < numVerts; i++) {
          const distNorm = distNormArray[i]
          const theta = thetaArray[i]
          const domeCurvature = domeCurvatureArray[i]

          if (isLive) {
            const radialFreq = (freqData[radialBinArray[i]] || 0) * 0.00392156862
            const angleFreq = (freqData[angleBinArray[i]] || 0) * 0.00392156862
            const localHz = radialFreq * 0.7 + angleFreq * 0.3

            const lowSpike = lowWeightArray[i] * (lowEnergy * 2.0 + (freqData[0] || 0) * 0.00392156862 * 1.2) * (1.0 + tempoSurge * 0.5)
            const midSpike = midWeightArray[i] * (midEnergy * 1.8 + radialFreq * 1.2) * (1.0 + Math.sin(theta * 4.0 + wavePhase) * 0.25)
            const highSpike = highWeightArray[i] * (highEnergy * 1.6 + angleFreq * 1.2) * Math.sin(theta * 8.0 - wavePhase * 1.4)
            const ripple = Math.sin(distNorm * 20.0 - wavePhase) * (frame.energy * 0.8 + 0.2) * (1.0 - distNorm * 0.25)

            posArray[i * 3 + 1] = domeCurvature + lowSpike + midSpike + highSpike + ripple + localHz * 0.85
            frequencyArray[i] = Math.min(1.0, Math.max(0.0,
              localHz * 0.6 + lowSpike * 0.25 + midSpike * 0.35 + highSpike * 0.35 + Math.abs(ripple) * 0.25
            ))
          } else {
            posArray[i * 3 + 1] = domeCurvature
            frequencyArray[i] = 0.0
          }
        }

        posAttr.needsUpdate = true
        ;(geometry.attributes.frequency as THREE.BufferAttribute).needsUpdate = true

        // Smooth subtle mouse parallax
        const targetCamX = 0.044185 + mouseX * 4.0
        const targetCamY = 17.332439 - mouseY * 2.5
        this.camera.position.x += (targetCamX - this.camera.position.x) * 0.05
        this.camera.position.y += (targetCamY - this.camera.position.y) * 0.05
        this.camera.lookAt(0, 0, 0)
      },

      dispose: () => {
        this.scene.remove(wireframeMesh)
        starfield.dispose()
        geometry.dispose()
        wireframeMat.dispose()
      },
    }
  }

  // =========================================================================
  // 7. MESH GRID VARIANT #14 (Spiral Galaxy Wireframe Disk in Deep Space)
  // =========================================================================
  private createWavy14Scene(theme: VisualizerSceneTheme): VisualizerSceneController {
    return this.createMeshGridGalaxyScene(14, theme)
  }

  // =========================================================================
  // 8. MESH GRID VARIANT #15 (Emerald Radar Galaxy with Glowing Surface & Dots)
  // =========================================================================
  private createWavy15Scene(theme: VisualizerSceneTheme): VisualizerSceneController {
    return this.createMeshGridGalaxyScene(15, theme)
  }

  private createMeshGridGalaxyScene(variant: 14 | 15, theme: VisualizerSceneTheme): VisualizerSceneController {
    this.camera.fov = 75
    this.camera.updateProjectionMatrix()

    const initialCamPos = new THREE.Vector3(32.68, 28.0, 98.96)
    const initialTarget = new THREE.Vector3(0, -3.5, 0)

    this.orbitTarget.copy(initialTarget)
    this.camera.position.copy(initialCamPos)
    this.camera.lookAt(initialTarget)

    const gridDim = 177
    const halfDim = (gridDim - 1) / 2
    const maxRadius = gridDim / 2
    const numVerts = gridDim * gridDim

    const geometry = new THREE.PlaneGeometry(gridDim, gridDim, gridDim - 1, gridDim - 1)
    geometry.rotateX(-Math.PI / 2)

    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    const posArray = posAttr.array as Float32Array
    const planarPosArray = new Float32Array(numVerts * 2)
    const frequencyArray = new Float32Array(numVerts)
    const smoothedHeights = new Float32Array(numVerts)

    for (let i = 0; i < numVerts; i++) {
      planarPosArray[i * 2] = posArray[i * 3]
      planarPosArray[i * 2 + 1] = posArray[i * 3 + 2]
      frequencyArray[i] = 0
      smoothedHeights[i] = 0
    }

    geometry.setAttribute('planarPos', new THREE.BufferAttribute(planarPosArray, 2))
    geometry.setAttribute('frequency', new THREE.BufferAttribute(frequencyArray, 1))

    // 36 discrete, individual 3D mountain peaks arranged in an organic sunflower spiral
    const NUM_PEAKS = 36
    const peakCenters: Array<{ x: number; z: number; bin: number; limit: number; invSigmaSq2: number }> = []
    const goldenAngle = 2.39996323

    for (let k = 0; k < NUM_PEAKS; k++) {
      const r = maxRadius * Math.sqrt((k + 0.8) / NUM_PEAKS) * 0.92
      const theta = k * goldenAngle
      const x = r * Math.cos(theta)
      const z = r * Math.sin(theta)
      const bin = Math.min(127, Math.round(Math.pow(k / (NUM_PEAKS - 1), 1.2) * 56))
      const sigma = 8.5 - (r / maxRadius) * 2.0
      const limit = sigma * 2.6
      peakCenters.push({
        x,
        z,
        bin,
        limit,
        invSigmaSq2: 1.0 / (2.0 * sigma * sigma),
      })
    }

    const MESH_GRID_VS = `
      attribute float frequency;
      attribute vec2 planarPos;
      varying vec2 vPlanar;
      varying float vFrequency;

      void main() {
        vPlanar = planarPos;
        vFrequency = frequency;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `

    const MESH_GRID_FS = `
      uniform float gridHalf;
      uniform vec3 colorLow;
      uniform vec3 colorHigh;
      varying vec2 vPlanar;
      varying float vFrequency;

      void main() {
        float nx = vPlanar.x / gridHalf;
        float nz = vPlanar.y / gridHalf;
        if (nx * nx + nz * nz > 1.0) discard;

        // Clean, stable, seamless two-tone gradient across the disc:
        // Left half (nx < 0) is colorLow (album primary accent)
        // Right half (nx > 0) is colorHigh (album secondary / edge)
        float t = clamp(nx * 0.5 + 0.5, 0.0, 1.0);
        vec3 baseColor = mix(colorLow, colorHigh, smoothstep(0.0, 1.0, t));

        // Base brightness: clearly visible, sharp, elegant at rest (0.68)
        // Peak brightness: scales smoothly up to 1.0 full vibrancy without exceeding 1.0 (no white clipping)
        float cf = clamp(vFrequency, 0.0, 1.0);
        float brightness = mix(0.68, 1.0, cf);
        vec3 color = baseColor * brightness;

        // Peak opacity: slightly more opaque on peaks (0.85 -> 1.0)
        float alpha = mix(0.85, 1.0, cf);

        gl_FragColor = vec4(color, alpha);
      }
    `

    const initialLow = theme.hasCustomPalette
      ? (theme.gradientLowRgb || theme.accentRgb)
      : { r: 217, g: 70, b: 239 }
    const initialHigh = theme.hasCustomPalette
      ? (theme.gradientHighRgb || theme.secondaryRgb || { r: 6, g: 182, b: 212 })
      : { r: 6, g: 182, b: 212 }

    const wireframeMat = new THREE.ShaderMaterial({
      uniforms: {
        gridHalf: { value: maxRadius },
        colorLow: { value: new THREE.Color(initialLow.r / 255, initialLow.g / 255, initialLow.b / 255) },
        colorHigh: { value: new THREE.Color(initialHigh.r / 255, initialHigh.g / 255, initialHigh.b / 255) },
      },
      vertexShader: MESH_GRID_VS,
      fragmentShader: MESH_GRID_FS,
      wireframe: true,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    })
    const wireframeMesh = new THREE.Mesh(geometry, wireframeMat)
    this.scene.add(wireframeMesh)

    // Variant 15: Glowing radar dots
    let dotsMesh: THREE.Points | null = null
    let dotsGeo: THREE.BufferGeometry | null = null
    let dotsMat: THREE.PointsMaterial | null = null

    if (variant === 15) {
      dotsGeo = geometry.clone()
      dotsMat = new THREE.PointsMaterial({
        size: 1.6,
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      })
      dotsMesh = new THREE.Points(dotsGeo, dotsMat)
      this.scene.add(dotsMesh)
    }

    // Space starfield
    const starfield = this.createCosmicStarfield(500)

    let clockTime = 0
    let wavePhase = 0

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        const isLive = frame.isPlaying
        const freqData = frame.frequencyData
        const dt = 0.016
        clockTime += dt

        const tempoScale = frame.tempo || 1.0
        const flowRate = isLive ? 1.5 * tempoScale : 0.0
        wavePhase += dt * flowRate

        starfield.update(clockTime, isLive ? frame.bass : 0)

        // Dynamically apply clean album colors: Left = primary, Right = secondary/cyan
        if (curTheme) {
          const low = curTheme.hasCustomPalette
            ? (curTheme.gradientLowRgb || curTheme.accentRgb)
            : { r: 217, g: 70, b: 239 }
          const high = curTheme.hasCustomPalette
            ? (curTheme.gradientHighRgb || curTheme.secondaryRgb || { r: 6, g: 182, b: 212 })
            : { r: 6, g: 182, b: 212 }

          wireframeMat.uniforms.colorLow.value.setRGB(low.r / 255, low.g / 255, low.b / 255)
          wireframeMat.uniforms.colorHigh.value.setRGB(high.r / 255, high.g / 255, high.b / 255)
        }

        // Base energy levels for celestial harmonic flow
        let lowSum = 0
        for (let b = 0; b <= 8; b++) lowSum += (freqData[b] || 0) / 255.0
        const eu = lowSum / 9.0

        let midSum = 0
        for (let b = 9; b <= 60; b++) midSum += (freqData[b] || 0) / 255.0
        const ec = midSum / 52.0

        // Precompute height for each of the 36 individual peaks based on its assigned frequency bin
        const peakHeights = new Float32Array(NUM_PEAKS)
        for (let k = 0; k < NUM_PEAKS; k++) {
          const b = peakCenters[k].bin
          const rawAmp = (freqData[b] || 0) / 255.0
          // High contrast power curve: active frequencies rise into prominent, isolated mountain summits
          peakHeights[k] = Math.pow(rawAmp, 1.35) * 16.0
        }

        for (let i = 0; i < numVerts; i++) {
          const l = i % gridDim
          const c = Math.floor(i / gridDim)
          const d = l - halfDim
          const m = c - halfDim
          const distNorm = Math.min(1.0, Math.sqrt(d * d + m * m) / maxRadius)
          const theta = Math.atan2(m, d)

          // Balanced 3D saucer curvature (subtle and elegant round plane)
          const dishBend = -9.0 * (1.0 - distNorm * distNorm)

          if (isLive) {
            // Subtle ocean wave motion underneath (ambient fluid movement)
            const ambientWave = (
              Math.sin(6.0 * distNorm - clockTime * 2.0) * eu * 0.45 +
              Math.sin(3.0 * theta + clockTime * 1.5) * ec * 0.35 +
              Math.sin(12.0 * distNorm - clockTime * 2.5) * eu * 0.25
            ) * 0.9

            // Accumulate individual isolated mountain summits
            let mountainHeight = 0
            let maxSummitExcitation = 0

            for (let k = 0; k < NUM_PEAKS; k++) {
              const p = peakCenters[k]
              const dx = d - p.x
              if (dx > p.limit || dx < -p.limit) continue
              const dz = m - p.z
              if (dz > p.limit || dz < -p.limit) continue

              const distSq = dx * dx + dz * dz
              const falloff = Math.exp(-distSq * p.invSigmaSq2)
              const h = peakHeights[k] * falloff

              if (h > mountainHeight) {
                mountainHeight = h
              } else {
                mountainHeight += h * 0.3
              }

              const excitation = falloff * Math.min(1.0, peakHeights[k] / 10.0)
              if (excitation > maxSummitExcitation) {
                maxSummitExcitation = excitation
              }
            }

            const targetHeight = ambientWave + mountainHeight

            // Transition smoothing: smooth for small changes, responsive and snappy for big changes
            const currentH = smoothedHeights[i]
            const diff = targetHeight - currentH
            const absDiff = Math.abs(diff)
            const changeIntensity = Math.min(1.0, Math.max(0.0, (absDiff - 0.25) / 1.75))
            const lerpRate = 0.14 + changeIntensity * 0.64
            smoothedHeights[i] = currentH + diff * lerpRate

            posArray[i * 3 + 1] = dishBend + smoothedHeights[i]

            // Shader frequency excitation reflects actual peak height (summit vs valley)
            frequencyArray[i] = Math.min(1.0, Math.max(0.0, maxSummitExcitation * 0.85 + (smoothedHeights[i] / 14.0) * 0.4))
          } else {
            smoothedHeights[i] = 0
            posArray[i * 3 + 1] = dishBend
            frequencyArray[i] = 0.0
          }
        }

        posAttr.needsUpdate = true
        ;(geometry.attributes.frequency as THREE.BufferAttribute).needsUpdate = true

        if (dotsGeo) {
          const dotsPosAttr = dotsGeo.attributes.position as THREE.BufferAttribute
          ;(dotsPosAttr.array as Float32Array).set(posArray)
          dotsPosAttr.needsUpdate = true
        }

        // Smooth spherical camera orbit interpolation from user dragging / wheel (full 360 in all directions)
        this.currentAzimuth += (this.targetAzimuth - this.currentAzimuth) * 0.12
        this.currentPolar += (this.targetPolar - this.currentPolar) * 0.12
        this.currentRadius += (this.targetRadius - this.currentRadius) * 0.1

        const p = this.currentPolar
        const a = this.currentAzimuth
        const r = this.currentRadius

        // Dynamic camera up orientation ensures seamless tumbling across the poles
        const isUpperHemisphere = Math.sin(p) >= 0
        this.camera.up.set(0, isUpperHemisphere ? 1 : -1, 0)

        const parallaxX = this.isDragging ? 0 : mouseX * 2.0
        const parallaxY = this.isDragging ? 0 : mouseY * 1.5

        const cx = this.orbitTarget.x + r * Math.sin(p) * Math.sin(a) + parallaxX
        const cy = this.orbitTarget.y + r * Math.cos(p) - parallaxY
        const cz = this.orbitTarget.z + r * Math.sin(p) * Math.cos(a)

        this.camera.position.set(cx, cy, cz)
        this.camera.lookAt(this.orbitTarget)
      },

      dispose: () => {
        this.scene.remove(wireframeMesh)
        starfield.dispose()
        if (dotsMesh) this.scene.remove(dotsMesh)

        geometry.dispose()
        wireframeMat.dispose()
        if (dotsGeo) dotsGeo.dispose()
        if (dotsMat) dotsMat.dispose()
      },
    }
  }

  // =========================================================================
  // 9. CONFIGURABLE VIZZ.FM 3D MESH GRID SCENE (10 DISTINCT MESH PRESETS)
  // =========================================================================
  private createConfiguredMeshGridScene(preset: MeshPresetConfig, theme: VisualizerSceneTheme): VisualizerSceneController {
    this.camera.fov = 75
    this.camera.updateProjectionMatrix()

    // For upward-curving amphitheater (meshBend > 0), adjust initial camera angle
    const isAmphitheater = preset.meshBend > 0
    const initialTarget = isAmphitheater
      ? new THREE.Vector3(0, -5.0, 0)
      : new THREE.Vector3(-0.745, -12.276, -2.66)
    const initialCamPos = isAmphitheater
      ? new THREE.Vector3(-65.0, 42.0, -55.0)
      : new THREE.Vector3(-77.042, 50.518, -46.974)

    this.orbitTarget.copy(initialTarget)
    this.currentAzimuth = isAmphitheater ? -1.8 : -2.1
    this.targetAzimuth = this.currentAzimuth
    this.currentPolar = isAmphitheater ? 1.05 : 0.952
    this.targetPolar = this.currentPolar
    this.currentRadius = 108.3
    this.targetRadius = 108.3

    // Restore saved per-preset camera angle & position if user previously moved camera
    const savedCam = getSavedCameraPresetState(preset.id)
    if (savedCam) {
      this.currentAzimuth = savedCam.azimuth
      this.targetAzimuth = savedCam.azimuth
      this.currentPolar = savedCam.polar
      this.targetPolar = savedCam.polar
      this.currentRadius = savedCam.radius
      this.targetRadius = savedCam.radius
      if (savedCam.targetX !== undefined) this.orbitTarget.x = savedCam.targetX
      if (savedCam.targetY !== undefined) this.orbitTarget.y = savedCam.targetY
      if (savedCam.targetZ !== undefined) this.orbitTarget.z = savedCam.targetZ
    }

    this.camera.position.copy(initialCamPos)
    this.camera.lookAt(this.orbitTarget)

    const gridDim = 160
    const halfDim = (gridDim - 1) / 2
    const maxRadius = gridDim / 2
    const numVerts = gridDim * gridDim

    const geometry = new THREE.PlaneGeometry(gridDim, gridDim, gridDim - 1, gridDim - 1)
    geometry.rotateX(-Math.PI / 2)

    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    const posArray = posAttr.array as Float32Array
    const planarPosArray = new Float32Array(numVerts * 2)
    const frequencyArray = new Float32Array(numVerts)
    const smoothedHeights = new Float32Array(numVerts)

    const dArray = new Float32Array(numVerts)
    const mArray = new Float32Array(numVerts)
    const distNormArray = new Float32Array(numVerts)
    const thetaArray = new Float32Array(numVerts)
    const saucerBendArray = new Float32Array(numVerts)

    for (let i = 0; i < numVerts; i++) {
      const l = i % gridDim
      const c = Math.floor(i / gridDim)
      const d = l - halfDim
      const m = c - halfDim
      const distNorm = Math.min(1.0, Math.sqrt(d * d + m * m) / maxRadius)
      const theta = Math.atan2(m, d)
      const saucerBend = preset.meshBend * (1.0 - distNorm * distNorm)

      dArray[i] = d
      mArray[i] = m
      distNormArray[i] = distNorm
      thetaArray[i] = theta
      saucerBendArray[i] = saucerBend

      planarPosArray[i * 2] = posArray[i * 3]
      planarPosArray[i * 2 + 1] = posArray[i * 3 + 2]
      frequencyArray[i] = 0
      smoothedHeights[i] = 0
    }

    geometry.setAttribute('planarPos', new THREE.BufferAttribute(planarPosArray, 2))
    geometry.setAttribute('frequency', new THREE.BufferAttribute(frequencyArray, 1))

    // Optional golden-angle mountain summits (used in Mountain Summits & Sunflower Peaks)
    const NUM_PEAKS = 36
    const peakCenters: Array<{ x: number; z: number; bin: number; limit: number; invSigmaSq2: number }> = []
    if (preset.hasPeaks) {
      const goldenAngle = 2.39996323
      for (let k = 0; k < NUM_PEAKS; k++) {
        const r = maxRadius * Math.sqrt((k + 0.8) / NUM_PEAKS) * 0.92
        const theta = k * goldenAngle
        const x = r * Math.cos(theta)
        const z = r * Math.sin(theta)
        const bin = Math.min(127, Math.round(Math.pow(k / (NUM_PEAKS - 1), 1.2) * 56))
        const sigma = 8.5 - (r / maxRadius) * 2.0
        const limit = sigma * 2.6
        peakCenters.push({
          x,
          z,
          bin,
          limit,
          invSigmaSq2: 1.0 / (2.0 * sigma * sigma),
        })
      }
    }

    // Mesh Grid Wireframe & Surface Shaders
    const MESH_GRID_VS = `
      attribute float frequency;
      attribute vec2 planarPos;
      varying vec3 vPosition;
      varying vec2 vPlanar;
      varying float vFrequency;

      void main() {
        vPosition = position;
        vPlanar = planarPos;
        vFrequency = frequency;
        vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewPosition;
      }
    `

    const MESH_GRID_FS = `
      uniform vec3 baseColor;
      uniform vec3 colorLow;
      uniform vec3 colorMid;
      uniform vec3 colorHigh;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec3 uColor4;
      uniform vec3 uColor5;
      uniform float albumHue;
      uniform float albumSat;
      uniform float albumVal;
      uniform float time;
      uniform float colorIntensity;
      uniform float colorReactivity;
      uniform float circleMode;
      uniform float gridHalf;
      uniform float angleHueMix;
      uniform float surfaceOpacity;
      uniform float surfaceShade;
      uniform float fillReactivity;

      varying vec3 vPosition;
      varying vec2 vPlanar;
      varying float vFrequency;

      vec3 sample5Color(float t) {
        float ct = clamp(t, 0.0, 1.0);
        if (ct < 0.25) {
          return mix(uColor1, uColor2, ct * 4.0);
        } else if (ct < 0.50) {
          return mix(uColor2, uColor3, (ct - 0.25) * 4.0);
        } else if (ct < 0.75) {
          return mix(uColor3, uColor4, (ct - 0.50) * 4.0);
        } else {
          return mix(uColor4, uColor5, (ct - 0.75) * 4.0);
        }
      }

      void main() {
        if (circleMode > 0.5) {
          float dist = length(vPlanar) / gridHalf;
          if (dist > 1.0) discard;
        }

        float cf = clamp(vFrequency * colorReactivity, 0.0, 1.0);
        float dist = length(vPlanar) / gridHalf;
        float t = clamp(cf * 0.80 + (1.0 - dist) * 0.20, 0.0, 1.0);
        vec3 color = sample5Color(t);

        if (angleHueMix > 0.0) {
          vec2 dir = length(vPlanar) > 0.001 ? normalize(vPlanar) : vec2(1.0, 0.0);
          float subtleSheen = 1.0 + (dir.x * 0.07 + dir.y * 0.04) * angleHueMix;
          color *= subtleSheen;
        }

        color = clamp(color * min(1.0, colorIntensity * 0.50), 0.0, 1.0);
        float alpha = surfaceOpacity * mix(1.0, vFrequency, fillReactivity);
        gl_FragColor = vec4(color * surfaceShade, alpha);
      }
    `

    // Vertex Dots Shaders
    const DOTS_VS = `
      attribute float frequency;
      attribute vec2 planarPos;
      uniform float dotSize;
      uniform float dotReactivity;
      uniform float uPixelRatio;
      uniform float sizeMul;
      varying vec2 vPlanar;
      varying float vFrequency;

      void main() {
        vPlanar = planarPos;
        vFrequency = frequency;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float amp = mix(1.0, mix(0.15, 1.0, frequency), dotReactivity);
        float base = 0.7 + 0.2 * dotSize;
        gl_PointSize = base * sizeMul * amp * uPixelRatio * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `

    const DOTS_FS = `
      uniform vec3 baseColor;
      uniform vec3 colorLow;
      uniform vec3 colorMid;
      uniform vec3 colorHigh;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec3 uColor4;
      uniform vec3 uColor5;
      uniform float albumHue;
      uniform float albumSat;
      uniform float albumVal;
      uniform float time;
      uniform float colorIntensity;
      uniform float colorReactivity;
      uniform float circleMode;
      uniform float gridHalf;
      uniform float angleHueMix;
      uniform float dotSize;
      uniform float dotReactivity;

      varying vec2 vPlanar;
      varying float vFrequency;

      vec3 sample5Color(float t) {
        float ct = clamp(t, 0.0, 1.0);
        if (ct < 0.25) {
          return mix(uColor1, uColor2, ct * 4.0);
        } else if (ct < 0.50) {
          return mix(uColor2, uColor3, (ct - 0.25) * 4.0);
        } else if (ct < 0.75) {
          return mix(uColor3, uColor4, (ct - 0.50) * 4.0);
        } else {
          return mix(uColor4, uColor5, (ct - 0.75) * 4.0);
        }
      }

      void main() {
        if (circleMode > 0.5) {
          float dist = length(vPlanar) / gridHalf;
          if (dist > 1.0) discard;
        }

        vec2 pc = gl_PointCoord - 0.5;
        float r2 = dot(pc, pc);
        if (r2 > 0.25) discard;
        float edge = smoothstep(0.25, 0.16, r2);

        float cf = clamp(vFrequency * colorReactivity, 0.0, 1.0);
        float dist = length(vPlanar) / gridHalf;
        float t = clamp(cf * 0.85 + (1.0 - dist) * 0.15, 0.0, 1.0);
        vec3 color = sample5Color(t);

        if (angleHueMix > 0.0) {
          vec2 dir = length(vPlanar) > 0.001 ? normalize(vPlanar) : vec2(1.0, 0.0);
          color *= 1.0 + dir.x * 0.06 * angleHueMix;
        }

        color = clamp(color * min(0.95, colorIntensity * 0.50), 0.0, 1.0);
        float fadeIn = clamp(dotSize * 3.0, 0.0, 1.0);
        float alpha = mix(0.5, clamp(0.1 + vFrequency * 1.0, 0.0, 0.95), dotReactivity);
        gl_FragColor = vec4(color, alpha * edge * fadeIn);
      }
    `

    const GLOW_DOTS_FS = `
      uniform vec3 baseColor;
      uniform vec3 colorLow;
      uniform vec3 colorMid;
      uniform vec3 colorHigh;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec3 uColor4;
      uniform vec3 uColor5;
      uniform float albumHue;
      uniform float albumSat;
      uniform float albumVal;
      uniform float time;
      uniform float colorIntensity;
      uniform float colorReactivity;
      uniform float circleMode;
      uniform float gridHalf;
      uniform float angleHueMix;
      uniform float dotSize;
      uniform float dotReactivity;
      uniform float dotGlow;

      varying vec2 vPlanar;
      varying float vFrequency;

      vec3 sample5Color(float t) {
        float ct = clamp(t, 0.0, 1.0);
        if (ct < 0.25) {
          return mix(uColor1, uColor2, ct * 4.0);
        } else if (ct < 0.50) {
          return mix(uColor2, uColor3, (ct - 0.25) * 4.0);
        } else if (ct < 0.75) {
          return mix(uColor3, uColor4, (ct - 0.50) * 4.0);
        } else {
          return mix(uColor4, uColor5, (ct - 0.75) * 4.0);
        }
      }

      void main() {
        if (circleMode > 0.5) {
          float dist = length(vPlanar) / gridHalf;
          if (dist > 1.0) discard;
        }

        vec2 pc = gl_PointCoord - 0.5;
        float r2 = dot(pc, pc);
        if (r2 > 0.25) discard;
        float falloff = exp(-r2 * 18.0);

        float cf = clamp(vFrequency * colorReactivity, 0.0, 1.0);
        float dist = length(vPlanar) / gridHalf;
        float t = clamp(cf * 0.85 + (1.0 - dist) * 0.15, 0.0, 1.0);
        vec3 color = sample5Color(t);

        if (angleHueMix > 0.0) {
          vec2 dir = length(vPlanar) > 0.001 ? normalize(vPlanar) : vec2(1.0, 0.0);
          color *= 1.0 + dir.x * 0.06 * angleHueMix;
        }

        color = clamp(color * min(0.95, colorIntensity * 0.50), 0.0, 1.0);
        float fadeIn = clamp(dotSize * 3.0, 0.0, 1.0);
        float alpha = mix(0.4, clamp(0.1 + vFrequency * 1.0, 0.0, 0.85), dotReactivity) * dotGlow;
        gl_FragColor = vec4(color, alpha * falloff * fadeIn * 0.75);
      }
    `

    const initialLow = theme.hasCustomPalette
      ? (theme.gradientLowRgb || theme.accentRgb)
      : { r: 217, g: 70, b: 239 }
    const initialMid = theme.hasCustomPalette
      ? (theme.gradientMidRgb || theme.accentRgb)
      : { r: 59, g: 130, b: 246 }
    const initialHigh = theme.hasCustomPalette
      ? (theme.gradientHighRgb || theme.secondaryRgb || { r: 6, g: 182, b: 212 })
      : { r: 6, g: 182, b: 212 }
    const initialColor = theme.hasCustomPalette
      ? (theme.secondaryRgb || theme.gradientHighRgb || { r: 6, g: 182, b: 212 })
      : { r: 6, g: 182, b: 212 }

    const c1 = theme.colorRgbs?.[0] || { r: 217, g: 70, b: 239 }
    const c2 = theme.colorRgbs?.[1] || { r: 59, g: 130, b: 246 }
    const c3 = theme.colorRgbs?.[2] || { r: 6, g: 182, b: 212 }
    const c4 = theme.colorRgbs?.[3] || { r: 245, g: 158, b: 11 }
    const c5 = theme.colorRgbs?.[4] || { r: 16, g: 185, b: 129 }

    const uColor1Obj = new THREE.Color(c1.r / 255, c1.g / 255, c1.b / 255)
    const uColor2Obj = new THREE.Color(c2.r / 255, c2.g / 255, c2.b / 255)
    const uColor3Obj = new THREE.Color(c3.r / 255, c3.g / 255, c3.b / 255)
    const uColor4Obj = new THREE.Color(c4.r / 255, c4.g / 255, c4.b / 255)
    const uColor5Obj = new THREE.Color(c5.r / 255, c5.g / 255, c5.b / 255)

    const baseColorObj = new THREE.Color(initialColor.r / 255, initialColor.g / 255, initialColor.b / 255)
    const colorLowObj = new THREE.Color(initialLow.r / 255, initialLow.g / 255, initialLow.b / 255)
    const colorMidObj = new THREE.Color(initialMid.r / 255, initialMid.g / 255, initialMid.b / 255)
    const colorHighObj = new THREE.Color(initialHigh.r / 255, initialHigh.g / 255, initialHigh.b / 255)
    const initialHue = theme.albumHue ?? 0.78
    const initialSat = theme.albumSat ?? 0.92
    const initialVal = theme.albumVal ?? 0.85

    // 1. Wireframe grid layer
    const wireframeMat = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: baseColorObj },
        colorLow: { value: colorLowObj },
        colorMid: { value: colorMidObj },
        colorHigh: { value: colorHighObj },
        uColor1: { value: uColor1Obj },
        uColor2: { value: uColor2Obj },
        uColor3: { value: uColor3Obj },
        uColor4: { value: uColor4Obj },
        uColor5: { value: uColor5Obj },
        albumHue: { value: initialHue },
        albumSat: { value: initialSat },
        albumVal: { value: initialVal },
        time: { value: 0 },
        colorIntensity: { value: preset.colorIntensity },
        colorReactivity: { value: 1.0 },
        circleMode: { value: 1.0 },
        gridHalf: { value: maxRadius },
        angleHueMix: { value: preset.angleHueMix },
        surfaceOpacity: { value: 1.0 },
        surfaceShade: { value: 1.0 },
        fillReactivity: { value: 0.0 },
      },
      vertexShader: MESH_GRID_VS,
      fragmentShader: MESH_GRID_FS,
      wireframe: true,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: true,
      depthTest: true,
    })
    const wireframeMesh = new THREE.Mesh(geometry, wireframeMat)
    wireframeMesh.renderOrder = 1
    wireframeMesh.visible = preset.lineReactivity > 0
    this.scene.add(wireframeMesh)

    // 2. Translucent facet surface fill layer
    const fillMat = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: baseColorObj },
        colorLow: { value: colorLowObj },
        colorMid: { value: colorMidObj },
        colorHigh: { value: colorHighObj },
        uColor1: { value: uColor1Obj },
        uColor2: { value: uColor2Obj },
        uColor3: { value: uColor3Obj },
        uColor4: { value: uColor4Obj },
        uColor5: { value: uColor5Obj },
        albumHue: { value: initialHue },
        albumSat: { value: initialSat },
        albumVal: { value: initialVal },
        time: { value: 0 },
        colorIntensity: { value: preset.colorIntensity },
        colorReactivity: { value: 1.0 },
        circleMode: { value: 1.0 },
        gridHalf: { value: maxRadius },
        angleHueMix: { value: preset.angleHueMix },
        surfaceOpacity: { value: preset.fillOpacity },
        surfaceShade: { value: 0.55 },
        fillReactivity: { value: preset.fillReactivity },
      },
      vertexShader: MESH_GRID_VS,
      fragmentShader: MESH_GRID_FS,
      wireframe: false,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    const fillMesh = new THREE.Mesh(geometry, fillMat)
    fillMesh.renderOrder = 0
    fillMesh.visible = preset.fillOpacity > 0.001
    this.scene.add(fillMesh)

    // 3. Audio-reactive core dots
    const dotsMat = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: baseColorObj },
        colorLow: { value: colorLowObj },
        colorMid: { value: colorMidObj },
        colorHigh: { value: colorHighObj },
        uColor1: { value: uColor1Obj },
        uColor2: { value: uColor2Obj },
        uColor3: { value: uColor3Obj },
        uColor4: { value: uColor4Obj },
        uColor5: { value: uColor5Obj },
        albumHue: { value: initialHue },
        albumSat: { value: initialSat },
        albumVal: { value: initialVal },
        time: { value: 0 },
        colorIntensity: { value: preset.colorIntensity },
        colorReactivity: { value: 1.0 },
        circleMode: { value: 1.0 },
        gridHalf: { value: maxRadius },
        angleHueMix: { value: preset.angleHueMix },
        dotSize: { value: preset.dotSize },
        dotReactivity: { value: preset.dotReactivity },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        sizeMul: { value: 1.0 },
      },
      vertexShader: DOTS_VS,
      fragmentShader: DOTS_FS,
      transparent: true,
      depthWrite: false,
    })
    const dotsMesh = new THREE.Points(geometry, dotsMat)
    dotsMesh.renderOrder = 2
    dotsMesh.visible = preset.dotSize > 0.001
    this.scene.add(dotsMesh)

    // 4. Glow halo dots layer
    const glowDotsMat = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: baseColorObj },
        colorLow: { value: colorLowObj },
        colorMid: { value: colorMidObj },
        colorHigh: { value: colorHighObj },
        uColor1: { value: uColor1Obj },
        uColor2: { value: uColor2Obj },
        uColor3: { value: uColor3Obj },
        uColor4: { value: uColor4Obj },
        uColor5: { value: uColor5Obj },
        albumHue: { value: initialHue },
        albumSat: { value: initialSat },
        albumVal: { value: initialVal },
        time: { value: 0 },
        colorIntensity: { value: preset.colorIntensity },
        colorReactivity: { value: 1.0 },
        circleMode: { value: 1.0 },
        gridHalf: { value: maxRadius },
        angleHueMix: { value: preset.angleHueMix },
        dotSize: { value: preset.dotSize },
        dotReactivity: { value: preset.dotReactivity },
        dotGlow: { value: preset.dotGlow },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        sizeMul: { value: 3.5 },
      },
      vertexShader: DOTS_VS,
      fragmentShader: GLOW_DOTS_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const glowDotsMesh = new THREE.Points(geometry, glowDotsMat)
    glowDotsMesh.renderOrder = 3
    glowDotsMesh.visible = preset.dotSize > 0.001 && preset.dotGlow > 0.001
    this.scene.add(glowDotsMesh)

    // Space starfield
    const starfield = this.createCosmicStarfield(550)

    let clockTime = 0
    let wavePhase = 0
    let prevEnergy = 0
    let smoothedFlux = 0

    // High-resolution ping-pong render targets with 4x MSAA antialiasing
    const pr = this.renderer.getPixelRatio()
    const initialWidth = Math.round(Math.max(300, (this.canvas.clientWidth || window.innerWidth || 1920)) * pr)
    const initialHeight = Math.round(Math.max(300, (this.canvas.clientHeight || window.innerHeight || 1080)) * pr)
    let renderTargetA: THREE.WebGLRenderTarget | null = null
    let renderTargetB: THREE.WebGLRenderTarget | null = null

    if (preset.feedbackEnabled) {
      try {
        renderTargetA = new THREE.WebGLRenderTarget(initialWidth, initialHeight, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          samples: 4,
        })
        renderTargetB = new THREE.WebGLRenderTarget(initialWidth, initialHeight, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          samples: 4,
        })
      } catch {
        // Fallback to direct canvas rendering
      }
    }

    const feedbackScene = new THREE.Scene()
    const feedbackCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const feedbackGeo = new THREE.PlaneGeometry(2, 2)
    const feedbackMat = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tPrev: { value: null },
        decay: { value: preset.feedbackDecay },
        zoom: { value: preset.feedbackZoom },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tCurrent;
        uniform sampler2D tPrev;
        uniform float decay;
        uniform float zoom;
        varying vec2 vUv;
        void main() {
          vec2 center = vec2(0.5);
          vec2 uvZoomed = (vUv - center) / zoom + center;
          vec4 cur = texture2D(tCurrent, vUv);
          vec4 prev = vec4(0.0);
          if (uvZoomed.x >= 0.0 && uvZoomed.x <= 1.0 && uvZoomed.y >= 0.0 && uvZoomed.y <= 1.0) {
            prev = texture2D(tPrev, uvZoomed) * decay;
          }
          gl_FragColor = cur + prev * 0.78;
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const feedbackMesh = new THREE.Mesh(feedbackGeo, feedbackMat)
    feedbackScene.add(feedbackMesh)

    const peakHeights = new Float32Array(NUM_PEAKS)

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        const isLive = frame.isPlaying
        const freqData = frame.frequencyData
        const dt = 0.016
        clockTime += dt * preset.waveSpeed

        const tempoScale = frame.tempo || 1.0
        const flowRate = isLive ? 0.8 * tempoScale : 0.0
        wavePhase += dt * flowRate

        starfield.update(clockTime, isLive ? frame.bass : 0)

        // Compute transient flux (onset spike)
        let currentEnergy = 0
        const sampleCount = Math.min(64, freqData.length)
        for (let b = 0; b < sampleCount; b++) {
          currentEnergy += (freqData[b] || 0) / 255
        }
        currentEnergy /= sampleCount
        const rawFlux = Math.max(0, currentEnergy - prevEnergy)
        prevEnergy = currentEnergy
        if (rawFlux > smoothedFlux) {
          smoothedFlux = rawFlux
        } else {
          smoothedFlux *= 0.88
        }

        const fluxBoost = smoothedFlux * 2.8
        const dynamicNoiseIntensity = (1.35 + fluxBoost) * (isLive ? 1.0 : 0.2)
        const dynamicRadialMix = Math.max(0.1, 0.25 - smoothedFlux * 0.15)

        // Precompute peak heights for mountain summit presets
        if (preset.hasPeaks && isLive) {
          for (let k = 0; k < NUM_PEAKS; k++) {
            const b = peakCenters[k].bin
            const rawAmp = (freqData[b] || 0) * 0.00392156862
            peakHeights[k] = Math.pow(rawAmp, 1.35) * (preset.waveHeight * 5.5)
          }
        }

        // Update color and time uniforms dynamically from album cover palette
        if (curTheme) {
          if (curTheme.colorRgbs) {
            const [cr1, cr2, cr3, cr4, cr5] = curTheme.colorRgbs
            uColor1Obj.setRGB(cr1.r / 255, cr1.g / 255, cr1.b / 255)
            uColor2Obj.setRGB(cr2.r / 255, cr2.g / 255, cr2.b / 255)
            uColor3Obj.setRGB(cr3.r / 255, cr3.g / 255, cr3.b / 255)
            uColor4Obj.setRGB(cr4.r / 255, cr4.g / 255, cr4.b / 255)
            uColor5Obj.setRGB(cr5.r / 255, cr5.g / 255, cr5.b / 255)
          }
          const low = curTheme.gradientLowRgb || { r: 217, g: 70, b: 239 }
          const mid = curTheme.gradientMidRgb || { r: 59, g: 130, b: 246 }
          const high = curTheme.gradientHighRgb || { r: 6, g: 182, b: 212 }
          const col = curTheme.hasCustomPalette
            ? (curTheme.secondaryRgb || curTheme.gradientHighRgb || { r: 6, g: 182, b: 212 })
            : { r: 6, g: 182, b: 212 }

          baseColorObj.setRGB(col.r / 255, col.g / 255, col.b / 255)
          colorLowObj.setRGB(low.r / 255, low.g / 255, low.b / 255)
          colorMidObj.setRGB(mid.r / 255, mid.g / 255, mid.b / 255)
          colorHighObj.setRGB(high.r / 255, high.g / 255, high.b / 255)

          const hVal = curTheme.albumHue ?? 0.78
          const sVal = curTheme.albumSat ?? 0.92
          const vVal = curTheme.albumVal ?? 0.85

          wireframeMat.uniforms.albumHue.value = hVal
          wireframeMat.uniforms.albumSat.value = sVal
          wireframeMat.uniforms.albumVal.value = vVal

          fillMat.uniforms.albumHue.value = hVal
          fillMat.uniforms.albumSat.value = sVal
          fillMat.uniforms.albumVal.value = vVal

          dotsMat.uniforms.albumHue.value = hVal
          dotsMat.uniforms.albumSat.value = sVal
          dotsMat.uniforms.albumVal.value = vVal

          glowDotsMat.uniforms.albumHue.value = hVal
          glowDotsMat.uniforms.albumSat.value = sVal
          glowDotsMat.uniforms.albumVal.value = vVal
        }

        wireframeMat.uniforms.time.value = clockTime
        fillMat.uniforms.time.value = clockTime
        dotsMat.uniforms.time.value = clockTime
        glowDotsMat.uniforms.time.value = clockTime

        const pixelRatio = this.renderer.getPixelRatio()
        dotsMat.uniforms.uPixelRatio.value = pixelRatio
        glowDotsMat.uniforms.uPixelRatio.value = pixelRatio

        // Smooth continuous frequency interpolation defined once outside loop
        const sampleFreq = (norm: number, maxBins = 85): number => {
          const targetIdx = Math.max(0, Math.min(maxBins - 1, norm * (maxBins - 1)))
          const i0 = Math.floor(targetIdx)
          const i1 = Math.min(maxBins - 1, i0 + 1)
          const frac = targetIdx - i0
          const a0 = (freqData[i0] || 0) * 0.00392156862
          const a1 = (freqData[i1] || 0) * 0.00392156862
          return a0 * (1 - frac) + a1 * frac
        }

        const turns = Math.round(preset.spiralTurns)
        const hasSpiral = turns !== 0
        const isSpiral2 = preset.id === 'wavy-spiral-2'

        for (let i = 0; i < numVerts; i++) {
          const d = dArray[i]
          const m = mArray[i]
          const distNorm = distNormArray[i]
          const theta = thetaArray[i]
          const saucerBend = saucerBendArray[i]

          if (isLive) {
            const radialFreq = sampleFreq(distNorm, 85)
            let compositeAmp = radialFreq
            let spiralWave = 0

            if (hasSpiral) {
              if (isSpiral2) {
                const helixPhase = turns * theta - distNorm * 22.0 + clockTime * 3.2
                const counterHelix = Math.sin(2.0 * theta + distNorm * 10.0 - clockTime * 2.0)
                spiralWave = (Math.sin(helixPhase) * 1.35 + counterHelix * 0.45) * (0.8 + frame.energy * 0.9) * (1.0 + preset.flowMix)
                const helixFold = Math.abs(Math.cos(turns * theta * 0.5))
                const helixCoord = Math.min(1.0, distNorm * 0.6 + helixFold * 0.4)
                compositeAmp = radialFreq * 0.5 + sampleFreq(helixCoord, 85) * 0.5
              } else {
                const spiralPhase = turns * theta - distNorm * 10.0 + clockTime * 1.6
                spiralWave = Math.cos(spiralPhase) * (1.35 * (1.0 - distNorm * 0.25)) * (frame.energy * 0.75 + 0.35) * (1.0 + preset.flowMix)
                const spiralFold = Math.abs(Math.sin(turns * theta * 0.5))
                const spiralCoord = Math.min(1.0, distNorm * 0.7 + spiralFold * 0.3)
                compositeAmp = radialFreq * 0.55 + sampleFreq(spiralCoord, 85) * 0.45
              }
            }

            // Procedural 3D Perlin flowing noise
            const noiseVal = preset.perlinNoiseIntensity > 0
              ? perlin3D(d * 0.045, m * 0.045, clockTime * preset.perlinNoiseSpeed)
              : 0
            const noiseDisplacement = noiseVal * dynamicNoiseIntensity * (preset.perlinNoiseIntensity * 1.6)

            // Harmonic concentric undulation
            const rippleRing = Math.sin(distNorm * 16.0 - clockTime * 2.2) * (frame.energy * 0.6 + 0.15) * (1.0 - distNorm * 0.3)
            const harmonicWave = (
              Math.sin(4.0 * theta + clockTime * 1.4) * 0.35 * (1.0 - distNorm) +
              rippleRing * 0.7 * dynamicRadialMix +
              Math.sin(6.0 * theta - clockTime * 1.6) * 0.25 * frame.bass
            ) * (1.0 + preset.flowMix)

            const audioLift = Math.pow(compositeAmp, 1.25) * (preset.waveHeight * 12.5) * (1.0 - distNorm * 0.42)

            // Accumulate mountain peaks for summit presets
            let mountainHeight = 0
            if (preset.hasPeaks) {
              for (let k = 0; k < NUM_PEAKS; k++) {
                const p = peakCenters[k]
                const dx = d - p.x
                if (dx > p.limit || dx < -p.limit) continue
                const dz = m - p.z
                if (dz > p.limit || dz < -p.limit) continue

                const distSq = dx * dx + dz * dz
                const falloff = Math.exp(-distSq * p.invSigmaSq2)
                const h = peakHeights[k] * falloff
                if (h > mountainHeight) mountainHeight = h
                else mountainHeight += h * 0.25
              }
            }

            const targetHeight = audioLift + noiseDisplacement + harmonicWave + spiralWave + mountainHeight
            const curH = smoothedHeights[i]
            smoothedHeights[i] = curH + (targetHeight - curH) * 0.22

            posArray[i * 3 + 1] = saucerBend + smoothedHeights[i]
            frequencyArray[i] = Math.min(1.0, Math.max(0.0, compositeAmp * 0.85 + (smoothedHeights[i] / 16.0) * 0.35))
          } else {
            smoothedHeights[i] = 0
            posArray[i * 3 + 1] = saucerBend
            frequencyArray[i] = 0.0
          }
        }

        posAttr.needsUpdate = true
        ;(geometry.attributes.frequency as THREE.BufferAttribute).needsUpdate = true

        // Continuous cinematic camera orbit
        this.targetAzimuth += preset.cameraRotationSpeed

        // Smooth camera orbit
        this.currentAzimuth += (this.targetAzimuth - this.currentAzimuth) * 0.12
        this.currentPolar += (this.targetPolar - this.currentPolar) * 0.12
        this.currentRadius += (this.targetRadius - this.currentRadius) * 0.1

        const p = this.currentPolar
        const a = this.currentAzimuth
        const r = this.currentRadius

        const isUpperHemisphere = Math.sin(p) >= 0
        this.camera.up.set(0, isUpperHemisphere ? 1 : -1, 0)

        const parallaxX = this.isDragging ? 0 : mouseX * 2.0
        const parallaxY = this.isDragging ? 0 : mouseY * 1.5

        const cx = this.orbitTarget.x + r * Math.sin(p) * Math.sin(a) + parallaxX
        const cy = this.orbitTarget.y + r * Math.cos(p) - parallaxY
        const cz = this.orbitTarget.z + r * Math.sin(p) * Math.cos(a)

        this.camera.position.set(cx, cy, cz)
        this.camera.lookAt(this.orbitTarget)
      },

      render: (renderer, scene, camera) => {
        if (!preset.feedbackEnabled || !renderTargetA || !renderTargetB) {
          renderer.render(scene, camera)
          return
        }

        renderer.setRenderTarget(renderTargetA)
        renderer.clear()
        renderer.render(scene, camera)

        feedbackMat.uniforms.tCurrent.value = renderTargetA.texture
        feedbackMat.uniforms.tPrev.value = renderTargetB.texture

        renderer.setRenderTarget(null)
        renderer.render(feedbackScene, feedbackCamera)

        const temp = renderTargetA
        renderTargetA = renderTargetB
        renderTargetB = temp
      },

      resize: (w, h) => {
        if (renderTargetA && renderTargetB && w > 0 && h > 0) {
          const pixelRatio = this.renderer.getPixelRatio()
          const rw = Math.round(w * pixelRatio)
          const rh = Math.round(h * pixelRatio)
          renderTargetA.setSize(rw, rh)
          renderTargetB.setSize(rw, rh)
        }
      },

      dispose: () => {
        this.scene.remove(wireframeMesh)
        this.scene.remove(fillMesh)
        this.scene.remove(dotsMesh)
        this.scene.remove(glowDotsMesh)
        starfield.dispose()

        geometry.dispose()
        wireframeMat.dispose()
        fillMat.dispose()
        dotsMat.dispose()
        glowDotsMat.dispose()

        feedbackGeo.dispose()
        feedbackMat.dispose()
        renderTargetA?.dispose()
        renderTargetB?.dispose()
      },
    }
  }

  // =========================================================================
  // MESH TUNNEL (First-Person Infinite 3D Warp Cylinder Tunnel)
  // =========================================================================
  private createMeshTunnelScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    // Linear fog smoothly fades the tunnel into 100% solid pitch black at z = -170
    // Long before the tunnel geometry ends (at z = -340), it is completely invisible in deep black space
    this.scene.fog = new THREE.Fog(0x000000, 25, 170)
    this.camera.position.set(0, 0, 0)
    this.camera.lookAt(0, 0, -100)
    this.camera.up.set(0, 1, 0)
    this.camera.fov = 75
    this.camera.updateProjectionMatrix()

    this.orbitTarget.set(0, 0, -100)
    this.currentAzimuth = 0
    this.targetAzimuth = 0
    this.currentPolar = 0
    this.targetPolar = 0
    this.currentRadius = 16
    this.targetRadius = 16

    const savedTunnelCam = getSavedCameraPresetState('mesh-tunnel')
    if (savedTunnelCam) {
      this.currentAzimuth = savedTunnelCam.azimuth
      this.targetAzimuth = savedTunnelCam.azimuth
      this.currentPolar = savedTunnelCam.polar
      this.targetPolar = savedTunnelCam.polar
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambientLight)

    // Deep, ultra-long cylinder geometry (length 360 units, spanning z = +20 to z = -340)
    // Radius = 16 units surrounds the user with generous clearance so it never clips the camera
    const tunnelGeo = new THREE.CylinderGeometry(16, 16, 360, 64, 120, true)
    tunnelGeo.rotateX(Math.PI / 2)
    tunnelGeo.translate(0, 0, -160)

    const posAttr = tunnelGeo.attributes.position as THREE.BufferAttribute
    const posArray = posAttr.array as Float32Array
    const numVerts = posArray.length / 3
    const baseThetas = new Float32Array(numVerts)
    const baseRadii = new Float32Array(numVerts)
    const baseZs = new Float32Array(numVerts)

    const colorArray = new Float32Array(numVerts * 3)
    tunnelGeo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3))

    for (let i = 0; i < numVerts; i++) {
      const x = posArray[i * 3]
      const y = posArray[i * 3 + 1]
      const z = posArray[i * 3 + 2]
      baseThetas[i] = Math.atan2(y, x)
      baseRadii[i] = Math.sqrt(x * x + y * y)
      baseZs[i] = z
    }

    // Steady, comfortable non-flashing wireframe material with 5-color vertex hues
    const wireframeMat = new THREE.MeshStandardMaterial({
      wireframe: true,
      vertexColors: true,
      color: 0xffffff,
      emissive: theme.primaryHex,
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.2,
      transparent: true,
      opacity: 0.85,
    })
    const wireframeMesh = new THREE.Mesh(tunnelGeo, wireframeMat)
    this.scene.add(wireframeMesh)

    // Soft translucent facet fill layer (non-glaring, non-strobe)
    const fillMat = new THREE.MeshBasicMaterial({
      color: theme.accentHex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const fillMesh = new THREE.Mesh(tunnelGeo, fillMat)
    this.scene.add(fillMesh)

    let totalTime = 0
    let flightOffset = 0
    let currentSpeed = 0.5

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        totalTime += 0.016

        // Beat-driven velocity mechanics:
        // Automatically adjusts speed based on track tempo and surges on musical beats
        const isPlaying = frame.isPlaying
        const bpm = frame.bpm || frame.tempo || 120
        const tempoMultiplier = Math.min(1.8, Math.max(0.65, bpm / 115))

        // Cruise speed smoothly adapts to track energy & tempo
        const cruiseSpeed = isPlaying ? (0.35 + frame.energy * 0.65) * tempoMultiplier : 0.12

        // Beat impulse surge: smoothly accelerates on beat transients and kicks
        const beatImpulse = isPlaying
          ? (frame.beat * 1.8) + (frame.bass > 0.55 ? (frame.bass - 0.55) * 2.2 : 0)
          : 0
        const targetSpeed = cruiseSpeed + beatImpulse

        // Graceful exponential easing: no sudden flashes or violent velocity spikes
        const ease = targetSpeed > currentSpeed ? 0.18 : 0.06
        currentSpeed += (targetSpeed - currentSpeed) * ease

        // Advance forward flight smoothly
        flightOffset += currentSpeed * 1.4

        // Palette Theming with smooth, cohesive longitudinal waves (calibrated non-glare)
        const cRgbs = curTheme.colorRgbs || [
          { r: 28, g: 30, b: 68 },
          { r: 76, g: 68, b: 172 },
          { r: 132, g: 72, b: 200 },
          { r: 156, g: 112, b: 216 },
          { r: 196, g: 184, b: 236 },
        ]

        wireframeMat.emissive.setHex(curTheme.color2Hex || curTheme.primaryHex)
        wireframeMat.emissiveIntensity = 0.18 + Math.min(0.12, frame.energy * 0.1)
        fillMat.color.setHex(curTheme.color1Hex || curTheme.primaryHex)
        fillMat.opacity = 0.04

        // Peristaltic audio dilation along the cylinder walls streaming at beat-driven velocity
        for (let i = 0; i < numVerts; i++) {
          const th = baseThetas[i]
          const baseR = baseRadii[i]
          const z = baseZs[i]

          const wavePhase = (z - flightOffset * 1.5) * 0.08
          // Smooth radial undulation
          const bassPulse = isPlaying ? Math.sin(wavePhase) * (frame.bass * 2.2 + 0.2) : 0
          // 4-fold even harmonic ripple (100% seamless across 360 degrees)
          const harmonicRipple = isPlaying ? Math.cos(4.0 * th + wavePhase * 0.5) * (frame.mid * 1.1 + 0.15) : 0
          const trebleTwist = isPlaying ? Math.sin(6.0 * th - wavePhase * 1.0) * (frame.treble * 0.6) : 0

          const curR = baseR + bassPulse + harmonicRipple + trebleTwist
          posArray[i * 3] = Math.cos(th) * curR
          posArray[i * 3 + 1] = Math.sin(th) * curR
          posArray[i * 3 + 2] = z

          // Cohesive longitudinal tonal wave along tunnel depth (no spinning circumference stripes)
          const colorPhase = (((z - flightOffset * 0.6) * 0.006) % 1.0 + 1.0) % 1.0
          const seg = colorPhase * 4.0
          const colIdx = Math.min(3, Math.floor(seg))
          const nextColIdx = colIdx + 1
          const frac = seg - colIdx
          const colA = cRgbs[colIdx]
          const colB = cRgbs[nextColIdx]
          colorArray[i * 3] = (colA.r * (1 - frac) + colB.r * frac) / 255
          colorArray[i * 3 + 1] = (colA.g * (1 - frac) + colB.g * frac) / 255
          colorArray[i * 3 + 2] = (colA.b * (1 - frac) + colB.b * frac) / 255
        }
        posAttr.needsUpdate = true
        ;(tunnelGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true

        // Smooth interactive camera steering (pitch/yaw/subtle banking roll)
        const steerX = mouseX * 3.5 + this.targetAzimuth * 6.0
        const steerY = mouseY * 2.5 + this.targetPolar * 5.0
        this.camera.position.x += (steerX - this.camera.position.x) * 0.06
        this.camera.position.y += (-steerY - this.camera.position.y) * 0.06
        this.camera.lookAt(steerX * 0.4, -steerY * 0.4, -100)
        this.camera.rotation.z = Math.sin(totalTime * 0.6) * 0.02 - mouseX * 0.04
      },

      dispose: () => {
        this.scene.fog = null
        this.scene.remove(ambientLight)
        this.scene.remove(wireframeMesh)
        this.scene.remove(fillMesh)

        tunnelGeo.dispose()
        wireframeMat.dispose()
        fillMat.dispose()
      },
    }
  }

  // =========================================================================
  // SPHERE 1: CELESTIAL ORB (Audio-Reactive 3D Geodesic Wireframe Sphere)
  // =========================================================================
  private createSphereMeshScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.scene.fog = null
    this.orbitTarget.set(0, 0, 0)
    this.currentAzimuth = 0.35
    this.targetAzimuth = 0.35
    this.currentPolar = 1.35
    this.targetPolar = 1.35
    this.currentRadius = 55.0
    this.targetRadius = 55.0

    const savedCam = getSavedCameraPresetState('sphere-mesh')
    if (savedCam) {
      this.currentAzimuth = savedCam.azimuth
      this.targetAzimuth = savedCam.azimuth
      this.currentPolar = savedCam.polar
      this.targetPolar = savedCam.polar
      this.currentRadius = savedCam.radius
      this.targetRadius = savedCam.radius
      if (savedCam.targetX !== undefined) this.orbitTarget.x = savedCam.targetX
      if (savedCam.targetY !== undefined) this.orbitTarget.y = savedCam.targetY
      if (savedCam.targetZ !== undefined) this.orbitTarget.z = savedCam.targetZ
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45)
    this.scene.add(ambientLight)

    const sphereGroup = new THREE.Group()
    this.scene.add(sphereGroup)

    // Geodesic icosahedron wireframe shell (subdivision 4 gives 1,280 facets & 642 vertices)
    const baseRadius = 18.0
    const geo = new THREE.IcosahedronGeometry(baseRadius, 4)
    const posAttr = geo.attributes.position as THREE.BufferAttribute
    const posArray = posAttr.array as Float32Array
    const numVerts = posArray.length / 3

    const normals = new Float32Array(numVerts * 3)
    const colorArray = new Float32Array(numVerts * 3)
    for (let i = 0; i < numVerts; i++) {
      const x = posArray[i * 3]
      const y = posArray[i * 3 + 1]
      const z = posArray[i * 3 + 2]
      const len = Math.sqrt(x * x + y * y + z * z) || 1
      normals[i * 3] = x / len
      normals[i * 3 + 1] = y / len
      normals[i * 3 + 2] = z / len
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3))

    const wireframeMat = new THREE.MeshStandardMaterial({
      wireframe: true,
      vertexColors: true,
      emissive: theme.primaryHex,
      emissiveIntensity: 0.22,
      roughness: 0.45,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85,
    })
    const wireframeMesh = new THREE.Mesh(geo, wireframeMat)
    sphereGroup.add(wireframeMesh)

    // Translucent glassmorphic interior facets
    const fillMat = new THREE.MeshBasicMaterial({
      color: theme.color1Hex || theme.primaryHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const fillMesh = new THREE.Mesh(geo, fillMat)
    sphereGroup.add(fillMesh)

    // Luminous vertex pearl nodes (comfortable non-glare scale)
    const pearlGeo = new THREE.BufferGeometry()
    const pearlPositions = new Float32Array(numVerts * 3)
    pearlGeo.setAttribute('position', new THREE.BufferAttribute(pearlPositions, 3))
    const pearlMat = new THREE.PointsMaterial({
      size: 1.1,
      color: theme.color5Hex || 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const pearlPoints = new THREE.Points(pearlGeo, pearlMat)
    sphereGroup.add(pearlPoints)

    // Molten inner core sphere (pulsing to deep bass)
    const coreGeo = new THREE.SphereGeometry(7.0, 32, 32)
    const coreMat = new THREE.MeshBasicMaterial({
      color: theme.color1Hex || theme.primaryHex,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    })
    const coreMesh = new THREE.Mesh(coreGeo, coreMat)
    sphereGroup.add(coreMesh)

    // Equatorial starlight halo ring
    const haloCount = 220
    const haloGeo = new THREE.BufferGeometry()
    const haloPositions = new Float32Array(haloCount * 3)
    const haloBaseAngles = new Float32Array(haloCount)
    const haloBaseRadii = new Float32Array(haloCount)
    for (let i = 0; i < haloCount; i++) {
      haloBaseAngles[i] = Math.random() * Math.PI * 2
      haloBaseRadii[i] = 22.0 + Math.random() * 10.0
      haloPositions[i * 3] = Math.cos(haloBaseAngles[i]) * haloBaseRadii[i]
      haloPositions[i * 3 + 1] = (Math.random() - 0.5) * 2.0
      haloPositions[i * 3 + 2] = Math.sin(haloBaseAngles[i]) * haloBaseRadii[i]
    }
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPositions, 3))
    const haloMat = new THREE.PointsMaterial({
      size: 1.1,
      color: theme.color4Hex || theme.accentHex,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const haloPoints = new THREE.Points(haloGeo, haloMat)
    sphereGroup.add(haloPoints)

    let totalTime = 0

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        totalTime += 0.016

        // 5-Color Chromatic Palette
        const cRgbs = curTheme.colorRgbs || [
          { r: 28, g: 30, b: 68 },
          { r: 76, g: 68, b: 172 },
          { r: 132, g: 72, b: 200 },
          { r: 156, g: 112, b: 216 },
          { r: 196, g: 184, b: 236 },
        ]

        wireframeMat.emissive.setHex(curTheme.color2Hex || curTheme.primaryHex)
        wireframeMat.emissiveIntensity = 0.20 + frame.energy * 0.12
        fillMat.color.setHex(curTheme.color1Hex || curTheme.primaryHex)
        coreMat.color.setHex(curTheme.color1Hex || curTheme.primaryHex)
        haloMat.color.setHex(curTheme.color4Hex || curTheme.accentHex)
        pearlMat.color.setHex(curTheme.color5Hex || 0xffffff)

        // Sphere rotation responding to track energy
        const spinSpeed = 0.003 + frame.energy * 0.005
        sphereGroup.rotation.y += spinSpeed
        sphereGroup.rotation.x = Math.sin(totalTime * 0.4) * 0.12

        // Molten core scale on bass kicks
        const coreScale = 1.0 + frame.bass * 0.5 + frame.beat * 0.25
        coreMesh.scale.set(coreScale, coreScale, coreScale)
        coreMesh.rotation.y -= spinSpeed * 1.5

        // Audio-reactive vertex displacement across 5-color coordinates
        for (let i = 0; i < numVerts; i++) {
          const nx = normals[i * 3]
          const ny = normals[i * 3 + 1]
          const nz = normals[i * 3 + 2]

          const phi = Math.acos(Math.max(-1, Math.min(1, ny)))
          const theta = Math.atan2(nz, nx)
          const sinPhi = Math.sin(phi)

          const binIdx = Math.min(127, Math.floor(sinPhi * 75))
          const freqVal = (frame.frequencyData[binIdx] || 0) / 255.0

          const isPlaying = frame.isPlaying
          const bassPulse = isPlaying ? Math.sin(4.0 * phi + totalTime * 2.2) * (frame.bass * 2.4 + 0.1) : 0
          const harmonicRipple = isPlaying ? Math.cos(6.0 * theta - totalTime * 3.0) * (frame.mid * 1.0 + 0.1) : 0
          const trebleTwist = isPlaying ? Math.sin(8.0 * phi + 4.0 * theta + totalTime * 4.0) * (frame.treble * 0.5) : 0

          const deltaR = isPlaying ? freqVal * 5.0 + bassPulse + harmonicRipple + trebleTwist : 0
          const curR = baseRadius + deltaR

          const px = nx * curR
          const py = ny * curR
          const pz = nz * curR

          posArray[i * 3] = px
          posArray[i * 3 + 1] = py
          posArray[i * 3 + 2] = pz

          pearlPositions[i * 3] = px
          pearlPositions[i * 3 + 1] = py
          pearlPositions[i * 3 + 2] = pz

          // Smooth polar elevation gradient (deep foundation at poles, glowing crest at equator)
          const elev = phi / Math.PI
          const colorT = Math.min(0.99, Math.max(0.0, (1.0 - Math.abs(elev - 0.5) * 1.8) * 0.55 + freqVal * 0.45))
          const seg = colorT * 4.0
          const colIdx = Math.min(3, Math.floor(seg))
          const nextColIdx = colIdx + 1
          const frac = seg - colIdx
          const colA = cRgbs[colIdx]
          const colB = cRgbs[nextColIdx]
          colorArray[i * 3] = (colA.r * (1 - frac) + colB.r * frac) / 255
          colorArray[i * 3 + 1] = (colA.g * (1 - frac) + colB.g * frac) / 255
          colorArray[i * 3 + 2] = (colA.b * (1 - frac) + colB.b * frac) / 255
        }
        posAttr.needsUpdate = true
        ;(geo.attributes.color as THREE.BufferAttribute).needsUpdate = true
        ;(pearlGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true

        // Pulse pearl node sizing on treble
        pearlMat.size = 1.0 + frame.treble * 0.9 + frame.beat * 0.5

        // Halo starlight rotation
        haloPoints.rotation.y += spinSpeed * 0.8

        // Smooth interactive 360° orbit drag and zoom
        this.currentAzimuth += (this.targetAzimuth - this.currentAzimuth) * 0.08
        this.currentPolar += (this.targetPolar - this.currentPolar) * 0.08
        this.currentRadius += (this.targetRadius - this.currentRadius) * 0.08

        const cx = this.orbitTarget.x + this.currentRadius * Math.sin(this.currentPolar) * Math.sin(this.currentAzimuth)
        const cy = this.orbitTarget.y + this.currentRadius * Math.cos(this.currentPolar)
        const cz = this.orbitTarget.z + this.currentRadius * Math.sin(this.currentPolar) * Math.cos(this.currentAzimuth)
        this.camera.position.set(cx, cy, cz)
        this.camera.lookAt(this.orbitTarget)
      },

      dispose: () => {
        this.scene.remove(ambientLight)
        this.scene.remove(sphereGroup)
        geo.dispose()
        wireframeMat.dispose()
        fillMat.dispose()
        pearlGeo.dispose()
        pearlMat.dispose()
        coreGeo.dispose()
        coreMat.dispose()
        haloGeo.dispose()
        haloMat.dispose()
      },
    }
  }

  // =========================================================================
  // SPHERE 2: RINGED NEBULA (Planetary Core with Gyro Equalizer Rings)
  // =========================================================================
  private createSphereRingsScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.scene.fog = null
    this.orbitTarget.set(0, 0, 0)
    this.currentAzimuth = 0.55
    this.targetAzimuth = 0.55
    this.currentPolar = 1.18
    this.targetPolar = 1.18
    this.currentRadius = 68.0
    this.targetRadius = 68.0

    const savedCam = getSavedCameraPresetState('sphere-rings')
    if (savedCam) {
      this.currentAzimuth = savedCam.azimuth
      this.targetAzimuth = savedCam.azimuth
      this.currentPolar = savedCam.polar
      this.targetPolar = savedCam.polar
      this.currentRadius = savedCam.radius
      this.targetRadius = savedCam.radius
      if (savedCam.targetX !== undefined) this.orbitTarget.x = savedCam.targetX
      if (savedCam.targetY !== undefined) this.orbitTarget.y = savedCam.targetY
      if (savedCam.targetZ !== undefined) this.orbitTarget.z = savedCam.targetZ
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45)
    this.scene.add(ambientLight)

    const mainGroup = new THREE.Group()
    this.scene.add(mainGroup)

    // 1. Central Core Sphere
    const coreGeo = new THREE.SphereGeometry(10.0, 36, 36)
    const corePosAttr = coreGeo.attributes.position as THREE.BufferAttribute
    const corePosArray = corePosAttr.array as Float32Array
    const coreNumVerts = corePosArray.length / 3
    const coreNormals = new Float32Array(coreNumVerts * 3)
    for (let i = 0; i < coreNumVerts; i++) {
      const x = corePosArray[i * 3]
      const y = corePosArray[i * 3 + 1]
      const z = corePosArray[i * 3 + 2]
      const len = Math.sqrt(x * x + y * y + z * z) || 1
      coreNormals[i * 3] = x / len
      coreNormals[i * 3 + 1] = y / len
      coreNormals[i * 3 + 2] = z / len
    }

    const coreWireMat = new THREE.MeshStandardMaterial({
      wireframe: true,
      color: theme.color2Hex || theme.primaryHex,
      emissive: theme.color1Hex || theme.primaryHex,
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.82,
    })
    const coreWireMesh = new THREE.Mesh(coreGeo, coreWireMat)
    mainGroup.add(coreWireMesh)

    const coreFillMat = new THREE.MeshBasicMaterial({
      color: theme.color1Hex || theme.surfaceHex,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    })
    const coreFillMesh = new THREE.Mesh(coreGeo, coreFillMat)
    mainGroup.add(coreFillMesh)

    // 2. Ring 1: Equatorial Gyro Equalizer Ring (72 radial spoke bars)
    const spokeCount = 72
    const spokeGroup = new THREE.Group()
    spokeGroup.rotation.x = 0.2
    mainGroup.add(spokeGroup)

    const spokeBarGeo = new THREE.BoxGeometry(0.35, 1.0, 1.2)
    spokeBarGeo.translate(0, 0.5, 0)
    const spokeMat = new THREE.MeshBasicMaterial({
      color: theme.color3Hex || theme.accentHex,
      transparent: true,
      opacity: 0.82,
    })
    const spokeMeshes: THREE.Mesh[] = []
    for (let i = 0; i < spokeCount; i++) {
      const mesh = new THREE.Mesh(spokeBarGeo, spokeMat)
      const angle = (i / spokeCount) * Math.PI * 2
      const radius = 17.0
      mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      mesh.rotation.y = -angle
      spokeGroup.add(mesh)
      spokeMeshes.push(mesh)
    }

    // 3. Ring 2: Polar Gyro Ring (Tilted 55° on X)
    const gyroRingGeo = new THREE.TorusGeometry(25.0, 0.35, 16, 100)
    const gyroRingMat = new THREE.MeshStandardMaterial({
      wireframe: true,
      color: theme.color4Hex || theme.accentHex,
      emissive: theme.color3Hex || theme.accentHex,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.8,
    })
    const gyroRingMesh = new THREE.Mesh(gyroRingGeo, gyroRingMat)
    gyroRingMesh.rotation.x = Math.PI * 0.3
    gyroRingMesh.rotation.y = Math.PI * 0.15
    mainGroup.add(gyroRingMesh)

    // 4. Ring 3: Outer Celestial Counter-Ring (Tilted -48° on X)
    const outerRingGeo = new THREE.TorusGeometry(31.0, 0.25, 16, 120)
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: theme.color4Hex || theme.primaryHex,
      transparent: true,
      opacity: 0.75,
    })
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat)
    outerRingMesh.rotation.x = -Math.PI * 0.27
    outerRingMesh.rotation.z = Math.PI * 0.12
    mainGroup.add(outerRingMesh)

    // 5. Orbiting Keplerian Stardust Cloud (320 points, gentle opacity)
    const dustCount = 320
    const dustGeo = new THREE.BufferGeometry()
    const dustPositions = new Float32Array(dustCount * 3)
    const dustColors = new Float32Array(dustCount * 3)
    const dustThetas = new Float32Array(dustCount)
    const dustRadii = new Float32Array(dustCount)
    const dustSpeeds = new Float32Array(dustCount)
    const dustYOffsets = new Float32Array(dustCount)

    const cRgbs = theme.colorRgbs || [
      { r: 28, g: 30, b: 68 },
      { r: 76, g: 68, b: 172 },
      { r: 132, g: 72, b: 200 },
      { r: 156, g: 112, b: 216 },
      { r: 196, g: 184, b: 236 },
    ]

    for (let i = 0; i < dustCount; i++) {
      dustThetas[i] = Math.random() * Math.PI * 2
      dustRadii[i] = 14.0 + Math.random() * 26.0
      dustSpeeds[i] = (0.005 + Math.random() * 0.01) * (Math.random() > 0.3 ? 1 : -1)
      dustYOffsets[i] = (Math.random() - 0.5) * 3.0

      const c = cRgbs[i % 5]
      dustColors[i * 3] = c.r / 255
      dustColors[i * 3 + 1] = c.g / 255
      dustColors[i * 3 + 2] = c.b / 255
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
    dustGeo.setAttribute('color', new THREE.BufferAttribute(dustColors, 3))

    const dustMat = new THREE.PointsMaterial({
      size: 1.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const dustPoints = new THREE.Points(dustGeo, dustMat)
    mainGroup.add(dustPoints)

    let totalTime = 0

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        totalTime += 0.016

        // 5-Color Updates (calibrated comfortable luminescence)
        coreWireMat.color.setHex(curTheme.color2Hex || curTheme.primaryHex)
        coreWireMat.emissive.setHex(curTheme.color1Hex || curTheme.primaryHex)
        coreWireMat.emissiveIntensity = 0.20 + frame.energy * 0.12
        spokeMat.color.setHex(curTheme.color3Hex || curTheme.accentHex)
        gyroRingMat.color.setHex(curTheme.color4Hex || curTheme.accentHex)
        gyroRingMat.emissive.setHex(curTheme.color3Hex || curTheme.accentHex)
        outerRingMat.color.setHex(curTheme.color4Hex || curTheme.primaryHex)

        // Rotation
        const spinSpeed = 0.003 + frame.energy * 0.005
        mainGroup.rotation.y += spinSpeed * 0.6
        spokeGroup.rotation.y += spinSpeed * 1.2
        gyroRingMesh.rotation.z += spinSpeed * 1.5
        outerRingMesh.rotation.z -= spinSpeed * 1.8

        // Core vertex bass undulation
        for (let i = 0; i < coreNumVerts; i++) {
          const nx = coreNormals[i * 3]
          const ny = coreNormals[i * 3 + 1]
          const nz = coreNormals[i * 3 + 2]
          const wave = frame.isPlaying ? Math.sin(ny * 4.0 + totalTime * 3.0) * (frame.bass * 2.2 + 0.1) : 0
          const r = 10.0 + wave
          corePosArray[i * 3] = nx * r
          corePosArray[i * 3 + 1] = ny * r
          corePosArray[i * 3 + 2] = nz * r
        }
        corePosAttr.needsUpdate = true

        // Spoke bars height reaction to FFT spectrum
        for (let i = 0; i < spokeCount; i++) {
          const binIdx = Math.min(127, Math.floor((Math.abs(i - spokeCount / 2) / (spokeCount / 2)) * 105))
          const freqVal = (frame.frequencyData[binIdx] || 0) / 255.0
          const h = Math.max(0.3, freqVal * 12.0 * (frame.energy + 0.35) + frame.bass * 2.0)
          spokeMeshes[i].scale.set(1, h, 1)
        }

        // Gyro ring pulsation
        const gyroScale = 1.0 + frame.mid * 0.2 + frame.beat * 0.08
        gyroRingMesh.scale.set(gyroScale, gyroScale, gyroScale)

        // Orbiting stardust positions
        for (let i = 0; i < dustCount; i++) {
          dustThetas[i] += dustSpeeds[i] * (1.0 + frame.energy)
          const rad = dustRadii[i] + Math.sin(dustThetas[i] * 3.0) * (frame.bass * 1.5)
          dustPositions[i * 3] = Math.cos(dustThetas[i]) * rad
          dustPositions[i * 3 + 1] = dustYOffsets[i] + Math.sin(dustThetas[i] * 2.0) * 1.5
          dustPositions[i * 3 + 2] = Math.sin(dustThetas[i]) * rad
        }
        ;(dustGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true

        // Smooth interactive 360° orbit drag and zoom
        this.currentAzimuth += (this.targetAzimuth - this.currentAzimuth) * 0.08
        this.currentPolar += (this.targetPolar - this.currentPolar) * 0.08
        this.currentRadius += (this.targetRadius - this.currentRadius) * 0.08

        const cx = this.orbitTarget.x + this.currentRadius * Math.sin(this.currentPolar) * Math.sin(this.currentAzimuth)
        const cy = this.orbitTarget.y + this.currentRadius * Math.cos(this.currentPolar)
        const cz = this.orbitTarget.z + this.currentRadius * Math.sin(this.currentPolar) * Math.cos(this.currentAzimuth)
        this.camera.position.set(cx, cy, cz)
        this.camera.lookAt(this.orbitTarget)
      },

      dispose: () => {
        this.scene.remove(ambientLight)
        this.scene.remove(mainGroup)
        coreGeo.dispose()
        coreWireMat.dispose()
        coreFillMat.dispose()
        spokeBarGeo.dispose()
        spokeMat.dispose()
        gyroRingGeo.dispose()
        gyroRingMat.dispose()
        outerRingGeo.dispose()
        outerRingMat.dispose()
        dustGeo.dispose()
        dustMat.dispose()
      },
    }
  }

  // =========================================================================
  // CITY 1: CYBER METROPOLIS (3D Downtown Grid of Skyscraper Towers)
  // =========================================================================
  private createCitySkyscrapersScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.scene.fog = new THREE.FogExp2(0x000000, 0.007)
    this.orbitTarget.set(0, 4, 0)
    this.currentAzimuth = 0.78
    this.targetAzimuth = 0.78
    this.currentPolar = 1.05
    this.targetPolar = 1.05
    this.currentRadius = 95.0
    this.targetRadius = 95.0

    const savedCam = getSavedCameraPresetState('city-skyscrapers')
    if (savedCam) {
      this.currentAzimuth = savedCam.azimuth
      this.targetAzimuth = savedCam.azimuth
      this.currentPolar = savedCam.polar
      this.targetPolar = savedCam.polar
      this.currentRadius = savedCam.radius
      this.targetRadius = savedCam.radius
      if (savedCam.targetX !== undefined) this.orbitTarget.x = savedCam.targetX
      if (savedCam.targetY !== undefined) this.orbitTarget.y = savedCam.targetY
      if (savedCam.targetZ !== undefined) this.orbitTarget.z = savedCam.targetZ
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45)
    this.scene.add(ambientLight)

    const cityGroup = new THREE.Group()
    this.scene.add(cityGroup)

    // Reflective city ground plane with avenue grid
    const groundGeo = new THREE.PlaneGeometry(90, 90)
    groundGeo.rotateX(-Math.PI / 2)
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x050508,
      transparent: true,
      opacity: 0.9,
    })
    const groundMesh = new THREE.Mesh(groundGeo, groundMat)
    groundMesh.position.y = -0.05
    cityGroup.add(groundMesh)

    // Street grid line markings
    const gridHelper = new THREE.GridHelper(90, 18, theme.color2Hex || theme.accentHex, 0x111116)
    gridHelper.position.y = 0.01
    cityGroup.add(gridHelper)

    // 12 x 12 Building Grid = 144 Skyscraper Towers
    const gridCols = 12
    const gridRows = 12
    const buildingWidth = 3.2
    const buildingDepth = 3.2
    const spacing = 5.2

    const boxGeo = new THREE.BoxGeometry(buildingWidth, 1.0, buildingDepth)
    boxGeo.translate(0, 0.5, 0) // Anchor base at y = 0
    const capGeo = new THREE.BoxGeometry(buildingWidth + 0.1, 0.35, buildingDepth + 0.1)
    const spireGeo = new THREE.CylinderGeometry(0.08, 0.08, 5.0, 8)
    spireGeo.translate(0, 2.5, 0)

    const cRgbs = theme.colorRgbs || [
      { r: 28, g: 30, b: 68 },
      { r: 76, g: 68, b: 172 },
      { r: 132, g: 72, b: 200 },
      { r: 156, g: 112, b: 216 },
      { r: 196, g: 184, b: 236 },
    ]

    // Create 5 materials for the buildings according to frequency zones (calibrated non-glare)
    const buildingMaterials = [
      new THREE.MeshStandardMaterial({ wireframe: true, color: theme.color1Hex || theme.primaryHex, emissive: theme.color1Hex || theme.primaryHex, emissiveIntensity: 0.18, transparent: true, opacity: 0.8 }),
      new THREE.MeshStandardMaterial({ wireframe: true, color: theme.color2Hex || theme.accentHex, emissive: theme.color2Hex || theme.accentHex, emissiveIntensity: 0.18, transparent: true, opacity: 0.8 }),
      new THREE.MeshStandardMaterial({ wireframe: true, color: theme.color3Hex || theme.primaryHex, emissive: theme.color3Hex || theme.primaryHex, emissiveIntensity: 0.18, transparent: true, opacity: 0.8 }),
      new THREE.MeshStandardMaterial({ wireframe: true, color: theme.color4Hex || theme.accentHex, emissive: theme.color4Hex || theme.accentHex, emissiveIntensity: 0.18, transparent: true, opacity: 0.8 }),
      new THREE.MeshStandardMaterial({ wireframe: true, color: theme.color5Hex || theme.primaryHex, emissive: theme.color5Hex || theme.primaryHex, emissiveIntensity: 0.22, transparent: true, opacity: 0.85 }),
    ]

    const capMaterials = [
      new THREE.MeshBasicMaterial({ color: theme.color1Hex || theme.primaryHex, transparent: true, opacity: 0.85 }),
      new THREE.MeshBasicMaterial({ color: theme.color2Hex || theme.accentHex, transparent: true, opacity: 0.85 }),
      new THREE.MeshBasicMaterial({ color: theme.color3Hex || theme.primaryHex, transparent: true, opacity: 0.85 }),
      new THREE.MeshBasicMaterial({ color: theme.color4Hex || theme.accentHex, transparent: true, opacity: 0.85 }),
      new THREE.MeshBasicMaterial({ color: theme.color5Hex || theme.primaryHex, transparent: true, opacity: 0.9 }),
    ]

    const spireMat = new THREE.MeshBasicMaterial({
      color: theme.color5Hex || 0xffffff,
      transparent: true,
      opacity: 0.9,
    })

    const buildings: Array<{
      mesh: THREE.Mesh
      cap: THREE.Mesh
      spire?: THREE.Mesh
      binIdx: number
      baseHeight: number
      colorTier: number
    }> = []

    for (let c = 0; c < gridCols; c++) {
      for (let r = 0; r < gridRows; r++) {
        // Leave central cross boulevards
        const xOffset = c >= gridCols / 2 ? 1.5 : -1.5
        const zOffset = r >= gridRows / 2 ? 1.5 : -1.5
        const x = (c - gridCols / 2 + 0.5) * spacing + xOffset
        const z = (r - gridRows / 2 + 0.5) * spacing + zOffset

        const distFromCenter = Math.sqrt(x * x + z * z) / 42.0 // 0 to 1
        let binIdx = 0
        let colorTier = 0
        let baseH = 2.0

        if (distFromCenter < 0.28) {
          // Downtown core (Bass & Kicks) - Deep base & primary
          binIdx = Math.min(12, Math.floor(distFromCenter * 35))
          colorTier = 1
          baseH = 5.0 + Math.random() * 3.0
        } else if (distFromCenter < 0.58) {
          // Midtown (Vocals & Melodies) - Harmonic crest
          binIdx = 12 + Math.floor((distFromCenter - 0.28) * 75)
          colorTier = 2
          baseH = 3.5 + Math.random() * 2.2
        } else {
          // Suburbs (Treble & Hi-hats) - Upper ridge & soft accent
          binIdx = 45 + Math.floor((distFromCenter - 0.58) * 140)
          colorTier = 3
          baseH = 2.0 + Math.random() * 1.5
        }
        binIdx = Math.max(0, Math.min(127, binIdx))

        const mesh = new THREE.Mesh(boxGeo, buildingMaterials[colorTier])
        mesh.position.set(x, 0, z)
        cityGroup.add(mesh)

        const cap = new THREE.Mesh(capGeo, capMaterials[colorTier])
        cap.position.set(x, 1, z)
        cityGroup.add(cap)

        let spire: THREE.Mesh | undefined
        // Central towers get architectural spires
        if (distFromCenter < 0.3) {
          spire = new THREE.Mesh(spireGeo, spireMat)
          spire.position.set(x, 1, z)
          cityGroup.add(spire)
        }

        buildings.push({
          mesh,
          cap,
          spire,
          binIdx,
          baseHeight: baseH,
          colorTier,
        })
      }
    }

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        // Dynamic Palette Updates
        const themeHexes = curTheme.colors || [
          curTheme.primaryHex,
          curTheme.accentHex,
          curTheme.primaryHex,
          curTheme.accentHex,
          curTheme.primaryHex,
        ]

        for (let i = 0; i < 5; i++) {
          buildingMaterials[i].color.setHex(themeHexes[i])
          buildingMaterials[i].emissive.setHex(themeHexes[i])
          buildingMaterials[i].emissiveIntensity = 0.18 + frame.energy * 0.10
          capMaterials[i].color.setHex(themeHexes[i])
        }
        spireMat.color.setHex(curTheme.color5Hex || themeHexes[4])

        // Subtle slow city rotation for cinematic sweep
        cityGroup.rotation.y += 0.0006

        // Skyscraper height extrusions reacting to music frequencies
        for (let i = 0; i < buildings.length; i++) {
          const b = buildings[i]
          const freqVal = (frame.frequencyData[b.binIdx] || 0) / 255.0
          const kickBoost = b.colorTier <= 1 ? frame.bass * 6.0 + frame.beat * 3.5 : 0
          const height = frame.isPlaying
            ? Math.max(1.0, b.baseHeight + freqVal * 26.0 * (frame.energy + 0.35) + kickBoost)
            : b.baseHeight

          b.mesh.scale.set(1, height, 1)
          b.cap.position.y = height
          if (b.spire) {
            b.spire.position.y = height
          }
        }

        // Smooth interactive 360° orbit drag and zoom
        this.currentAzimuth += (this.targetAzimuth - this.currentAzimuth) * 0.08
        this.currentPolar += (this.targetPolar - this.currentPolar) * 0.08
        this.currentRadius += (this.targetRadius - this.currentRadius) * 0.08

        const cx = this.orbitTarget.x + this.currentRadius * Math.sin(this.currentPolar) * Math.sin(this.currentAzimuth)
        const cy = this.orbitTarget.y + this.currentRadius * Math.cos(this.currentPolar)
        const cz = this.orbitTarget.z + this.currentRadius * Math.sin(this.currentPolar) * Math.cos(this.currentAzimuth)
        this.camera.position.set(cx, cy, cz)
        this.camera.lookAt(this.orbitTarget)
      },

      dispose: () => {
        this.scene.fog = null
        this.scene.remove(ambientLight)
        this.scene.remove(cityGroup)
        groundGeo.dispose()
        groundMat.dispose()
        boxGeo.dispose()
        capGeo.dispose()
        spireGeo.dispose()
        buildingMaterials.forEach((m) => m.dispose())
        capMaterials.forEach((m) => m.dispose())
        spireMat.dispose()
      },
    }
  }

  // =========================================================================
  // CITY 2: NEON BOULEVARD (Endless Highway towards Monumental Skyline)
  // =========================================================================
  private createCityHorizonScene(theme: VisualizerSceneTheme): VisualizerSceneController {
    this.scene.fog = new THREE.Fog(0x000000, 25, 150)
    this.orbitTarget.set(0, 8, -75)
    this.currentAzimuth = 0
    this.targetAzimuth = 0
    this.currentPolar = 1.45
    this.targetPolar = 1.45
    this.currentRadius = 22.0
    this.targetRadius = 22.0

    const savedCam = getSavedCameraPresetState('city-horizon')
    if (savedCam) {
      this.currentAzimuth = savedCam.azimuth
      this.targetAzimuth = savedCam.azimuth
      this.currentPolar = savedCam.polar
      this.targetPolar = savedCam.polar
      this.currentRadius = savedCam.radius
      this.targetRadius = savedCam.radius
      if (savedCam.targetX !== undefined) this.orbitTarget.x = savedCam.targetX
      if (savedCam.targetY !== undefined) this.orbitTarget.y = savedCam.targetY
      if (savedCam.targetZ !== undefined) this.orbitTarget.z = savedCam.targetZ
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45)
    this.scene.add(ambientLight)

    const sceneGroup = new THREE.Group()
    this.scene.add(sceneGroup)

    // 1. Moving Cyber Boulevard Ground (spanning z = +20 to -120)
    const roadWidth = 44.0
    const roadLength = 140.0
    const roadGeo = new THREE.PlaneGeometry(roadWidth, roadLength, 20, 70)
    roadGeo.rotateX(-Math.PI / 2)
    roadGeo.translate(0, 0, -50)

    const roadMat = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: theme.color1Hex || theme.primaryHex,
      transparent: true,
      opacity: 0.5,
    })
    const roadMesh = new THREE.Mesh(roadGeo, roadMat)
    sceneGroup.add(roadMesh)

    // Side guardrail light beams
    const railGeo = new THREE.CylinderGeometry(0.2, 0.2, roadLength, 8)
    railGeo.rotateX(Math.PI / 2)
    railGeo.translate(0, 0, -50)
    const railMat = new THREE.MeshBasicMaterial({
      color: theme.color2Hex || theme.accentHex,
      transparent: true,
      opacity: 0.75,
    })
    const leftRail = new THREE.Mesh(railGeo, railMat)
    leftRail.position.x = -roadWidth / 2
    sceneGroup.add(leftRail)
    const rightRail = new THREE.Mesh(railGeo, railMat)
    rightRail.position.x = roadWidth / 2
    sceneGroup.add(rightRail)

    // 2. Monumental Horizon Skyline (56 skyscraper monoliths along z = -80)
    const towerCount = 56
    const towerSpan = 130.0
    const towerGroup = new THREE.Group()
    towerGroup.position.set(0, 0, -80)
    sceneGroup.add(towerGroup)

    const towerBoxGeo = new THREE.BoxGeometry(2.0, 1.0, 2.0)
    towerBoxGeo.translate(0, 0.5, 0)
    const towerCapGeo = new THREE.BoxGeometry(2.2, 0.4, 2.2)

    const themeHexes = theme.colors || [
      theme.primaryHex,
      theme.accentHex,
      theme.primaryHex,
      theme.accentHex,
      theme.primaryHex,
    ]

    const towerMaterials = [
      new THREE.MeshStandardMaterial({ wireframe: true, color: themeHexes[0], emissive: themeHexes[0], emissiveIntensity: 0.18, transparent: true, opacity: 0.82 }),
      new THREE.MeshStandardMaterial({ wireframe: true, color: themeHexes[1], emissive: themeHexes[1], emissiveIntensity: 0.18, transparent: true, opacity: 0.82 }),
      new THREE.MeshStandardMaterial({ wireframe: true, color: themeHexes[2], emissive: themeHexes[2], emissiveIntensity: 0.18, transparent: true, opacity: 0.82 }),
      new THREE.MeshStandardMaterial({ wireframe: true, color: themeHexes[3], emissive: themeHexes[3], emissiveIntensity: 0.18, transparent: true, opacity: 0.82 }),
      new THREE.MeshStandardMaterial({ wireframe: true, color: themeHexes[4], emissive: themeHexes[4], emissiveIntensity: 0.22, transparent: true, opacity: 0.85 }),
    ]

    const towerCapMaterials = [
      new THREE.MeshBasicMaterial({ color: themeHexes[0], transparent: true, opacity: 0.85 }),
      new THREE.MeshBasicMaterial({ color: themeHexes[1], transparent: true, opacity: 0.85 }),
      new THREE.MeshBasicMaterial({ color: themeHexes[2], transparent: true, opacity: 0.85 }),
      new THREE.MeshBasicMaterial({ color: themeHexes[3], transparent: true, opacity: 0.85 }),
      new THREE.MeshBasicMaterial({ color: themeHexes[4], transparent: true, opacity: 0.9 }),
    ]

    const towers: Array<{
      mesh: THREE.Mesh
      cap: THREE.Mesh
      binIdx: number
      baseHeight: number
      tier: number
    }> = []

    for (let i = 0; i < towerCount; i++) {
      const x = (i / (towerCount - 1) - 0.5) * towerSpan
      const distFromCenter = Math.abs(x) / (towerSpan * 0.5)
      const binIdx = Math.min(127, Math.floor(distFromCenter * 115))
      // Smooth gradient across horizon rather than random zebra alternating
      const tier = Math.min(3, Math.floor((1.0 - distFromCenter * 0.7) * 3.5))
      const baseHeight = 5.0 + (1.0 - distFromCenter * 0.5) * 12.0

      const mesh = new THREE.Mesh(towerBoxGeo, towerMaterials[tier])
      mesh.position.set(x, 0, 0)
      mesh.scale.set(1.0 + Math.random() * 0.8, baseHeight, 1.0 + Math.random() * 0.8)
      towerGroup.add(mesh)

      const cap = new THREE.Mesh(towerCapGeo, towerCapMaterials[tier])
      cap.position.set(x, baseHeight, 0)
      towerGroup.add(cap)

      towers.push({ mesh, cap, binIdx, baseHeight, tier })
    }

    // 3. Volumetric-style Sky Searchlights (6 sweeping beams, gentle atmospheric mist)
    const beamCount = 6
    const beamGeo = new THREE.CylinderGeometry(0.2, 3.5, 60.0, 16)
    beamGeo.translate(0, 30.0, 0)
    const beamMat = new THREE.MeshBasicMaterial({
      color: theme.color3Hex || theme.accentHex,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const beams: THREE.Mesh[] = []
    for (let i = 0; i < beamCount; i++) {
      const beam = new THREE.Mesh(beamGeo, beamMat)
      const bx = (i / (beamCount - 1) - 0.5) * (towerSpan * 0.7)
      beam.position.set(bx, 0, -82)
      sceneGroup.add(beam)
      beams.push(beam)
    }

    let totalTime = 0
    let roadScroll = 0

    return {
      update: (frame, curTheme, mouseX, mouseY) => {
        totalTime += 0.016

        // Dynamic 5-Color Updates (comfortable, non-glaring)
        const curColors = curTheme.colors || [
          curTheme.primaryHex,
          curTheme.accentHex,
          curTheme.primaryHex,
          curTheme.accentHex,
          curTheme.primaryHex,
        ]

        roadMat.color.setHex(curTheme.color1Hex || curColors[0])
        railMat.color.setHex(curTheme.color2Hex || curColors[1])
        beamMat.color.setHex(curTheme.color4Hex || curColors[3])

        for (let t = 0; t < 5; t++) {
          towerMaterials[t].color.setHex(curColors[t])
          towerMaterials[t].emissive.setHex(curColors[t])
          towerMaterials[t].emissiveIntensity = 0.18 + frame.energy * 0.10
          towerCapMaterials[t].color.setHex(curColors[t])
        }

        // Road streaming velocity
        const bpm = frame.bpm || frame.tempo || 120
        const speed = frame.isPlaying ? (0.6 + frame.energy * 0.8) * Math.min(1.8, Math.max(0.7, bpm / 115)) : 0.0
        roadScroll = (roadScroll + speed) % 2.0

        // Skyline towers bounce to frequency bands
        for (let i = 0; i < towers.length; i++) {
          const t = towers[i]
          const freqVal = (frame.frequencyData[t.binIdx] || 0) / 255.0
          const h = frame.isPlaying
            ? Math.max(2.0, t.baseHeight + freqVal * 32.0 * (frame.energy + 0.35) + frame.bass * 6.0)
            : t.baseHeight

          t.mesh.scale.y = h
          t.cap.position.y = h
        }

        // Searchlights rhythmically sweep across the sky
        for (let i = 0; i < beamCount; i++) {
          const angle = Math.sin(totalTime * 1.2 + i * 1.1) * 0.28 + (mouseX * 0.15)
          beams[i].rotation.z = angle
          beams[i].rotation.x = Math.cos(totalTime * 0.9 + i) * 0.08
        }

        // Camera steering parallax with saved preset angles
        const steerX = mouseX * 4.0 + this.targetAzimuth * 8.0
        const steerY = mouseY * 2.5 + this.targetPolar * 4.0
        this.camera.position.x += (steerX - this.camera.position.x) * 0.06
        this.camera.position.y += (8.0 - steerY - this.camera.position.y) * 0.06
        this.camera.lookAt(steerX * 0.3, 8.0 - steerY * 0.3, -75)
      },

      dispose: () => {
        this.scene.fog = null
        this.scene.remove(ambientLight)
        this.scene.remove(sceneGroup)
        roadGeo.dispose()
        roadMat.dispose()
        railGeo.dispose()
        railMat.dispose()
        towerBoxGeo.dispose()
        towerCapGeo.dispose()
        beamGeo.dispose()
        beamMat.dispose()
        towerMaterials.forEach((m) => m.dispose())
        towerCapMaterials.forEach((m) => m.dispose())
      },
    }
  }

  public dispose() {
    if (this.isDisposed) return
    this.isDisposed = true

    clearTimeout(this.wheelSaveTimeout)
    this.saveCurrentPresetCamera()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('wheel', this.onWheel)

    if (this.activeController) {
      this.activeController.dispose()
      this.activeController = null
    }
    this.scene.clear()
    this.renderer.dispose()
  }
}
