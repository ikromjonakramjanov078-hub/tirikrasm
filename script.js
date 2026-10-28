
const canvas = document.getElementById("artCanvas");
const fxCanvas = document.getElementById("fxCanvas");
const ctx = canvas.getContext("2d");
const fx = fxCanvas.getContext("2d");

const $ = id => document.getElementById(id);

let drawing = false;
let lastPoint = null;
let currentTool = "draw";
let currentColor = "#ffd21f";
let brushSize = 4;
let glow = 18;
let speed = 5;
let paused = false;
let animating = false;
let strokes = [];
let currentStroke = null;
let particles = [];
let animationFrame = 0;
let toastTimer;
let missionIndex = 0;
let missionDone = [false, false, false];
let savedImage = null;
let canvasWidth = 0;
let canvasHeight = 0;

const missions = [
  {
    text: "Oltin rangda kamida 3 ta chiziq chizib, asaringni jonlant.",
    count: () => strokes.filter(s => s.color === "#ffd21f").length >= 3
  },
  {
    text: "Galaktika effektini tanla va ekranda kamida 100 ta zarracha hosil qil.",
    count: () => $("effect").value === "galaxy" && particles.length >= 100
  },
  {
    text: "Istalgan rangda rasm chiz va uni PNG formatida saqla.",
    count: () => strokes.length > 0 && savedImage !== null
  }
];

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const oldWidth = canvasWidth;
  const oldHeight = canvasHeight;

  const oldArt = document.createElement("canvas");
  oldArt.width = canvas.width;
  oldArt.height = canvas.height;

  if (oldWidth && oldHeight) {
    oldArt.getContext("2d").drawImage(canvas, 0, 0);
  }

  canvasWidth = rect.width;
  canvasHeight = rect.height;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  [canvas, fxCanvas].forEach(c => {
    c.width = Math.round(canvasWidth * dpr);
    c.height = Math.round(canvasHeight * dpr);
    c.style.width = canvasWidth + "px";
    c.style.height = canvasHeight + "px";
  });

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  fx.lineCap = "round";

  if (oldWidth && oldHeight) {
    ctx.drawImage(oldArt, 0, 0, oldWidth, oldHeight,
      0, 0, canvasWidth, canvasHeight);
  }

  renderStrokes();
  if (animating) createAmbientParticles();
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function updateStatus(message) {
  $("statusText").textContent = message;
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function setDrawingStyle(color) {
  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
}

function drawSegment(from, to, color, width) {
  ctx.save();
  setDrawingStyle(color);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function renderStrokes() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  for (const stroke of strokes) {
    if (!stroke.points.length) continue;

    ctx.save();
    setDrawingStyle(stroke.color);
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
    }

    ctx.stroke();
    ctx.restore();
  }
}

function startDrawing(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();

  drawing = true;
  lastPoint = getPoint(event);

  if (currentTool === "erase") {
    const erased = strokes.length;
    strokes = strokes.filter(stroke => {
      return !stroke.points.some(point =>
        Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y)
        < Math.max(brushSize * 2, 14)
      );
    });

    if (strokes.length !== erased) {
      renderStrokes();
      updateStrokeCount();
    }
    return;
  }

  if (currentTool === "move") {
    burstParticles(lastPoint.x, lastPoint.y, 55);
    return;
  }

  currentStroke = {
    color: currentColor,
    width: brushSize,
    points: [lastPoint]
  };

  strokes.push(currentStroke);
  $("emptyHint").classList.add("hidden");
  canvas.setPointerCapture?.(event.pointerId);

  if (animating) burstParticles(lastPoint.x, lastPoint.y, 4);

  updateStrokeCount();
  updateStatus("IJOD DAVOM ETMOQDA");
}

function continueDrawing(event) {
  const point = getPoint(event);

  $("coordinates").textContent =
    `X: ${String(Math.round(point.x)).padStart(3, "0")} · Y: ${String(Math.round(point.y)).padStart(3, "0")}`;

  if (!drawing || !lastPoint) return;
  event.preventDefault();

  if (currentTool === "erase") {
    const before = strokes.length;
    strokes = strokes.filter(stroke =>
      !stroke.points.some(p =>
        Math.hypot(p.x - point.x, p.y - point.y) < Math.max(brushSize * 2, 14)
      )
    );
    if (before !== strokes.length) {
      renderStrokes();
      updateStrokeCount();
    }
    lastPoint = point;
    return;
  }

  if (currentTool === "move") {
    burstParticles(point.x, point.y, 3);
    lastPoint = point;
    return;
  }

  if (!currentStroke) return;

  currentStroke.points.push(point);
  drawSegment(lastPoint, point, currentColor, brushSize);

  if (animating) {
    burstParticles(point.x, point.y, 1);
  }

  lastPoint = point;
}

function stopDrawing() {
  if (!drawing) return;
  drawing = false;
  lastPoint = null;
  currentStroke = null;
  updateStatus(animating ? "JONLI ANIMATSIYA" : "CHIZISHGA TAYYOR");
  updateMission();
}

function updateStrokeCount() {
  $("strokeCount").textContent = strokes.length;
  updateMission();
}

function selectTool(tool) {
  if (tool === "clear") {
    clearArt();
    return;
  }

  currentTool = tool;

  document.querySelectorAll(".tool").forEach(button => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });

  const labels = {
    draw: "ERKIN CHIZISH",
    erase: "O‘CHIRG‘ICH",
    move: "ZARRACHALARNI UYG‘OTISH"
  };

  $("modeText").textContent = labels[tool];
  canvas.style.cursor = tool === "erase" ? "cell" : "crosshair";
}

function clearArt() {
  strokes = [];
  particles = [];
  savedImage = null;
  renderStrokes();
  fx.clearRect(0, 0, canvasWidth, canvasHeight);
  $("emptyHint").classList.remove("hidden");
  updateStrokeCount();
  updateStatus("YANGI RASM");
  showToast("Maydon tozalandi. Yangi asar yarat!");
}

function undoStroke() {
  if (!strokes.length) {
    showToast("Qaytarish uchun chiziq yo‘q.");
    return;
  }

  strokes.pop();
  renderStrokes();
  updateStrokeCount();
  savedImage = null;
  showToast("Oxirgi chiziq qaytarildi.");
}

function burstParticles(x, y, amount) {
  const effect = $("effect").value;

  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    let velocity = Math.random() * 2 + 0.5;

    if (effect === "galaxy") velocity *= 1.6;
    if (effect === "wave") velocity *= 0.5;

    particles.push({
      x, y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 40 + Math.random() * 80,
      maxLife: 120,
      size: Math.random() * 2.6 + 0.6,
      color: currentColor,
      angle,
      seed: Math.random() * 10
    });
  }

  if (particles.length > 1800) {
    particles.splice(0, particles.length - 1800);
  }
}

function createAmbientParticles() {
  if (particles.length > 500) return;

  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  for (let i = 0; i < 150; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * Math.min(canvasWidth, canvasHeight) * 0.38;

    particles.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: (Math.random() - 0.5) * 1.4,
      vy: (Math.random() - 0.5) * 1.4,
      life: 100 + Math.random() * 180,
      maxLife: 280,
      size: Math.random() * 2.2 + 0.5,
      color: currentColor,
      angle,
      seed: Math.random() * 10
    });
  }
}

function animateParticles() {
  animationFrame = requestAnimationFrame(animateParticles);

  if (paused || !animating) return;

  fx.clearRect(0, 0, canvasWidth, canvasHeight);

  const effect = $("effect").value;
  const multiplier = speed / 5;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    if (effect === "galaxy") {
      const dx = p.x - cx;
      const dy = p.y - cy;
      p.vx += (-dy * 0.0007 + -dx * 0.00005) * multiplier;
      p.vy += (dx * 0.0007 + -dy * 0.00005) * multiplier;
    } else if (effect === "wave") {
      p.vy += Math.sin(p.x * 0.018 + p.seed) * 0.025 * multiplier;
    } else if (effect === "fireflies") {
      p.vx += Math.sin(p.seed + p.life * 0.04) * 0.035;
      p.vy += Math.cos(p.seed + p.life * 0.03) * 0.035;
    } else if (effect === "flow") {
      p.vx += Math.sin(p.y * 0.012 + p.seed) * 0.025 * multiplier;
      p.vy += Math.cos(p.x * 0.012 + p.seed) * 0.025 * multiplier;
    }

    p.x += p.vx * multiplier;
    p.y += p.vy * multiplier;
    p.life -= 0.55 * multiplier;

    if (effect === "particles") {
      p.vx *= 0.986;
      p.vy *= 0.986;
    }

    if (p.life <= 0 ||
        p.x < -30 || p.x > canvasWidth + 30 ||
        p.y < -30 || p.y > canvasHeight + 30) {
      particles.splice(i, 1);
      continue;
    }

    const alpha = Math.min(1, p.life / 25);
    fx.globalAlpha = alpha;
    fx.fillStyle = p.color;
    fx.shadowColor = p.color;
    fx.shadowBlur = glow;
    fx.beginPath();
    fx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    fx.fill();
  }

  fx.globalAlpha = 1;
  fx.shadowBlur = 0;

  if (particles.length < 30 && animating) {
    const p = strokes[Math.floor(Math.random() * strokes.length)];
    if (p && p.points.length) {
      const point = p.points[Math.floor(Math.random() * p.points.length)];
      burstParticles(point.x, point.y, 2);
    }
  }
}

function startAnimation() {
  if (!strokes.length) {
    showToast("Avval rasm chiz! Sehr uchun asar kerak.");
    return;
  }

  animating = true;
  paused = false;
  $("pauseBtn").textContent = "Ⅱ Harakatni to‘xtatish";
  $("emptyHint").classList.add("hidden");
  updateStatus("JONLI ANIMATSIYA");

  if ($("effect").value === "galaxy" ||
      $("effect").value === "fireflies") {
    createAmbientParticles();
  }

  // Chizilgan izlarni ham zarrachalarga aylantirish.
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.points.length; i += 5) {
      const p = stroke.points[i];
      burstParticles(p.x, p.y, 2);
    }
  }

  $("modeText").textContent = "JONLI SAN'AT";
  updateMission();
  showToast("Asaring uyg‘ondi! ✨");
}

function togglePause() {
  if (!animating) {
    showToast("Avval rasmni jonlantir.");
    return;
  }

  paused = !paused;
  $("pauseBtn").textContent = paused
    ? "▶ Davom ettirish"
    : "Ⅱ Harakatni to‘xtatish";

  updateStatus(paused ? "ANIMATSIYA PAUZADA" : "JONLI ANIMATSIYA");
}

function saveImage() {
  if (!strokes.length) {
    showToast("Saqlashdan oldin rasm chiz.");
    return;
  }

  // Asl chizilgan rasm va hozirgi animatsiyani birlashtiramiz.
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;

  const out = output.getContext("2d");
  out.fillStyle = "#080808";
  out.fillRect(0, 0, output.width, output.height);
  out.drawImage(canvas, 0, 0);
  out.drawImage(fxCanvas, 0, 0);

  savedImage = output.toDataURL("image/png");

  const link = document.createElement("a");
  link.download = "tirik-rasm.png";
  link.href = savedImage;
  link.click();

  showToast("Rasming PNG formatida saqlandi!");
  updateMission();
}

function updateMission() {
  if (missionIndex >= missions.length) return;

  const mission = missions[missionIndex];
  const done = mission.count();

  $("missionProgress").style.width = done ? "100%" : "0%";
  $("missionState").textContent = done ? "BAJARILDI ✓" : "JARAYONDA";
  $("missionBtn").textContent = done
    ? "KEYINGI MISSIYA ↗"
    : "MISSIYANI BAJARISH ↗";
}

function handleMission() {
  if (missionIndex >= missions.length) {
    showToast("Barcha missiyalar bajarildi! Sen haqiqiy ijodkorsan.");
    return;
  }

  if (missionDone[missionIndex]) {
    showToast("Bu missiya allaqachon bajarilgan.");
    return;
  }

  if (!missions[missionIndex].count()) {
    showToast("Hali shart bajarilmadi. Qayta urinib ko‘r!");
    return;
  }

  missionDone[missionIndex] = true;
  showToast("Missiya bajarildi! ✦");

  if (missionIndex < missions.length - 1) {
    missionIndex++;
    $("missionCount").textContent =
      `0${missionIndex + 1} / 03`;
    $("missionText").textContent = missions[missionIndex].text;
    $("missionProgress").style.width = "0%";
    $("missionState").textContent = "BOSHLANMAGAN";
    $("missionBtn").textContent = "MISSIYANI BAJARISH ↗";
  } else {
    $("missionState").textContent = "HAMMASI BAJARILDI";
    $("missionProgress").style.width = "100%";
    $("missionBtn").textContent = "BARCHA MISSIYALAR TUGADI";
  }
}

document.querySelectorAll(".tool").forEach(button => {
  button.addEventListener("click", () => selectTool(button.dataset.tool));
});

document.querySelectorAll(".swatch").forEach(button => {
  button.addEventListener("click", () => {
    currentColor = button.dataset.color;

    document.querySelectorAll(".swatch").forEach(swatch => {
      swatch.classList.toggle("selected", swatch === button);
    });
  });
});

$("brushSize").addEventListener("input", event => {
  brushSize = Number(event.target.value);
  $("brushSizeVal").textContent = brushSize;
});

$("glow").addEventListener("input", event => {
  glow = Number(event.target.value);
  $("glowVal").textContent = glow;
});

$("speed").addEventListener("input", event => {
  speed = Number(event.target.value);
  $("speedVal").textContent = speed;
});

canvas.addEventListener("pointerdown", startDrawing);
canvas.addEventListener("pointermove", continueDrawing);
canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("lostpointercapture", stopDrawing);

$("animateBtn").addEventListener("click", startAnimation);
$("pauseBtn").addEventListener("click", togglePause);
$("undoBtn").addEventListener("click", undoStroke);
$("saveBtn").addEventListener("click", saveImage);
$("missionBtn").addEventListener("click", handleMission);

$("effect").addEventListener("change", () => {
  if (!animating) return;
  particles = [];
  createAmbientParticles();
  startAnimation();
});

$("fullscreenBtn").addEventListener("click", async () => {
  const frame = $("canvasFrame");

  try {
    if (!document.fullscreenElement) {
      await frame.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    showToast("To‘liq ekran bu qurilmada mavjud emas.");
  }
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
renderStrokes();
animateParticles();
updateStrokeCount();
$("missionText").textContent = missions[0].text;
