/**
 * GLSL Shaders for the 3D Audio-Reactive Mesh Grid Visualizer.
 */

export const MESH_GRID_VERTEX_SHADER = /* glsl */ `
  attribute float frequency;
  attribute float elevation;
  attribute vec2 planarPos;
  varying vec3 vPosition;
  varying vec2 vPlanar;
  varying float vFrequency;
  varying float vElevation;
  varying float vViewZ;

  void main() {
    vPosition = position;
    vPlanar = planarPos;
    vFrequency = frequency;
    vElevation = elevation;
    vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewZ = -modelViewPosition.z;
    gl_Position = projectionMatrix * modelViewPosition;
  }
`

export const MESH_GRID_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 baseColor;
  uniform vec3 uLowColor;
  uniform vec3 uMidColor;
  uniform vec3 uHighColor;
  uniform vec3 uAngleColor1;
  uniform vec3 uAngleColor2;
  uniform vec3 uAngleColor3;
  uniform float uHasPalette;
  uniform float uColorByHeight;
  uniform float time;
  uniform float colorIntensity;
  uniform float colorReactivity;
  uniform float circleMode;
  uniform float gridHalfX;
  uniform float gridHalfZ;
  uniform float angleHueMix;
  uniform float surfaceOpacity;
  uniform float surfaceShade;
  uniform float fillReactivity;
  uniform float uColorLowCutoff;
  uniform float uColorMidCutoff;
  uniform float uColorApexCutoff;
  uniform float uApexHighlight;
  uniform float uBaselineAlpha;
  varying vec3 vPosition;
  varying vec2 vPlanar;
  varying float vFrequency;
  varying float vElevation;
  varying float vViewZ;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    // Discard fragments outside the ellipse with subtle smooth edge falloff
    float edgeFade = 1.0;
    if (circleMode > 0.5) {
      float nx = vPlanar.x / gridHalfX;
      float nz = vPlanar.y / gridHalfZ;
      float r2 = nx * nx + nz * nz;
      if (r2 > 1.0) discard;
      edgeFade = smoothstep(1.0, 0.94, r2);
    }

    // Determine active modulation signal:
    // When uColorByHeight > 0.5, color is driven strictly by physical vertical elevation (vElevation).
    // Otherwise it uses the acoustic harmonic cascade (vFrequency).
    float signal = uColorByHeight > 0.5 ? vElevation : vFrequency;
    float h = clamp(signal * colorReactivity, 0.0, 1.0);

    // When colorByHeight is enabled, completely bypass the radial angle color wheel
    float activeAngleMix = uColorByHeight > 0.5 ? 0.0 : angleHueMix;

    // Configurable height tier cutoffs with safe fallbacks
    float lowCut = uColorLowCutoff > 0.0 ? uColorLowCutoff : 0.20;
    float midCut = uColorMidCutoff > lowCut ? uColorMidCutoff : 0.60;
    float apexCut = uColorApexCutoff > midCut ? uColorApexCutoff : 0.88;
    float apexStrength = uApexHighlight > 0.0 ? uApexHighlight : 1.0;
    float baseAlpha = uBaselineAlpha > 0.0 ? uBaselineAlpha : 0.85;

    vec3 color;
    if (uHasPalette > 0.5) {
      // Dynamic multi-stage gradient derived from playing song's album art:
      // Base / valley (h < lowCut): uLowColor (deep rich atmosphere)
      // Mid slope (lowCut <= h < midCut): transitions smoothly from uLowColor to uMidColor
      // Upper ridge (midCut <= h < apexCut): transitions from uMidColor to uHighColor (hero album accent)
      // Apex tip (h >= apexCut): flashes brilliant warm white apex highlight
      if (h < lowCut) {
        float t = smoothstep(0.0, lowCut, h);
        color = mix(uLowColor, uMidColor, t * 0.45);
      } else if (h < midCut) {
        float t = smoothstep(lowCut, midCut, h);
        color = mix(uLowColor, uMidColor, t);
      } else if (h < apexCut) {
        float t = smoothstep(midCut, apexCut, h);
        color = mix(uMidColor, uHighColor, t);
      } else {
        float t = smoothstep(apexCut, 1.0, h);
        vec3 apexGlaze = mix(uHighColor, vec3(1.0, 1.0, 0.96), apexStrength * 0.20);
        color = mix(uHighColor, apexGlaze, t);
      }

      // Angle color wheel using album's harmonic palette (only when not in pure height mode)
      if (activeAngleMix > 0.0) {
        float angleNorm = fract(atan(vPlanar.y, vPlanar.x) / 6.2831853 + 0.5);
        vec3 angleColor;
        if (angleNorm < 0.333) {
          angleColor = mix(uAngleColor1, uAngleColor2, angleNorm * 3.0);
        } else if (angleNorm < 0.666) {
          angleColor = mix(uAngleColor2, uAngleColor3, (angleNorm - 0.333) * 3.0);
        } else {
          angleColor = mix(uAngleColor3, uAngleColor1, (angleNorm - 0.666) * 3.0);
        }
        color = mix(color, angleColor * (0.8 + h * 0.4), activeAngleMix * 0.45);
      }
    } else {
      // Physical height / harmonic spectrum:
      // Low (valleys/resting): deep electric sapphire/indigo (hue 0.70)
      // Mid (slopes/ripples): electric cyan/turquoise (hue 0.45-0.35)
      // High (crests/ridges): hot gold/amber/fiery red (hue 0.15-0.0)
      // Apex (tips): flashing brilliant diamond highlight
      float cf = h;
      float hue = mix(0.70, 0.0, cf);
      float saturation = 0.84 + cf * 0.16;
      float value = 0.65 + cf * 0.35;
      value += sin(time * 2.0) * 0.06 * cf;
      color = hsv2rgb(vec3(hue, saturation, value));

      if (activeAngleMix > 0.0) {
        float angleHue = fract(atan(vPlanar.y, vPlanar.x) / 6.2831853 + 0.5);
        vec3 angleColor = hsv2rgb(vec3(angleHue, saturation, value));
        color = mix(color, angleColor, activeAngleMix);
      }

      // Apex highlight for intense peaks and musical climaxes
      if (cf >= apexCut) {
        float tApex = smoothstep(apexCut, 1.0, cf);
        color = mix(color, vec3(1.0, 1.0, 0.96), tApex * apexStrength * 0.90);
      }
    }

    // Mix with base color using colorIntensity uniform with chroma preservation for album art
    if (uHasPalette > 0.5) {
      // Album art palette: maintain deep chromatic saturation without clipping channels to white
      float maxC = max(color.r, max(color.g, color.b));
      float minC = min(color.r, min(color.g, color.b));
      float delta = maxC - minC;
      if (maxC > 0.001 && delta > 0.001) {
        vec3 pureHue = (color - vec3(minC)) / delta;
        // Keep the vibrant color identity even at high radiance
        color = mix(color, pureHue * maxC, clamp((colorIntensity - 1.0) * 0.5, 0.0, 0.75));
      }
      // Modulate intensity smoothly using colorIntensity without channel blow-out:
      float scale = pow(max(0.0001, colorIntensity), 0.8);
      color = clamp(color * scale, 0.0, 1.0);
    } else {
      color = mix(baseColor, color, colorIntensity);
    }

    // Atmospheric depth attenuation: grounds distant terrain with soft spatial depth
    float depthAtten = clamp(1.0 - (vViewZ - 70.0) * 0.003, 0.70, 1.0);
    color *= depthAtten;

    // Wireframe alpha: surfaceOpacity * mix(1.0, signal, fillReactivity) * edgeFade
    float alpha = surfaceOpacity * mix(1.0, max(baseAlpha, signal), fillReactivity) * edgeFade;
    gl_FragColor = vec4(color * surfaceShade, alpha);
  }
`

export const MESH_POINTS_VERTEX_SHADER = /* glsl */ `
  attribute float frequency;
  attribute float elevation;
  attribute vec2 planarPos;
  uniform float dotSize;
  uniform float dotReactivity;
  uniform float uPixelRatio;
  uniform float sizeMul;
  varying vec2 vPlanar;
  varying float vFrequency;
  varying float vElevation;

  void main() {
    vPlanar = planarPos;
    vFrequency = frequency;
    vElevation = elevation;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float amp = mix(1.0, mix(0.15, 1.0, frequency), dotReactivity);
    float base = 0.7 + 0.2 * dotSize;
    gl_PointSize = base * sizeMul * amp * uPixelRatio * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

export const MESH_POINTS_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 baseColor;
  uniform float uColorByHeight;
  uniform float time;
  uniform float colorIntensity;
  uniform float colorReactivity;
  uniform float circleMode;
  uniform float gridHalfX;
  uniform float gridHalfZ;
  uniform float angleHueMix;
  uniform float dotSize;
  uniform float dotReactivity;
  varying vec2 vPlanar;
  varying float vFrequency;
  varying float vElevation;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    if (circleMode > 0.5) {
      float nx = vPlanar.x / gridHalfX;
      float nz = vPlanar.y / gridHalfZ;
      if (nx * nx + nz * nz > 1.0) discard;
    }

    vec2 pc = gl_PointCoord - 0.5;
    float r2 = dot(pc, pc);
    if (r2 > 0.25) discard;
    float edge = smoothstep(0.25, 0.16, r2);

    float signal = uColorByHeight > 0.5 ? vElevation : vFrequency;
    float cf = clamp(signal * colorReactivity, 0.0, 1.0);
    float activeAngleMix = uColorByHeight > 0.5 ? 0.0 : angleHueMix;

    float hue = mix(0.7, 0.0, cf);
    float saturation = 0.8 + cf * 0.2;
    float value = 0.6 + cf * 0.4;
    value += sin(time * 2.0) * 0.1 * cf;
    vec3 color = hsv2rgb(vec3(hue, saturation, value));

    if (activeAngleMix > 0.0) {
      float angleHue = fract(atan(vPlanar.y, vPlanar.x) / 6.2831853 + 0.5);
      vec3 angleColor = hsv2rgb(vec3(angleHue, saturation, value));
      color = mix(color, angleColor, activeAngleMix);
    }
    color = mix(baseColor, color, colorIntensity);

    float fadeIn = clamp(dotSize * 3.0, 0.0, 1.0);
    float alpha = mix(1.0, clamp(0.1 + signal * 1.2, 0.0, 1.0), dotReactivity);
    gl_FragColor = vec4(color, alpha * edge * fadeIn);
  }
`

export const MESH_GLOW_POINTS_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 baseColor;
  uniform float uColorByHeight;
  uniform float time;
  uniform float colorIntensity;
  uniform float colorReactivity;
  uniform float circleMode;
  uniform float gridHalfX;
  uniform float gridHalfZ;
  uniform float angleHueMix;
  uniform float dotSize;
  uniform float dotReactivity;
  uniform float dotGlow;
  varying vec2 vPlanar;
  varying float vFrequency;
  varying float vElevation;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    if (circleMode > 0.5) {
      float nx = vPlanar.x / gridHalfX;
      float nz = vPlanar.y / gridHalfZ;
      if (nx * nx + nz * nz > 1.0) discard;
    }

    vec2 pc = gl_PointCoord - 0.5;
    float r2 = dot(pc, pc);
    if (r2 > 0.25) discard;
    float falloff = exp(-r2 * 18.0);

    float signal = uColorByHeight > 0.5 ? vElevation : vFrequency;
    float cf = clamp(signal * colorReactivity, 0.0, 1.0);
    float activeAngleMix = uColorByHeight > 0.5 ? 0.0 : angleHueMix;

    float hue = mix(0.7, 0.0, cf);
    float saturation = 0.8 + cf * 0.2;
    float value = 0.6 + cf * 0.4;
    value += sin(time * 2.0) * 0.1 * cf;
    vec3 color = hsv2rgb(vec3(hue, saturation, value));

    if (activeAngleMix > 0.0) {
      float angleHue = fract(atan(vPlanar.y, vPlanar.x) / 6.2831853 + 0.5);
      vec3 angleColor = hsv2rgb(vec3(angleHue, saturation, value));
      color = mix(color, angleColor, activeAngleMix);
    }
    color = mix(baseColor, color, colorIntensity);

    float fadeIn = clamp(dotSize * 3.0, 0.0, 1.0);
    float alpha = mix(1.0, clamp(0.1 + signal * 1.2, 0.0, 1.0), dotReactivity);
    gl_FragColor = vec4(color, dotGlow * 0.6 * alpha * falloff * fadeIn);
  }
`

/**
 * Procedural Starfield GLSL Quad Shaders.
 * Bypasses 3D camera projection using clip-space quad with audio reactivity.
 */
export const PROCEDURAL_STARFIELD_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // Render directly to clip-space behind the 3D scene (z = 0.9999)
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`

export const PROCEDURAL_STARFIELD_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uStarDensity;
  uniform float uTwinkleSpeed;
  uniform float uAudioReactivity;
  uniform float uTime;
  uniform float uAudioValue;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec3 color = uColor1;

    // Scale UV for star density - higher density = more stars
    vec2 scaledUv = vUv * uStarDensity * 80.0;
    vec2 gridCell = floor(scaledUv);

    // Get random value for this grid cell
    float starRand = hash(gridCell);
    float starThreshold = 0.97;

    if (starRand > starThreshold) {
      vec2 starPos = gridCell + vec2(hash(gridCell + 0.5), hash(gridCell + 1.5));
      float dist = length(scaledUv - starPos);

      // Sub-pixel star brightness falloff
      float starSize = 0.1 + hash(gridCell + 2.5) * 0.15;
      float star = smoothstep(starSize, 0.0, dist);

      // Twinkle animation - each star has unique phase and speed
      float twinklePhase = hash(gridCell + 3.5) * 6.28318;
      float twinkle = sin(uTime * uTwinkleSpeed * (0.5 + hash(gridCell + 4.5)) + twinklePhase);
      twinkle = twinkle * 0.4 + 0.6;

      // Star color variation (warm to cool)
      float colorVar = hash(gridCell + 5.5);
      vec3 starColor = uColor2;
      starColor.r *= 0.9 + colorVar * 0.2;
      starColor.b *= 1.1 - colorVar * 0.2;

      // Audio reactivity: bass kick makes stars flash brighter
      float audioBoost = 1.0 + uAudioValue * uAudioReactivity;
      color += starColor * star * twinkle * audioBoost;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`

/**
 * Fullscreen Feedback Loop Shaders.
 * Implements frame-rate independent echo trails, zoom, rotation, offset, and additive blending.
 */
export const MESH_FEEDBACK_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const MESH_FEEDBACK_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform sampler2D tFeedback;
  uniform vec2 resolution;
  uniform float centerX;
  uniform float centerY;
  uniform float zoomFrame;
  uniform float rotateFrame;
  uniform vec2 offsetFrame;
  uniform float hueFrame;
  uniform float decayFrame;
  uniform float injectFrame;
  uniform int blendModeInt; // 0 = max, 1 = add, 2 = mix
  uniform float opacity;

  vec3 hueRotate(vec3 color, float angle) {
    const vec3 k = vec3(0.57735, 0.57735, 0.57735);
    float cosAngle = cos(angle);
    return vec3(color * cosAngle + cross(k, color) * sin(angle) + k * dot(k, color) * (1.0 - cosAngle));
  }

  void main() {
    vec4 current = texture2D(tDiffuse, vUv);
    vec2 center = vec2(centerX, centerY);
    float aspect = resolution.x / resolution.y;

    // Inverse-transform pixel coordinates to look up position in previous frame
    vec2 p = vUv - center;
    p.x *= aspect;
    float c = cos(-rotateFrame);
    float s = sin(-rotateFrame);
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    p /= zoomFrame;
    p.x /= aspect;
    vec2 fuv = p + center - offsetFrame;

    // Check bounds: outside previous frame has zero trail
    float inside = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
    vec3 prev = texture2D(tFeedback, fuv).rgb * inside;

    if (hueFrame != 0.0) {
      prev = hueRotate(prev, hueFrame);
    }

    vec3 result;
    if (blendModeInt == 1) {
      // Additive mode: accumulates current * injectFrame + prev * decayFrame
      result = current.rgb * injectFrame + prev * decayFrame;
    } else if (blendModeInt == 2) {
      // Crossfade mix mode
      result = mix(current.rgb, prev, decayFrame);
    } else {
      // Max / Screen mode
      result = max(current.rgb, prev * decayFrame);
    }

    gl_FragColor = vec4(mix(current.rgb, result, opacity), current.a);
  }
`

