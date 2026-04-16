// --- SHADER SOURCE STRINGS ---

const vert = `
  precision highp float;
  attribute vec3 aPosition;

  void main() {
    gl_Position = vec4(aPosition.xy, 0.0, 1.0);
  }
`;

const frag = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform float u_night;

  const float cloudscale = 1.1;
  const float speed = 0.03;
  const float clouddark = 0.5;
  const float cloudlight = 0.3;
  const float cloudcover = 0.2;
  const float cloudalpha = 8.0;
  const float skytint = 0.5;

  const vec3 daySky1 = vec3(0.40, 0.60, 0.90);
  const vec3 daySky2 = vec3(0.60, 0.80, 1.00);

  const vec3 nightSkyTop    = vec3(0.020, 0.040, 0.110);
  const vec3 nightSkyBottom = vec3(0.070, 0.100, 0.190);

  const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(in vec2 p) {
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;
    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0);
    vec3 n = h*h*h*h * vec3(
      dot(a, hash(i + 0.0)),
      dot(b, hash(i + o)),
      dot(c, hash(i + 1.0))
    );
    return dot(n, vec3(70.0));
  }

  vec3 spectrum(float t) {
    t = fract(t);
    return 0.5 + 0.5 * cos(6.28318 * (vec3(t) + vec3(0.0, 0.33, 0.67)));
  }

  float starCore(vec2 p, float r) {
    float d = length(p);
    float core = exp(-pow(d / max(r, 0.0001), 2.4));
    float halo = 0.42 * exp(-pow(d / max(r * 4.0, 0.0001), 1.6));
    return core + halo;
  }

  vec3 starTint(float t) {
    return mix(vec3(0.80, 0.88, 1.0), vec3(1.0, 0.95, 0.89), t);
  }

  float layeredStar(vec2 uv, float scale, float threshold, float sizeBase, float twinkleAmt, float brightness) {
    vec2 gv = fract(uv * scale) - 0.5;
    vec2 id = floor(uv * scale);

    float rnd = hash1(id);
    if (rnd < threshold) return 0.0;

    vec2 offs = vec2(hash1(id + 17.2), hash1(id + 43.7)) - 0.5;
    vec2 p = gv - offs * 0.72;

    float mag = pow(hash1(id + 91.1), 5.0);
    float size = mix(sizeBase * 0.65, sizeBase * 1.65, mag);

    float tw = mix(
      1.0,
      0.5 + 0.5 * sin(u_time * (0.7 + 2.0 * hash1(id + 12.4)) + rnd * 30.0),
      twinkleAmt
    );

    return starCore(p, size) * mix(0.30, brightness, mag) * tw;
  }

  vec3 enhancedStarField(vec2 uv, float clearSky, float skyHeightMask) {
    vec2 suv = uv;
    float aspect = u_resolution.x / u_resolution.y;
    suv.x *= aspect;

    vec3 stars = vec3(0.0);

    float clusterA = noise(suv * 2.2 + vec2(0.0, u_time * 0.003));
    float clusterB = noise(suv * 4.8 - vec2(u_time * 0.002, 0.0));
    float clusterC = noise(suv * 9.0 + vec2(5.7, -1.9));

    float structure = 0.58 * clusterA + 0.28 * clusterB + 0.14 * clusterC;
    float hazeMask = smoothstep(0.56, 0.88, structure);

    vec3 haze = vec3(0.06, 0.09, 0.16) * hazeMask * 0.18;

    float s1 = layeredStar(suv, 28.0, 0.915, 0.0100, 0.05, 0.95);
    float s2 = layeredStar(suv, 48.0, 0.945, 0.0072, 0.08, 1.05);
    float s3 = layeredStar(suv, 86.0, 0.968, 0.0052, 0.12, 1.15);
    float s4 = layeredStar(suv, 150.0, 0.983, 0.0038, 0.16, 1.22);

    float hero1 = layeredStar(suv, 18.0, 0.986, 0.0135, 0.05, 1.45);
    float hero2 = layeredStar(suv, 12.0, 0.992, 0.0160, 0.03, 1.70);

    float starMix = s1 + s2 + s3 + s4 + hero1 + hero2;

    float tintField1 = 0.5 + 0.5 * noise(suv * 12.0 + vec2(13.7, -4.2));
    float tintField2 = 0.5 + 0.5 * noise(suv * 19.0 + vec2(-7.1, 5.9));
    vec3 tint = starTint(mix(tintField1, tintField2, 0.5));

    stars += haze;
    stars += tint * starMix;

    vec2 p1 = suv - vec2(0.30 * aspect, 0.76);
    vec2 p2 = suv - vec2(0.70 * aspect, 0.64);
    vec2 p3 = suv - vec2(0.56 * aspect, 0.44);
    vec2 p4 = suv - vec2(0.17 * aspect, 0.56);

    float fixed1 = starCore(p1, 0.0055) * 1.05;
    float fixed2 = starCore(p2, 0.0048) * 0.90;
    float fixed3 = starCore(p3, 0.0060) * 1.18;
    float fixed4 = starCore(p4, 0.0045) * 0.82;

    stars += vec3(0.88, 0.92, 1.0) * fixed1;
    stars += vec3(1.00, 0.95, 0.88) * fixed2;
    stars += vec3(0.90, 0.96, 1.0) * fixed3;
    stars += vec3(1.00, 0.97, 0.92) * fixed4;

    float horizonFade = mix(0.28, 1.0, smoothstep(0.05, 0.78, uv.y));

    stars *= clearSky;
    stars *= skyHeightMask;
    stars *= horizonFade;

    return stars;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = uv;

    vec2 aspectUv = uv;
    aspectUv.x *= u_resolution.x / u_resolution.y;

    float time = u_time * speed;
    vec2 q = u_mouse * 0.5;

    float r = 0.0;
    float weight = 0.8;
    vec2 uv1 = aspectUv;
    for (int i = 0; i < 8; i++) {
      r += abs(weight * noise(uv1 + q));
      uv1 = m * uv1 + time;
      weight *= 0.7;
    }

    float f = 0.0;
    vec2 uv2 = aspectUv;
    uv2 *= cloudscale;
    uv2 -= q - time;
    weight = 0.7;
    for (int i = 0; i < 8; i++) {
      f += weight * noise(uv2);
      uv2 = m * uv2 + time;
      weight *= 0.6;
    }
    f *= r + f;

    float c = 0.0;
    float cTime = u_time * speed * 2.0;
    vec2 cUv = aspectUv;
    cUv *= cloudscale * 2.0;
    cUv -= q - cTime;
    weight = 0.4;
    for (int i = 0; i < 7; i++) {
      c += weight * noise(cUv);
      cUv = m * cUv + cTime;
      weight *= 0.6;
    }

    float c1 = 0.0;
    float rTime = u_time * speed * 3.0;
    vec2 rUv = aspectUv;
    rUv *= cloudscale * 3.0;
    rUv -= q - rTime;
    weight = 0.4;
    for (int i = 0; i < 7; i++) {
      c1 += abs(weight * noise(rUv));
      rUv = m * rUv + rTime;
      weight *= 0.6;
    }

    c += c1;

    float night = clamp(u_night, 0.0, 1.0);

    vec3 daySky = mix(daySky2, daySky1, p.y);
    vec3 nightSky = mix(nightSkyBottom, nightSkyTop, p.y);
    vec3 skycolour = mix(daySky, nightSky, night);

    f = cloudcover + cloudalpha * f * r;
    float cloudMask = clamp(f + c, 0.0, 1.0);

    float clearSky = 1.0 - clamp(cloudMask * 1.02, 0.0, 1.0);
    clearSky = smoothstep(0.04, 0.90, clearSky);

    float skyHeightMask = smoothstep(0.06, 0.98, p.y);

    vec3 stars = enhancedStarField(uv, clearSky, skyHeightMask);

    skycolour += stars * night * 1.28;

    vec3 cloudcolourDay = vec3(1.1, 1.1, 0.9) * clamp(clouddark + cloudlight * c, 0.0, 1.0);
    vec3 cloudcolourNight = vec3(0.70, 0.77, 0.90) * clamp(0.35 + 0.34 * c, 0.0, 1.0);
    vec3 cloudcolour = mix(cloudcolourDay, cloudcolourNight, night);

    float thinEdge = (1.0 - cloudMask) * smoothstep(0.18, 1.35, c1 + 0.35 * c);
    vec3 moonBlue = vec3(0.18, 0.24, 0.38) * thinEdge * night * 0.55;

    vec3 litClouds = clamp(
      mix(skytint, 0.34, night) * skycolour + cloudcolour + moonBlue,
      0.0,
      1.0
    );

    vec3 baseResult = mix(
      skycolour,
      litClouds,
      cloudMask
    );

    float sheenMask = smoothstep(0.5, 0.95, cloudMask);

    float phase =
      0.55 * c +
      0.35 * r +
      0.12 * sin(aspectUv.x * 8.0 - aspectUv.y * 5.0 + u_time * 0.6) +
      0.08 * sin(length(aspectUv - q * 0.8) * 18.0 - u_time * 1.1);

    vec3 iridescence = spectrum(phase);
    iridescence = mix(iridescence, vec3(1.0), 0.95);

    float highlight = smoothstep(0.2, 1.4, c1 + 0.4 * c);
    float sheenStrength = 0.88 * sheenMask * highlight * mix(1.0, 0.46, night);

    vec3 result = mix(baseResult, iridescence, sheenStrength);

    gl_FragColor = vec4(result, 1.0);
  }
`;

// --- P5.JS SKETCH ---

let cloudShader;
let isNight = false;
let nightBlend = 0.0;
let shaderTime = 0;

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let didTouchMove = false;

const TAP_MOVE_THRESHOLD = 16;
const TAP_TIME_THRESHOLD = 280;

function setup() {
  pixelDensity(2);
  createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();
  cloudShader = createShader(vert, frag);
}

function draw() {
  shader(cloudShader);

  nightBlend = lerp(nightBlend, isNight ? 1.0 : 0.0, 0.08);

  shaderTime += min(deltaTime, 100) / 1000.0;

  cloudShader.setUniform('u_resolution', [width, height]);
  cloudShader.setUniform('u_time', shaderTime);
  cloudShader.setUniform('u_night', nightBlend);

  const mx = constrain(mouseX / width, 0, 1);
  const my = constrain(1.0 - mouseY / height, 0, 1);
  cloudShader.setUniform('u_mouse', [mx, my]);

  beginShape();
  vertex(-1, -1, 0);
  vertex( 1, -1, 0);
  vertex( 1,  1, 0);
  vertex(-1,  1, 0);
  endShape(CLOSE);
}

function mousePressed(e) {
  if (e && e.target && e.target.closest('#logo')) return;
  isNight = !isNight;
}

function touchStarted() {
  if (touches.length > 0) {
    touchStartX = touches[0].x;
    touchStartY = touches[0].y;
    touchStartTime = millis();
    didTouchMove = false;
  }
  return false;
}

function touchMoved() {
  if (touches.length > 0) {
    const dx = touches[0].x - touchStartX;
    const dy = touches[0].y - touchStartY;
    if (dx * dx + dy * dy > TAP_MOVE_THRESHOLD * TAP_MOVE_THRESHOLD) {
      didTouchMove = true;
    }
  }
  return false;
}

function touchEnded(e) {
  const dt = millis() - touchStartTime;
  if (!didTouchMove && dt < TAP_TIME_THRESHOLD) {
    if (e && e.target && e.target.closest('#logo')) return false;
    isNight = !isNight;
  }
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
