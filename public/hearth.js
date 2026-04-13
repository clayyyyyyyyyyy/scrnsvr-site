// Hypertorus — p5.js instance mode
var hypertorusInstance = null;

function startHypertorus() {
  if (hypertorusInstance) return;
  hypertorusInstance = new p5(function(p) {
    var angle = 0;
    var wAngle = 0;
    var touchYFactor = 0.5;
    var touchXFactor = 0.5;
    var inputX = null;
    var inputY = null;
    var isInteracting = false;

    p.setup = function() {
      var container = document.getElementById('page-two');
      var w = container.offsetWidth || p.windowWidth;
      var h = container.offsetHeight || p.windowHeight;
      var cnv = p.createCanvas(w, h, p.WEBGL);
      cnv.parent('page-two');
      p.colorMode(p.HSB, 360, 75, 75);
      p.noStroke();
    };

    p.draw = function() {
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

      var layers, pointsPerLayer, sphereSize, torusRadius, torusTube, maxRadius;
      var shorter = p.min(p.width, p.height);
      if (p.width <= 800) {
        layers = 35;
        pointsPerLayer = 35;
        sphereSize = 3;
        torusRadius = 5;
        torusTube = 2;
        maxRadius = shorter * 0.28;
      } else {
        var scaleFactor = shorter / 800;
        layers = p.floor(35 * scaleFactor);
        pointsPerLayer = p.floor(35 * scaleFactor);
        sphereSize = 3 * scaleFactor;
        torusRadius = 5 * scaleFactor;
        torusTube = 2 * scaleFactor;
        maxRadius = shorter * 0.35;
      }

      var globalHueShift = p.frameCount * 0.3 * touchYFactor;

      var lx = p.sin(p.frameCount * 0.01) * 600;
      var ly = p.cos(p.frameCount * 0.01) * 600;
      var lz = p.sin(p.frameCount * 0.01) * p.cos(p.frameCount * 0.01) * 600;
      p.pointLight(255, 255, 255, lx, ly, lz);
      p.ambientLight(40, 40, 40);

      p.rotateX(p.frameCount * 0.003 * touchXFactor);
      p.rotateY(p.frameCount * 0.004 * touchXFactor);
      p.rotateZ(p.frameCount * 0.005 * touchXFactor);

      for (var j = 0; j < layers; j++) {
        var layerOffset = p.map(j, 0, layers, -p.PI, p.PI);
        for (var i = 0; i < pointsPerLayer; i++) {
          var theta = p.map(i, 0, pointsPerLayer, 0, p.TWO_PI);
          var phi = p.map(j, 0, layers, 0, p.PI);
          var r = maxRadius * (0.5 + 0.5 * p.sin(p.frameCount * 0.01 * touchYFactor + layerOffset));
          var x = r * p.sin(phi) * p.cos(theta + wAngle);
          var y = r * p.sin(phi) * p.sin(theta + wAngle);
          var z = r * p.cos(phi);

          var h = (globalHueShift + i * 10 + j * 5 + p.sin(theta + phi) * 30) % 360;
          var s = 100;
          var b = p.map(p.sin(p.frameCount * 0.01 + layerOffset), -1, 1, 75, 100);

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

    p.windowResized = function() {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };
  });
}
