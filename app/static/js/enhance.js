// ╔══════════════════════════════════════════════════════════════════╗
// ║  enhance.js  v6 — COMPLETE FIX                                   ║
// ║  FIXES:                                                          ║
// ║  • Event-delegation intercepts "history" tab click (no switch    ║
// ║    case needed in monitor.js)                                    ║
// ║  • API data: m.cpu.value / m.memory.percent / m.rootstorage.percent
// ║  • API_BASE read from monitor.js const correctly                 ║
// ║  • Log modal scoping fixed                                       ║
// ╚══════════════════════════════════════════════════════════════════╝

"use strict";

console.log("🚀 enhance.js v6 loaded");
let _cachedChartData = { server: null, cpu: [], mem: [], sto: [] };

// ── Module-level state ────────────────────────────────────────────
const serverStates = new Map();
const criticalServers = new Set();
const warningServers = new Set();
let alertBannerTimeout = null;

// ── Log modal state ───────────────────────────────────────────────
let _logCurrentServer = null;
let _logCurrentLines = 200;
let _logCurrentFilter = "all";
let _logAutoRefresh = null;
let _logAutoScroll = true;

let _gpuSmiAutoRefresh = null;
let _gpuCurrentServer = null;
let _gpuSmiTimer = null;

// ─────────────────────────────────────────────────────────────────
// 0. SAFE API_BASE
//    monitor.js declares: const API_BASE = '/monitoring_server'
//    That is a script-scoped const — accessible as API_BASE but NOT
//    as window.API_BASE. We read it directly.
// ─────────────────────────────────────────────────────────────────
function getAPIBase() {
  try {
    return typeof APIBASE !== "undefined" ? APIBASE : "/monitoring_server/";
  } catch (e) {
    return "/monitoring_server/";
  }
}

function _getAPIBase() {
  return getAPIBase();
}
let _chartCache = { server: null, cpu: [], mem: [], sto: [], state: "idle" };

// ─────────────────────────────────────────────────────────────────
// 1. INTERNAL STORAGE FILTER
// ─────────────────────────────────────────────────────────────────
function filterInternalStorage(storageArray) {
  if (!Array.isArray(storageArray)) return [];
  const external = [
    /^\/mnt\//,
    /^\/vol/,
    /^\/vedas_pools\//,
    /^\/netapp/,
    /^\/home\/sac\//,
    /^\/home\/isro\//,
    /\/(67_data|115_data|Pix2Poly)/,
    /^\/vol\d+/,
    /^\/home_\d+/,
  ];
  const internal = [
    /^\/$/,
    /^\/boot/,
    /^\/home$/,
    /^\/var/,
    /^\/tmp/,
    /^\/usr/,
    /^\/opt/,
  ];
  return storageArray.filter((s) => {
    const mp = s.mountpoint;
    return (
      internal.some((p) => p.test(mp)) && !external.some((p) => p.test(mp))
    );
  });
}

// ─────────────────────────────────────────────────────────────────
// 2. SERVER STATE TRACKING
// ─────────────────────────────────────────────────────────────────
function trackServerState(server) {
  const name = server.name;
  const prev = serverStates.get(name);
  let state = "normal",
    reason = "";

  if (server.status === "offline") {
    state = "offline";
    reason = "Server offline";
  } else if (server.status === "ssh_unreachable") {
    state = "ssh_unreachable";
    reason = "SSH not responding";
  } else if (server.status === "online") {
    if (server.cpu != null) {
      if (server.cpu >= 90) {
        state = "critical";
        reason = `CPU critical: ${server.cpu.toFixed(1)}%`;
      } else if (server.cpu >= 75 && state === "normal") {
        state = "warning";
        reason = `CPU warning: ${server.cpu.toFixed(1)}%`;
      }
    }
    if (server.memory?.used && server.memory?.total) {
      const mp = calculateMemoryPercent(
        server.memory.used,
        server.memory.total,
      );
      if (mp >= 90) {
        state = "critical";
        reason = `Memory critical: ${mp.toFixed(1)}%`;
      } else if (mp >= 75 && state === "normal") {
        state = "warning";
        reason = `Memory warning: ${mp.toFixed(1)}%`;
      }
    }
    for (const s of filterInternalStorage(server.storage)) {
      if (s.percent >= 90) {
        state = "critical";
        reason = `Storage critical: ${s.mountpoint} (${s.percent.toFixed(1)}%)`;
        break;
      } else if (s.percent >= 80 && state !== "critical") {
        state = "warning";
        reason = `Storage warning: ${s.mountpoint} (${s.percent.toFixed(1)}%)`;
      }
    }
  }

  const ts = new Date();
  if (!prev) {
    serverStates.set(name, {
      current: state,
      previous: null,
      timestamp: ts,
      history: [{ state, timestamp: ts, reason }],
    });
  } else {
    if (prev.current !== state) {
      const history = [
        ...(prev.history || []),
        { state, timestamp: ts, reason },
      ];
      if (history.length > 20) history.shift();
      serverStates.set(name, {
        current: state,
        previous: prev.current,
        timestamp: ts,
        history,
        transition: `${prev.current} → ${state}`,
      });
      if (_shouldShowCriticalBanner(prev, state)) {
        if (state === "critical" || state === "offline")
          criticalServers.add(name);
        else if (state === "ssh_unreachable") warningServers.add(name);
        showCriticalAlertBanner();
        if (state === "offline" && prev.current !== "offline")
          setTimeout(() => fetchServerCrashLogs(name), 1000);
      }
    } else {
      serverStates.set(name, { ...prev, timestamp: ts });
    }
  }

  if (state === "critical" || state === "offline") {
    criticalServers.add(name);
    warningServers.delete(name);
  } else if (state === "ssh_unreachable") {
    warningServers.add(name);
    criticalServers.delete(name);
  } else {
    criticalServers.delete(name);
    warningServers.delete(name);
  }

  return {
    current: state,
    previous: prev ? prev.current : null,
    changed: prev && prev.current !== state,
    history: serverStates.get(name).history,
  };
}

function _shouldShowCriticalBanner(prev, current) {
  return [
    ["normal", "critical"],
    ["normal", "offline"],
    ["normal", "ssh_unreachable"],
    ["warning", "critical"],
    ["warning", "offline"],
    ["warning", "ssh_unreachable"],
    ["critical", "offline"],
    ["ssh_unreachable", "critical"],
    ["ssh_unreachable", "offline"],
  ].some(([f, t]) => prev.current === f && current === t);
}

// ─────────────────────────────────────────────────────────────────
// 3. CRITICAL ALERT BANNER
// ─────────────────────────────────────────────────────────────────
function showCriticalAlertBanner() {
  let banner = document.getElementById("critical-alert-banner");
  if (!banner) {
    _createCriticalBanner();
    banner = document.getElementById("critical-alert-banner");
  }
  _updateCriticalBannerContent();
  banner.classList.add("active", "blink-animation");
  document.body.classList.add("has-critical-banner");
  if (alertBannerTimeout) clearTimeout(alertBannerTimeout);
  alertBannerTimeout = setTimeout(
    () => banner.classList.remove("blink-animation"),
    10000,
  );
}
function _createCriticalBanner() {
  const b = document.createElement("div");
  b.id = "critical-alert-banner";
  b.className = "critical-alert-banner";
  b.innerHTML = `
    <div class="critical-banner-content">
      <i class="fas fa-exclamation-triangle critical-banner-icon"></i>
      <div class="critical-banner-text">
        <div class="critical-banner-title"   id="critical-banner-title"></div>
        <div class="critical-banner-servers" id="critical-banner-servers"></div>
      </div>
    </div>
    <div class="critical-banner-actions">
      <button class="critical-banner-btn" onclick="viewCriticalServers()"><i class="fas fa-eye"></i> View Details</button>
      <button class="critical-banner-btn" onclick="viewAllLogs()"><i class="fas fa-file-alt"></i> View Logs</button>
    </div>
    <button class="critical-banner-close" onclick="hideCriticalBanner()"><i class="fas fa-times"></i></button>`;
  document.body.insertBefore(b, document.body.firstChild);
}
function _updateCriticalBannerContent() {
  const titleEl = document.getElementById("critical-banner-title");
  const serversEl = document.getElementById("critical-banner-servers");
  if (!titleEl || !serversEl) return;
  const cc = criticalServers.size,
    wc = warningServers.size;
  if (!cc && !wc) {
    hideCriticalBanner();
    return;
  }
  titleEl.innerHTML =
    cc > 0
      ? `⚠️ ${cc} Server${cc > 1 ? "s" : ""} in Critical State!`
      : `⚡ ${wc} Server${wc > 1 ? "s" : ""} with SSH Issue!`;
  const parts = [
    ...Array.from(criticalServers).map((n) => {
      const s = serverStates.get(n);
      return `<strong style="color:#ef4444">${n}</strong> <span style="opacity:.7">(${s ? s.current : "critical"})</span>`;
    }),
    ...Array.from(warningServers).map(
      (n) =>
        `<strong style="color:#f59e0b">${n}</strong> <span style="opacity:.7">(ssh unreachable)</span>`,
    ),
  ];
  serversEl.innerHTML = parts.join(" &bull; ");
}
function hideCriticalBanner() {
  const b = document.getElementById("critical-alert-banner");
  if (b) b.classList.remove("active", "blink-animation");
  document.body.classList.remove("has-critical-banner");
}
function viewCriticalServers() {
  const nav = document.querySelector('[data-page="dashboard"]');
  if (nav) {
    nav.click();
    setTimeout(
      () =>
        document
          .querySelector(".critical-group")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      300,
    );
  }
}
function viewAllLogs() {
  const s = Array.from(criticalServers);
  if (s.length) fetchServerCrashLogs(s[0]);
}

function _isGpuServer(serverLike) {
  if (!serverLike) return false;

  if (typeof serverLike === "string") {
    const name = serverLike.trim().toLowerCase();
    const server = (window.currentServersData || []).find(
      (s) => (s.name || "").trim().toLowerCase() === name,
    );
    return ((server?.group || "") + "").toLowerCase() === "gpus";
  }

  return ((serverLike.group || "") + "").toLowerCase() === "gpus";
}

function _escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text == null ? "" : String(text);
  return d.innerHTML;
}

function _stopGpuSmiLive() {
  if (_gpuSmiAutoRefresh) {
    clearInterval(_gpuSmiAutoRefresh);
    _gpuSmiAutoRefresh = null;
  }
}

function _renderGpuSmiEmpty(container, msg) {
  container.innerHTML = `
    <div class="gpu-smi-state empty">
      <i class="fas fa-microchip"></i>
      <div>
        <div class="gpu-state-title">GPU telemetry unavailable</div>
        <div class="gpu-state-sub">${_escapeHtml(msg)}</div>
      </div>
    </div>
  `;
}

function _renderGpuSmiOutput(container, data, serverName) {
  const parsed = _parseNvidiaSmi(data.output || "");

  container.innerHTML = `
    <div class="gpu-smi-meta">
      <div class="gpu-live-pill">
        <span class="gpu-live-dot"></span>
        LIVE
      </div>
      <div class="gpu-meta-server">${_escapeHtml(serverName)}</div>
      <div class="gpu-meta-time">${new Date(data.timestamp).toLocaleString()}</div>
    </div>

    ${
      parsed.gpus.length
        ? `<div class="gpu-grid">
            ${parsed.gpus.map((g) => _gpuCardHtml(g)).join("")}
          </div>`
        : `<div class="gpu-smi-raw">
            <pre>${_escapeHtml(data.output || "No output")}</pre>
          </div>`
    }

    ${
      parsed.processes.length
        ? `<div class="gpu-proc-block">
            <div class="gpu-section-title">
              <i class="fas fa-tasks"></i> GPU Processes
            </div>
            <div class="gpu-proc-table">
              <div class="gpu-proc-head">
                <span>GPU</span>
                <span>PID</span>
                <span>Type</span>
                <span>Process</span>
                <span>Memory</span>
              </div>
              ${parsed.processes
                .map(
                  (p) => `
                <div class="gpu-proc-row">
                  <span>${_escapeHtml(p.gpu)}</span>
                  <span>${_escapeHtml(p.pid)}</span>
                  <span>${_escapeHtml(p.type)}</span>
                  <span class="gpu-proc-name">${_escapeHtml(p.name)}</span>
                  <span>${_escapeHtml(p.mem)}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>`
        : ""
    }
  `;
}

function _gpuCardHtml(g) {
  const memPct =
    g.memTotal > 0 ? Math.min(100, (g.memUsed / g.memTotal) * 100) : 0;
  const utilPct = Number(g.util || 0);
  const temp = Number(g.temp || 0);

  const utilClass = utilPct >= 90 ? "critical" : utilPct >= 70 ? "warn" : "ok";
  const tempClass = temp >= 85 ? "critical" : temp >= 75 ? "warn" : "ok";

  return `
    <div class="gpu-card">
      <div class="gpu-card-top">
        <div>
          <div class="gpu-name">${_escapeHtml(g.name || "GPU")}</div>
          <div class="gpu-sub">GPU ${_escapeHtml(g.index)}</div>
        </div>
        <div class="gpu-badges">
          <span class="gpu-badge ${tempClass}">${_escapeHtml(g.temp)}°C</span>
          <span class="gpu-badge ${utilClass}">${_escapeHtml(g.util)}% util</span>
        </div>
      </div>

      <div class="gpu-metrics">
        <div class="gpu-metric">
          <span>Power</span>
          <strong>${_escapeHtml(g.power || "—")}</strong>
        </div>
        <div class="gpu-metric">
          <span>Fan</span>
          <strong>${_escapeHtml(g.fan || "—")}</strong>
        </div>
        <div class="gpu-metric">
          <span>Perf</span>
          <strong>${_escapeHtml(g.perf || "—")}</strong>
        </div>
      </div>

      <div class="gpu-mem-row">
        <div class="gpu-mem-label">
          <span>Memory</span>
          <strong>${g.memUsed} / ${g.memTotal} MiB</strong>
        </div>
        <div class="gpu-mem-bar">
          <div class="gpu-mem-fill ${memPct >= 90 ? "critical" : memPct >= 75 ? "warn" : ""}" style="width:${memPct}%"></div>
        </div>
      </div>
    </div>
  `;
}

function _parseNvidiaSmi(raw) {
  const lines = (raw || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const result = { gpus: [], processes: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const gpuNameMatch = line.match(/^\|\s*(\d+)\s+([^\|]+?)\s{2,}/);
    if (gpuNameMatch && i + 1 < lines.length) {
      const next = lines[i + 1];

      const tempMatch = next.match(/(\d+)C/);
      const powerMatch = next.match(/(\d+W\s*\/\s*\d+W)/);
      const memMatch = next.match(/(\d+)MiB\s*\/\s*(\d+)MiB/);
      const utilMatch = next.match(/(\d+)%\s*Default/);
      const fanMatch = next.match(/(\d+)%\s+/);
      const perfMatch = next.match(/\|\s*[\dA-F:]+\s+(\w+)\s*\|/);

      result.gpus.push({
        index: gpuNameMatch[1],
        name: gpuNameMatch[2].replace(/\s+/g, " ").trim(),
        temp: tempMatch ? tempMatch[1] : "—",
        power: powerMatch ? powerMatch[1] : "—",
        memUsed: memMatch ? Number(memMatch[1]) : 0,
        memTotal: memMatch ? Number(memMatch[2]) : 0,
        util: utilMatch ? utilMatch[1] : "0",
        fan: fanMatch ? `${fanMatch[1]}%` : "—",
        perf: perfMatch ? perfMatch[1] : "—",
      });
    }

    const procMatch = line.match(
      /^\|\s*(\d+)\s+N\/A\s+N\/A\s+(\d+)\s+([CG])\s+(.+?)\s+(\d+)MiB\s+\|$/,
    );
    if (procMatch) {
      result.processes.push({
        gpu: procMatch[1],
        pid: procMatch[2],
        type: procMatch[3],
        name: procMatch[4].trim(),
        mem: `${procMatch[5]} MiB`,
      });
    }
  }

  return result;
}

function _escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _renderGpuSmiError(container, error) {
  if (!container) return;
  container.innerHTML = `
    <div class="gpu-smi-error">
      <i class="fas fa-exclamation-triangle"></i>
      <span>${_escapeHtml(error || "Failed to load NVIDIA SMI")}</span>
    </div>`;
}

function _renderGpuSmiOutput(container, payload, serverName) {
  if (!container) return;

  const raw =
    payload?.output ??
    payload?.nvidia_smi ??
    payload?.data ??
    payload?.stdout ??
    "No NVIDIA SMI output";

  const ts = payload?.timestamp
    ? new Date(payload.timestamp).toLocaleString()
    : new Date().toLocaleString();

  container.innerHTML = `
    <div class="gpu-smi-panel">
      <div class="gpu-smi-toolbar">
        <div class="gpu-smi-status">
          <span class="gpu-smi-live-dot"></span>
          <span>Live NVIDIA SMI</span>
        </div>
        <div class="gpu-smi-actions">
          <span class="gpu-smi-server">${_escapeHtml(serverName || "")}</span>
          <span class="gpu-smi-time">${_escapeHtml(ts)}</span>
          <button class="gpu-smi-refresh-btn" onclick="_refreshGpuSmiNow()">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
      </div>
      <div class="gpu-smi-terminal-wrap">
        <pre class="gpu-smi-terminal"><code>${_escapeHtml(raw)}</code></pre>
      </div>
    </div>`;
}

function _fetchGpuSmi(serverName, silent = false) {
  const container = document.getElementById("gpu-smi-live-container");
  if (!container || !serverName) return;

  //   if (!silent) _renderGpuSmiLoading(container, serverName);

  fetch(`${getAPIBase()}/api/gpu_smi_live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server: serverName }),
  })
    .then(async (r) => {
      const ct = r.headers.get("content-type") || "";
      if (!r.ok) {
        let err = `HTTP ${r.status}`;
        if (ct.includes("application/json")) {
          try {
            const j = await r.json();
            err = j.error || err;
          } catch (_) {}
        }
        throw new Error(err);
      }

      if (!ct.includes("application/json")) {
        throw new Error("Non-JSON response from GPU API");
      }

      return r.json();
    })
    .then((data) => {
      if (!data || data.success !== true) {
        _renderGpuSmiEmpty(
          container,
          data?.error || "NVIDIA SMI not available",
        );
        return;
      }
      _renderGpuSmiOutput(container, data, serverName);
    })
    .catch((err) => {
      console.warn("GPU SMI:", err.message);
      _renderGpuSmiEmpty(
        container,
        err.message || "Failed to load GPU metrics",
      );
    });
}

function _startGpuSmiLive(serverName) {
  _gpuCurrentServer = serverName;
  if (_gpuSmiTimer) clearInterval(_gpuSmiTimer);
  _fetchGpuSmi(serverName);
  _gpuSmiTimer = setInterval(() => _fetchGpuSmi(serverName, true), 15000);
}

function _refreshGpuSmiNow() {
  if (_gpuCurrentServer) {
    _fetchGpuSmi(_gpuCurrentServer, false);
  }
}

function _injectGpuSmiIntoOverview(serverName) {
  const overviewTab = document.getElementById("overview-tab");
  if (!overviewTab) return;

  let wrap = document.getElementById("gpu-smi-live-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "gpu-smi-live-wrap";
    wrap.className = "gpu-smi-live-wrap";
    wrap.innerHTML = `
      <div class="gpu-smi-card">
        <div class="gpu-smi-head">
          <div class="gpu-smi-title">
            <div class="gpu-smi-icon"><i class="fas fa-microchip"></i></div>
            <div>
              <div class="gpu-smi-kicker">GPU TELEMETRY</div>
              <h3>NVIDIA SMI Live</h3>
            </div>
          </div>
          <div class="gpu-smi-actions">
            <button class="gpu-smi-btn" onclick="_fetchGpuSmi('${serverName}')">
              <i class="fas fa-sync-alt"></i> Refresh
            </button>
          </div>
        </div>
        <div id="gpu-smi-live-container" class="gpu-smi-body"></div>
      </div>
    `;
    overviewTab.appendChild(wrap);
  }

  _startGpuSmiLive(serverName);
}

// ─────────────────────────────────────────────────────────────────
// 4. STORAGE ALERTS
// ─────────────────────────────────────────────────────────────────
function getStorageAlertDetails(server) {
  if (!server?.storage?.length) return null;
  const alerts = { critical: [], warning: [] };
  filterInternalStorage(server.storage).forEach((s) => {
    if (s.percent >= 90) alerts.critical.push(s);
    else if (s.percent >= 80) alerts.warning.push(s);
  });
  return alerts.critical.length || alerts.warning.length ? alerts : null;
}
function renderStorageAlertDetails(alerts, server) {
  if (!alerts || !server || (!alerts.critical.length && !alerts.warning.length))
    return "";
  const sev = alerts.critical.length ? "critical" : "warning";
  const items = [...alerts.critical, ...alerts.warning];
  const esc = (str) => str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  return `
    <div class="storage-alert-details ${sev}">
      <div class="storage-alert-title ${sev}">
        <i class="fas fa-hdd"></i> Storage Alert — ${items.length} Partition${items.length > 1 ? "s" : ""}
      </div>
      <div class="storage-alert-items">
        ${items
          .map(
            (s) => `
          <div class="storage-alert-item">
            <span class="storage-mountpoint"><i class="fas fa-folder"></i> ${s.mountpoint}</span>
            <div class="storage-usage-bar">
              <div class="storage-usage-progress">
                <div class="storage-usage-fill ${s.percent >= 90 ? "critical" : "warning"}" style="width:${s.percent}%"></div>
              </div>
              <span class="storage-usage-value">${s.percent.toFixed(1)}%</span>
            </div>
            <button class="storage-analyze-inline-btn"
                    onclick="event.stopPropagation();analyzeStorage('${esc(server.name)}','${esc(s.mountpoint)}')">
              <i class="fas fa-search-plus"></i> Analyze
            </button>
          </div>`,
          )
          .join("")}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────
// 5. 24H HISTORY CHARTS
// ─────────────────────────────────────────────────────────────────
// ── routes.py stores metrics as:
//    { cpu: {value: 1.8, status: 'normal'},
//      memory: {percent: 14.9, status: 'normal'},
//      rootstorage: {percent: 96.0, status: 'critical'} }
//
// ── TRIGGER: event-delegation on ANY click of data-tab="history"
//    This works even though monitor.js setupTabs has no 'history' case.
// ─────────────────────────────────────────────────────────────────

// Intercept "history" tab clicks anywhere on the page
document.addEventListener(
  "click",
  function (e) {
    const tab = e.target.closest('[data-tab="history"]');
    if (!tab) return;
    const serverName = document
      .getElementById("modal-server-name")
      ?.textContent?.trim();
    console.log(`📊 History tab clicked → server: "${serverName}"`);
    if (!serverName || serverName === "Server Details") {
      console.warn("⚠️  Server name not found on history tab click");
      return;
    }
    // Small delay so setupTabs has time to show #history-tab
    setTimeout(() => loadHistoryCharts(serverName), 250);
  },
  true,
); // capture phase so it fires before other handlers

document.addEventListener(
  "click",
  function (e) {
    const tab = e.target.closest('[data-tab="overview"]');
    if (!tab) return;

    const serverName = document
      .getElementById("modal-server-name")
      ?.textContent?.trim();

    if (!serverName || serverName === "Server Details") return;

    setTimeout(() => {
      _injectGpuSmiIntoOverview(serverName);
    }, 250);
  },
  true,
);

// Also attach on Refresh button in history section
document.addEventListener("click", function (e) {
  const btn = e.target.closest('[data-action="refresh-history"]');
  if (!btn) return;
  const serverName = document
    .getElementById("modal-server-name")
    ?.textContent?.trim();
  if (serverName) loadHistoryCharts(serverName);
});

/**
 * Safely extract a numeric percent from any field shape:
 *   - flat number:         1.8
 *   - {value: 1.8}         → 1.8
 *   - {percent: 14.9}      → 14.9
 *   - {usage_percent: 96}  → 96
 */
function _extractNum(val) {
  if (val == null) return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  if (typeof val === "object") {
    const v =
      val.value ?? val.percent ?? val.usage_percent ?? val.usagepercent ?? null;
    if (v != null) {
      const n = Number(v);
      return isNaN(n) ? null : n;
    }
  }
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function loadHistoryCharts(serverName) {
  console.group(`📊 loadHistoryCharts("${serverName}")`);

  if (typeof Highcharts === "undefined") {
    console.error("❌ Highcharts not loaded");
    ["cpu", "mem", "storage"].forEach((id) =>
      _hcState(id, "error", "Highcharts not loaded"),
    );
    console.groupEnd();
    return;
  }

  ["cpu", "mem", "storage"].forEach((id) => _hcState(id, "loading"));

  const base = _getAPIBase();
  const url = `${base}/api/server_metrics_history?server=${encodeURIComponent(serverName)}&days=1`;
  console.log("  URL →", url);

  fetch(url)
    .then((r) => {
      console.log("  HTTP →", r.status);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      const metrics = Array.isArray(data.metrics) ? data.metrics : [];
      console.log(`  Rows → ${metrics.length}`);

      if (!metrics.length) {
        ["cpu", "mem", "storage"].forEach((id) =>
          _hcState(
            id,
            "empty",
            "No history data yet — check after first poll cycle",
          ),
        );
        console.groupEnd();
        return;
      }

      // Debug first row to reveal field shapes
      const r0 = metrics[0];
      console.log("  row[0] →", {
        cpu: r0.cpu,
        memory: r0.memory,
        rootstorage: r0.rootstorage,
        root_storage: r0.root_storage,
      });

      const cpuData = [],
        memData = [],
        stoData = [];

      metrics.forEach((m, i) => {
        const ts = new Date(m.timestamp).getTime();
        if (isNaN(ts)) {
          if (i < 2) console.warn(`  row[${i}] bad ts:`, m.timestamp);
          return;
        }

        // ✅ CORRECT for routes.py nested format:
        //    m.cpu.value | m.memory.percent | m.rootstorage.percent
        // ✅ Also handles flat floats as fallback
        const cpu = _extractNum(m.cpu);
        const mem = _extractNum(m.memory);
        const sto = _extractNum(m.rootstorage) ?? _extractNum(m.root_storage);

        if (cpu != null) cpuData.push([ts, +cpu.toFixed(1)]);
        if (mem != null) memData.push([ts, +mem.toFixed(1)]);
        if (sto != null) stoData.push([ts, +sto.toFixed(1)]);
      });

      console.log(
        `  Parsed → CPU:${cpuData.length} MEM:${memData.length} STO:${stoData.length}`,
      );

      if (!cpuData.length && !memData.length && !stoData.length) {
        console.error("  ❌ All empty — all row[0] keys:", Object.keys(r0));
        console.error(
          "  Hint: check field names in db.save_server_metrics() output",
        );
      }

      _renderAreaChart("history-cpu-chart", cpuData, {
        name: "CPU Usage",
        color: "#667eea",
        grad: "rgba(102,126,234,0.35)",
        warn: 75,
        crit: 90,
        empty: "No CPU data in last 24h",
      });
      _renderAreaChart("history-mem-chart", memData, {
        name: "Memory",
        color: "#06b6d4",
        grad: "rgba(6,182,212,0.35)",
        warn: 75,
        crit: 90,
        empty: "No Memory data in last 24h",
      });
      const stoColor = _stoColor(stoData);
      _renderAreaChart("history-storage-chart", stoData, {
        name: "Root Storage",
        color: stoColor,
        grad: _stoGrad(stoData),
        warn: 80,
        crit: 95,
        empty: "No Storage data in last 24h",
      });

      console.log("  ✅ Done");
      console.groupEnd();
    })
    .catch((err) => {
      console.error("  ❌ Fetch failed:", err.message);
      ["cpu", "mem", "storage"].forEach((id) =>
        _hcState(id, "error", err.message),
      );
      console.groupEnd();
    });
}

function _stoColor(d) {
  const v = d.length ? d[d.length - 1][1] : 0;
  return v > 95 ? "#ef4444" : v > 80 ? "#f59e0b" : "#10b981";
}
function _stoGrad(d) {
  const v = d.length ? d[d.length - 1][1] : 0;
  return v > 95
    ? "rgba(239,68,68,0.35)"
    : v > 80
      ? "rgba(245,158,11,0.35)"
      : "rgba(16,185,129,0.35)";
}

/** Set loading / empty / error placeholder inside a chart card */
function _hcState(id, type, msg) {
  const el = document.getElementById(`history-${id}-chart`);
  if (!el) return;
  const cfg = {
    loading: {
      icon: "fa-spinner fa-spin",
      color: "#667eea",
      label: "Loading data…",
    },
    ready: {
      icon: "fa-chart-area",
      color: "#10b981",
      label: msg || "Data ready",
    },
    empty: { icon: "fa-database", color: "#4a5568", label: msg || "No data" },
    error: {
      icon: "fa-exclamation-triangle",
      color: "#ef4444",
      label: msg || "Error",
    },
  }[type] || { icon: "fa-circle", color: "#667eea", label: msg || "" };

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;min-height:150px;gap:8px;color:${cfg.color}">
      <i class="fas ${cfg.icon}" style="font-size:1.6rem"></i>
      <p style="font-size:11px;color:#64748b;margin:0;text-align:center;max-width:180px">${cfg.label}</p>
    </div>`;
}

function _renderCachedCharts() {
  const { cpu, mem, sto, loading, error } = _cachedChartData;

  if (loading) {
    ["cpu", "mem", "storage"].forEach((id) => _hcState(id, "loading"));
    return;
  }
  if (error) {
    ["cpu", "mem", "storage"].forEach((id) => _hcState(id, "error", error));
    return;
  }

  // Read actual rendered pixel width of a chart container
  const sampleEl = document.getElementById("history-cpu-chart");
  const w = sampleEl ? sampleEl.offsetWidth : 0;
  console.log(`📊 Rendering charts — container width: ${w}px`);

  if (w < 10) {
    // Layout not ready yet — retry in 100ms
    console.warn("📊 Container width too small, retrying in 100ms...");
    setTimeout(_renderCachedCharts, 100);
    return;
  }

  _renderAreaChart("history-cpu-chart", cpu, {
    name: "CPU Usage",
    color: "#667eea",
    grad: "rgba(102,126,234,0.35)",
    warn: 75,
    crit: 90,
    empty: "No CPU data in last 24h",
    width: w,
  });
  _renderAreaChart("history-mem-chart", mem, {
    name: "Memory",
    color: "#06b6d4",
    grad: "rgba(6,182,212,0.35)",
    warn: 75,
    crit: 90,
    empty: "No Memory data in last 24h",
    width: w,
  });
  _renderAreaChart("history-storage-chart", sto, {
    name: "Root Storage",
    color: _stoColor(sto),
    grad: _stoGrad(sto),
    warn: 80,
    crit: 95,
    empty: "No Storage data in last 24h",
    width: w,
  });
}

function _switchLogModalTab(tab) {
  const chartsPanel = document.getElementById("log-modal-charts-panel");
  const logsPanel = document.getElementById("log-modal-logs-panel");
  const chartsBtn = document.getElementById("log-modal-tab-charts");
  const logsBtn = document.getElementById("log-modal-tab-logs");
  const refreshBtn = document.getElementById("log-chart-refresh-btn");
  if (!chartsPanel || !logsPanel) return;

  if (tab === "charts") {
    // Make panel visible FIRST
    chartsPanel.style.display = "block";
    logsPanel.style.display = "none";
    chartsBtn?.classList.add("active");
    logsBtn?.classList.remove("active");
    if (refreshBtn) refreshBtn.style.display = "flex";

    // Wait for browser to paint the visible panel, THEN render
    // Two nested rAF + 80ms timeout = guaranteed layout is done
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          _renderCachedCharts();
        }, 80);
      });
    });
  } else {
    chartsPanel.style.display = "none";
    logsPanel.style.display = "flex";
    logsBtn?.classList.add("active");
    chartsBtn?.classList.remove("active");
    if (refreshBtn) refreshBtn.style.display = "none";
  }
}

function _renderAreaChart(containerId, data, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el) {
    console.warn("⚠️ chart container not found:", containerId);
    return;
  }

  const cfg = {
    name: opts.name || "Series",
    color: opts.color || "#667eea",
    gradColor: opts.gradColor || opts.grad || "rgba(102,126,234,0.25)",
    warnLine: opts.warnLine ?? opts.warn ?? 75,
    critLine: opts.critLine ?? opts.crit ?? 90,
    emptyMsg: opts.emptyMsg || opts.empty || "No data",
  };

  if (typeof Highcharts !== "undefined" && Array.isArray(Highcharts.charts)) {
    const existing = Highcharts.charts.find((c) => c && c.renderTo === el);
    if (existing) {
      try {
        existing.destroy();
      } catch (e) {}
    }
  }

  if (!Array.isArray(data) || !data.length) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:150px;color:#4a5568;flex-direction:column;gap:8px">
        <i class="fas fa-database" style="font-size:1.5rem"></i>
        <p style="font-size:11px;margin:0">${cfg.emptyMsg}</p>
      </div>`;
    return;
  }

  if (typeof Highcharts === "undefined") {
    el.innerHTML = `<p style="color:#f59e0b;padding:12px;font-size:12px">Highcharts not loaded</p>`;
    return;
  }

  el.innerHTML = "";
  const w = el.offsetWidth || 300;
  console.log(`📈 rendering ${containerId} w=${w} pts=${data.length}`);

  const chart = Highcharts.chart(containerId, {
    accessibility: { enabled: false },
    chart: {
      type: "areaspline",
      backgroundColor: "transparent",
      width: w,
      height: 155,
      animation: { duration: 400 },
      style: { fontFamily: "inherit" },
      margin: [8, 12, 28, 42],
    },
    title: { text: null },
    credits: { enabled: false },
    exporting: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      type: "datetime",
      gridLineColor: "rgba(255,255,255,0.04)",
      lineColor: "rgba(255,255,255,0.07)",
      tickColor: "rgba(255,255,255,0.07)",
      labels: {
        style: { color: "#666", fontSize: "10px" },
        format: "{value:%H:%M}",
        step: Math.max(1, Math.ceil(data.length / 8)),
      },
    },
    yAxis: {
      title: { text: null },
      min: 0,
      max: 100,
      gridLineColor: "rgba(255,255,255,0.05)",
      labels: {
        style: { color: "#666", fontSize: "10px" },
        format: "{value}%",
      },
      plotLines: [
        {
          value: cfg.warnLine,
          color: "rgba(245,158,11,0.6)",
          dashStyle: "ShortDash",
          width: 1,
          label: {
            text: `${cfg.warnLine}%`,
            style: { color: "#f59e0b", fontSize: "9px" },
            align: "right",
            x: -4,
          },
        },
        {
          value: cfg.critLine,
          color: "rgba(239,68,68,0.6)",
          dashStyle: "ShortDash",
          width: 1,
          label: {
            text: `${cfg.critLine}%`,
            style: { color: "#ef4444", fontSize: "9px" },
            align: "right",
            x: -4,
          },
        },
      ],
    },
    tooltip: {
      backgroundColor: "rgba(10,10,24,0.94)",
      borderColor: cfg.color,
      borderRadius: 10,
      shadow: false,
      style: { color: "#e2e8f0", fontSize: "12px" },
      formatter: function () {
        const col =
          this.y >= cfg.critLine
            ? "#ef4444"
            : this.y >= cfg.warnLine
              ? "#f59e0b"
              : cfg.color;
        return `<b>${Highcharts.dateFormat("%d %b %H:%M", this.x)}</b><br/>${cfg.name}: <b style="color:${col}">${this.y.toFixed(1)}%</b>`;
      },
    },
    series: [
      {
        name: cfg.name,
        data,
        color: cfg.color,
        fillColor: {
          linearGradient: { x1: 0, x2: 0, y1: 0, y2: 1 },
          stops: [
            [0, cfg.gradColor],
            [1, "rgba(0,0,0,0)"],
          ],
        },
        lineWidth: 2,
        marker: {
          enabled: false,
          states: { hover: { enabled: true, radius: 3 } },
        },
        states: { hover: { lineWidth: 2 } },
        threshold: null,
      },
    ],
  });

  setTimeout(() => {
    try {
      chart.reflow();
    } catch (e) {}
  }, 200);
}

// ─────────────────────────────────────────────────────────────────
// 6. ENHANCED LOG MODAL
// ─────────────────────────────────────────────────────────────────
function fetchServerCrashLogs(serverName, lines, filter) {
  _logCurrentServer = serverName;
  _logCurrentLines = lines || _logCurrentLines;
  _logCurrentFilter = filter || _logCurrentFilter;

  showLogsModal(serverName); // open modal
  _switchLogModalTab("logs"); // ✅ default = Logs tab
  _doFetchLogs(); // start log fetch immediately

  // Pre-fetch chart data silently (won't render until tab is clicked)
  _chartCache = {
    server: serverName,
    cpu: [],
    mem: [],
    sto: [],
    state: "loading",
  };
  _prefetchCharts(serverName);
}

function _doFetchLogs() {
  const sn = _logCurrentServer;
  const container = document.getElementById("logs-container");
  if (!container) return;
  container.innerHTML = `
    <div class="logs-empty-state">
      <i class="fas fa-spinner fa-spin fa-2x" style="color:#667eea"></i>
      <p style="margin-top:12px;color:#64748b">Fetching logs from
        <strong style="color:#a5b4fc">${sn}</strong>…</p>
    </div>`;
  const url = `${_getAPIBase()}/api/server_logs`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      server: sn,
      lines: _logCurrentLines,
      filter: _logCurrentFilter,
    }),
  })
    .then((r) => {
      if (!r.ok)
        return r.json().then((d) => {
          throw new Error(d.error || `HTTP ${r.status}`);
        });
      return r.json();
    })
    .then((data) => {
      if (data.success) displayLogs(data.logs, sn);
      else _displayLogsError(data.error || "Failed to fetch logs");
    })
    .catch((err) => {
      console.error("❌ Logs:", err);
      _displayLogsError(`Connection error: ${err.message}`);
    });
}

function showLogsModal(serverName) {
  let modal = document.getElementById("logs-modal-overlay");
  if (!modal) modal = _createLogsModal();
  _updateLogsModalHeader(serverName);
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}
function fetchServerCrashLogs(serverName, lines, filter) {
  _logCurrentServer = serverName;
  _logCurrentLines = lines || _logCurrentLines;
  _logCurrentFilter = filter || _logCurrentFilter;

  showLogsModal(serverName); // open modal
  _switchLogModalTab("logs"); // ✅ default = Logs tab
  _doFetchLogs(); // start log fetch immediately

  // Pre-fetch chart data silently (won't render until tab is clicked)
  _chartCache = {
    server: serverName,
    cpu: [],
    mem: [],
    sto: [],
    state: "loading",
  };
  _prefetchCharts(serverName);
}
function _prefetchCharts(serverName) {
  const url = `${_getAPIBase()}/api/server_metrics_history?server=${encodeURIComponent(serverName)}&days=1`;
  console.log("📊 _prefetchCharts ->", url);

  fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      const metrics = Array.isArray(data.metrics) ? data.metrics : [];
      console.log(`📊 metrics received: ${metrics.length} rows`);

      const cpu = [],
        mem = [],
        sto = [];
      metrics.forEach((m) => {
        const ts = new Date(m.timestamp).getTime();
        if (isNaN(ts)) return;
        // ✅ handles BOTH flat floats AND nested {value/percent} objects
        const c = m.cpu?.value ?? m.cpu;
        const me = m.memory?.percent ?? m.memory;
        const s =
          m.root_storage?.percent ??
          m.root_storage ??
          m.rootstorage?.percent ??
          m.rootstorage;
        if (c != null && !isNaN(c)) cpu.push([ts, +Number(c).toFixed(1)]);
        if (me != null && !isNaN(me)) mem.push([ts, +Number(me).toFixed(1)]);
        if (s != null && !isNaN(s)) sto.push([ts, +Number(s).toFixed(1)]);
      });

      _chartCache = { server: serverName, cpu, mem, sto, state: "ready" };
      console.log(
        `📊 cache ready — CPU:${cpu.length} MEM:${mem.length} STO:${sto.length}`,
      );
    })
    .catch((err) => {
      console.error("📊 prefetch error:", err.message);
      _chartCache = { ..._chartCache, state: "error", error: err.message };
    });
}
// ─────────────────────────────────────────────────────────────────
// Tab switcher for log modal
// ─────────────────────────────────────────────────────────────────
function _switchLogModalTab(tab) {
  const chartsPanel = document.getElementById("log-modal-charts-panel");
  const logsPanel = document.getElementById("log-modal-logs-panel");
  const chartsBtn = document.getElementById("log-tab-btn-charts");
  const logsBtn = document.getElementById("log-tab-btn-logs");
  if (!chartsPanel || !logsPanel) return;

  if (tab === "charts") {
    chartsPanel.style.display = "block";
    logsPanel.style.display = "none";
    chartsBtn?.classList.add("active");
    logsBtn?.classList.remove("active");

    // ✅ Wait for panel to paint, THEN measure width, THEN render
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setTimeout(_drawChartsFromCache, 100);
      }),
    );
  } else {
    chartsPanel.style.display = "none";
    logsPanel.style.display = "flex";
    logsBtn?.classList.add("active");
    chartsBtn?.classList.remove("active");
  }
}

// ─────────────────────────────────────────────────────────────────
function _setChartState(id, type, msg) {
  const el = document.getElementById(`modal-${id}-chart`);
  if (!el) return;
  const cfg = {
    loading: {
      icon: "fa-spinner fa-spin",
      color: "#667eea",
      text: "Loading data…",
    },
    empty: { icon: "fa-database", color: "#4a5568", text: msg || "No data" },
    error: {
      icon: "fa-exclamation-triangle",
      color: "#ef4444",
      text: msg || "Error",
    },
  }[type] || { icon: "fa-circle", color: "#667eea", text: msg || "" };
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;min-height:150px;gap:8px;color:${cfg.color}">
      <i class="fas ${cfg.icon}" style="font-size:1.6rem"></i>
      <p style="font-size:11px;color:#64748b;margin:0;text-align:center">${cfg.text}</p>
    </div>`;
}

function _drawChartsFromCache() {
  const el = document.getElementById("modal-cpu-chart");
  if (!el) {
    console.error("❌ modal-cpu-chart container missing");
    return;
  }

  const w = el.offsetWidth;
  console.log(`📊 _drawChartsFromCache state=${_chartCache.state} w=${w}`);

  if (w < 10) {
    // Container not laid out yet — retry
    setTimeout(_drawChartsFromCache, 100);
    return;
  }

  if (_chartCache.state === "loading") {
    ["cpu", "mem", "sto"].forEach((id) => _setChartState(id, "loading"));
    // Poll until ready
    const poll = setInterval(() => {
      if (_chartCache.state !== "loading") {
        clearInterval(poll);
        _drawChartsFromCache();
      }
    }, 300);
    return;
  }

  if (_chartCache.state === "error") {
    ["cpu", "mem", "sto"].forEach((id) =>
      _setChartState(id, "error", _chartCache.error),
    );
    return;
  }

  const { cpu, mem, sto } = _chartCache;

  _renderAreaChart("modal-cpu-chart", cpu, {
    name: "CPU Usage",
    color: "#667eea",
    gradColor: "rgba(102,126,234,0.35)",
    warnLine: 75,
    critLine: 90,
    emptyMsg: "No CPU data in last 24h",
  });
  _renderAreaChart("modal-mem-chart", mem, {
    name: "Memory",
    color: "#06b6d4",
    gradColor: "rgba(6,182,212,0.35)",
    warnLine: 75,
    critLine: 90,
    emptyMsg: "No Memory data in last 24h",
  });
  _renderAreaChart("modal-sto-chart", sto, {
    name: "Root Storage",
    color: _stoColor(sto),
    gradColor: _stoGrad(sto),
    warnLine: 80,
    critLine: 95,
    emptyMsg: "No Storage data in last 24h",
  });
}
// ─────────────────────────────────────────────────────────────────
// Load history charts INSIDE log modal
// ─────────────────────────────────────────────────────────────────
function loadHistoryChartsInModal(serverName) {
  // Reuse same chart containers but inside the modal
  ["cpu", "mem", "storage"].forEach((id) => _hcState(id, "loading"));

  const url = `${_getAPIBase()}/api/server_metrics_history?server=${encodeURIComponent(serverName)}&days=1`;
  console.log("📊 loadHistoryChartsInModal →", url);

  fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      const metrics = Array.isArray(data.metrics) ? data.metrics : [];
      if (!metrics.length) {
        ["cpu", "mem", "storage"].forEach((id) =>
          _hcState(id, "empty", "No history data yet"),
        );
        return;
      }

      const cpuData = [],
        memData = [],
        stoData = [];
      metrics.forEach((m) => {
        const ts = new Date(m.timestamp).getTime();
        if (isNaN(ts)) return;
        const cpu = _extractNum(m.cpu);
        const mem = _extractNum(m.memory);
        const sto = _extractNum(m.rootstorage) ?? _extractNum(m.root_storage);
        if (cpu != null) cpuData.push([ts, +cpu.toFixed(1)]);
        if (mem != null) memData.push([ts, +mem.toFixed(1)]);
        if (sto != null) stoData.push([ts, +sto.toFixed(1)]);
      });

      _renderAreaChart("history-cpu-chart", cpuData, {
        name: "CPU Usage",
        color: "#667eea",
        grad: "rgba(102,126,234,0.35)",
        warn: 75,
        crit: 90,
        empty: "No CPU data",
      });
      _renderAreaChart("history-mem-chart", memData, {
        name: "Memory",
        color: "#06b6d4",
        grad: "rgba(6,182,212,0.35)",
        warn: 75,
        crit: 90,
        empty: "No Memory data",
      });
      _renderAreaChart("history-storage-chart", stoData, {
        name: "Root Storage",
        color: _stoColor(stoData),
        grad: _stoGrad(stoData),
        warn: 80,
        crit: 95,
        empty: "No Storage data",
      });
    })
    .catch((err) => {
      console.error("❌ Modal chart error:", err.message);
      ["cpu", "mem", "storage"].forEach((id) =>
        _hcState(id, "error", err.message),
      );
    });
}

function _createLogsModal() {
  const modal = document.createElement("div");
  modal.id = "logs-modal-overlay";
  modal.className = "logs-modal-overlay";
  modal.innerHTML = `
    <div class="logs-modal">

      <!-- ══ GLOWING HEADER ══ -->
      <div class="logs-modal-header">
        <div class="lm-header-left">
          <div class="lm-server-icon">
            <i class="fas fa-server"></i>
          </div>
          <div class="lm-title-block">
            <div class="lm-title-label">SERVER MONITOR</div>
            <div class="lm-server-name" id="logs-modal-server-name">—</div>
          </div>
        </div>
        <div class="lm-header-center">
          <div class="lm-status-pill" id="lm-status-pill">
            <span class="lm-status-dot"></span>
            <span id="lm-status-text">Connected</span>
          </div>
        </div>
        <div class="lm-header-right">
          <button class="lm-action-btn" id="logs-copy-btn"        onclick="_copyLogs()"          title="Copy logs">
            <i class="fas fa-copy"></i><span>Copy</span>
          </button>
          <button class="lm-action-btn" id="logs-autoscroll-btn"  onclick="_toggleAutoScroll()"  title="Auto-scroll">
            <i class="fas fa-arrow-down"></i><span>Scroll</span>
          </button>
          <button class="lm-action-btn" id="logs-autorefresh-btn" onclick="_toggleAutoRefresh()" title="Auto-refresh">
            <i class="fas fa-sync"></i><span>Live</span>
          </button>
          <button class="lm-close-btn" onclick="closeLogsModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- ══ SERVER SWITCHER ══ -->
      <div class="logs-server-switcher" id="logs-server-switcher" style="display:none"></div>

      <!-- ══ TAB BAR ══ -->
      <div class="lm-tabbar">
        <div class="lm-tabs">
          <button class="lm-tab active" id="log-tab-btn-logs" onclick="_switchLogModalTab('logs')">
            <i class="fas fa-terminal"></i>
            <span>System Logs</span>
          </button>
          <button class="lm-tab" id="log-tab-btn-charts" onclick="_switchLogModalTab('charts')">
            <i class="fas fa-chart-area"></i>
            <span>24h History</span>
            <span class="lm-tab-badge" id="lm-chart-badge">●</span>
          </button>
        </div>
        <button class="lm-refresh-charts-btn" id="log-chart-refresh-btn" style="display:none"
                onclick="_chartCache.state='idle';_prefetchCharts(document.getElementById('logs-modal-server-name').textContent.trim());_setChartState('cpu','loading');_setChartState('mem','loading');_setChartState('sto','loading');setTimeout(_drawChartsFromCache,400)">
          <i class="fas fa-sync-alt"></i> Refresh Charts
        </button>
      </div>

      <!-- ══ CHARTS PANEL ══ -->
      <div id="log-modal-charts-panel" style="display:none">
        <div class="lm-charts-wrapper">
          <div class="lm-chart-card">
            <div class="lm-chart-label">
              <span class="lm-chart-pill cpu-pill">CPU</span>
              <span class="lm-chart-title-text">Usage — Last 24h</span>
            </div>
            <div id="modal-cpu-chart" class="lm-chart-body"></div>
          </div>
          <div class="lm-chart-card">
            <div class="lm-chart-label">
              <span class="lm-chart-pill mem-pill">MEM</span>
              <span class="lm-chart-title-text">Usage — Last 24h</span>
            </div>
            <div id="modal-mem-chart" class="lm-chart-body"></div>
          </div>
          <div class="lm-chart-card">
            <div class="lm-chart-label">
              <span class="lm-chart-pill sto-pill">DISK</span>
              <span class="lm-chart-title-text">Root Storage — Last 24h</span>
            </div>
            <div id="modal-sto-chart" class="lm-chart-body"></div>
          </div>
        </div>
      </div>

      <!-- ══ LOGS PANEL ══ -->
      <div id="log-modal-logs-panel">


        <!-- Filter Bar -->
        <div class="lm-filter-bar">
          <div class="lm-filter-pills">
            <button class="lm-filter-pill active" onclick="_setLogFilter('all',this)">
              <i class="fas fa-layer-group"></i> All
            </button>
            <button class="lm-filter-pill error" onclick="_setLogFilter('error',this)">
              <i class="fas fa-times-circle"></i> Errors
              <span class="lm-pill-count" id="fp-error">0</span>
            </button>
            <button class="lm-filter-pill warning" onclick="_setLogFilter('warning',this)">
              <i class="fas fa-exclamation-triangle"></i> Warnings
              <span class="lm-pill-count" id="fp-warning">0</span>
            </button>
            <button class="lm-filter-pill info" onclick="_setLogFilter('info',this)">
              <i class="fas fa-info-circle"></i> Info
              <span class="lm-pill-count" id="fp-info">0</span>
            </button>
          </div>
          <div class="lm-filter-right">
            <div class="lm-search-wrap">
              <i class="fas fa-search lm-search-icon"></i>
              <input type="text" id="logs-search-input" class="lm-search-input"
                     placeholder="Search logs…" oninput="filterLogs(this.value)">
            </div>
            <div class="lm-lines-wrap">
              <i class="fas fa-list-ol" style="color:#64748b;font-size:11px"></i>
              <select class="lm-lines-select" onchange="_setLogLines(this.value)">
                <option value="100">100</option>
                <option value="200" selected>200</option>
                <option value="500">500</option>
                <option value="1000">1 000</option>
              </select>
            </div>
            <button class="lm-go-btn" onclick="refreshLogs()">
              <i class="fas fa-sync"></i> Fetch
            </button>
          </div>
        </div>

        <!-- Stats Strip -->
        <div class="lm-stats-strip" id="logs-stats-bar" style="display:none">
          <div class="lm-stat-chip error-chip">
            <i class="fas fa-times-circle"></i>
            <span id="stat-error">0</span> Errors
          </div>
          <div class="lm-stat-chip warn-chip">
            <i class="fas fa-exclamation-triangle"></i>
            <span id="stat-warning">0</span> Warnings
          </div>
          <div class="lm-stat-chip info-chip">
            <i class="fas fa-info-circle"></i>
            <span id="stat-info">0</span> Info
          </div>
          <div class="lm-stat-chip total-chip" style="margin-left:auto">
            <i class="fas fa-database"></i>
            <span id="stat-total">0</span> Total
          </div>
        </div>

        <!-- Log Content -->
        <div class="lm-log-content">
          <div id="logs-container" class="lm-log-entries"></div>
        </div>

      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeLogsModal();
  });
  return modal;
}

function _updateLogsModalHeader(serverName) {
  const nameEl = document.getElementById("logs-modal-server-name");
  const switcherEl = document.getElementById("logs-server-switcher");
  if (nameEl) nameEl.textContent = serverName;
  if (!switcherEl) return;

  const troubled = (window.currentServersData || [])
    .filter((s) => {
      const st = s._stateInfo?.current || s.status;
      return st === "critical" || st === "offline" || st === "ssh_unreachable";
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (troubled.length <= 1) {
    switcherEl.style.display = "none";
    return;
  }
  switcherEl.style.display = "flex";

  const idx = Math.max(
    0,
    troubled.findIndex((s) => s.name === serverName),
  );
  const prev = troubled[(idx - 1 + troubled.length) % troubled.length];
  const next = troubled[(idx + 1) % troubled.length];
  const stColor = (s) => {
    const st = s._stateInfo?.current || s.status;
    return st === "critical" || st === "offline" ? "#ef4444" : "#f59e0b";
  };

  switcherEl.innerHTML = `
    <button class="log-sw-btn" onclick="fetchServerCrashLogs('${prev.name}')" title="← ${prev.name}">
      <i class="fas fa-chevron-left"></i>
    </button>
    <div class="log-sw-middle">
      <select class="log-sw-select" onchange="fetchServerCrashLogs(this.value)">
        ${troubled.map((s) => `<option value="${s.name}" ${s.name === serverName ? "selected" : ""} style="color:${stColor(s)}">${s.name}</option>`).join("")}
      </select>
      <span class="log-sw-counter">${idx + 1} / ${troubled.length}</span>
    </div>
    <button class="log-sw-btn" onclick="fetchServerCrashLogs('${next.name}')" title="${next.name} →">
      <i class="fas fa-chevron-right"></i>
    </button>`;

  if (_isGpuServer(serverName)) {
    setTimeout(() => _injectGpuSmiIntoOverview(serverName), 250);
  } else {
    _stopGpuSmiLive();
    const box = document.getElementById("gpu-smi-live-container");
    if (box) {
      const section = box.closest(".gpu-smi-live-section");
      section?.remove();
    }
  }
}

function displayLogs(logs, serverName) {
  const container = document.getElementById("logs-container");
  if (!container) return;
  if (!logs?.length) {
    container.innerHTML = `
      <div class="logs-empty-state">
        <i class="fas fa-check-circle" style="font-size:2.5rem;color:#10b981"></i>
        <h3 style="margin-top:12px;color:#94a3b8">No Logs Found</h3>
        <p style="color:#64748b;font-size:13px">No entries matched the current filter.</p>
      </div>`;
    _updateStatsBar({ error: 0, warning: 0, info: 0, total: 0 });
    return;
  }

  let ec = 0,
    wc = 0,
    ic = 0;
  const _esc = (text) => {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  };

  container.innerHTML = logs
    .map((log) => {
      const level = _detectLogLevel(log);
      const parts = _parseLogEntry(log);
      if (level === "error") ec++;
      else if (level === "warning") wc++;
      else ic++;
      return `
      <div class="log-entry log-entry-${level}" data-level="${level}">
        ${parts.timestamp ? `<span class="log-timestamp">${parts.timestamp}</span>` : ""}
        <span class="log-level-badge ${level}">${level.toUpperCase()}</span>
        <span class="log-message${parts.highlight ? " log-highlight" : ""}">${_esc(parts.message)}</span>
      </div>`;
    })
    .join("");

  _updateStatsBar({ error: ec, warning: wc, info: ic, total: logs.length });
  if (_logAutoScroll) container.scrollTop = container.scrollHeight;
}

function _updateStatsBar(counts) {
  const bar = document.getElementById("logs-stats-bar");
  if (!bar) return;
  bar.style.display = counts ? "flex" : "none";
  if (!counts) return;
  document.getElementById("stat-error").textContent = counts.error;
  document.getElementById("stat-warning").textContent = counts.warning;
  document.getElementById("stat-info").textContent = counts.info;
  document.getElementById("stat-total").textContent = counts.total;
  // ✅ Also update filter pill counters
  const fe = document.getElementById("fp-error");
  const fw = document.getElementById("fp-warning");
  const fi = document.getElementById("fp-info");
  if (fe) fe.textContent = counts.error;
  if (fw) fw.textContent = counts.warning;
  if (fi) fi.textContent = counts.info;
}

function _detectLogLevel(log) {
  const l = log.toLowerCase();
  if (
    l.includes("error") ||
    l.includes("fail") ||
    l.includes("fatal") ||
    l.includes("crit")
  )
    return "error";
  if (l.includes("warn")) return "warning";
  return "info";
}

function _parseLogEntry(log) {
  const m = log.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
  const timestamp = m ? m[0] : null;
  const message = timestamp ? log.substring(timestamp.length).trim() : log;
  const highlight = [
    "error",
    "fail",
    "crash",
    "killed",
    "segfault",
    "fatal",
    "panic",
    "oom",
  ].some((kw) => message.toLowerCase().includes(kw));
  return { timestamp, message, highlight };
}

function _displayLogsError(error) {
  const c = document.getElementById("logs-container");
  if (!c) return;
  const d = document.createElement("div");
  d.textContent = error;
  c.innerHTML = `
    <div class="logs-empty-state">
      <i class="fas fa-exclamation-triangle" style="font-size:2.5rem;color:#ef4444"></i>
      <h3 style="margin-top:12px;color:#94a3b8">Failed to Load Logs</h3>
      <p style="color:#64748b;font-size:13px">${d.innerHTML}</p>
      <button class="logs-refresh-btn" style="margin-top:16px" onclick="_doFetchLogs()">
        <i class="fas fa-sync"></i> Retry
      </button>
    </div>`;
  _updateStatsBar(null);
}

function _prefetchChartData(serverName) {
  return prefetchCharts(serverName);
}

function closeLogsModal() {
  document.getElementById("logs-modal-overlay")?.classList.remove("active");
  document.body.style.overflow = "";

  if (_logAutoRefresh) {
    clearInterval(_logAutoRefresh);
    _logAutoRefresh = null;
  }

  _stopGpuSmiLive();

  const btn = document.getElementById("logs-autorefresh-btn");
  if (btn) {
    btn.style.color = "";
    btn.title = "Auto-refresh (5s)";
  }
}

function filterLogs(searchText) {
  document.querySelectorAll(".log-entry").forEach((e) => {
    e.style.display =
      !searchText ||
      e.textContent.toLowerCase().includes(searchText.toLowerCase())
        ? ""
        : "none";
  });
}

function refreshLogs() {
  _doFetchLogs();
}
function _setLogFilter(f, btn) {
  _logCurrentFilter = f;
  document
    .querySelectorAll(".logs-tab")
    .forEach((t) => t.classList.remove("active"));
  btn?.classList.add("active");
  _doFetchLogs();
}
function _setLogLines(val) {
  _logCurrentLines = parseInt(val);
  _doFetchLogs();
}
function _toggleAutoScroll() {
  _logAutoScroll = !_logAutoScroll;
  const btn = document.getElementById("logs-autoscroll-btn");
  if (btn) {
    btn.style.color = _logAutoScroll ? "#10b981" : "#6b7280";
    btn.title = `Auto-scroll ${_logAutoScroll ? "ON" : "OFF"}`;
  }
  if (_logAutoScroll) {
    const c = document.getElementById("logs-container");
    if (c) c.scrollTop = c.scrollHeight;
  }
}
function _toggleAutoRefresh() {
  const btn = document.getElementById("logs-autorefresh-btn");
  if (_logAutoRefresh) {
    clearInterval(_logAutoRefresh);
    _logAutoRefresh = null;
    if (btn) {
      btn.style.color = "";
      btn.title = "Auto-refresh (5s)";
    }
  } else {
    _logAutoRefresh = setInterval(_doFetchLogs, 5000);
    if (btn) {
      btn.style.color = "#10b981";
      btn.title = "Auto-refresh ON";
    }
    _doFetchLogs();
  }
}
function _copyLogs() {
  const text = Array.from(document.querySelectorAll(".log-entry"))
    .map((e) => e.textContent.trim())
    .join("\n");
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("logs-copy-btn");
    if (!btn) return;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.style.color = "#10b981";
    setTimeout(() => {
      btn.innerHTML = '<i class="fas fa-copy"></i>';
      btn.style.color = "";
    }, 2000);
  });
}

// ─────────────────────────────────────────────────────────────────
// 7. ENHANCED updateServers — 3-tier rendering
// ─────────────────────────────────────────────────────────────────
window.updateServers = function () {
  fetch(`${_getAPIBase()}/api/status`)
    .then((r) => r.json())
    .then((data) => {
      window.currentServersData = data.servers;
      data.servers.forEach((s) => {
        s._stateInfo = trackServerState(s);
      });
      updateStats(data.servers);

      const critList = [],
        sshList = [],
        normalGroups = {};
      data.servers.forEach((server) => {
        if (!showOfflineServers && server.status === "offline") return;
        const st = server._stateInfo?.current;
        if (st === "critical" || st === "offline") critList.push(server);
        else if (st === "ssh_unreachable") sshList.push(server);
        else {
          const g = server.group || "default";
          (normalGroups[g] = normalGroups[g] || []).push(server);
        }
      });

      const container = document.getElementById("servers-container");
      container.innerHTML = "";
      if (critList.length)
        container.appendChild(_createCriticalGroupSection(critList));
      if (sshList.length) {
        if (critList.length) container.appendChild(_createSeparator("warning"));
        container.appendChild(_createSSHWarningGroupSection(sshList));
      }
      if (
        (critList.length || sshList.length) &&
        Object.keys(normalGroups).length
      )
        container.appendChild(
          _createSeparator("normal", Object.keys(normalGroups).length),
        );
      Object.keys(normalGroups).forEach((g) =>
        container.appendChild(createGroupSection(g, normalGroups[g])),
      );

      if (criticalServers.size || warningServers.size)
        showCriticalAlertBanner();
      else hideCriticalBanner();
    })
    .catch((err) => console.error("Error fetching servers:", err));
};

function _createCriticalGroupSection(servers) {
  const sec = document.createElement("div");
  sec.className = "server-group critical-group";
  sec.innerHTML = `
    <div class="group-header">
      <div style="display:flex;align-items:center;gap:1rem">
        <i class="fas fa-exclamation-triangle" style="color:var(--danger);animation:pulse 2s infinite"></i>
        <h2 style="color:var(--danger)">CRITICAL SERVERS</h2>
      </div>
      <span class="server-count" style="background:rgba(239,68,68,.2);color:var(--danger);border:1px solid var(--danger)">
        ${servers.length} server${servers.length !== 1 ? "s" : ""}
      </span>
    </div>
    <div class="servers-grid" id="group-critical"></div>`;
  servers.forEach((s) =>
    sec.querySelector(".servers-grid").appendChild(createServerCard(s)),
  );
  return sec;
}

function _createSSHWarningGroupSection(servers) {
  const sec = document.createElement("div");
  sec.className = "server-group ssh-warning-group";
  sec.innerHTML = `
    <div class="group-header">
      <div style="display:flex;align-items:center;gap:1rem">
        <i class="fas fa-ethernet" style="color:#f59e0b;animation:pulse 2s infinite"></i>
        <h2 style="color:#f59e0b">SSH UNREACHABLE</h2>
      </div>
      <span class="server-count" style="background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid #f59e0b">
        ${servers.length} server${servers.length !== 1 ? "s" : ""} — Ping OK, SSH down
      </span>
    </div>
    <div class="servers-grid" id="group-ssh-warn"></div>`;
  servers.forEach((s) =>
    sec.querySelector(".servers-grid").appendChild(createServerCard(s)),
  );
  return sec;
}

function _createSeparator(tier, groupCount) {
  const sep = document.createElement("div");
  sep.className = "servers-separator";
  const icons = { warning: "fa-ethernet", normal: "fa-server" };
  const colors = { warning: "#f59e0b", normal: "var(--text-secondary)" };
  const labels = {
    warning: "SSH Warning Servers",
    normal: groupCount
      ? `All Servers (${groupCount} Group${groupCount !== 1 ? "s" : ""})`
      : "All Servers",
  };
  sep.innerHTML = `
    <div class="servers-separator-text" style="color:${colors[tier]}">
      <i class="fas ${icons[tier]}"></i><span>${labels[tier]}</span>
    </div>`;
  return sep;
}

// ─────────────────────────────────────────────────────────────────
// 8. INJECTED CSS
// ─────────────────────────────────────────────────────────────────
(function _injectStyles() {
  if (document.getElementById("enhance-styles")) return;
  const s = document.createElement("style");
  s.id = "enhance-styles";
  s.textContent = `

/* ════════════════════════════════════════════════════════════
   LOG MODAL — OVERLAY
════════════════════════════════════════════════════════════ */
.logs-modal-overlay{
  position:fixed;inset:0;
  background:rgba(0,0,0,.75);
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
  z-index:9999;
  display:none;align-items:center;justify-content:center;
  padding:16px;
}
.logs-modal-overlay.active{ display:flex; }

/* ── Shell ───────────────────────────────────────────────── */
.logs-modal{
  position:relative;
  background:linear-gradient(160deg,#0d1425 0%,#0a0f1e 60%,#0d1425 100%);
  border:1px solid rgba(102,126,234,.25);
  border-radius:20px;
  width:min(1100px,97vw);
  max-height:94vh;
  display:flex;flex-direction:column;
  overflow:hidden;
  box-shadow:
    0 0 0 1px rgba(102,126,234,.1),
    0 40px 120px rgba(0,0,0,.8),
    0 0 80px rgba(102,126,234,.06);
  animation:lm-drop-in .25s cubic-bezier(.22,1,.36,1) both;
}
@keyframes lm-drop-in{
  from{opacity:0;transform:translateY(-24px) scale(.97)}
  to  {opacity:1;transform:translateY(0)     scale(1)}
}

/* ── Header ──────────────────────────────────────────────── */
.logs-modal-header{
  display:flex;align-items:center;
  padding:18px 22px;
  border-bottom:1px solid rgba(255,255,255,.06);
  background:linear-gradient(90deg,rgba(102,126,234,.12) 0%,rgba(6,182,212,.06) 100%);
  flex-shrink:0;gap:12px;
  position:relative;
}
.logs-modal-header::after{
  content:'';position:absolute;bottom:0;left:22px;right:22px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(102,126,234,.5),transparent);
}

.lm-server-icon{
  width:44px;height:44px;border-radius:12px;
  background:linear-gradient(135deg,#667eea,#764ba2);
  display:flex;align-items:center;justify-content:center;
  font-size:18px;color:#fff;flex-shrink:0;
  box-shadow:0 4px 16px rgba(102,126,234,.4);
}
.lm-title-block{ display:flex;flex-direction:column;gap:2px; }
.lm-title-label{ font-size:9px;font-weight:700;letter-spacing:1.5px;color:#667eea;text-transform:uppercase; }
.lm-server-name{ font-size:17px;font-weight:700;color:#e2e8f0;line-height:1.2; }

.lm-header-left{ display:flex;align-items:center;gap:12px;flex:1;min-width:0; }
.lm-header-center{ display:flex;align-items:center;justify-content:center; }
.lm-header-right{ display:flex;align-items:center;gap:6px;flex-shrink:0; }

/* Status pill */
.lm-status-pill{
  display:flex;align-items:center;gap:7px;
  background:rgba(16,185,129,.1);
  border:1px solid rgba(16,185,129,.25);
  border-radius:20px;padding:5px 14px;
  font-size:12px;font-weight:600;color:#10b981;
}
.lm-status-dot{
  width:7px;height:7px;border-radius:50%;
  background:#10b981;
  box-shadow:0 0 6px #10b981;
  animation:lm-pulse 2s infinite;
}
@keyframes lm-pulse{ 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.85)} }

/* Action buttons */
.lm-action-btn{
  display:flex;align-items:center;gap:5px;
  background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.08);
  color:#94a3b8;border-radius:10px;
  padding:6px 12px;font-size:12px;cursor:pointer;
  transition:all .2s;white-space:nowrap;
}
.lm-action-btn:hover{ background:rgba(102,126,234,.25);border-color:#667eea;color:#a5b4fc; }
.lm-action-btn.active-btn{ background:rgba(16,185,129,.15);border-color:#10b981;color:#10b981; }
.lm-action-btn i{ font-size:12px; }

/* Close button */
.lm-close-btn{
  width:36px;height:36px;border-radius:10px;
  background:rgba(239,68,68,.1);
  border:1px solid rgba(239,68,68,.2);
  color:#ef4444;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;transition:all .2s;
}
.lm-close-btn:hover{ background:rgba(239,68,68,.3);border-color:#ef4444;transform:rotate(90deg); }

/* ── Server Switcher ─────────────────────────────────────── */
.logs-server-switcher{
  display:flex;align-items:center;gap:8px;
  padding:10px 22px;
  border-bottom:1px solid rgba(255,255,255,.05);
  background:rgba(0,0,0,.2);flex-shrink:0;
}
.log-sw-btn{
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);
  color:#94a3b8;border-radius:8px;width:30px;height:30px;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  font-size:12px;transition:all .2s;flex-shrink:0;
}
.log-sw-btn:hover{ background:rgba(102,126,234,.3);color:#fff;border-color:#667eea; }
.log-sw-middle{ display:flex;align-items:center;gap:8px;flex:1;min-width:0; }
.log-sw-select{
  flex:1;min-width:0;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
  color:#fff;border-radius:8px;padding:5px 10px;font-size:13px;cursor:pointer;outline:none;
}
.log-sw-select:focus{ border-color:#667eea; }
.log-sw-select option{ background:#0d1425; }
.log-sw-counter{
  font-size:10px;color:#64748b;white-space:nowrap;
  background:rgba(255,255,255,.04);padding:3px 10px;border-radius:20px;
}

/* ── Tab Bar ─────────────────────────────────────────────── */
.lm-tabbar{
  display:flex;align-items:center;
  padding:0 22px;
  border-bottom:1px solid rgba(255,255,255,.06);
  background:rgba(0,0,0,.15);flex-shrink:0;gap:4px;
}
.lm-tabs{ display:flex;gap:2px;flex:1; }
.lm-tab{
  background:transparent;
  border:none;border-bottom:2px solid transparent;
  color:#64748b;font-size:13px;font-weight:600;
  padding:13px 18px;cursor:pointer;
  display:flex;align-items:center;gap:8px;
  transition:all .2s;margin-bottom:-1px;border-radius:8px 8px 0 0;
}
.lm-tab:hover{ color:#a5b4fc;background:rgba(102,126,234,.07); }
.lm-tab.active{
  color:#a5b4fc;border-bottom-color:#667eea;
  background:rgba(102,126,234,.1);
}
.lm-tab i{ font-size:13px; }
.lm-tab-badge{
  font-size:8px;color:#10b981;
  animation:lm-pulse 2s infinite;margin-left:2px;
}
.lm-refresh-charts-btn{
  margin-left:auto;
  background:rgba(102,126,234,.12);
  border:1px solid rgba(102,126,234,.25);
  color:#a5b4fc;border-radius:10px;
  padding:6px 16px;font-size:12px;font-weight:600;
  cursor:pointer;display:flex;align-items:center;gap:7px;
  transition:all .2s;
}
.lm-refresh-charts-btn:hover{ background:rgba(102,126,234,.3);color:#fff; }

/* ── Charts Wrapper ──────────────────────────────────────── */
#log-modal-charts-panel{
  padding:18px 22px 16px;
  flex-shrink:0;
  background:rgba(0,0,0,.1);
  border-bottom:1px solid rgba(255,255,255,.05);
}
.lm-charts-wrapper{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:16px;
}
@media(max-width:780px){.lm-charts-wrapper{grid-template-columns:1fr}}

.lm-chart-card{
  background:rgba(255,255,255,.025);
  border:1px solid rgba(255,255,255,.07);
  border-radius:14px;padding:14px;
  transition:border-color .2s;
  overflow:hidden;
}
.lm-chart-card:hover{ border-color:rgba(102,126,234,.3); }

.lm-chart-label{
  display:flex;align-items:center;gap:9px;margin-bottom:10px;
}
.lm-chart-pill{
  font-size:9px;font-weight:800;letter-spacing:1.2px;
  padding:3px 8px;border-radius:6px;text-transform:uppercase;
}
.cpu-pill{ background:rgba(102,126,234,.2);color:#a5b4fc;border:1px solid rgba(102,126,234,.3); }
.mem-pill{ background:rgba(6,182,212,.2);  color:#67e8f9;border:1px solid rgba(6,182,212,.3); }
.sto-pill{ background:rgba(16,185,129,.2); color:#6ee7b7;border:1px solid rgba(16,185,129,.3); }
.lm-chart-title-text{ font-size:11px;color:#64748b;font-weight:500; }

/* ✅ CRITICAL: explicit height for Highcharts */
.lm-chart-body{
  height:158px;width:100%;
  display:block;border-radius:8px;overflow:hidden;
}

/* ── Filter Bar ──────────────────────────────────────────── */
.lm-filter-bar{
  display:flex;align-items:center;justify-content:space-between;
  padding:12px 22px;
  border-bottom:1px solid rgba(255,255,255,.05);
  gap:12px;flex-wrap:wrap;flex-shrink:0;
  background:rgba(0,0,0,.15);
}
.lm-filter-pills{ display:flex;gap:6px;flex-wrap:wrap; }
.lm-filter-pill{
  display:flex;align-items:center;gap:6px;
  background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.08);
  color:#64748b;border-radius:20px;
  padding:5px 14px;font-size:12px;font-weight:600;
  cursor:pointer;transition:all .2s;
}
.lm-filter-pill:hover{ background:rgba(255,255,255,.1);color:#fff; }
.lm-filter-pill.active{
  background:rgba(102,126,234,.2);
  border-color:rgba(102,126,234,.5);color:#a5b4fc;
}
.lm-filter-pill.error.active{ background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);color:#fca5a5; }
.lm-filter-pill.warning.active{ background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.4);color:#fcd34d; }
.lm-filter-pill.info.active{ background:rgba(6,182,212,.15);border-color:rgba(6,182,212,.4);color:#67e8f9; }
.lm-pill-count{
  background:rgba(0,0,0,.3);
  border-radius:10px;padding:1px 6px;font-size:10px;
}

.lm-filter-right{ display:flex;align-items:center;gap:8px; }
.lm-search-wrap{
  display:flex;align-items:center;
  background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.09);
  border-radius:10px;padding:0 10px;gap:7px;
  transition:border-color .2s;
}
.lm-search-wrap:focus-within{ border-color:#667eea; }
.lm-search-icon{ color:#4a5568;font-size:12px;flex-shrink:0; }
.lm-search-input{
  background:transparent;border:none;
  color:#e2e8f0;font-size:13px;
  padding:7px 0;outline:none;width:180px;
}
.lm-search-input::placeholder{ color:#3a4558; }

.lm-lines-wrap{
  display:flex;align-items:center;gap:6px;
  background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.09);
  border-radius:10px;padding:0 10px;
}
.lm-lines-select{
  background:transparent;border:none;
  color:#94a3b8;font-size:12px;cursor:pointer;outline:none;padding:7px 0;
}
.lm-lines-select option{ background:#0d1425; }
.lm-go-btn{
  display:flex;align-items:center;gap:7px;
  background:linear-gradient(135deg,#667eea,#764ba2);
  border:none;color:#fff;border-radius:10px;
  padding:7px 18px;font-size:12px;font-weight:700;
  cursor:pointer;transition:all .2s;
  box-shadow:0 4px 14px rgba(102,126,234,.35);
}
.lm-go-btn:hover{ transform:translateY(-1px);box-shadow:0 6px 20px rgba(102,126,234,.5); }
.lm-go-btn:active{ transform:translateY(0); }

/* ── Stats Strip ─────────────────────────────────────────── */
.lm-stats-strip{
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  padding:8px 22px;
  background:rgba(0,0,0,.2);
  border-bottom:1px solid rgba(255,255,255,.04);
  flex-shrink:0;
}
.lm-stat-chip{
  display:flex;align-items:center;gap:6px;
  border-radius:8px;padding:4px 12px;font-size:11px;font-weight:600;
}
.error-chip{ background:rgba(239,68,68,.1);color:#fca5a5; }
.warn-chip{  background:rgba(245,158,11,.1);color:#fcd34d; }
.info-chip{  background:rgba(6,182,212,.1); color:#67e8f9; }
.total-chip{ background:rgba(255,255,255,.05);color:#94a3b8; }

/* ── Log Content Area ────────────────────────────────────── */
/* ── BEFORE (broken) ── */
.lm-log-content{
  flex:1;min-height:0;overflow:hidden;
  position:relative;
}
.lm-log-content::before{
  content:'';position:absolute;top:0;left:0;right:0;height:20px;
  background:linear-gradient(rgba(13,20,37,1),transparent);
  z-index:2;pointer-events:none;
}
.lm-log-entries{
  height:100%;overflow-y:auto;   /* ❌ height:100% fails in flex column */
  padding:12px 0 8px;
  font-family:...
}
.lm-log-entries::-webkit-scrollbar{ width:5px; }
.lm-log-entries::-webkit-scrollbar-track{ background:transparent; }
.lm-log-entries::-webkit-scrollbar-thumb{
  background:rgba(102,126,234,.3);border-radius:3px;
}
.lm-log-entries::-webkit-scrollbar-thumb:hover{ background:rgba(102,126,234,.6); }

/* ── Individual Log Entries ──────────────────────────────── */
.log-entry{
  display:flex;align-items:baseline;gap:10px;
  padding:4px 22px;
  border-left:2px solid transparent;
  transition:background .15s;
}
.log-entry:hover{ background:rgba(255,255,255,.03); }

.log-entry-error{
  border-left-color:#ef4444;
  background:rgba(239,68,68,.04);
}
.log-entry-error:hover{ background:rgba(239,68,68,.08); }

.log-entry-warning{
  border-left-color:#f59e0b;
  background:rgba(245,158,11,.03);
}
.log-entry-warning:hover{ background:rgba(245,158,11,.07); }

.log-entry-info{ border-left-color:transparent; }

.log-timestamp{
  font-size:10.5px;color:#3a4a6a;
  white-space:nowrap;flex-shrink:0;
  font-variant-numeric:tabular-nums;
}
.log-level-badge{
  font-size:9px;font-weight:800;letter-spacing:.8px;
  padding:1px 7px;border-radius:5px;
  white-space:nowrap;flex-shrink:0;text-transform:uppercase;
}
.log-level-badge.error{   background:rgba(239,68,68,.2);  color:#fca5a5; }
.log-level-badge.warning{ background:rgba(245,158,11,.2); color:#fcd34d; }
.log-level-badge.info{    background:rgba(100,116,139,.15);color:#64748b; }

.log-message{ color:#94a3b8;word-break:break-word;flex:1;min-width:0; }
.log-highlight{ color:#fbbf24 !important; }

/* Empty / error states */
.logs-empty-state{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  height:100%;min-height:200px;gap:12px;
  color:#334155;
}
.logs-empty-state h3{ color:#475569;margin:0;font-size:15px; }
.logs-empty-state p{ margin:0;font-size:13px; }

/* ── Alert Banner ────────────────────────────────────────── */
.critical-alert-banner{
  position:fixed;top:0;left:0;right:0;z-index:10000;
  background:linear-gradient(90deg,rgba(239,68,68,.95),rgba(185,28,28,.95));
  backdrop-filter:blur(8px);
  padding:10px 20px;display:none;
  align-items:center;justify-content:space-between;gap:12px;
  border-bottom:1px solid rgba(255,255,255,.2);
  box-shadow:0 4px 20px rgba(239,68,68,.4);
}
.critical-alert-banner.active{ display:flex; }
@keyframes bannerPulse{0%,100%{opacity:1}50%{opacity:.7}}
.blink-animation{ animation:bannerPulse 1.2s ease-in-out 8; }
.critical-banner-content{ display:flex;align-items:center;gap:14px;flex:1;min-width:0; }
.critical-banner-icon{ font-size:1.5rem;color:#fff;animation:lm-pulse 2s infinite;flex-shrink:0; }
.critical-banner-text{ display:flex;flex-direction:column;gap:3px;min-width:0; }
.critical-banner-title{ font-size:14px;font-weight:700;color:#fff; }
.critical-banner-servers{ font-size:12px;color:rgba(255,255,255,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.critical-banner-actions{ display:flex;gap:8px;flex-shrink:0; }
.critical-banner-btn{
  background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);
  color:#fff;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;
  cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .2s;
}
.critical-banner-btn:hover{ background:rgba(255,255,255,.35); }
.critical-banner-close{
  background:transparent;border:none;color:rgba(255,255,255,.6);
  cursor:pointer;font-size:14px;padding:4px 8px;border-radius:6px;transition:all .2s;flex-shrink:0;
}
.critical-banner-close:hover{ color:#fff;background:rgba(0,0,0,.2); }

/* ── Storage Alert Cards ─────────────────────────────────── */
.storage-alert-details{ margin-top:10px;border-radius:10px;overflow:hidden;border:1px solid rgba(239,68,68,.2); }
.storage-alert-details.warning{ border-color:rgba(245,158,11,.2); }
.storage-alert-title{ padding:7px 14px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;display:flex;align-items:center;gap:8px; }
.storage-alert-title.critical{ background:rgba(239,68,68,.12);color:#ef4444; }
.storage-alert-title.warning{  background:rgba(245,158,11,.12);color:#f59e0b; }
.storage-alert-items{ padding:8px 10px;display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,.15); }
.storage-alert-item{ display:flex;align-items:center;gap:10px;flex-wrap:wrap; }
.storage-mountpoint{ font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;min-width:100px; }
.storage-usage-bar{ display:flex;align-items:center;gap:8px;flex:1;min-width:100px; }
.storage-usage-progress{ flex:1;height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden; }
.storage-usage-fill{ height:100%;border-radius:3px;transition:width .4s; }
.storage-usage-fill.critical{ background:linear-gradient(90deg,#ef4444,#dc2626); }
.storage-usage-fill.warning{  background:linear-gradient(90deg,#f59e0b,#d97706); }
.storage-usage-value{ font-size:11px;font-weight:700;color:#e2e8f0;white-space:nowrap; }
.storage-analyze-inline-btn{
  background:rgba(102,126,234,.12);border:1px solid rgba(102,126,234,.25);
  color:#a5b4fc;border-radius:6px;padding:3px 10px;font-size:11px;
  cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .2s;
}
.storage-analyze-inline-btn:hover{ background:rgba(102,126,234,.3);color:#fff; }

/* ── Server Card Extras ──────────────────────────────────── */
.server-card.ssh-unreachable{ border-color:rgba(245,158,11,.3)!important; }
.ssh-unreachable-notice{ font-size:11px;color:#f59e0b;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.18);border-radius:6px;padding:5px 10px;margin-top:8px;display:flex;align-items:center;gap:8px; }
.server-transition-badge{ font-size:10px;background:rgba(102,126,234,.15);color:#a5b4fc;border:1px solid rgba(102,126,234,.25);border-radius:12px;padding:2px 8px;margin-left:6px;display:inline-flex;align-items:center;gap:4px; }
.servers-separator{ padding:12px 4px;display:flex;align-items:center;gap:12px; }
.servers-separator::before,.servers-separator::after{ content:'';flex:1;height:1px;background:rgba(255,255,255,.05); }
.servers-separator-text{ display:flex;align-items:center;gap:8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;padding:0 8px;color:#64748b; }
`;
  document.head.appendChild(s);
})();

// ─────────────────────────────────────────────────────────────────
// 9. EXPORTS — expose everything needed by inline onclick= attributes
//    and by monitor.js calling window.trackServerState etc.
// ─────────────────────────────────────────────────────────────────
Object.assign(window, {
  trackServerState,
  showCriticalAlertBanner,
  hideCriticalBanner,
  viewCriticalServers,
  viewAllLogs,
  getStorageAlertDetails,
  renderStorageAlertDetails,
  filterInternalStorage,
  loadHistoryCharts,
  fetchServerCrashLogs,
  showLogsModal,
  closeLogsModal,
  displayLogs,
  filterLogs,
  refreshLogs,
  setLogFilter,
  setLogLines,
  toggleAutoScroll,
  toggleAutoRefresh,
  copyLogs,
  _doFetchLogs,
  _switchLogModalTab,
  loadHistoryChartsInModal,
  _renderCachedCharts,
  _drawChartsFromCache,
  prefetchCharts,
  _prefetchChartData,
});
window._switchLogModalTab = _switchLogModalTab;
window._drawChartsFromCache = _drawChartsFromCache;
window._prefetchCharts = _prefetchCharts;

console.log("✅ enhance.js v6 — all exports registered");
