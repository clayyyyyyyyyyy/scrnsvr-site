// ── Sanctum: Section-Aware Generative Background ──

// ── SKETCH DEFINITIONS ──
// Each sketch renders full-screen into #bg-canvas

// TORUS HYPERSTRUCTURE (identical to sanctum.art)
function torusSketch(p) {
  let angle = 0;
  let wAngle = 0;
  let touchYFactor = 0.5;
  let touchXFactor = 0.5;
  let inputX = null;
  let inputY = null;
  let isInteracting = false;

  p.setup = function () {
    let canvas = p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
    canvas.parent('bg-canvas');
    p.colorMode(p.HSB, 360, 75, 75);
    p.noStroke();
  };

  p.draw = function () {
    p.background(0);

    if (p.touches.length > 0) {
      inputX = p.touches[0].x;
      inputY = p.touches[0].y;
      isInteracting = true;
    } else if (
      p.mouseIsPressed &&
      p.mouseX >= 0 && p.mouseX <= p.width &&
      p.mouseY >= 0 && p.mouseY <= p.height
    ) {
      inputX = p.mouseX;
      inputY = p.mouseY;
      isInteracting = true;
    } else {
      isInteracting = false;
    }

    if (isInteracting) {
      touchYFactor = p.constrain(p.map(inputY, 0, p.height, 1.2, 0.2), 0.2, 1.2);
      touchXFactor = p.constrain(p.map(inputX, 0, p.width, 0.2, 1.2), 0.2, 1.2);
    } else {
      touchYFactor = p.lerp(touchYFactor, 0.5, 0.02);
      touchXFactor = p.lerp(touchXFactor, 0.5, 0.02);
    }

    let layers, pointsPerLayer, sphereSize, torusRadius, torusTube, maxRadius;
    if (p.width <= 800) {
      layers = 35;
      pointsPerLayer = 35;
      sphereSize = 3;
      torusRadius = 5;
      torusTube = 2;
      maxRadius = 200;
    } else {
      let scaleFactor = p.min(p.width, p.height) / 800;
      layers = p.floor(35 * scaleFactor);
      pointsPerLayer = p.floor(35 * scaleFactor);
      sphereSize = 3 * scaleFactor;
      torusRadius = 5 * scaleFactor;
      torusTube = 2 * scaleFactor;
      maxRadius = p.min(p.width * 0.4, p.height * 0.35);
    }

    const globalHueShift = p.frameCount * 0.3 * touchYFactor;

    let lx = p.sin(p.frameCount * 0.01) * 600;
    let ly = p.cos(p.frameCount * 0.01) * 600;
    let lz = p.sin(p.frameCount * 0.01) * p.cos(p.frameCount * 0.01) * 600;
    p.pointLight(255, 255, 255, lx, ly, lz);
    p.ambientLight(40, 40, 40);

    p.rotateX(p.frameCount * 0.003 * touchXFactor);
    p.rotateY(p.frameCount * 0.004 * touchXFactor);
    p.rotateZ(p.frameCount * 0.005 * touchXFactor);

    for (let j = 0; j < layers; j++) {
      let layerOffset = p.map(j, 0, layers, -p.PI, p.PI);
      for (let i = 0; i < pointsPerLayer; i++) {
        const theta = p.map(i, 0, pointsPerLayer, 0, p.TWO_PI);
        const phi = p.map(j, 0, layers, 0, p.PI);
        let r = maxRadius * (0.5 + 0.5 * p.sin(p.frameCount * 0.01 * touchYFactor + layerOffset));
        let x = r * p.sin(phi) * p.cos(theta + wAngle);
        let y = r * p.sin(phi) * p.sin(theta + wAngle);
        let z = r * p.cos(phi);

        let h = (globalHueShift + i * 10 + j * 5 + p.sin(theta + phi) * 30) % 360;
        let s = 100;
        let b = p.map(p.sin(p.frameCount * 0.01 + layerOffset), -1, 1, 75, 100);

        p.ambientMaterial(h, s, b);

        p.push();
        p.translate(x, y, z);
        if (j % 3 === 0) {
          p.torus(torusRadius, torusTube);
        } else {
          p.sphere(sphereSize + p.sin(p.frameCount * 0.02 + i) * 0.5);
        }
        p.pop();
      }
    }

    angle += 0.006;
    wAngle += 0.02 * touchYFactor;
  };

  p.windowResized = function () {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
}

// FLAME ATTRACTOR
function flameSketch(p) {
  let particles = [];
  let t = 0;
  let zoom;
  let symmetry = 6;
  let touchInfluence = 0;

  class FlameParticle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = p.random(-1, 1);
      this.y = p.random(-1, 1);
      this.life = p.random(0, 100);
      this.speed = 0;
      this.hueSeed = p.random(360);
    }

    hybridAttractor(x, y) {
      let a = 1.4 + 0.4 * p.sin(t * 0.9 + touchInfluence * 2);
      let b = 1.3 + 0.3 * p.cos(t * 0.5);
      let c = 0.9 + 0.4 * p.sin(t * 0.3);
      let d = 1.2 + 0.2 * p.cos(t * 0.7 + touchInfluence);

      let x1 = p.sin(a * y) - p.cos(b * x);
      let y1 = p.sin(c * x) - p.cos(d * y);

      let swirlX = 0.5 * p.sin(y * 3 + t) * touchInfluence;
      let swirlY = 0.5 * p.cos(x * 3 - t) * touchInfluence;

      return [x1 + swirlX, y1 + swirlY];
    }

    update() {
      let [nx, ny] = this.hybridAttractor(this.x, this.y);
      this.speed = p.sqrt((this.x - nx) ** 2 + (this.y - ny) ** 2);
      this.x = nx;
      this.y = ny;
      this.life++;
      if (this.life > 300 || this.speed > 6.0) this.reset();
    }

    display() {
      let px = this.x * zoom;
      let py = this.y * zoom;

      let alpha = p.map(this.speed, 0, 0.5, 0.01, 0.08);
      let baseHue = (this.hueSeed + t * 100 + touchInfluence * 200) % 360;
      let size = 1;

      for (let i = 0; i < symmetry; i++) {
        let phaseDrift = 0.15 * touchInfluence * p.sin(t + i);
        let angle = (p.TWO_PI / symmetry) * i + phaseDrift;
        let cosA = p.cos(angle);
        let sinA = p.sin(angle);
        let x1 = px * cosA - py * sinA;
        let y1 = px * sinA + py * cosA;

        let distFromCenter = p.sqrt(x1 * x1 + y1 * y1);
        let angleFromCenter = p.atan2(y1, x1);

        let hueMod =
          40 * p.sin(angleFromCenter * 3 + t * 0.8) +
          30 * p.cos(distFromCenter * 0.02 + t * 0.6) +
          20 * p.sin(this.hueSeed * 0.05 + t * 0.4) +
          15 * p.sin(i * 0.5 + t * 0.3);

        let centerHeat = p.map(distFromCenter, 0, p.width * 0.4, -30, 0);
        let flameHue = (baseHue + hueMod + centerHeat + 360) % 360;

        p.fill(flameHue, 90, 100, alpha);
        p.ellipse(x1, y1, size, size);

        p.fill((flameHue + 180) % 360, 80, 100, alpha * 0.7);
        p.ellipse(-x1, y1, size * 0.9, size * 0.9);
      }
    }
  }

  p.setup = function () {
    let canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('bg-canvas');
    p.colorMode(p.HSB, 360, 100, 100, 1);
    p.noStroke();
    p.pixelDensity(2);
    p.frameRate(60);

    zoom = p.min(p.windowWidth, p.windowHeight) * 0.21;

    for (let i = 0; i < 2500; i++) {
      particles.push(new FlameParticle());
    }

    p.background(0);
  };

  p.draw = function () {
    p.background(0);
    p.translate(p.width / 2, p.height / 2);
    t += 0.03;

    for (let ptl of particles) {
      ptl.update();
      ptl.display();
    }
  };

  p.touchMoved = function () {
    let dx = p.abs(p.mouseX - p.pmouseX);
    let dy = p.abs(p.mouseY - p.pmouseY);
    touchInfluence = (dx + dy) / 150.0;
    return false;
  };

  p.windowResized = function () {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    zoom = p.min(p.windowWidth, p.windowHeight) * 0.21;
  };
}

// GRID WAVE
function waveSketch(p) {
  let step = 10;
  let time = 0;
  let waveFactor = 0.035;
  let cx = 0;
  let cy = 0;
  let targetCx = 0;
  let targetCy = 0;
  let followMouse = false;

  p.setup = function () {
    let canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('bg-canvas');
    p.noFill();
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.strokeWeight(1);
  };

  p.draw = function () {
    p.background(0);
    p.strokeWeight(1);
    p.translate(p.width / 2, p.height / 2);

    if (!followMouse) {
      targetCx = 200 * p.sin(time * 0.3);
      targetCy = 200 * p.cos(time * 0.2);
    }

    cx = p.lerp(cx, targetCx, 0.05);
    cy = p.lerp(cy, targetCy, 0.05);

    let globalHueShift = (time * 25) % 360;

    for (let x = -p.width / 2; x < p.width / 2; x += step) {
      for (let y = -p.height / 2; y < p.height / 2; y += step) {
        let d = p.dist(x, y, cx, cy) + 0.0001;
        let wave = p.sin(d * waveFactor + time) * p.cos(x * waveFactor + y * waveFactor);

        let hue = (p.map(wave, -1, 1, 0, 360) + globalHueShift) % 360;
        let sat = 90 + 10 * p.sin(d * 0.01 + time * 0.2);
        let bright = 75 + 20 * wave;

        p.stroke(hue, sat, bright, 80);

        let radius = p.map(wave, -1, 1, 2, 20) + 5 * p.sin(time + d * 0.01);
        p.ellipse(x, y, radius);
      }
    }

    time += 0.02;
  };

  p.mouseDragged = function () {
    targetCx = p.mouseX - p.width / 2;
    targetCy = p.mouseY - p.height / 2;
    followMouse = true;
  };

  p.mouseReleased = function () {
    followMouse = false;
  };

  p.touchMoved = function () {
    targetCx = p.touches[0].x - p.width / 2;
    targetCy = p.touches[0].y - p.height / 2;
    followMouse = true;
    return false;
  };

  p.touchEnded = function () {
    followMouse = false;
  };

  p.windowResized = function () {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
}

// ── SKETCH REGISTRY ──

const sketches = {
  torus: torusSketch,
  flame: flameSketch,
  wave: waveSketch
};

// ── SECTION-AWARE SWITCHING ──

let currentSketchName = null;
let currentInstance = null;

function switchSketch(name) {
  if (name === currentSketchName) return;

  if (currentInstance) {
    currentInstance.remove();
    currentInstance = null;
  }

  currentSketchName = name;
  if (sketches[name]) {
    currentInstance = new p5(sketches[name]);
  }
}

// Start with the opening section's sketch
switchSketch('torus');

// Watch sections for visibility
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const sketchName = entry.target.dataset.sketch;
      if (sketchName) {
        switchSketch(sketchName);
      }
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('section[data-sketch]').forEach(section => {
  sectionObserver.observe(section);
});

// ── Scroll fade-in ──

const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.fade-in').forEach(el => fadeObserver.observe(el));
