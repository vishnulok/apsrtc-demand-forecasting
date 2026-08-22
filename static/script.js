/* ============================================================
   script.js  –  APSRTC Demand Forecasting & Dynamic Fleet Control
   ============================================================ */

"use strict";

// ── Global References & State ──────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

let currentPredictionData = null;
let currentDashboardData = null;
let originalDashboardRoutes = null;
let sliderDebounceTimer = null;

// Chart instances store
let chartInstances = {};

// ── Toast Notifications ────────────────────────────────────
function showToast(msg, type = "info", duration = 3500) {
  let container = $("#toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(10px)";
    t.style.transition = "0.3s ease";
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ── Loading Overlay ────────────────────────────────────────
function showLoading(show = true, msg = "Processing…") {
  let el = $("#loading-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "loading-overlay";
    el.className = "loading-overlay";
    el.innerHTML = `<div class="spinner"></div><p id="loading-msg">${msg}</p>`;
    document.body.appendChild(el);
  }
  el.classList.toggle("show", show);
  const msgEl = el.querySelector("#loading-msg");
  if (msgEl) msgEl.textContent = msg;
}

// ── Number Animation ───────────────────────────────────────
function animateNumber(el, target, duration = 600, suffix = "") {
  if (!el) return;
  const start = parseFloat(el.textContent) || 0;
  const startTime = performance.now();
  function update(now) {
    const p = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const curr = start + (target - start) * ease;
    el.textContent = (Number.isInteger(target) ? Math.round(curr) : curr.toFixed(1)) + suffix;
    if (p < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function getDemandClass(level) {
  return { HIGH: "badge-high", MEDIUM: "badge-medium", LOW: "badge-low" }[level] || "badge-low";
}

function getUtilColor(pct) {
  if (pct >= 80) return "#ef4444";
  if (pct >= 50) return "#f59e0b";
  return "#10b981";
}

function utilFillClass(pct) {
  if (pct >= 80) return "fill-red";
  if (pct >= 50) return "fill-orange";
  return "fill-green";
}

function rankClass(n) {
  return { 1: "rank-1", 2: "rank-2", 3: "rank-3" }[n] || "rank-n";
}

function round1(val) {
  return Math.round(val * 10) / 10;
}

// ── Navbar Hamburger ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const hb = $(".hamburger");
  const nl = $(".nav-links");
  if (hb && nl) {
    hb.addEventListener("click", () => nl.classList.toggle("open"));
    document.addEventListener("click", (e) => {
      if (!hb.contains(e.target) && !nl.contains(e.target))
        nl.classList.remove("open");
    });
  }

  $$(".nav-links a").forEach((a) => {
    if (a.href === location.href) a.classList.add("active");
  });
});

/* ============================================================
   1. PREDICTION PAGE LOGIC
   ============================================================ */
function initPredictionPage() {
  const form = $("#prediction-form");
  if (!form) return;

  const routeSelect   = $("#route");
  const busTypeSelect = $("#bus_type");
  const capacityInput = $("#capacity");
  const distanceInput = $("#distance_km");
  const fareInput     = $("#fare_per_passenger");
  const depotInput    = $("#depot");
  const prevInput     = $("#previous_passengers");

  const routeData     = window.ROUTE_DATA || {};
  const busCapacities = window.BUS_CAPACITIES || {};

  function syncRouteFields() {
    const key = routeSelect?.value;
    if (key && routeData[key]) {
      const r = routeData[key];
      if (distanceInput) distanceInput.value = r.distance_km;
      if (fareInput)     fareInput.value     = r.fare_per_passenger;
      if (depotInput)    depotInput.value    = r.depot;
      if (prevInput && !prevInput.value) {
        prevInput.placeholder = `e.g. ${r.base_demand} passengers`;
      }
    }
  }

  function syncCapacity() {
    const bt = busTypeSelect?.value;
    if (bt && busCapacities[bt] && capacityInput) {
      capacityInput.value = busCapacities[bt];
    }
  }

  function syncAllFields() {
    syncRouteFields();
    syncCapacity();
    if (prevInput) prevInput.value = "";
    const indicator = $("#pred-status-indicator");
    if (indicator) indicator.textContent = "";
  }

  window.syncRouteFields = syncRouteFields;
  window.syncCapacity = syncCapacity;
  window.syncAllFields = syncAllFields;

  routeSelect?.addEventListener("change", syncRouteFields);
  busTypeSelect?.addEventListener("change", syncCapacity);

  syncRouteFields();
  syncCapacity();

  const dateInput = $("#date");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  // Execute prediction API call
  async function executePrediction() {
    const btn = $("#predict-btn");
    if (btn) btn.disabled = true;
    showLoading(true, "Running AI demand prediction…");

    const payload = {
      route:              routeSelect?.value,
      bus_type:           busTypeSelect?.value,
      depot:              depotInput?.value,
      capacity:           parseInt(capacityInput?.value) || 52,
      distance_km:        parseFloat(distanceInput?.value) || 275,
      fare_per_passenger: parseFloat(fareInput?.value) || 300,
      date:               dateInput?.value,
      previous_passengers: prevInput?.value ? parseFloat(prevInput.value) : null,
    };

    try {
      const res = await fetch("/api/predict", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error || "Prediction failed");

      showLoading(false);
      currentPredictionData = data;
      renderPredictionResult(data);
      showToast(`Forecast complete for ${data.route}!`, "success");
    } catch (err) {
      showLoading(false);
      showToast("Error: " + err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window.executePrediction = executePrediction;

  // Submit Handler
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    executePrediction();
  });
}

// ── Operational Scenario Presets ───────────────────────────
window.applyPreset = function(type) {
  const routeSelect   = $("#route");
  const busTypeSelect = $("#bus_type");
  const capacityInput = $("#capacity");
  const prevInput     = $("#previous_passengers");
  const routeData     = window.ROUTE_DATA || {};
  const busCapacities = window.BUS_CAPACITIES || {};

  const currentKey    = routeSelect?.value || "Hyderabad-Vijayawada";
  const baseDemand    = (routeData[currentKey] && routeData[currentKey].base_demand) || 150;

  let multiplier = 1.0;
  let label = "";

  if (type === "normal") {
    multiplier = 1.0;
    if (busTypeSelect) busTypeSelect.value = "Express";
    label = "🏢 Regular Weekday (Express 52 seats) applied";
  } else if (type === "weekend") {
    multiplier = 1.25;
    if (busTypeSelect) busTypeSelect.value = "Super Luxury";
    label = "🎉 Weekend Rush (+25% surge, Super Luxury 44 seats) applied";
  } else if (type === "festival") {
    multiplier = 1.50;
    if (busTypeSelect) busTypeSelect.value = "Volvo AC";
    label = "🎊 Festival / Holiday Surge (+50% surge, Volvo AC 42 seats) applied";
  } else if (type === "offpeak") {
    multiplier = 0.70;
    if (busTypeSelect) busTypeSelect.value = "Ordinary";
    label = "🌙 Off-Peak / Low Demand (-30% flow, Ordinary 55 seats) applied";
  }

  // Sync capacity with selected bus type
  if (busTypeSelect && capacityInput && busCapacities[busTypeSelect.value]) {
    capacityInput.value = busCapacities[busTypeSelect.value];
  }

  if (prevInput) {
    prevInput.value = Math.round(baseDemand * multiplier);
  }

  const indicator = $("#pred-status-indicator");
  if (indicator) indicator.textContent = label;
  showToast(label, "info", 2500);

  // Directly run prediction with new values
  if (window.executePrediction) {
    window.executePrediction();
  }
};

// ── Render Prediction Result ───────────────────────────────
function renderPredictionResult(data) {
  const section = $("#result-section");
  if (!section) return;
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth", block: "start" });

  const badge = $("#pred-route-badge");
  if (badge) {
    badge.textContent = `📍 ${data.route} (${data.bus_type}) · Freq: ${data.daily_frequency || "Every 30 mins"} · Date: ${data.date}`;
  }

  animateNumber($("#res-passengers"), data.predicted_passengers);
  animateNumber($("#res-occupancy"),  data.occupancy_pct, 600, "%");
  animateNumber($("#res-buses"),      data.recommended_buses);

  const lvlEl = $("#res-level");
  if (lvlEl) {
    lvlEl.textContent = `${data.demand_level} DEMAND`;
    lvlEl.className = `badge ${getDemandClass(data.demand_level)}`;
  }

  const occLabel = $("#res-occ-label");
  if (occLabel) {
    occLabel.textContent = `${data.occupancy_pct}% (${data.demand_level})`;
    occLabel.style.color = getUtilColor(data.occupancy_pct);
  }

  const pb = $("#occupancy-bar");
  if (pb) {
    const pct = Math.min(data.occupancy_pct, 100);
    pb.style.width = pct + "%";
    pb.className = `progress-fill ${utilFillClass(data.occupancy_pct)}`;
  }

  // Configure simulator
  const simSlider = $("#sim-buses-slider");
  if (simSlider) {
    simSlider.value = data.recommended_buses || 1;
    updateBusFlowSimulation(simSlider.value);
  }

  drawPredictionChart(data);
}

// ── Real-Time Bus Flow Simulator for Single Route ──────────
window.updateBusFlowSimulation = function(busesCount) {
  const count = parseInt(busesCount) || 1;
  const valEl = $("#sim-buses-val");
  if (valEl) valEl.textContent = count;

  if (!currentPredictionData) return;

  const passengers = currentPredictionData.predicted_passengers;
  const singleCapacity = currentPredictionData.capacity || 52;
  const totalCap = count * singleCapacity;
  const effOcc = round1((passengers / Math.max(totalCap, 1)) * 100);
  const passPerBus = Math.ceil(passengers / count);

  let level = "LOW";
  if (effOcc >= 80) level = "HIGH";
  else if (effOcc >= 50) level = "MEDIUM";

  const totalCapEl = $("#sim-total-cap");
  if (totalCapEl) totalCapEl.textContent = `${totalCap} seats (${count} × ${singleCapacity})`;

  const effOccEl = $("#sim-eff-occ");
  if (effOccEl) {
    effOccEl.textContent = `${effOcc}%`;
    effOccEl.style.color = getUtilColor(effOcc);
  }

  const effLevelEl = $("#sim-eff-level");
  if (effLevelEl) {
    effLevelEl.innerHTML = `<span class="badge ${getDemandClass(level)}">${level} DEMAND</span>`;
  }

  const passPerBusEl = $("#sim-pass-per-bus");
  if (passPerBusEl) passPerBusEl.textContent = `${passPerBus} pass / bus`;
};

// ── Draw Prediction Bar Chart ──────────────────────────────
function drawPredictionChart(data) {
  const canvas = $("#pred-chart");
  if (!canvas) return;
  if (chartInstances.pred) chartInstances.pred.destroy();

  const capacity = parseInt($("#capacity")?.value || 52);
  const recCapacity = data.recommended_buses * capacity;
  const labels = [
    "Predicted Single Trip Demand",
    "Single Bus Seating Capacity",
    `Recommended Fleet Capacity (${data.recommended_buses} Buses)`
  ];

  chartInstances.pred = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Headcount / Seats",
        data: [
          data.predicted_passengers,
          capacity,
          recCapacity,
        ],
        backgroundColor: [
          "rgba(59,130,246,0.8)",
          "rgba(16,185,129,0.65)",
          "rgba(139,92,246,0.75)",
        ],
        borderColor: ["#3b82f6","#10b981","#8b5cf6"],
        borderWidth: 2,
        borderRadius: 8,
      }]
    },
    options: chartDefaults({ scales: true }),
  });
}

/* ============================================================
   2. FLEET OPTIMIZATION PAGE LOGIC
   ============================================================ */
function initOptimizationPage() {
  const form = $("#opt-form");
  if (!form) return;

  const dateInput = $("#opt-date");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#opt-btn");
    if (btn) btn.disabled = true;
    showLoading(true, "Running AI greedy fleet optimization with frequency weighting…");

    const payload = {
      total_buses: parseInt($("#total_buses")?.value) || 30,
      date:        dateInput?.value || new Date().toISOString().split("T")[0],
    };

    try {
      const res = await fetch("/api/optimize", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error || "Optimization failed");

      showLoading(false);
      renderOptResult(data);
      showToast(`Fleet allocation complete for ${payload.total_buses} buses!`, "success");
    } catch (err) {
      showLoading(false);
      showToast("Error: " + err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function renderOptResult(data) {
  const section = $("#opt-result");
  if (!section) return;
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth", block: "start" });

  animateNumber($("#opt-routes"),      data.total_routes);
  animateNumber($("#opt-buses"),       data.total_buses);
  animateNumber($("#opt-avg-demand"),  data.avg_demand);
  animateNumber($("#opt-avg-util"),    data.avg_utilization, 600, "%");

  drawOptCharts(data.routes);

  const tbody = $("#opt-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  data.routes.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass(r.priority_rank)}">${r.priority_rank}</span></td>
      <td>
        <strong>${r.route}</strong><br>
        <small class="text-muted">${r.depot} · ${r.corridor_type || "Corridor"}</small>
      </td>
      <td>
        <span style="font-size:0.85rem;font-weight:600;color:var(--accent-cyan);">⏱️ ${r.daily_frequency}</span>
      </td>
      <td>
        <div><strong>${r.predicted_passengers}</strong> <small class="text-muted">pass/day</small></div>
        <div style="font-size:0.75rem;color:var(--text-muted);">${r.single_trip_predicted} pass/trip</div>
      </td>
      <td class="fw-700 value-blue" style="font-size:1.1rem;">${r.allocated_buses}</td>
      <td>${r.allocated_capacity} seats</td>
      <td>
        <div style="min-width:85px">
          <span class="fw-700" style="color:${getUtilColor(r.utilization)}">${r.utilization}%</span>
          <div class="progress-bar mt-1">
            <div class="progress-fill ${utilFillClass(r.utilization)}"
                 style="width:${Math.min(r.utilization, 100)}%"></div>
          </div>
        </div>
      </td>
      <td><span class="badge ${getDemandClass(r.demand_level)}">${r.demand_level}</span></td>
      <td style="font-size:0.82rem;line-height:1.4;color:var(--text-secondary);max-width:280px;">
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:0.15rem;">${r.recommendation}</div>
        ${r.allocation_reason}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function drawOptCharts(routes) {
  const labels = routes.map((r) => r.route);

  // Demand chart
  const demandCanvas = $("#chart-demand");
  if (demandCanvas) {
    if (chartInstances.optDemand) chartInstances.optDemand.destroy();
    chartInstances.optDemand = new Chart(demandCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Total Daily Predicted Demand (passengers)",
          data: routes.map((r) => r.predicted_passengers),
          backgroundColor: "rgba(59,130,246,0.75)",
          borderColor: "#3b82f6",
          borderWidth: 2,
          borderRadius: 6,
        }]
      },
      options: chartDefaults({ scales: true }),
    });
  }

  // Allocation chart
  const allocCanvas = $("#chart-alloc");
  if (allocCanvas) {
    if (chartInstances.optAlloc) chartInstances.optAlloc.destroy();
    chartInstances.optAlloc = new Chart(allocCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Allocated Buses",
          data: routes.map((r) => r.allocated_buses),
          backgroundColor: "rgba(139,92,246,0.75)",
          borderColor: "#8b5cf6",
          borderWidth: 2,
          borderRadius: 6,
        }]
      },
      options: chartDefaults({ scales: true }),
    });
  }

  // Utilization chart
  const utilCanvas = $("#chart-util");
  if (utilCanvas) {
    if (chartInstances.optUtil) chartInstances.optUtil.destroy();
    chartInstances.optUtil = new Chart(utilCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Expected Fleet Occupancy (%)",
          data: routes.map((r) => r.utilization),
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6,182,212,0.12)",
          borderWidth: 2.5,
          pointBackgroundColor: routes.map((r) => getUtilColor(r.utilization)),
          pointRadius: 5,
          fill: true,
          tension: 0.35,
        }]
      },
      options: chartDefaults({ scales: true, yMax: 120 }),
    });
  }
}

/* ============================================================
   3. LIVE DASHBOARD PAGE LOGIC
   ============================================================ */
async function initDashboard() {
  const container = $("#dashboard-container");
  if (!container) return;

  const dateInput = $("#dash-date");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  await refreshDashboard();
}

window.onDashboardSliderChange = function(val) {
  const display = $("#dash-slider-display");
  if (display) display.textContent = `${val} Buses`;

  clearTimeout(sliderDebounceTimer);
  sliderDebounceTimer = setTimeout(() => {
    refreshDashboard();
  }, 250);
};

window.setDashboardBuses = function(busesCount) {
  const slider = $("#dash-bus-slider");
  if (slider) {
    slider.value = busesCount;
    onDashboardSliderChange(busesCount);
  }
};

window.refreshDashboard = async function() {
  const dateVal    = $("#dash-date")?.value || new Date().toISOString().split("T")[0];
  const busTypeVal = $("#dash-bus-type")?.value || "Express";
  const totalBuses = parseInt($("#dash-bus-slider")?.value) || 30;

  showLoading(true, `Simulating fleet distribution for ${totalBuses} buses…`);

  try {
    const url = `/api/dashboard?total_buses=${totalBuses}&date=${dateVal}&bus_type=${encodeURIComponent(busTypeVal)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) throw new Error(data.error || "Dashboard request failed");

    showLoading(false);
    currentDashboardData = data;
    originalDashboardRoutes = JSON.parse(JSON.stringify(data.routes));
    renderDashboard(data);
    showToast(`Dashboard updated: ${totalBuses} buses on ${busTypeVal} services!`, "success", 2000);
  } catch (err) {
    showLoading(false);
    showToast("Error updating dashboard: " + err.message, "error");
  }
};

window.resetToAiOptimal = function() {
  if (originalDashboardRoutes && currentDashboardData) {
    currentDashboardData.routes = JSON.parse(JSON.stringify(originalDashboardRoutes));
    recalculateDashboardStats(currentDashboardData);
    showToast("Reset to AI Optimal Allocation", "info");
  }
};

// ── Manual Inline Bus Adjuster for Individual Routes ───────
window.adjustRouteBuses = function(routeIndex, delta) {
  if (!currentDashboardData || !currentDashboardData.routes) return;
  const r = currentDashboardData.routes[routeIndex];
  if (!r) return;

  const newAlloc = Math.max(0, r.allocated_buses + delta);
  r.allocated_buses = newAlloc;
  r.allocated_capacity = newAlloc * r.capacity * 2;
  r.utilization = round1((r.predicted_passengers / Math.max(r.allocated_capacity, 1)) * 100);

  if (newAlloc >= 3) {
    r.allocation_reason = `Manual dispatch override: 3+ buses provide ${r.allocated_capacity} daily seats to sustain ${r.daily_frequency}.`;
  } else if (newAlloc === 2) {
    r.allocation_reason = `Manual dispatch override: 2 buses provide ${r.allocated_capacity} daily seats for ${r.daily_frequency} (${r.utilization}% load).`;
  } else if (newAlloc === 1) {
    r.allocation_reason = `Manual dispatch override: 1 bus provides ${r.allocated_capacity} daily seats for ${r.daily_frequency}.`;
  } else {
    r.allocation_reason = "Manual override: Route suspended (0 buses).";
  }

  if (r.utilization >= 90) {
    r.demand_level = "HIGH";
    r.recommendation = "High demand – Deploy extra backup bus";
  } else if (r.utilization >= 50) {
    r.demand_level = "MEDIUM";
    r.recommendation = "Optimal utilization – Balanced service";
  } else {
    r.demand_level = "LOW";
    r.recommendation = "Low occupancy – Reallocate bus to busier corridor";
  }

  const badge = $("#table-action-badge");
  if (badge) badge.textContent = `Manual override on ${r.route}: ${newAlloc} buses (${r.utilization}% load)`;

  recalculateDashboardStats(currentDashboardData);
};

function recalculateDashboardStats(data) {
  const routes = data.routes;
  const totalBuses = routes.reduce((acc, r) => acc + r.allocated_buses, 0);
  const totalPredicted = routes.reduce((acc, r) => acc + r.predicted_passengers, 0);
  const avgDemand = round1(totalPredicted / Math.max(routes.length, 1));
  const avgUtil = round1(routes.reduce((acc, r) => acc + r.utilization, 0) / Math.max(routes.length, 1));

  data.total_buses = totalBuses;
  data.avg_demand = avgDemand;
  data.avg_utilization = avgUtil;

  animateNumber($("#dash-routes"),   routes.length);
  animateNumber($("#dash-buses"),    totalBuses);
  animateNumber($("#dash-demand"),   avgDemand);
  animateNumber($("#dash-util"),     avgUtil, 500, "%");

  renderDashboardTable(routes);
  drawDashboardCharts(routes);
}

function renderDashboard(data) {
  animateNumber($("#dash-routes"),   data.total_routes);
  animateNumber($("#dash-buses"),    data.total_buses);
  animateNumber($("#dash-demand"),   data.avg_demand);
  animateNumber($("#dash-util"),     data.avg_utilization, 600, "%");

  renderDashboardTable(data.routes);
  drawDashboardCharts(data.routes);
}

function renderDashboardTable(routes) {
  const tbody = $("#dash-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  routes.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass(r.priority_rank)}">${r.priority_rank}</span></td>
      <td>
        <strong>${r.route}</strong><br>
        <small class="text-muted">Depot: ${r.depot} · ${r.corridor_type || "Corridor"}</small>
      </td>
      <td>
        <span style="font-size:0.85rem;font-weight:600;color:var(--accent-cyan);">⏱️ ${r.daily_frequency}</span>
      </td>
      <td class="fw-700">
        <div>${r.predicted_passengers} <small class="text-muted">pass/day</small></div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <button class="btn-bus-adj" onclick="adjustRouteBuses(${idx}, -1)" title="Decrease bus">-</button>
          <span style="font-weight:800;font-size:1rem;min-width:24px;text-align:center;color:var(--accent-purple);">${r.allocated_buses}</span>
          <button class="btn-bus-adj" onclick="adjustRouteBuses(${idx}, 1)" title="Increase bus">+</button>
        </div>
      </td>
      <td>${r.allocated_capacity} seats</td>
      <td>
        <div style="min-width:85px;">
          <span class="fw-700" style="color:${getUtilColor(r.utilization)}">${r.utilization}%</span>
          <div class="progress-bar mt-1">
            <div class="progress-fill ${utilFillClass(r.utilization)}"
                 style="width:${Math.min(r.utilization, 100)}%"></div>
          </div>
        </div>
      </td>
      <td><span class="badge ${getDemandClass(r.demand_level)}">${r.demand_level}</span></td>
      <td style="font-size:0.82rem;color:var(--text-secondary);line-height:1.4;max-width:280px;">
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:0.15rem;">${r.recommendation}</div>
        ${r.allocation_reason}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function drawDashboardCharts(routes) {
  const labels = routes.map((r) => r.route);

  // Demand bar chart
  const dc = $("#dash-chart-demand");
  if (dc) {
    if (chartInstances.dashDemand) chartInstances.dashDemand.destroy();
    chartInstances.dashDemand = new Chart(dc, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Total Daily Predicted Demand (passengers)",
          data: routes.map((r) => r.predicted_passengers),
          backgroundColor: routes.map((r) =>
            r.demand_level === "HIGH" ? "rgba(239,68,68,0.75)"
            : r.demand_level === "MEDIUM" ? "rgba(245,158,11,0.75)"
            : "rgba(16,185,129,0.75)"
          ),
          borderColor: routes.map((r) =>
            r.demand_level === "HIGH" ? "#ef4444"
            : r.demand_level === "MEDIUM" ? "#f59e0b"
            : "#10b981"
          ),
          borderWidth: 1.5,
          borderRadius: 6,
        }]
      },
      options: chartDefaults({ scales: true }),
    });
  }

  // Allocation doughnut chart
  const ac = $("#dash-chart-alloc");
  if (ac) {
    if (chartInstances.dashAlloc) chartInstances.dashAlloc.destroy();
    chartInstances.dashAlloc = new Chart(ac, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: routes.map((r) => r.allocated_buses),
          backgroundColor: [
            "#3b82f6","#8b5cf6","#06b6d4","#10b981","#f59e0b",
            "#ef4444","#ec4899","#14b8a6","#f97316","#6366f1",
            "#0284c7","#a855f7","#10b981","#eab308","#f43f5e"
          ],
          borderWidth: 2,
          borderColor: "#0a0e1a",
        }]
      },
      options: {
        ...chartDefaults({ scales: false }),
        cutout: "60%",
        plugins: {
          legend: { position: "right", labels: { color: "#94a3b8", font: { size: 10 } } },
          tooltip: {
            callbacks: { label: (c) => ` ${c.label}: ${c.raw} buses` }
          }
        }
      },
    });
  }

  // Utilization line chart
  const uc = $("#dash-chart-util");
  if (uc) {
    if (chartInstances.dashUtil) chartInstances.dashUtil.destroy();
    chartInstances.dashUtil = new Chart(uc, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Occupancy / Utilization Rate (%)",
          data: routes.map((r) => r.utilization),
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6,182,212,0.12)",
          borderWidth: 2.5,
          pointBackgroundColor: routes.map((r) => getUtilColor(r.utilization)),
          pointRadius: 6,
          fill: true,
          tension: 0.35,
        }]
      },
      options: chartDefaults({ scales: true, yMax: 130 }),
    });
  }
}

// ── Chart.js Global Options Factory ────────────────────────
function chartDefaults({ scales = true, yMax } = {}) {
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(15,21,40,0.95)",
        borderColor: "rgba(59,130,246,0.3)",
        borderWidth: 1,
        titleColor: "#f1f5f9",
        bodyColor: "#94a3b8",
        padding: 10,
        cornerRadius: 8,
      },
    },
  };
  if (scales) {
    opts.scales = {
      x: {
        ticks: { color: "#94a3b8", font: { size: 11 } },
        grid:  { color: "rgba(255,255,255,0.05)" },
      },
      y: {
        ticks: { color: "#94a3b8", font: { size: 11 } },
        grid:  { color: "rgba(255,255,255,0.05)" },
      },
    };
    if (yMax) opts.scales.y.max = yMax;
  }
  return opts;
}

// ── Auto Initialization ────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const path = location.pathname;
  if (path === "/prediction" || path.endsWith("prediction.html"))   initPredictionPage();
  if (path === "/optimization" || path.endsWith("optimization.html")) initOptimizationPage();
  if (path === "/dashboard" || path.endsWith("dashboard.html"))     initDashboard();
});
