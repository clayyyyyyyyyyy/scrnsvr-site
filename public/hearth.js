let particles = [];
let symmetry = 6;
let t = 0;
let zoom;
let touchInfluence = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 1);
  noStroke();
  pixelDensity(2);
  frameRate(60);

  zoom = min(width, height) * 0.2;

  for (let i = 0; i < 3500; i++) {
    particles.push(new FlameParticle());
  }

  background(0);
}

function draw() {
  background(0, 0.1);
  translate(width / 2, height / 2);
  t += 0.025;

  for (let p of particles) {
    p.update();
    p.display();
  }
}

class FlameParticle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = random(-1, 1);
    this.y = random(-1, 1);
    this.life = random(0, 100);
    this.speed = 0;
    this.hueSeed = random(360);
  }

  update() {
    let a = 1.4 + 0.4 * sin(t * 0.9 + touchInfluence * 2);
    let b = 1.3 + 0.3 * cos(t * 0.5);
    let c = 0.9 + 0.4 * sin(t * 0.3);
    let d = 1.2 + 0.2 * cos(t * 0.7 + touchInfluence);

    let nx = sin(a * this.y) - cos(b * this.x);
    let ny = sin(c * this.x) - cos(d * this.y);

    nx += 0.5 * sin(this.y * 3 + t) * touchInfluence;
    ny += 0.5 * cos(this.x * 3 - t) * touchInfluence;

    this.speed = sqrt((this.x - nx) ** 2 + (this.y - ny) ** 2);
    this.x = nx;
    this.y = ny;
    this.life++;
    if (this.life > 300 || this.speed > 6.0) this.reset();
  }

  display() {
    let px = this.x * zoom;
    let py = this.y * zoom;

    let alpha = map(this.speed, 0, 0.5, 0.01, 0.08);
    let baseHue = (this.hueSeed + t * 100 + touchInfluence * 200) % 360;
    let brightness = 100;
    let size = 1;

    for (let i = 0; i < symmetry; i++) {
      let phaseDrift = 0.15 * touchInfluence * sin(t + i);
      let angle = TWO_PI / symmetry * i + phaseDrift;
      let cosA = cos(angle);
      let sinA = sin(angle);
      let x1 = px * cosA - py * sinA;
      let y1 = px * sinA + py * cosA;

      let distFromCenter = sqrt(x1 * x1 + y1 * y1);
      let angleFromCenter = atan2(y1, x1);

      let hueMod =
        40 * sin(angleFromCenter * 3 + t * 0.8) +
        30 * cos(distFromCenter * 0.02 + t * 0.6) +
        20 * sin(this.hueSeed * 0.05 + t * 0.4) +
        15 * sin(i * 0.5 + t * 0.3);

      let centerHeat = map(distFromCenter, 0, width * 0.4, -30, 0);
      let flameHue = (baseHue + hueMod + centerHeat + 360) % 360;

      fill(flameHue, 90, brightness, alpha);
      ellipse(x1, y1, size, size);

      fill((flameHue + 180) % 360, 80, brightness, alpha * 0.7);
      ellipse(-x1, y1, size * 0.9, size * 0.9);
    }
  }
}

function touchMoved() {
  let dx = abs(mouseX - pmouseX);
  let dy = abs(mouseY - pmouseY);
  touchInfluence = (dx + dy) / 150.0;
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  zoom = min(width, height) * 0.2;
}
