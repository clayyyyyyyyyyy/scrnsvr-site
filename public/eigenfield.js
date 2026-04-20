// Eigenfield — p5.js instance mode, mounted as background of #eigenfield-bg.
// Adds compositional darkening baked into the shader so centered text stays legible.
(function () {
  var eigenfieldInstance = null;

  function startEigenfield() {
    if (eigenfieldInstance) return;
    eigenfieldInstance = new p5(function (p) {
      var sh;
      var touchX = 0.5, touchY = 0.5, targetTouchAmt = 0.0, touchAmt = 0.0;

      var phaseT = 0.0;
      var BASE_SPEED = 0.22;
      var DT_CLAMP = 1 / 60;

      var morphX = 0.0, morphY = 0.0;

      var RIPPLE_LIFE = 10.0;
      var ripples = [];
      var lastTrailT = 0;

      var RIPPLE_SAMPLE_EVERY = 0.055;
      var TOUCH_SIGMA = 0.065;
      var TOUCH_DECAY = 0.10;
      var TOUCH_BEAT = 0.99;
      var DPHI_GAIN = 0.512;
      var IRSHIFT_GAIN = 0.20;
      var SPARK_GAIN = 0.02;
      var TOUCH_GAIN = 1.5;

      var VERT = [
        'precision mediump float;',
        'attribute vec3 aPosition;',
        'attribute vec2 aTexCoord;',
        'uniform mat4 uProjectionMatrix;',
        'uniform mat4 uModelViewMatrix;',
        'varying vec2 vUv;',
        'void main(){',
        '  vUv = aTexCoord;',
        '  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);',
        '}'
      ].join('\n');

      var FRAG = [
        '#ifdef GL_ES',
        'precision highp float;',
        '#endif',
        'varying vec2 vUv;',
        'uniform vec2  uResolution;',
        'uniform float uPhase;',
        'uniform vec2  uTouch;',
        'uniform float uTouchAmt;',
        'uniform vec2  uMorph;',
        // Silhouette mask: up to 24 rects packed as (cx, cy, halfW, halfH) in device px.
        'uniform float uMaskRects[96];',
        'uniform float uMaskCount;',
        'uniform float uMaskFeather;',
        'uniform float uMaskDesat;', // 0..1 how far toward grayscale inside the mask
        'uniform float uMaskDim;',   // 0..1 small luma pull so cream text has contrast
        'uniform float uRipPos[96];',
        'uniform float uRipTime[48];',
        'uniform float uRipCount;',
        'const float PI  = 3.141592653589793;',
        'const float TAU = 6.283185307179586;',
        'const float PHI = 1.6180339887498948;',
        'const float SQ2 = 1.4142135623730951;',
        'float tanhFast(float x){ float e2x=exp(2.0*x); return (e2x-1.0)/(e2x+1.0); }',
        'vec3  pow3(vec3 a, float b){ return vec3(pow(a.x,b), pow(a.y,b), pow(a.z,b)); }',
        'float smoother5(float x){ x=clamp(x,0.0,1.0); return x*x*x*(x*(x*6.0-15.0)+10.0); }',
        'float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }',
        'vec3 envColor(vec3 d){',
        '  float u = clamp(d.y*0.5+0.5, 0.0, 1.0);',
        '  vec3 skyTop=vec3(0.09,0.24,0.62), skyHor=vec3(0.36,0.52,0.73), gnd=vec3(0.02,0.02,0.03);',
        '  vec3 sky = mix(skyHor, skyTop, smoothstep(0.0,1.0,u));',
        '  return mix(gnd, sky, smoothstep(0.0,1.0,u));',
        '}',
        'vec3 filmIridescence(float opd){',
        '  vec3 lambda=vec3(680.0,550.0,440.0);',
        '  vec3 phase = TAU*(opd/lambda);',
        '  vec3 I = 0.5+0.5*cos(phase);',
        '  return pow3(I,1.22);',
        '}',
        'vec3 spectral(float x){',
        '  float w=fract(x);',
        '  return clamp(vec3(',
        '    0.5+0.5*cos(TAU*(w+0.00)),',
        '    0.5+0.5*cos(TAU*(w-0.33)),',
        '    0.5+0.5*cos(TAU*(w-0.66))',
        '  ),0.0,1.0);',
        '}',
        'vec3 hueRotate(vec3 c, float a){',
        '  vec3 u=normalize(vec3(1.0));',
        '  float ca=cos(a), sa=sin(a), udc=dot(u,c);',
        '  vec3 crossUC=vec3(u.y*c.z-u.z*c.y, u.z*c.x-u.x*c.z, u.x*c.y-u.y*c.x);',
        '  vec3 cc=c*ca + crossUC*sa + u*udc*(1.0-ca);',
        '  return clamp(cc,0.0,1.0);',
        '}',
        'float wave1D(float x,float m){ return sin(m*PI*x); }',
        'float rectMode(vec2 uv,float m,float n){ return wave1D(uv.x,m)*wave1D(uv.y,n); }',
        'float torusMode(vec2 uv,float m,float n){ return cos(TAU*m*uv.x)*cos(TAU*n*uv.y); }',
        'float blendedRect(vec2 uv,float fM,float fN){',
        '  float m0=max(floor(fM),1.0), n0=max(floor(fN),1.0);',
        '  float aM=smoother5(fract(fM)), aN=smoother5(fract(fN));',
        '  float m1=m0+1.0, n1=n0+1.0;',
        '  float r00=rectMode(uv,m0,n0), r10=rectMode(uv,m1,n0);',
        '  float r01=rectMode(uv,m0,n1), r11=rectMode(uv,m1,n1);',
        '  return mix(mix(r00,r10,aM), mix(r01,r11,aM), aN);',
        '}',
        'vec2 stir(vec2 uv, vec2 touch,float amt,float t){',
        '  vec2 d=uv-touch; float r=length(d);',
        '  float warp=exp(-9.0*r*r)*amt;',
        '  return uv + d*warp*0.14*sin(7.0*r - 1.8*t);',
        '}',
        'vec2 moebius(vec2 uv, vec2 ctr, float t, float s){',
        '  vec2 z=(uv-ctr)*2.0;',
        '  float a=0.22*sin(0.032*t);',
        '  vec2 A=vec2(a*cos(0.052*t+1.0+s), a*sin(0.043*t+2.1-s));',
        '  vec2 num=z+A;',
        '  vec2 den=vec2(A.x*z.x - A.y*z.y + 1.0, A.x*z.y + A.y*z.x);',
        '  float inv=1.0/dot(den,den);',
        '  vec2 w=vec2(num.x*den.x+num.y*den.y, num.y*den.x-num.x*den.y)*inv;',
        '  return w*0.5+0.5;',
        '}',
        'vec2 extraDim6(vec2 uv,float t,float morphY){',
        '  float rate = 0.15 + 0.09*morphY;',
        '  vec2 zw=vec2(0.5+0.48*sin((0.14+0.01)*t),',
        '               0.5+0.48*sin((0.10+0.008)*t+1.3));',
        '  vec2 pq=vec2(0.5+0.48*sin((0.14*PHI)*t+0.7),',
        '               0.5+0.48*sin((0.10*SQ2)*t+0.1));',
        '  float a1 = (0.18+rate)*t;',
        '  float a2 = (0.16+rate*0.8)*PHI*t;',
        '  float c1=cos(a1), s1=sin(a1), c2=cos(a2), s2=sin(a2);',
        '  float x1 = uv.x*c1 + zw.x*s1; float z1 = -uv.x*s1 + zw.x*c1;',
        '  float y1 = uv.y*c1 + zw.y*s1; float w1 = -uv.y*s1 + zw.y*c1;',
        '  float x2 = x1*c2 + pq.x*s2;   float p2 = -x1*s2 + pq.x*c2;',
        '  float y2 = y1*c2 + pq.y*s2;   float q2 = -y1*s2 + pq.y*c2;',
        '  return vec2(x2 + 0.02*z1 + 0.02*p2, y2 + 0.02*w1 + 0.02*q2);',
        '}',
        'float quasi(vec2 uv, vec2 sc, float f1,float f2,float f3){',
        '  float a1=2.0*PI/5.0;',
        '  vec2 d0=vec2(1.0,0.0);',
        '  vec2 d1=vec2(cos(a1),sin(a1));',
        '  vec2 d2=vec2(cos(2.0*a1),sin(2.0*a1));',
        '  vec2 d3=vec2(cos(3.0*a1),sin(3.0*a1));',
        '  vec2 d4=vec2(cos(4.0*a1),sin(4.0*a1));',
        '  vec2 u = uv*sc;',
        '  float acc=0.0;',
        '  acc += 0.50*0.2*(cos(f1*dot(u,d0))+cos(f1*dot(u,d1))+cos(f1*dot(u,d2))+cos(f1*dot(u,d3))+cos(f1*dot(u,d4)));',
        '  acc += 0.30*0.2*(cos(f2*dot(u,d0))+cos(f2*dot(u,d1))+cos(f2*dot(u,d2))+cos(f2*dot(u,d3))+cos(f2*dot(u,d4)));',
        '  acc += 0.20*0.2*(cos(f3*dot(u,d0))+cos(f3*dot(u,d1))+cos(f3*dot(u,d2))+cos(f3*dot(u,d3))+cos(f3*dot(u,d4)));',
        '  return acc;',
        '}',
        'float fieldAll(vec2 uv, float t, vec2 sc, vec2 touch, float touchAmt, float morphY){',
        '  float breath=0.5+0.5*sin(0.33*t);',
        '  vec2 uvS = stir(uv, touch, touchAmt, t);',
        '  vec2 c1 = vec2(0.5) + 0.10*vec2(sin(0.09*t), cos(0.07*t+0.7));',
        '  vec2 c2 = vec2(0.5) + 0.09*vec2(sin(0.06*t+1.2), cos(0.08*t));',
        '  vec2 uvH1 = moebius(uvS, c1, t, 0.0);',
        '  vec2 uvH2 = moebius(uvS, c2, t*0.95, 0.7);',
        '  vec2 uv6a = extraDim6(uvH1, t*(0.60 + 0.16*breath), morphY);',
        '  vec2 uv6b = extraDim6(uvH2, t*(0.57 + 0.15*breath), morphY);',
        '  float ts = t * (0.60 + 0.03*PHI);',
        '  float tf = t * (0.95 + 0.02*SQ2);',
        '  float R1 = blendedRect(uv6a, 2.0+5.0*0.5*(sin(0.052*ts)+sin(0.067*ts+1.2)),',
        '                               3.0+5.0*0.5*(sin(0.049*ts+0.7)+sin(0.061*ts+2.5)));',
        '  float R2 = blendedRect(uvH1,  4.0+6.0*0.5*(sin(0.045*tf+2.2)+sin(0.069*tf)),',
        '                               4.0+6.0*0.5*(sin(0.047*tf)+sin(0.073*tf+1.0)));',
        '  float R3 = blendedRect(uvH2,  5.0+7.0*0.5*(sin(0.041*ts+1.1)+sin(0.059*ts+0.3)),',
        '                               5.0+7.0*0.5*(sin(0.052*ts+0.6)+sin(0.061*ts+2.0)));',
        '  float qA = quasi(uv6a, sc, 11.0, 17.0, 23.0);',
        '  float T1 = torusMode(uv6a + 0.002*qA, 3.0 + 2.0*sin(0.05*ts), 5.0 + 3.0*sin(0.065*ts));',
        '  float T2 = torusMode(uvH1, 8.0, 13.0);',
        '  float A = 0.60*R1 + 0.46*R2 + 0.40*R3;',
        '  float B = 0.34*T1 + 0.30*T2;',
        '  float phi = 0.62*A + 0.31*sin(2.0*A + 1.05*B) + 0.22*tanhFast(0.9*(A+B));',
        '  return phi*0.8;',
        '}',
        'vec2 gradFD(vec2 uv,float t,vec2 sc,vec2 touch,float touchAmt,float morphY){',
        '  float eps=1.0/max(uResolution.x,uResolution.y);',
        '  float a=fieldAll(uv+vec2( eps,0.0),t,sc,touch,touchAmt,morphY);',
        '  float b=fieldAll(uv+vec2(-eps,0.0),t,sc,touch,touchAmt,morphY);',
        '  float c=fieldAll(uv+vec2(0.0, eps),t,sc,touch,touchAmt,morphY);',
        '  float d=fieldAll(uv+vec2(0.0,-eps),t,sc,touch,touchAmt,morphY);',
        '  return vec2((a-b),(c-d))/(2.0*eps);',
        '}',
        'void main(){',
        '  float t = uPhase;',
        '  vec2 uv = vUv;',
        '  float aspect = uResolution.x / uResolution.y;',
        '  vec2 sc = vec2(max(aspect, 1.0), max(1.0/aspect, 1.0));',
        '  vec2 uvField = (uv - 0.5) * sc + 0.5;',
        '  float phi = fieldAll(uvField, t, sc, uTouch, uTouchAmt, uMorph.y);',
        '  float dPhi = 0.0, irShift = 0.0, spark = 0.0;',
        '  const int MAXN = 48;',
        '  for (int i=0; i<MAXN; i++){',
        '    float idx = float(i);',
        '    float active = step(idx, uRipCount-1.0);',
        '    float sx = uRipPos[i*2+0];',
        '    float sy = uRipPos[i*2+1];',
        '    float st = uRipTime[i];',
        '    float dt = max(0.0, t - st);',
        '    float sigma = ' + TOUCH_SIGMA.toFixed(3) + ';',
        '    float r = length(uv - vec2(sx,sy));',
        '    float env = active * exp(-(r*r)/(2.0*sigma*sigma)) * exp(-' + TOUCH_DECAY.toFixed(2) + '*dt);',
        '    if (env < 1e-4) continue;',
        '    float contour = cos(24.0*phi + 2.2*dt);',
        '    float beat    = 0.5 + 0.5*sin(' + TOUCH_BEAT.toFixed(2) + '*dt);',
        '    float local   = contour * beat;',
        '    dPhi    += ' + DPHI_GAIN.toFixed(3) + ' * ' + TOUCH_GAIN.toFixed(2) + ' * env * local;',
        '    irShift += ' + IRSHIFT_GAIN.toFixed(2) + ' * ' + TOUCH_GAIN.toFixed(2) + ' * env * (0.5 + 0.5*cos(18.0*phi + 1.3*dt));',
        '    spark   += ' + SPARK_GAIN.toFixed(2) + ' * ' + TOUCH_GAIN.toFixed(2) + ' * env * smoothstep(0.96, 1.0, contour);',
        '  }',
        '  phi += dPhi;',
        '  vec2 g=gradFD(uvField,t,sc,uTouch,uTouchAmt,uMorph.y);',
        '  float gmag=length(g);',
        '  float breath=0.5+0.5*sin(0.33*t);',
        '  float slopeScale=0.55+1.20*mix(0.6,1.0,breath)*smoothstep(0.0,1.0,gmag);',
        '  vec3 n=normalize(vec3(-g.x,-g.y,1.0/slopeScale));',
        '  float ndv=max(dot(n,vec3(0.0,0.0,1.0)),0.0);',
        '  vec3 r=reflect(vec3(0.0,0.0,-1.0),n);',
        '  vec3 base=envColor(r);',
        '  vec3 F0=vec3(0.018,0.026,0.036);',
        '  float pf=pow(1.0-ndv,5.0);',
        '  vec3 Fres=F0+(vec3(1.0)-F0)*pf;',
        '  float thickness_nm=420.0+145.0*sin(2.0*phi-0.16*t+0.55*uTouchAmt)+46.0*breath;',
        '  float opd=2.0*thickness_nm*ndv;',
        '  vec3 irid = mix(filmIridescence(opd), filmIridescence(opd*1.7), 0.28);',
        '  irid = mix(irid, irid*1.15, clamp(irShift, 0.0, 0.25));',
        '  float th = atan(n.y,n.x);',
        '  float lattice = quasi(uvField + 0.05*vec2(sin(0.11*t),cos(0.13*t)), sc, 11.0, 17.0, 23.0);',
        '  float grat = 0.5+0.5*cos((16.0+9.0*sin(0.14*t))*th + 0.9 + 1.1*lattice);',
        '  irid = mix(irid, irid*grat, 0.24);',
        '  float thetaG=atan(g.y,g.x);',
        '  float s1 = phi*0.55 + 0.08*sin(0.46*t) + thetaG/(2.0*PI);',
        '  float s2 = phi*0.90 + 0.11*sin(0.68*t + lattice*1.15);',
        '  vec3 spec1=spectral(s1);',
        '  vec3 spec2=spectral(s2 + 0.25*uMorph.x);',
        '  float detail = smoothstep(0.18,0.92,gmag);',
        '  vec3 color = mix(base, base*irid, 0.50);',
        '  color *= (0.82 + 0.44*Fres);',
        '  color  = mix(color, spec1, 0.16) + 0.09*spec2*(0.55+0.45*detail);',
        '  color  = hueRotate(color, 0.10*sin(0.40*t + 1.05*phi + 0.55*lattice));',
        '  color += spark;',
        '  vec2 px=vUv*uResolution;',
        '  float tw = hash21(floor(px*0.45))*TAU;',
        '  float tw2= hash21(floor(px*0.10)+13.7)*TAU;',
        '  float twinkle = (0.006*(0.6*sin(1.4*t + tw) + 0.4*sin(2.0*t + tw2))) * (0.6+0.4*detail);',
        '  color += twinkle;',
        '  float rEdge = min(min(vUv.x,1.0-vUv.x), min(vUv.y,1.0-vUv.y));',
        '  float pulse = 0.97 + 0.03*sin(0.20*t);',
        '  color *= mix(0.92, 1.0, smoothstep(0.0, 0.02, rEdge)*pulse);',
        // Compositional desaturation — feathered union of per-line text/control rects.
        // Inside the silhouette we pull color toward its own luma (art loses chroma)
        // and apply a small luma dim so cream text has a legible field.
        '  vec2 fragPx = vUv * uResolution;',
        '  float inside = 0.0;',
        '  const int MAX_MASK = 24;',
        '  for (int i = 0; i < MAX_MASK; i++){',
        '    if (float(i) >= uMaskCount) break;',
        '    vec2 rc  = vec2(uMaskRects[i*4+0], uMaskRects[i*4+1]);',
        '    vec2 rhw = vec2(uMaskRects[i*4+2], uMaskRects[i*4+3]);',
        '    vec2 dM = abs(fragPx - rc);',
        '    float mx = 1.0 - smoothstep(rhw.x, rhw.x + uMaskFeather, dM.x);',
        '    float my = 1.0 - smoothstep(rhw.y, rhw.y + uMaskFeather, dM.y);',
        '    inside = max(inside, mx * my);',
        '  }',
        '  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));',
        '  vec3 desatCol = mix(color, vec3(luma), uMaskDesat);',
        '  desatCol *= (1.0 - uMaskDim);',
        '  color = mix(color, desatCol, inside);',
        '  gl_FragColor = vec4(color,1.0);',
        '}'
      ].join('\n');

      p.setup = function () {
        p.setAttributes({ preserveDrawingBuffer: true, antialias: true });
        var cnv = p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
        cnv.parent('eigenfield-bg');
        p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
        p.rectMode(p.CENTER);
        p.noStroke();
        sh = p.createShader(VERT, FRAG);
      };

      var MAX_MASK = 24;
      var maskBuf = new Float32Array(MAX_MASK * 4);
      var maskCount = 0;
      var maskPadX = 18;  // px of horizontal breathing room around text lines
      var maskPadY = 6;   // px of vertical breathing room

      // Measure the silhouette of every [data-adapt] element:
      //  - paragraphs: per-line rects via Range.getClientRects()
      //  - form controls/status/logo: single bounding rect
      function measureMask() {
        var nodes = document.querySelectorAll('[data-adapt], .about-logo');
        var rects = [];
        nodes.forEach(function (el) {
          if (el.tagName === 'P') {
            var range = document.createRange();
            range.selectNodeContents(el);
            var lineRects = range.getClientRects();
            for (var i = 0; i < lineRects.length; i++) {
              var r = lineRects[i];
              if (r.width > 1 && r.height > 1) rects.push(r);
            }
          } else {
            rects.push(el.getBoundingClientRect());
          }
        });

        var pd = p.pixelDensity();
        var n = Math.min(rects.length, MAX_MASK);
        for (var k = 0; k < n; k++) {
          var rr = rects[k];
          var cx = (rr.left + rr.right) * 0.5 * pd;
          var cy = (rr.top + rr.bottom) * 0.5 * pd;
          var hw = (rr.width * 0.5 + maskPadX) * pd;
          var hh = (rr.height * 0.5 + maskPadY) * pd;
          maskBuf[k * 4 + 0] = cx;
          maskBuf[k * 4 + 1] = cy;
          maskBuf[k * 4 + 2] = hw;
          maskBuf[k * 4 + 3] = hh;
        }
        for (var m = n; m < MAX_MASK; m++) {
          maskBuf[m * 4 + 0] = 0;
          maskBuf[m * 4 + 1] = 0;
          maskBuf[m * 4 + 2] = 0;
          maskBuf[m * 4 + 3] = 0;
        }
        maskCount = n;
      }

      // Re-measure when layout can change: resize, font swap, scroll in #page-two.
      function scheduleMeasure() {
        requestAnimationFrame(measureMask);
      }
      window.addEventListener('resize', scheduleMeasure);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleMeasure);
      }
      setTimeout(measureMask, 0);
      setTimeout(measureMask, 400);
      setTimeout(measureMask, 1500);
      var pageTwo = document.getElementById('page-two');
      if (pageTwo) pageTwo.addEventListener('scroll', scheduleMeasure, { passive: true });

      p.draw = function () {
        var dt = Math.min(DT_CLAMP, Math.max(0, p.deltaTime / 1000));
        phaseT += dt * BASE_SPEED;

        p.shader(sh);

        touchAmt += (targetTouchAmt - touchAmt) * 0.12;
        // Decay the drive target so the effect fades when the pointer stops moving.
        targetTouchAmt *= 0.94;
        morphX *= 0.96; morphY *= 0.96;

        var pd = p.pixelDensity();
        sh.setUniform('uResolution', [p.width * pd, p.height * pd]);
        sh.setUniform('uPhase', phaseT);
        sh.setUniform('uTouch', [touchX, touchY]);
        sh.setUniform('uTouchAmt', touchAmt);
        sh.setUniform('uMorph', [morphX, morphY]);

        // Shader mask disabled — legibility handled by CSS backdrop-filter pills.
        sh.setUniform('uMaskRects', Array.from(maskBuf));
        sh.setUniform('uMaskCount', 0);
        sh.setUniform('uMaskFeather', 1);
        sh.setUniform('uMaskDesat', 0);
        sh.setUniform('uMaskDim', 0);

        var GPU_MAX = 100;
        var N = Math.min(ripples.length, GPU_MAX);
        var pos = new Float32Array(GPU_MAX * 2);
        var tim = new Float32Array(GPU_MAX);
        for (var i = 0; i < N; i++) {
          var r = ripples[ripples.length - 1 - i];
          pos[i * 2] = r.x; pos[i * 2 + 1] = r.y; tim[i] = r.t;
        }
        for (var j = N; j < GPU_MAX; j++) { pos[j * 2] = 0; pos[j * 2 + 1] = 0; tim[j] = -1e6; }
        sh.setUniform('uRipPos', Array.from(pos));
        sh.setUniform('uRipTime', Array.from(tim));
        sh.setUniform('uRipCount', N * 1.0);

        p.rect(0, 0, p.width, p.height);

        for (var k = ripples.length - 1; k >= 0; k--) {
          if (phaseT - ripples[k].t > RIPPLE_LIFE) ripples.splice(k, 1);
        }
      };

      function updateTouch(px, py, amt) {
        touchX = p.constrain(px / p.width, 0, 1);
        touchY = p.constrain(py / p.height, 0, 1);
        targetTouchAmt = amt;
      }

      function addRipple(px, py) {
        ripples.push({
          x: p.constrain(px / p.width, 0, 1),
          y: p.constrain(py / p.height, 0, 1),
          t: phaseT
        });
      }

      // Hover-as-drag: moving the pointer drives the same ripples + morph that
      // click-and-drag used to. Clicks/releases have no visual side effect.
      var lastMouseX = 0, lastMouseY = 0;
      var pointerInited = false;

      function applyPointer(x, y) {
        if (!pointerInited) {
          lastMouseX = x; lastMouseY = y; pointerInited = true;
          return;
        }
        updateTouch(x, y, 0.85);
        if (phaseT - lastTrailT > RIPPLE_SAMPLE_EVERY) {
          addRipple(x, y);
          lastTrailT = phaseT;
        }
        var dx = (x - lastMouseX) / p.width;
        var dy = (y - lastMouseY) / p.height;
        morphX = p.constrain(morphX + dx * 0.6, -1, 1);
        morphY = p.constrain(morphY - dy * 0.6, -1, 1);
        lastMouseX = x; lastMouseY = y;
      }

      p.mouseMoved = function () { applyPointer(p.mouseX, p.mouseY); };
      p.mouseDragged = function () { applyPointer(p.mouseX, p.mouseY); };
      p.mousePressed = function () {};
      p.mouseReleased = function () {};
      p.touchStarted = function () {};
      p.touchMoved = function () {
        if (p.touches.length) applyPointer(p.touches[0].x, p.touches[0].y);
        return false;
      };
      p.touchEnded = function () {};
      p.windowResized = function () {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        measureMask();
      };
    });
  }

  // Luminance-adaptive text. Periodically downsamples the WebGL canvas
  // and, for every element tagged [data-adapt], averages luminance under
  // its bounding box and flips a data-lum attribute used by CSS.
  function startLumAdapter() {
    var sample = document.createElement('canvas');
    sample.width = 80;
    sample.height = 80;
    var sctx = sample.getContext('2d', { willReadFrequently: true });
    var running = true;

    function tick() {
      if (!running) return;
      var bg = document.getElementById('eigenfield-bg');
      var cnv = bg && bg.querySelector('canvas');
      if (!cnv || !cnv.width) { setTimeout(tick, 120); return; }

      try {
        sctx.drawImage(cnv, 0, 0, sample.width, sample.height);
      } catch (e) {
        setTimeout(tick, 200);
        return;
      }

      var nodes = document.querySelectorAll('[data-adapt]');
      var vw = window.innerWidth, vh = window.innerHeight;
      nodes.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var x0 = Math.max(0, Math.floor(r.left / vw * sample.width));
        var y0 = Math.max(0, Math.floor(r.top / vh * sample.height));
        var x1 = Math.min(sample.width, Math.ceil(r.right / vw * sample.width));
        var y1 = Math.min(sample.height, Math.ceil(r.bottom / vh * sample.height));
        var sw = Math.max(1, x1 - x0), sh = Math.max(1, y1 - y0);
        var data;
        try {
          data = sctx.getImageData(x0, y0, sw, sh).data;
        } catch (e) { return; }
        var L = 0, n = 0;
        for (var i = 0; i < data.length; i += 4) {
          L += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          n++;
        }
        var avg = n ? (L / (n * 255)) : 0;
        el.dataset.lum = avg > 0.52 ? 'light' : 'dark';
      });

      setTimeout(tick, 140);
    }

    tick();
    return function stop() { running = false; };
  }

  // Mirror-canvas blur. `backdrop-filter` can't reliably sample through a WebGL
  // canvas on its own compositor layer, so we keep a continuously-updated 2D copy
  // of the art and CSS-blur it. A clip-path built from every [data-adapt] rect
  // reveals the mirror only inside the pill silhouettes.
  function startPillMirror() {
    var mirror = document.getElementById('eigenfield-mirror');
    var mirrorSharp = document.getElementById('eigenfield-mirror-sharp');
    if (!mirror) return function () {};
    var mctx = mirror.getContext('2d');
    var mctxSharp = mirrorSharp ? mirrorSharp.getContext('2d') : null;
    var SCALE = 0.4;
    // Full-res copy so mix-blend-mode siblings (e.g. .about-hero) blend against
    // a crisp 2D backdrop on iOS instead of the WebGL layer they can't sample.
    var SCALE_SHARP = 1;
    var running = true;
    var clipDirty = true;

    function sizeMirror() {
      var w = Math.max(2, Math.floor(window.innerWidth * SCALE));
      var h = Math.max(2, Math.floor(window.innerHeight * SCALE));
      if (mirror.width !== w) mirror.width = w;
      if (mirror.height !== h) mirror.height = h;
      mirror.style.width = window.innerWidth + 'px';
      mirror.style.height = window.innerHeight + 'px';
      if (mirrorSharp) {
        var ws = Math.max(2, Math.floor(window.innerWidth * SCALE_SHARP));
        var hs = Math.max(2, Math.floor(window.innerHeight * SCALE_SHARP));
        if (mirrorSharp.width !== ws) mirrorSharp.width = ws;
        if (mirrorSharp.height !== hs) mirrorSharp.height = hs;
        mirrorSharp.style.width = window.innerWidth + 'px';
        mirrorSharp.style.height = window.innerHeight + 'px';
      }
    }

    function buildClipPath() {
      var nodes = document.querySelectorAll('[data-adapt]');
      var parts = [];
      nodes.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return;
        // Skip empty text containers (e.g. the pre-submit waitlist-status).
        if (el.tagName === 'P' && !el.textContent.trim()) return;
        var rr = Math.min(20, r.height * 0.5, r.width * 0.5);
        var x = r.left, y = r.top, w = r.width, h = r.height;
        parts.push(
          'M ' + (x + rr) + ' ' + y +
          ' h ' + (w - 2 * rr) +
          ' a ' + rr + ' ' + rr + ' 0 0 1 ' + rr + ' ' + rr +
          ' v ' + (h - 2 * rr) +
          ' a ' + rr + ' ' + rr + ' 0 0 1 ' + (-rr) + ' ' + rr +
          ' h ' + (-(w - 2 * rr)) +
          ' a ' + rr + ' ' + rr + ' 0 0 1 ' + (-rr) + ' ' + (-rr) +
          ' v ' + (-(h - 2 * rr)) +
          ' a ' + rr + ' ' + rr + ' 0 0 1 ' + rr + ' ' + (-rr) +
          ' Z'
        );
      });
      if (!parts.length) {
        mirror.style.clipPath = 'inset(100%)';
        mirror.style.webkitClipPath = 'inset(100%)';
      } else {
        var d = 'path("' + parts.join(' ') + '")';
        mirror.style.clipPath = d;
        mirror.style.webkitClipPath = d;
      }
    }

    function markClipDirty() { clipDirty = true; }

    sizeMirror();
    window.addEventListener('resize', function () {
      sizeMirror();
      markClipDirty();
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(markClipDirty);
    var pt = document.getElementById('page-two');
    if (pt) pt.addEventListener('scroll', markClipDirty, { passive: true });
    setTimeout(markClipDirty, 0);
    setTimeout(markClipDirty, 400);
    setTimeout(markClipDirty, 1500);

    var lastDraw = 0;
    function tick(t) {
      if (!running) return;
      if (clipDirty) { buildClipPath(); clipDirty = false; }
      if (t - lastDraw > 33) { // ~30fps
        var cnv = document.querySelector('#eigenfield-bg canvas');
        if (cnv && cnv.width > 0) {
          try {
            mctx.drawImage(cnv, 0, 0, mirror.width, mirror.height);
            if (!mirror.classList.contains('is-ready')) mirror.classList.add('is-ready');
            if (mctxSharp) {
              mctxSharp.drawImage(cnv, 0, 0, mirrorSharp.width, mirrorSharp.height);
              if (!mirrorSharp.classList.contains('is-ready')) mirrorSharp.classList.add('is-ready');
            }
          } catch (e) { /* canvas not ready */ }
          lastDraw = t;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    return function stop() { running = false; };
  }

  window.startEigenfield = startEigenfield;
  window.startLumAdapter = startLumAdapter;
  window.startPillMirror = startPillMirror;
})();
