const vert = `
  precision highp float;
  attribute vec3 aPosition;

  void main() {
    gl_Position = vec4(aPosition.xy, 0.0, 1.0);
  }
`;

const frag = `
  precision highp float;

  uniform vec2 u_viewport;
  uniform vec2 u_origin;
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

  void main() {
    vec2 globalFrag = gl_FragCoord.xy + u_origin;
    vec2 uv = globalFrag / u_viewport;
    vec2 p = uv;

    vec2 aspectUv = uv;
    aspectUv.x *= u_viewport.x / u_viewport.y;

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

document.addEventListener('DOMContentLoaded', function() {
  const btn = document.querySelector('.waitlist-form button');
  if (!btn || typeof p5 === 'undefined') return;

  new p5(function(p) {
    let cloudShader;
    let shaderTime = 0;

    p.setup = function() {
      p.pixelDensity(2);
      const w = Math.max(btn.clientWidth, 1);
      const h = Math.max(btn.clientHeight, 1);
      const canvas = p.createCanvas(w, h, p.WEBGL);
      canvas.parent(btn);
      document.querySelectorAll('main').forEach(function(m) {
        if (m.children.length === 0) m.remove();
      });
      p.noStroke();
      cloudShader = p.createShader(vert, frag);

      const ro = new ResizeObserver(function() {
        p.resizeCanvas(Math.max(btn.clientWidth, 1), Math.max(btn.clientHeight, 1));
      });
      ro.observe(btn);
    };

    p.draw = function() {
      p.shader(cloudShader);
      shaderTime += Math.min(p.deltaTime, 100) / 1000.0;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = btn.getBoundingClientRect();
      const originX = rect.left;
      const originY = vh - rect.bottom;

      cloudShader.setUniform('u_viewport', [vw, vh]);
      cloudShader.setUniform('u_origin', [originX, originY]);
      cloudShader.setUniform('u_time', shaderTime);
      cloudShader.setUniform('u_night', 0.0);
      cloudShader.setUniform('u_mouse', [0.5, 0.5]);

      p.beginShape();
      p.vertex(-1, -1, 0);
      p.vertex( 1, -1, 0);
      p.vertex( 1,  1, 0);
      p.vertex(-1,  1, 0);
      p.endShape(p.CLOSE);
    };
  });
});
