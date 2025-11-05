const API_BASE = window.API_BASE_URL || "http://localhost:4000";
const MODE_LABELS = {
  normal: "Normal Flow",
  rush_hour: "Rush Hour Surge",
  emergency: "Emergency Response"
};

let refreshIntervalMs = 5000;
let refreshTimer = null;
let cachedIntersections = [];
let baselineMetrics = null;
let currentMode = "normal";
let smartModeEnabled = true;

const metricsContainer = document.getElementById("city-metrics");
const intersectionsContainer = document.getElementById("intersections");
const historyBody = document.getElementById("history-body");
const overrideForm = document.getElementById("override-form");
const overrideSelect = document.getElementById("override-id");
const approachSelect = document.getElementById("override-approach");
const overrideStatus = document.getElementById("override-status");
const smartToggle = document.getElementById("smart-toggle");
const smartIndicator = document.getElementById("smart-indicator");
const smartIndicatorState = smartIndicator?.querySelector(".state");
const modeStatus = document.getElementById("mode-status");
const aiInsightsList = document.getElementById("ai-insights");
const controlButtons = Array.from(document.querySelectorAll(".control-buttons button"));

const vehiclesCanvas = document.getElementById("vehicles-chart");
const delayCanvas = document.getElementById("delay-chart");
const vehiclesCtx = vehiclesCanvas?.getContext("2d");
const delayCtx = delayCanvas?.getContext("2d");

const tooltip = document.createElement("div");
tooltip.className = "chart-tooltip";
document.body.appendChild(tooltip);

let vehiclesDataset = [];
let delayDataset = [];
const vehiclePoints = [];
const delayPoints = [];

const animateObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        animateObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.25 }
);

document.querySelectorAll("[data-animate]").forEach((node, index) => {
  if (!node) return;
  node.style.transitionDelay = `${index * 120}ms`;
  animateObserver.observe(node);
});

function animateIn(element, delay = 0) {
  if (!element) return;
  if (!element.dataset.animate) {
    element.dataset.animate = "inline";
  }
  element.style.transitionDelay = `${delay}ms`;
  animateObserver.observe(element);
}

function playSoftClick() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!playSoftClick.ctx) {
    playSoftClick.ctx = new AudioCtx();
  }
  const ctx = playSoftClick.ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  osc.type = "sine";
  osc.frequency.value = 520;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.03, now + 0.009);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function fetchJSON(url, options) {
  return fetch(url, options).then(async (response) => {
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || response.statusText);
    }
    return response.json();
  });
}

function setActiveModeButton(mode) {
  controlButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
}

function updateSmartIndicatorUI(enabled) {
  if (!smartIndicator) return;
  smartIndicator.classList.toggle("pulsing", enabled);
  if (smartIndicatorState) {
    smartIndicatorState.textContent = enabled ? "Adaptive" : "Manual";
  }
}

function updateModeStatus(mode) {
  if (!modeStatus) return;
  modeStatus.textContent = `Mode: ${MODE_LABELS[mode] || mode}`;
}

function applySmartHighlight(enabled) {
  document.body.classList.toggle("smart-active", enabled);
}

function positionTooltip(x, y, text) {
  tooltip.textContent = text;
  tooltip.style.opacity = 1;
  tooltip.style.left = `${x + 12}px`;
  tooltip.style.top = `${y - 12}px`;
}

function hideTooltip() {
  tooltip.style.opacity = 0;
}

function renderMetrics(metrics, smartEnabled) {
  metricsContainer.innerHTML = "";
  const metricItems = [
    { label: "Avg Queue", value: `${metrics.avgQueue} vehicles` },
    { label: "Avg Wait", value: `${metrics.avgWaitSeconds}s` },
    { label: "Active Emergencies", value: metrics.activeEmergencies }
  ];

  metricItems.forEach(({ label, value }, index) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    if (smartEnabled) card.classList.add("smart-glow");
    card.innerHTML = `<h3>${label}</h3><p>${value}</p>`;
    metricsContainer.appendChild(card);
    animateIn(card, index * 80);
  });

  const congestionCard = document.createElement("div");
  congestionCard.className = "metric-card wide";
  if (smartEnabled) congestionCard.classList.add("smart-glow");
  congestionCard.innerHTML = `
    <h3>Congestion Index</h3>
    <ul>
      ${metrics.junctionCongestion
        .map((junction) => `<li>${junction.name}: <strong>${junction.congestionIndex}</strong></li>`)
        .join("")}
    </ul>
  `;
  metricsContainer.appendChild(congestionCard);
  animateIn(congestionCard, metricItems.length * 80);
}

function renderIntersection(intersection, smartEnabled) {
  const widget = document.createElement("article");
  widget.className = "intersection";
  if (smartEnabled) widget.classList.add("smart-glow");

  const approaches = Object.entries(intersection.readings)
    .map(([name, stats]) => {
      const isActive = name === intersection.activeApproach;
      const emergencyBadge = stats.emergencyVehicle ? '<span class="badge danger">Emergency</span>' : "";
      return `
        <li class="${isActive ? "active" : ""}">
          <span class="lane">${name.toUpperCase()}</span>
          <span class="queue">${stats.queueLength} vehicles</span>
          <span class="wait">${stats.avgWaitSeconds}s wait</span>
          ${emergencyBadge}
        </li>
      `;
    })
    .join("");

  widget.innerHTML = `
    <header>
      <h3>${intersection.name}</h3>
      <span class="badge">${intersection.activeApproach.toUpperCase()} green</span>
    </header>
    <ul class="approaches">
      ${approaches}
    </ul>
  `;

  animateIn(widget);
  return widget;
}

function renderIntersections(intersections, smartEnabled) {
  intersectionsContainer.innerHTML = "";
  intersections.forEach((intersection, index) => {
    const widget = renderIntersection(intersection, smartEnabled);
    widget.style.transitionDelay = `${index * 45}ms`;
    intersectionsContainer.appendChild(widget);
  });
}

function renderHistory(history) {
  historyBody.innerHTML = "";
  history
    .slice()
    .reverse()
    .forEach((snapshot) => {
      snapshot.intersections.forEach((intersection) => {
        const row = document.createElement("tr");
        const timestamp = new Date(snapshot.timestamp).toLocaleTimeString();
        const queues = Object.entries(intersection.readings)
          .map(([lane, stats]) => `${lane}: ${stats.queueLength}`)
          .join(", ");
        row.innerHTML = `
          <td>${timestamp}</td>
          <td>${intersection.name}</td>
          <td>${intersection.activeApproach.toUpperCase()}</td>
          <td>${queues}</td>
        `;
        historyBody.appendChild(row);
      });
    });
}

function populateOverrideOptions(intersections) {
  cachedIntersections = intersections;
  overrideSelect.innerHTML = intersections
    .map((intersection) => `<option value="${intersection.id}">${intersection.name}</option>`)
    .join("");
  updateApproachOptions();
}

function updateApproachOptions() {
  const selected = cachedIntersections.find((item) => item.id === overrideSelect.value);
  const options = (selected?.approaches || []).map(
    (approach) => `<option value="${approach}">${approach.toUpperCase()}</option>`
  );
  approachSelect.innerHTML = options.join("");
}

function computeVehiclesPerMinute(metrics) {
  const base = metrics.avgQueue * (smartModeEnabled ? 2 : 2.4);
  const emergencyImpact = metrics.activeEmergencies * 5;
  const randomness = Math.random() * 6 - 3;
  return Math.max(0, Math.round(base + emergencyImpact + randomness));
}

function computeSignalDelay(metrics) {
  const modeFactor =
    currentMode === "rush_hour" ? 12 : currentMode === "emergency" ? 7 : smartModeEnabled ? -4 : -1;
  const randomness = Math.random() * 4 - 2;
  return Math.max(1, Math.round(metrics.avgWaitSeconds + modeFactor + randomness));
}

function drawLineChart(ctx, data, color = "rgba(78,205,196,1)") {
  if (!ctx) return [];
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!data.length) return [];

  const { width, height } = ctx.canvas;
  const padding = 30;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(max - min, 1);
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;

  const points = data.map((value, index) => {
    const x = padding + index * stepX;
    const y = padding + (1 - (value - min) / range) * (height - padding * 2);
    return { x, y, value };
  });

  const gradient = ctx.createLinearGradient(padding, 0, width - padding, 0);
  gradient.addColorStop(0, "rgba(78,205,196,0.9)");
  gradient.addColorStop(1, "rgba(78,205,196,0.4)");

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineWidth = 3;
  ctx.strokeStyle = gradient;
  ctx.shadowColor = "rgba(78,205,196,0.45)";
  ctx.shadowBlur = 16;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "rgba(78,205,196,0.35)";
  ctx.lineTo(points.at(-1).x, height - padding);
  ctx.lineTo(points[0].x, height - padding);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  return points;
}

function drawBarChart(ctx, data, color = "rgba(240,84,84,0.9)") {
  if (!ctx) return [];
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!data.length) return [];

  const { width, height } = ctx.canvas;
  const padding = 30;
  const max = Math.max(...data);
  const range = Math.max(max, 1);
  const barWidth = (width - padding * 2) / (data.length + 0.5);

  const points = [];
  data.forEach((value, index) => {
    const x = padding + index * barWidth * 1.2;
    const barHeight = ((value / range) * (height - padding * 2));
    const y = height - padding - barHeight;
    const gradient = ctx.createLinearGradient(x, y, x, height - padding);
    gradient.addColorStop(0, "rgba(240,84,84,0.9)");
    gradient.addColorStop(1, "rgba(240,84,84,0.2)");
    ctx.fillStyle = gradient;
    ctx.shadowColor = "rgba(240,84,84,0.35)";
    ctx.shadowBlur = 18;
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.shadowBlur = 0;
    points.push({ x: x + barWidth / 2, y, value });
  });

  return points;
}

function attachTooltip(canvas, getPoints, label) {
  if (!canvas) return;
  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let closest = null;
    let distance = Infinity;
    getPoints().forEach((point) => {
      const d = Math.hypot(point.x - x, point.y - y);
      if (d < distance && d < 35) {
        closest = point;
        distance = d;
      }
    });
    if (closest) {
      positionTooltip(event.clientX, event.clientY, `${label}: ${closest.value}`);
    } else {
      hideTooltip();
    }
  });
  canvas.addEventListener("mouseleave", hideTooltip);
}

attachTooltip(vehiclesCanvas, () => vehiclePoints, "vehicles/minute");
attachTooltip(delayCanvas, () => delayPoints, "signal delay (s)");

function flashElement(element) {
  if (!element) return;
  element.classList.add("flash");
  setTimeout(() => element.classList.remove("flash"), 280);
}

function overwritePoints(target, nextPoints) {
  target.length = 0;
  nextPoints.forEach((point) => target.push(point));
}

function updateCharts(metrics) {
  const vehiclesValue = computeVehiclesPerMinute(metrics);
  const delayValue = computeSignalDelay(metrics);
  vehiclesDataset = [...vehiclesDataset.slice(-19), vehiclesValue];
  delayDataset = [...delayDataset.slice(-19), delayValue];
  overwritePoints(vehiclePoints, drawLineChart(vehiclesCtx, vehiclesDataset));
  overwritePoints(delayPoints, drawBarChart(delayCtx, delayDataset));
}

function updateAIInsights(metrics) {
  if (!baselineMetrics) {
    baselineMetrics = { ...metrics };
  }

  const queueReduction = baselineMetrics.avgQueue
    ? Math.max(0, baselineMetrics.avgQueue - metrics.avgQueue)
    : metrics.avgQueue;
  const queueReductionPct = baselineMetrics.avgQueue
    ? Math.round((queueReduction / baselineMetrics.avgQueue) * 100)
    : 0;

  const waitDelta = baselineMetrics.avgWaitSeconds - metrics.avgWaitSeconds;
  const congestionHotspot = metrics.junctionCongestion
    .slice()
    .sort((a, b) => b.congestionIndex - a.congestionIndex)[0];

  const insightItems = [
    `Traffic density reduced by ${queueReductionPct}%`,
    `Optimized green time: ${waitDelta >= 0 ? "+" : ""}${waitDelta.toFixed(1)}s`,
    congestionHotspot
      ? `Predicted congestion ahead: ${congestionHotspot.name} (${congestionHotspot.congestionIndex})`
      : "Predicted congestion ahead: Low"
  ];

  aiInsightsList.innerHTML = insightItems.map((item) => `<li>${item}</li>`).join("");
}

function restartRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refresh, refreshIntervalMs);
}

async function changeMode(mode) {
  try {
    await fetchJSON(`${API_BASE}/api/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode })
    });
    currentMode = mode;
    setActiveModeButton(mode);
    updateModeStatus(mode);
    refreshIntervalMs = mode === "rush_hour" ? 3500 : mode === "emergency" ? 2500 : 5000;
    playSoftClick();
    flashElement(controlButtons.find((button) => button.dataset.mode === mode));
    refresh();
    restartRefreshTimer();
  } catch (error) {
    overrideStatus.textContent = `Mode switch failed: ${error.message}`;
    overrideStatus.classList.add("error");
  }
}

async function toggleSmartMode(enabled) {
  try {
    await fetchJSON(`${API_BASE}/api/smart-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });
    smartModeEnabled = enabled;
    smartToggle.checked = enabled;
    updateSmartIndicatorUI(enabled);
    applySmartHighlight(enabled);
    playSoftClick();
    flashElement(smartIndicator);
    refresh();
  } catch (error) {
    overrideStatus.textContent = `Smart mode toggle failed: ${error.message}`;
    overrideStatus.classList.add("error");
  }
}

async function refresh() {
  try {
    const state = await fetchJSON(`${API_BASE}/api/state`);
    currentMode = state.mode || currentMode;
    smartModeEnabled = state.smartMode ?? smartModeEnabled;
    renderMetrics(state.metrics, smartModeEnabled);
    renderIntersections(state.intersections, smartModeEnabled);
    updateAIInsights(state.metrics);
    updateCharts(state.metrics);
    updateModeStatus(currentMode);
    updateSmartIndicatorUI(smartModeEnabled);
    applySmartHighlight(smartModeEnabled);
    setActiveModeButton(currentMode);

    if (!cachedIntersections.length) {
      populateOverrideOptions(state.intersections);
    }

    const history = await fetchJSON(`${API_BASE}/api/history?limit=10`);
    renderHistory(history.history || []);
    overrideStatus.className = "form-status";
    overrideStatus.textContent = "";
  } catch (error) {
    overrideStatus.textContent = `Dashboard update failed: ${error.message}`;
    overrideStatus.classList.add("error");
  }
}

async function bootstrapConfig() {
  try {
    const config = await fetchJSON(`${API_BASE}/api/config`);
    currentMode = config.mode || currentMode;
    smartModeEnabled = config.smartMode ?? smartModeEnabled;
    setActiveModeButton(currentMode);
    smartToggle.checked = smartModeEnabled;
    updateSmartIndicatorUI(smartModeEnabled);
    applySmartHighlight(smartModeEnabled);
    updateModeStatus(currentMode);
  } catch (error) {
    // Config fetch is optional, fail silently but surface in status area for visibility
    overrideStatus.textContent = `Config fetch failed: ${error.message}`;
    overrideStatus.classList.add("error");
  }
}

overrideForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  overrideStatus.textContent = "Sending override...";
  overrideStatus.className = "form-status";

  const formData = new FormData(overrideForm);
  const payload = {
    id: formData.get("id"),
    approach: formData.get("approach"),
    durationSeconds: Number(formData.get("durationSeconds"))
  };

  try {
    await fetchJSON(`${API_BASE}/api/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    overrideStatus.textContent = "Override applied.";
    overrideStatus.classList.add("success");
    playSoftClick();
    refresh();
  } catch (error) {
    overrideStatus.textContent = error.message || "Override failed";
    overrideStatus.classList.add("error");
  }
});

overrideSelect.addEventListener("change", updateApproachOptions);

smartToggle?.addEventListener("change", (event) => {
  toggleSmartMode(event.target.checked);
});

controlButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const { mode } = button.dataset;
    if (mode && mode !== currentMode) {
      changeMode(mode);
    }
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (refreshTimer) clearInterval(refreshTimer);
  } else {
    refresh();
    restartRefreshTimer();
  }
});

(async function init() {
  await bootstrapConfig();
  await refresh();
  restartRefreshTimer();
})();
