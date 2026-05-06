// ==================== Global Variables ====================
let currentServer = null;
let refreshInterval = 5000;
let liveCPUChart = null;
let liveCPUData = [];
let liveCPUInterval = null;
let isCompactView = false;
let showOfflineServers = true;
let previousNetworkData = new Map();
let lastNetworkUpdateTime = Date.now();

const API_BASE = "/monitoring_server";

const IP_NAME_MAP = {
  "192.168.3.202": "Mihir",
  "192.168.3.220": "Harish",
  "192.168.3.141": "Vikrant",
  "192.168.3.221": "Karnav",
  "192.168.2.205": "Vidit",
  "192.168.2.210": "Arpan",
  "192.168.3.206": "Krishna",
  "192.168.3.211": "Nitin",
  "192.168.3.100": "Kishan",
};

// ==================== Settings Management ====================
function loadSettings() {
  const settings = localStorage.getItem("monitorSettings");
  if (settings) {
    const parsed = JSON.parse(settings);
    refreshInterval = parsed.refreshInterval * 1000 || 5000;
    isCompactView = parsed.compactView || false;
    showOfflineServers = parsed.showOffline !== false;

    document.getElementById("refresh-interval").value =
      parsed.refreshInterval || 5;
    document.getElementById("cpu-warning").value = parsed.cpuWarning || 70;
    document.getElementById("cpu-critical").value = parsed.cpuCritical || 90;
    document.getElementById("mem-warning").value = parsed.memWarning || 75;
    document.getElementById("mem-critical").value = parsed.memCritical || 90;
    document.getElementById("show-offline").checked = showOfflineServers;
    document.getElementById("compact-view").checked = isCompactView;

    applyCompactView();
  }
}

function saveSettings() {
  const settings = {
    refreshInterval: parseInt(
      document.getElementById("refresh-interval").value,
    ),
    cpuWarning: parseInt(document.getElementById("cpu-warning").value),
    cpuCritical: parseInt(document.getElementById("cpu-critical").value),
    memWarning: parseInt(document.getElementById("mem-warning").value),
    memCritical: parseInt(document.getElementById("mem-critical").value),
    showOffline: document.getElementById("show-offline").checked,
    compactView: document.getElementById("compact-view").checked,
  };

  localStorage.setItem("monitorSettings", JSON.stringify(settings));
  refreshInterval = settings.refreshInterval * 1000;
  isCompactView = settings.compactView;
  showOfflineServers = settings.showOffline;

  applyCompactView();
  alert("Settings saved successfully!");

  clearInterval(window.refreshTimer);
  window.refreshTimer = setInterval(updateServers, refreshInterval);
}

function applyCompactView() {
  if (isCompactView) {
    document.body.classList.add("compact-view");
  } else {
    document.body.classList.remove("compact-view");
  }
}

// ==================== Helper Functions ====================
function getCPUStatus(cpuPercent) {
  if (cpuPercent === null || cpuPercent === undefined) return "";
  const cpu = parseFloat(cpuPercent);
  if (isNaN(cpu)) return "";
  if (cpu >= 90) return "critical";
  if (cpu >= 70) return "warning";
  if (cpu >= 50) return "moderate";
  return "normal";
}

function calculateMemoryPercent(used, total) {
  if (!used || !total || isNaN(used) || isNaN(total) || total === 0) return 0;
  used = Math.max(0, parseFloat(used));
  total = Math.max(0, parseFloat(total));
  const percent = (used / total) * 100;
  return Math.max(0, Math.min(100, percent));
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return "N/A";
  bytes = Number(bytes);
  if (isNaN(bytes) || bytes === 0) return "N/A";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];

  if (bytes < 1) return "0 B";

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeIndex = Math.min(i, sizes.length - 1);

  return (
    parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(dm)) +
    " " +
    sizes[sizeIndex]
  );
}

function getStorageBarColor(status) {
  switch (status) {
    case "critical":
      return "#ef4444";
    case "warning":
      return "#f59e0b";
    case "moderate":
      return "#3b82f6";
    case "normal":
      return "#10b981";
    default:
      return "#9ca3af";
  }
}

function validateMemoryData(memory) {
  if (!memory) return null;
  return {
    total: Number(memory.total) || 0,
    used: Number(memory.used) || 0,
    free: Number(memory.free) || 0,
    buffers: Number(memory.buffers) || 0,
    cached: Number(memory.cached) || 0,
    status: memory.status || "normal",
  };
}

function drawMemoryPieChart(canvas, memoryData) {
  if (!canvas || !memoryData) return;

  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  const ctx = canvas.getContext("2d");
  const total = Math.abs(parseFloat(memoryData.total)) || 0;
  const used = Math.max(0, parseFloat(memoryData.used));
  const cached = Math.max(0, parseFloat(memoryData.cached));
  const buffers = Math.max(0, parseFloat(memoryData.buffers));
  const free = Math.max(0, parseFloat(memoryData.free));

  const data = [
    Math.max(0, Math.min(used, total)),
    Math.max(0, Math.min(cached, total)),
    Math.max(0, Math.min(buffers, total)),
    Math.max(0, Math.min(free, total)),
  ];

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Used", "Cached", "Buffers", "Free"],
      datasets: [
        {
          data: data,
          backgroundColor: ["#ef4444", "#3b82f6", "#f59e0b", "#10b981"],
          borderWidth: 0,
          borderColor: "transparent",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "65%",
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            label: (context) => {
              const value = context.raw;
              const percentage = calculateMemoryPercent(value, total);
              return `${context.label}: ${formatBytes(
                value,
              )} (${percentage.toFixed(1)}%)`;
            },
          },
        },
      },
      animation: {
        animateRotate: true,
        animateScale: false,
      },
    },
  });
}

// ==================== Navigation ====================
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page-content");

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.getAttribute("data-page");

      navItems.forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");

      pages.forEach((p) => p.classList.remove("active"));
      document.getElementById(`${page}-page`).classList.add("active");

      if (page === "alerts") loadAlerts();
      if (page === "analytics") loadAnalytics();
      if (page === "servers") loadAllServers();
      if (page === "user-tracking") loadUserTracking();
    });
  });
}

// ==================== Sidebar Toggle ====================
function initSidebarToggle() {
  const toggle = document.getElementById("sidebarToggle");
  const sidebar = document.getElementById("sidebar");

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 1024) {
      if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove("show");
      }
    }
  });
}

// ==================== Theme Switcher ====================
function initThemeSwitcher() {
  const themeButtons = document.querySelectorAll(".theme-btn");
  const savedTheme = localStorage.getItem("theme") || "dark";

  document.body.className = `theme-${savedTheme}`;
  themeButtons.forEach((btn) => {
    if (btn.getAttribute("data-theme") === savedTheme) {
      btn.classList.add("active");
    }
  });

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.getAttribute("data-theme");
      document.body.className = `theme-${theme}`;
      localStorage.setItem("theme", theme);

      themeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

// ==================== Time Display ====================
function updateTimeDisplay() {
  fetch(`${API_BASE}/api/time`)
    .then((response) => response.json())
    .then((data) => {
      const timeElement = document.getElementById("current-time");
      if (timeElement && data.timestamp) {
        const [dateStr, timeStr] = data.timestamp.split(" ");
        const [year, month, day] = dateStr.split("-").map(Number);
        const [hour, minute, second] = timeStr.split(":").map(Number);

        const utcDate = new Date(
          Date.UTC(year, month - 1, day, hour, minute, second),
        );

        const options = {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Kolkata",
        };

        const istDateTime = utcDate.toLocaleString("en-GB", options);
        const [d, m, y] = istDateTime.split(",")[0].split("/");
        const t = istDateTime.split(",")[1].trim();

        timeElement.textContent = `${y}-${m}-${d} ${t}`;
      }
    })
    .catch((error) => console.error("Error updating time:", error));
}

// ==================== Update Servers ====================
function updateServers() {
  console.log("🔄 updateServers() called");

  fetch(`${API_BASE}/api/status`)
    .then((response) => {
      console.log("📡 API Response received:", response.status);
      return response.json();
    })
    .then((data) => {
      console.log("📊 Data received:", data);
      console.log("📊 Servers count:", data.servers ? data.servers.length : 0);

      // ✅ THIS LINE IS CRITICAL - MUST BE HERE!
      window.currentServersData = data.servers || [];
      console.log("✅ Stored servers:", window.currentServersData.length);

      updateStats(data.servers);

      const groups = {};
      data.servers.forEach((server) => {
        if (!showOfflineServers && server.status === "offline") return;
        const group = server.group || "default";
        if (!groups[group]) groups[group] = [];
        groups[group].push(server);
      });

      const container = document.getElementById("servers-container");
      container.innerHTML = "";
      Object.keys(groups).forEach((groupName) => {
        const groupSection = createGroupSection(groupName, groups[groupName]);
        container.appendChild(groupSection);
      });
    })
    .catch((error) => {
      console.error("❌ Error fetching servers:", error);
    });
}

function updateStats(servers) {
  const total = servers.length;
  const online = servers.filter((s) => s.status === "online").length;

  let totalCPU = 0;
  let cpuCount = 0;
  let totalMemory = 0;
  let usedMemory = 0;
  let totalStorage = 0;
  let usedStorage = 0;

  // ✅ Initialize the Set BEFORE the loop begins
  const alertServersSet = new Set();

  servers.forEach((server) => {
    let hasAlert = false;
    let isMaxedOut = false; // Flag to track 100% usage

    if (server.status === "online") {
      // CPU
      if (server.cpu !== null && server.cpu !== undefined) {
        totalCPU += parseFloat(server.cpu);
        cpuCount++;
        if (server.cpu > 75) {
          hasAlert = true;
        }
        if (server.cpu >= 100) {
          isMaxedOut = true;
        }
      }

      // Memory
      if (server.memory) {
        const memTotal = Number(server.memory.total) || 0;
        const memUsed = Number(server.memory.used) || 0;
        totalMemory += memTotal;
        usedMemory += memUsed;

        if (server.memory.usage_percent > 75) {
          hasAlert = true;
        }
        if (server.memory.usage_percent >= 100) {
          isMaxedOut = true;
        }
      }

      // Storage
      if (server.storage && Array.isArray(server.storage)) {
        const rootStorage = server.storage.find(
          (s) => s.mountpoint === "/" || s.mountpoint === "root",
        );

        if (rootStorage) {
          const totalBytes = parseStorageToBytes(
            rootStorage.size || rootStorage.total || 0,
          );
          const usedBytes = parseStorageToBytes(rootStorage.used || 0);

          if (totalBytes > 0) {
            totalStorage += totalBytes;
            usedStorage += usedBytes;
          }

          if (rootStorage.percent && rootStorage.percent > 75) {
            hasAlert = true;
          }
          if (rootStorage.percent && rootStorage.percent >= 100) {
            isMaxedOut = true;
          }
        }
      }
    } else if (server.status === "ssh_unreachable") {
      hasAlert = true; // SSH unreachable = warning alert
    } else {
      hasAlert = true; // Offline = critical alert
    }

    if (hasAlert) {
      alertServersSet.add(server.name);
    }

    // 🚨 Trigger sound if 100% threshold is met
    if (isMaxedOut) {
      playDangerAlarm();
    }
  });

  const alertCount = alertServersSet.size;

  // Calculate averages
  const avgCPU = cpuCount > 0 ? (totalCPU / cpuCount).toFixed(1) : 0;
  const avgMemPercent =
    totalMemory > 0 ? ((usedMemory / totalMemory) * 100).toFixed(1) : 0;
  const avgStoragePercent =
    totalStorage > 0 ? ((usedStorage / totalStorage) * 100).toFixed(1) : 0;

  // Calculate actual bandwidth (bytes per second)
  const currentTime = Date.now();
  const timeDelta = (currentTime - lastNetworkUpdateTime) / 1000; // seconds

  let totalBandwidth = 0;
  let bandwidthCount = 0;

  servers.forEach((server) => {
    if (
      server.status === "online" &&
      server.network_stats &&
      Array.isArray(server.network_stats)
    ) {
      let currentTotal = 0;
      server.network_stats.forEach((net) => {
        currentTotal +=
          (Number(net.rx_bytes) || 0) + (Number(net.tx_bytes) || 0);
      });

      // Get previous reading
      const previousTotal = previousNetworkData.get(server.name);

      // Calculate bandwidth (bytes per second)
      if (
        previousTotal !== undefined &&
        timeDelta > 0 &&
        currentTotal >= previousTotal
      ) {
        const bytesPerSecond = (currentTotal - previousTotal) / timeDelta;
        totalBandwidth += bytesPerSecond;
        bandwidthCount++;
      }

      // Store current reading for next calculation
      previousNetworkData.set(server.name, currentTotal);
    }
  });

  lastNetworkUpdateTime = currentTime;

  // Calculate average bandwidth
  const avgBandwidth = bandwidthCount > 0 ? totalBandwidth / bandwidthCount : 0;

  // Format bandwidth display
  let networkDisplay = "0 B/s";
  if (avgBandwidth > 0) {
    if (avgBandwidth >= 1024 * 1024 * 1024) {
      networkDisplay =
        (avgBandwidth / (1024 * 1024 * 1024)).toFixed(2) + " GB/s";
    } else if (avgBandwidth >= 1024 * 1024) {
      networkDisplay = (avgBandwidth / (1024 * 1024)).toFixed(2) + " MB/s";
    } else if (avgBandwidth >= 1024) {
      networkDisplay = (avgBandwidth / 1024).toFixed(2) + " KB/s";
    } else {
      networkDisplay = avgBandwidth.toFixed(0) + " B/s";
    }
  }

  // Update DOM
  document.getElementById("total-servers").textContent = total;
  document.getElementById("online-servers").textContent = online;
  document.getElementById("alert-servers").textContent = alertCount;
  document.getElementById("avg-cpu").textContent = avgCPU + "%";
  document.getElementById("avg-memory").textContent = avgMemPercent + "%";
  document.getElementById("avg-storage").textContent = avgStoragePercent + "%";
  document.getElementById("avg-network").textContent = networkDisplay;

  if (document.getElementById("alert-badge")) {
    document.getElementById("alert-badge").textContent = alertCount;
  }
}

function createGroupSection(groupName, servers) {
  const section = document.createElement("div");
  section.className = "server-group";

  const groupIcons = {
    data: "fa-database",
    deployment: "fa-rocket",
    stagging: "fa-flask",
    gpus: "fa-brain",
    nginx: "fa-server",
    development: "fa-code",
  };

  section.innerHTML = `
        <div class="group-header">
            <i class="fas ${groupIcons[groupName] || "fa-server"}"></i>
            <h2>${groupName.charAt(0).toUpperCase() + groupName.slice(1)}</h2>
            <span class="server-count">${servers.length} server${
              servers.length !== 1 ? "s" : ""
            }</span>
        </div>
        <div class="servers-grid" id="group-${groupName}"></div>
    `;

  const grid = section.querySelector(".servers-grid");
  servers.forEach((server) => {
    const card = createServerCard(server);
    grid.appendChild(card);
  });

  return section;
}

function createServerCard(server) {
  const card = document.createElement("div");
  const cardStatusClass =
    server.status === "ssh_unreachable" ? "ssh-unreachable" : server.status;
  card.className = `server-card ${cardStatusClass} slide-up`;
  card.onclick = (event) => {
    // Don't open modal if clicking on buttons or interactive elements
    if (
      event.target.closest("button") ||
      event.target.closest(".storage-analyze-inline-btn") ||
      event.target.closest(".storage-analyze-btn")
    ) {
      return;
    }
    showServerDetails(server.name);
  };

  const memory = validateMemoryData(server.memory);
  const cpuStatus = getCPUStatus(server.cpu);

  // Safe CPU value
  const cpuValue =
    server.cpu !== null && server.cpu !== undefined
      ? server.cpu.toFixed(1) + "%"
      : "N/A";
  const cpuPercent = server.cpu || 0;

  // Safe memory value
  const memValue = memory
    ? calculateMemoryPercent(memory.used, memory.total).toFixed(1) + "%"
    : "N/A";
  const memPercent = memory
    ? calculateMemoryPercent(memory.used, memory.total)
    : 0;
  const memStatus = memory ? memory.status : "";

  // Get ROOT storage (/ or /root) - THIS IS THE FIX!
  let storageValue = "N/A";
  let storagePercent = 0;
  let storageStatus = "";

  if (server.storage && server.storage.length > 0) {
    // Find root partition (mountpoint = '/' or '/root')
    const rootStorage = server.storage.find(
      (s) => s.mountpoint === "/" || s.mountpoint === "/root",
    );

    if (
      rootStorage &&
      rootStorage.percent !== null &&
      rootStorage.percent !== undefined
    ) {
      storagePercent = rootStorage.percent;
      storageValue = storagePercent.toFixed(1) + "%";
      storageStatus = rootStorage.status || "";
    }
  }

  // Determine blink classes
  const cpuBlinkClass =
    cpuPercent >= 90
      ? "blink-critical"
      : cpuPercent >= 70
        ? "blink-warning"
        : "";
  const memBlinkClass =
    memPercent >= 90
      ? "blink-critical"
      : memPercent >= 75
        ? "blink-warning"
        : "";
  const storageBlinkClass =
    storagePercent >= 90
      ? "blink-critical"
      : storagePercent >= 80
        ? "blink-warning"
        : "";

  card.innerHTML = `
    <div class="server-header">
        <h3>${server.name}</h3>
        <span class="status-badge ${server.status === "ssh_unreachable" ? "ssh-unreachable" : server.status}">
  ${server.status === "ssh_unreachable" ? "⚠ SSH UNREACHABLE" : server.status}
</span>
        ${
          server._stateInfo && server._stateInfo.changed
            ? `<span class="server-transition-badge">
                <i class="fas fa-arrow-right"></i>
                ${server._stateInfo.transition}
            </span>`
            : ""
        }
    </div>
    <div class="server-stats">
        <div class="stat ${cpuBlinkClass}">
            <span class="stat-label">CPU</span>
            <span class="stat-value ${cpuStatus}">${cpuValue}</span>
        </div>
        <div class="stat ${memBlinkClass}">
            <span class="stat-label">Memory</span>
            <span class="stat-value ${memStatus}">${memValue}</span>
        </div>
        <div class="stat ${storageBlinkClass}">
            <span class="stat-label">Storage</span>
            <span class="stat-value ${storageStatus}">${storageValue}</span>
        </div>
    </div>
    ${
      server.status === "ssh_unreachable"
        ? `
  <div class="ssh-unreachable-notice">
    <i class="fas fa-ethernet"></i> Ping OK &nbsp;|&nbsp;
    <i class="fas fa-times-circle"></i> SSH not responding
  </div>`
        : ""
    }
${renderStorageAlertDetails(getStorageAlertDetails(server), server)}
    `;

  return card;
}

// ==================== Live CPU Chart Functions ====================
function initLiveCPUChart(serverName, initialCPU) {
  liveCPUData = [];
  const now = new Date().getTime();
  liveCPUData.push([now, initialCPU]);

  liveCPUChart = Highcharts.chart("live-cpu-chart", {
    chart: {
      type: "areaspline",
      backgroundColor: "transparent",
      height: 280,
      animation: Highcharts.svg,
    },
    title: { text: null },
    xAxis: {
      type: "datetime",
      tickPixelInterval: 150,
      gridLineColor: "rgba(255, 255, 255, 0.05)",
      labels: {
        style: {
          color: getComputedStyle(document.body).getPropertyValue(
            "--text-secondary",
          ),
        },
      },
    },
    yAxis: {
      title: {
        text: "CPU Usage (%)",
        style: {
          color: getComputedStyle(document.body).getPropertyValue(
            "--text-primary",
          ),
        },
      },
      min: 0,
      max: 100,
      gridLineColor: "rgba(255, 255, 255, 0.05)",
      labels: {
        style: {
          color: getComputedStyle(document.body).getPropertyValue(
            "--text-secondary",
          ),
        },
      },
      plotLines: [
        {
          value: 70,
          color: "#f59e0b",
          dashStyle: "shortdash",
          width: 2,
          label: {
            text: "Warning",
            style: { color: "#f59e0b" },
          },
        },
        {
          value: 90,
          color: "#ef4444",
          dashStyle: "shortdash",
          width: 2,
          label: {
            text: "Critical",
            style: { color: "#ef4444" },
          },
        },
      ],
    },
    accessibility: { enabled: false },
    legend: { enabled: false },
    credits: { enabled: false },
    exporting: { enabled: false },
    tooltip: {
      formatter: function () {
        return (
          "<b>" +
          Highcharts.dateFormat("%H:%M:%S", this.x) +
          "</b><br/>" +
          "CPU: " +
          this.y.toFixed(1) +
          "%"
        );
      },
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      style: { color: "#fff" },
    },
    series: [
      {
        name: "CPU Usage",
        data: liveCPUData,
        color: {
          linearGradient: { x1: 0, x2: 0, y1: 0, y2: 1 },
          stops: [
            [0, "#667eea"],
            [1, "rgba(102, 126, 234, 0.1)"],
          ],
        },
        fillOpacity: 0.3,
        lineWidth: 2,
        marker: {
          enabled: false,
          states: {
            hover: {
              enabled: true,
              radius: 5,
            },
          },
        },
      },
    ],
  });

  startLiveCPUUpdates(serverName);
}

function startLiveCPUUpdates(serverName) {
  if (liveCPUInterval) {
    clearInterval(liveCPUInterval);
  }

  liveCPUInterval = setInterval(() => {
    fetch(`${API_BASE}/api/status`)
      .then((response) => response.json())
      .then((data) => {
        const server = data.servers.find((s) => s.name === serverName);
        if (server && server.cpu !== null && server.cpu !== undefined) {
          updateLiveCPUChart(server.cpu);

          const displayElement = document.querySelector(".cpu-value-large");
          if (displayElement) {
            displayElement.textContent = server.cpu.toFixed(1) + "%";
            displayElement.className =
              "cpu-value-large " + getCPUStatus(server.cpu);
          }
        }
      })
      .catch((error) => console.error("Error updating live CPU:", error));
  }, 2000);
}

function updateLiveCPUChart(cpuValue) {
  if (!liveCPUChart) return;

  const now = new Date().getTime();
  const series = liveCPUChart.series[0];

  series.addPoint([now, cpuValue], true, liveCPUData.length > 30);

  if (liveCPUData.length > 30) {
    liveCPUData.shift();
  }
  liveCPUData.push([now, cpuValue]);
}

function stopLiveCPUUpdates() {
  if (liveCPUInterval) {
    clearInterval(liveCPUInterval);
    liveCPUInterval = null;
  }
}

// ==================== Server Details Modal ====================
function showServerDetails(serverName) {
  showLoading();

  fetch(`${API_BASE}/api/status`)
    .then((response) => response.json())
    .then((data) => {
      const server = data.servers.find((s) => s.name === serverName);
      if (server) {
        currentServer = server;
        openModal(server);
      }
      hideLoading();
    })
    .catch((error) => {
      console.error("Error:", error);
      hideLoading();
    });
}

function openModal(server) {
  const modal = document.getElementById("server-modal");
  const modalTitle = document.getElementById("modal-server-name");
  if (!modal || !modalTitle) {
    console.error("Modal elements not found!");
    return;
  }

  modalTitle.textContent = server.name;
  modal.classList.add("show");

  // ── Server Switcher ──────────────────────────────────────────
  const allServers = (window.currentServersData || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const currentIdx = allServers.findIndex((s) => s.name === server.name);
  const prevServer =
    currentIdx > 0
      ? allServers[currentIdx - 1]
      : allServers[allServers.length - 1];
  const nextServer =
    currentIdx < allServers.length - 1
      ? allServers[currentIdx + 1]
      : allServers[0];

  let switcherEl = document.getElementById("modal-server-switcher");
  if (!switcherEl) {
    switcherEl = document.createElement("div");
    switcherEl.id = "modal-server-switcher";
    modalTitle.parentNode.insertBefore(switcherEl, modalTitle.nextSibling);
  }

  switcherEl.innerHTML = `
    <div class="server-switcher">
      <button class="switcher-btn" onclick="switchModalServer('${prevServer.name}')" title="Previous: ${prevServer.name}">
        <i class="fas fa-chevron-left"></i>
      </button>
      <div class="switcher-dropdown-wrap">
        <select class="switcher-select" onchange="switchModalServer(this.value)">
          ${allServers
            .map(
              (s) => `
            <option value="${s.name}" ${s.name === server.name ? "selected" : ""}>
              ${s.name} ${s.status !== "online" ? "⚠" : "●"}
            </option>
          `,
            )
            .join("")}
        </select>
        <span class="switcher-counter">${currentIdx + 1} / ${allServers.length}</span>
      </div>
      <button class="switcher-btn" onclick="switchModalServer('${nextServer.name}')" title="Next: ${nextServer.name}">
        <i class="fas fa-chevron-right"></i>
      </button>
    </div>
  `;

  // ── Tabs reset ───────────────────────────────────────────────
  const tabsContainer = document.querySelector(".tabs");
  const allTabs = document.querySelectorAll(".tabs .tab");
  const allTabContents = document.querySelectorAll(".tab-content");
  if (tabsContainer) tabsContainer.style.display = "flex";
  allTabs.forEach((tab) => tab.classList.remove("active"));
  allTabContents.forEach((content) => content.classList.remove("active"));

  const overviewTab = document.querySelector('[data-tab="overview"]');
  const overviewContent = document.getElementById("overview-tab");
  if (overviewTab) overviewTab.classList.add("active");
  if (overviewContent) overviewContent.classList.add("active");

  setupTabs();
  renderOverviewTab(server);
}

// ── Switch server without closing modal ──────────────────────────
function switchModalServer(serverName) {
  stopLiveCPUUpdates();
  if (liveCPUChart) {
    liveCPUChart.destroy();
    liveCPUChart = null;
  }

  showLoading();
  fetch(`${API_BASE}/api/status`)
    .then((r) => r.json())
    .then((data) => {
      const server = data.servers.find((s) => s.name === serverName);
      if (server) {
        currentServer = server;
        openModal(server);
      }
      hideLoading();
    })
    .catch((err) => {
      console.error("Switch error:", err);
      hideLoading();
    });
}

function closeModal() {
  document.getElementById("server-modal").classList.remove("show");
  stopLiveCPUUpdates();
  if (liveCPUChart) {
    liveCPUChart.destroy();
    liveCPUChart = null;
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tabs .tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");

      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      contents.forEach((c) => c.classList.remove("active"));
      document.getElementById(`${tabName}-tab`).classList.add("active");

      if (tabName !== "overview") {
        stopLiveCPUUpdates();
      }

      switch (tabName) {
        case "overview":
          renderOverviewTab(currentServer);
          break;
        case "storage":
          renderStorageTab(currentServer);
          break;
        case "processes":
          renderProcessesTab(currentServer);
          break;
        case "services":
          renderServicesTab(currentServer);
          break;
        case "ssh":
          renderSSHTab(currentServer);
          break;
      }
    });
  });
}

function renderOverviewTab(server) {
  const memory = validateMemoryData(server.memory);
  const cpuStatus = getCPUStatus(server.cpu);
  const cpuValue =
    server.cpu !== null && server.cpu !== undefined
      ? server.cpu.toFixed(1) + "%"
      : "N/A";

  let html = `
        <div class="overview-stats">
            <div class="stat-section-grid">
                <div class="stat-section">
                    <h3><i class="fas fa-microchip"></i> Live CPU Usage</h3>
                    <div class="live-cpu-container">
                        <div id="live-cpu-chart"></div>
                        <div class="current-cpu-display">
                            <div class="cpu-value-large ${cpuStatus}">${cpuValue}</div>
                            <div class="cpu-label">Current Usage</div>
                        </div>
                    </div>
                </div>
                
                <div class="stat-section">
                    <h3><i class="fas fa-memory"></i> Memory Usage</h3>
                    ${
                      memory
                        ? `
                        <div class="memory-container">
                            <div class="memory-chart-wrapper">
                                <canvas id="memory-chart"></canvas>
                            </div>
                            <div class="memory-stats">
                                <div class="memory-stat">
                                    <span class="memory-label" style="background: #ef4444;"></span>
                                    <span>Used: ${formatBytes(
                                      memory.used,
                                    )}</span>
                                </div>
                                <div class="memory-stat">
                                    <span class="memory-label" style="background: #3b82f6;"></span>
                                    <span>Cached: ${formatBytes(
                                      memory.cached,
                                    )}</span>
                                </div>
                                <div class="memory-stat">
                                    <span class="memory-label" style="background: #f59e0b;"></span>
                                    <span>Buffers: ${formatBytes(
                                      memory.buffers,
                                    )}</span>
                                </div>
                                <div class="memory-stat">
                                    <span class="memory-label" style="background: #10b981;"></span>
                                    <span>Free: ${formatBytes(
                                      memory.free,
                                    )}</span>
                                </div>
                                <div class="memory-total">
                                    Total: ${formatBytes(memory.total)}
                                </div>
                            </div>
                        </div>
                    `
                        : "<p>Memory data not available</p>"
                    }
                </div>
            </div>

            ${
              server.load_average
                ? `
                <div class="stat-section">
                    <h3><i class="fas fa-tachometer-alt"></i> System Load</h3>
                    <div class="stat-grid">
                        <div class="stat-box">
                            <div class="stat-label">1 min</div>
                            <div class="stat-value">${server.load_average.load_1min}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">5 min</div>
                            <div class="stat-value">${server.load_average.load_5min}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">15 min</div>
                            <div class="stat-value">${server.load_average.load_15min}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">Processes</div>
                            <div class="stat-value">${server.load_average.running_processes}/${server.load_average.total_processes}</div>
                        </div>
                    </div>
                </div>
            `
                : ""
            }

            ${
              server.uptime
                ? `
                <div class="stat-section">
                    <h3><i class="fas fa-clock"></i> Uptime</h3>
                    <div class="stat-box">
                        <div class="stat-label">Running Since</div>
                        <div class="stat-value">${server.uptime.uptime_human}</div>
                        <div class="stat-label" style="margin-top: 0.5rem;">Boot Time: ${server.uptime.boot_time}</div>
                    </div>
                </div>
            `
                : ""
            }

            ${
              server.network_stats && server.network_stats.length > 0
                ? `
                <div class="stat-section">
                    <h3><i class="fas fa-network-wired"></i> Network Interfaces</h3>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Interface</th>
                                <th>RX (MB)</th>
                                <th>TX (MB)</th>
                                <th>Packets</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${server.network_stats
                              .map((net) => {
                                const rxMB = (
                                  net.rx_bytes /
                                  (1024 * 1024)
                                ).toFixed(2);
                                const txMB = (
                                  net.tx_bytes /
                                  (1024 * 1024)
                                ).toFixed(2);
                                return `
                                    <tr>
                                        <td><strong>${net.interface}</strong></td>
                                        <td>${rxMB} MB</td>
                                        <td>${txMB} MB</td>
                                        <td>↓${net.rx_packets} ↑${net.tx_packets}</td>
                                    </tr>
                                `;
                              })
                              .join("")}
                        </tbody>
                    </table>
                </div>
            `
                : ""
            }

            ${
              server.top_cpu_processes && server.top_cpu_processes.length > 0
                ? `
                <div class="stat-section">
                    <h3><i class="fas fa-microchip"></i> Top CPU Processes</h3>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>PID</th>
                                <th>User</th>
                                <th>CPU %</th>
                                <th>MEM %</th>
                                <th>Command</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${server.top_cpu_processes
                              .map(
                                (proc) => `
                                <tr>
                                    <td>${proc.pid}</td>
                                    <td>${proc.user}</td>
                                    <td><strong>${proc.cpu}%</strong></td>
                                    <td>${proc.mem}%</td>
                                    <td><code>${proc.command}</code></td>
                                </tr>
                            `,
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>
            `
                : ""
            }

            ${
              server.top_mem_processes && server.top_mem_processes.length > 0
                ? `
                <div class="stat-section">
                    <h3><i class="fas fa-memory"></i> Top Memory Processes</h3>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>PID</th>
                                <th>User</th>
                                <th>CPU %</th>
                                <th>MEM %</th>
                                <th>Command</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${server.top_mem_processes
                              .map(
                                (proc) => `
                                <tr>
                                    <td>${proc.pid}</td>
                                    <td>${proc.user}</td>
                                    <td>${proc.cpu}%</td>
                                    <td><strong>${proc.mem}%</strong></td>
                                    <td><code>${proc.command}</code></td>
                                </tr>
                            `,
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>
            `
                : ""
            }
        </div>
    `;

  // Append history charts section placeholder

  document.getElementById("overview-tab").innerHTML = html;

  // Draw memory pie chart
  if (memory) {
    setTimeout(() => {
      const canvas = document.getElementById("memory-chart");
      if (canvas) drawMemoryPieChart(canvas, memory);
    }, 100);
  }

  // Init live CPU chart
  if (server.cpu != null && server.cpu !== undefined) {
    initLiveCPUChart(server.name, server.cpu);
  }

  // Load 24h history charts ONCE, after DOM settles
  setTimeout(() => loadHistoryCharts(server.name), 200);

  if (memory) {
    setTimeout(() => {
      const canvas = document.getElementById("memory-chart");
      if (canvas) drawMemoryPieChart(canvas, memory);
    }, 100);
  }
  if (server.cpu != null && server.cpu !== undefined) {
    initLiveCPUChart(server.name, server.cpu);
  }

  // Load 24h history charts after DOM is ready
  //   setTimeout(() => loadHistoryCharts(server.name), 150);

  if (memory) {
    setTimeout(() => {
      const canvas = document.getElementById("memory-chart");
      if (canvas) {
        drawMemoryPieChart(canvas, memory);
      }
    }, 100);
  }

  if (server.cpu !== null && server.cpu !== undefined) {
    initLiveCPUChart(server.name, server.cpu);
  }
}

function loadHistoryCharts(serverName) {
  const chartIds = ["cpu", "mem", "storage"];
  const showNoData = (id, msg = "No data yet") => {
    const el = document.getElementById(`history-${id}-chart`);
    if (el)
      el.innerHTML = `<div class="hc-no-data"><i class="fas fa-database"></i><p>${msg}</p></div>`;
  };

  fetch(
    `${API_BASE}/api/server_metrics_history?server=${encodeURIComponent(serverName)}&days=1`,
  )
    .then((r) => {
      console.log(`📡 History API status: ${r.status} for ${serverName}`); // ← ADD THIS
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      console.log(
        "📦 Raw history response:",
        JSON.stringify(data).slice(0, 500),
      ); // ← ADD THIS
      const metrics = Array.isArray(data.metrics) ? data.metrics : [];
      console.log(`📊 Total rows: ${metrics.length}`); // ← ADD THIS
      if (metrics.length > 0) {
        console.log("🔍 First row keys:", JSON.stringify(metrics[0])); // ← SHOWS FIELD NAMES
      }

      if (!metrics.length) {
        chartIds.forEach((id) => showNoData(id, "No history data yet"));
        return;
      }

      const cpuData = [],
        memData = [],
        storageData = [];

      metrics.forEach((m) => {
        const ts = new Date(m.timestamp).getTime();
        if (isNaN(ts)) return;

        // API returns flat floats: m.cpu, m.memory, m.root_storage
        const cpuVal = m.cpu;
        if (cpuVal != null && !isNaN(cpuVal))
          cpuData.push([ts, parseFloat(Number(cpuVal).toFixed(1))]);

        const memVal = m.memory;
        if (memVal != null && !isNaN(memVal))
          memData.push([ts, parseFloat(Number(memVal).toFixed(1))]);

        const stoVal = m.root_storage;
        if (stoVal != null && !isNaN(stoVal))
          storageData.push([ts, parseFloat(Number(stoVal).toFixed(1))]);
      });

      console.log(
        `✅ Parsed — CPU: ${cpuData.length}, MEM: ${memData.length}, STO: ${storageData.length}`,
      );

      const makeOptions = (
        color,
        gradColor,
        warnLine,
        critLine,
        seriesName,
        pointData,
      ) => ({
        chart: {
          type: "areaspline",
          backgroundColor: "transparent",
          height: 180,
          animation: false,
          style: { fontFamily: "inherit" },
          margin: [10, 10, 30, 40],
        },
        title: { text: null },
        credits: { enabled: false },
        exporting: { enabled: false },
        legend: { enabled: false },
        xAxis: {
          type: "datetime",
          gridLineColor: "rgba(255,255,255,0.05)",
          lineColor: "rgba(255,255,255,0.08)",
          tickColor: "rgba(255,255,255,0.08)",
          labels: {
            style: { color: "#666", fontSize: "10px" },
            format: "{value:%H:%M}",
          },
        },
        yAxis: {
          title: { text: null },
          min: 0,
          max: 100,
          gridLineColor: "rgba(255,255,255,0.06)",
          labels: {
            style: { color: "#666", fontSize: "10px" },
            format: "{value}%",
          },
          plotLines: [
            {
              value: warnLine,
              color: "#f59e0b",
              dashStyle: "ShortDash",
              width: 1,
              label: {
                text: `${warnLine}%`,
                style: { color: "#f59e0b", fontSize: "9px" },
              },
            },
            {
              value: critLine,
              color: "#ef4444",
              dashStyle: "ShortDash",
              width: 1,
              label: {
                text: `${critLine}%`,
                style: { color: "#ef4444", fontSize: "9px" },
              },
            },
          ],
        },
        tooltip: {
          backgroundColor: "rgba(10,10,20,0.93)",
          borderColor: color,
          borderRadius: 8,
          shadow: false,
          style: { color: "#e2e8f0", fontSize: "12px" },
          formatter: function () {
            return `<b>${Highcharts.dateFormat("%d %b %H:%M", this.x)}</b><br/>
                    ${seriesName}: <b style="color:${color}">${this.y.toFixed(1)}%</b>`;
          },
        },
        series: [
          {
            name: seriesName,
            data: pointData,
            color: color,
            fillColor: {
              linearGradient: { x1: 0, x2: 0, y1: 0, y2: 1 },
              stops: [
                [0, gradColor],
                [1, "rgba(0,0,0,0)"],
              ],
            },
            fillOpacity: 0.4,
            lineWidth: 2,
            marker: {
              enabled: false,
              states: { hover: { enabled: true, radius: 3 } },
            },
            threshold: null,
          },
        ],
      });

      // CPU
      const cpuEl = document.getElementById("history-cpu-chart");
      if (cpuEl) {
        cpuData.length
          ? ((cpuEl.innerHTML = ""),
            Highcharts.chart(
              "history-cpu-chart",
              makeOptions(
                "#667eea",
                "rgba(102,126,234,0.35)",
                70,
                90,
                "CPU",
                cpuData,
              ),
            ))
          : showNoData("cpu", "No CPU history");
      }

      // Memory
      const memEl = document.getElementById("history-mem-chart");
      if (memEl) {
        memData.length
          ? ((memEl.innerHTML = ""),
            Highcharts.chart(
              "history-mem-chart",
              makeOptions(
                "#06b6d4",
                "rgba(6,182,212,0.35)",
                75,
                90,
                "Memory",
                memData,
              ),
            ))
          : showNoData("mem", "No memory history");
      }

      // Storage
      const stoEl = document.getElementById("history-storage-chart");
      if (stoEl) {
        if (storageData.length) {
          stoEl.innerHTML = "";
          const last = storageData[storageData.length - 1][1];
          const stoColor =
            last > 95 ? "#ef4444" : last > 80 ? "#f59e0b" : "#10b981";
          const stoGrad =
            last > 95
              ? "rgba(239,68,68,0.35)"
              : last > 80
                ? "rgba(245,158,11,0.35)"
                : "rgba(16,185,129,0.35)";
          Highcharts.chart(
            "history-storage-chart",
            makeOptions(stoColor, stoGrad, 80, 95, "Storage", storageData),
          );
        } else {
          showNoData("storage", "No storage history");
        }
      }
    })
    .catch((err) => {
      console.error("❌ History charts error:", err);
      chartIds.forEach((id) => showNoData(id, `Error: ${err.message}`));
    });
}

function renderStorageTab(server) {
  if (!server.storage || server.storage.length === 0) {
    document.getElementById("storage-tab").innerHTML = `
            <div class="empty-storage-state">
                <i class="fas fa-hdd fa-4x"></i>
                <h3>No Storage Data</h3>
                <p>Storage information is not available for this server</p>
            </div>
        `;
    return;
  }

  const html = `
        <div class="storage-header-section">
            <h3><i class="fas fa-database"></i> Storage Overview</h3>
            <div class="storage-stats-summary">
                <div class="storage-summary-item">
                    <i class="fas fa-hdd"></i>
                    <span>${server.storage.length} Partitions</span>
                </div>
                <div class="storage-summary-item">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>${
                      server.storage.filter((s) => s.status !== "normal").length
                    } Alerts</span>
                </div>
            </div>
        </div>
        
        <div class="storage-cards-grid">
            ${server.storage
              .map((drive, index) => {
                const usedPercent = drive.percent || 0;

                return `
                    <div class="storage-card-modern ${drive.status}">
                        <div class="storage-card-header">
                            <div class="storage-icon-wrapper">
                                <i class="fas ${
                                  drive.mountpoint === "/"
                                    ? "fa-hard-drive"
                                    : "fa-folder"
                                }"></i>
                            </div>
                            <div class="storage-title-section">
                                <h4>${drive.mountpoint}</h4>
                                <span class="storage-filesystem">${
                                  drive.filesystem
                                }</span>
                            </div>
                            <span class="storage-status-badge ${drive.status}">
                                ${drive.status}
                            </span>
                        </div>
                        
                        <div class="storage-visualization">
                            <canvas id="storage-chart-${index}" class="storage-mini-chart"></canvas>
                            <div class="storage-center-info">
                                <div class="storage-percent-large">${usedPercent.toFixed(
                                  1,
                                )}%</div>
                                <div class="storage-percent-label">Used</div>
                            </div>
                        </div>
                        
                        <div class="storage-details-grid">
                            <div class="storage-detail-item">
                                <i class="fas fa-database"></i>
                                <div class="storage-detail-content">
                                    <span class="storage-detail-label">Total</span>
                                    <span class="storage-detail-value">${formatBytes(
                                      drive.size,
                                    )}</span>
                                </div>
                            </div>
                            <div class="storage-detail-item">
                                <i class="fas fa-chart-pie"></i>
                                <div class="storage-detail-content">
                                    <span class="storage-detail-label">Used</span>
                                    <span class="storage-detail-value">${formatBytes(
                                      drive.used,
                                    )}</span>
                                </div>
                            </div>
                            <div class="storage-detail-item">
                                <i class="fas fa-check-circle"></i>
                                <div class="storage-detail-content">
                                    <span class="storage-detail-label">Free</span>
                                    <span class="storage-detail-value">${formatBytes(
                                      drive.available,
                                    )}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="storage-progress-bar">
                            <div class="storage-progress-fill ${
                              drive.status
                            }" style="width: ${usedPercent}%">
                                <span class="storage-progress-text">${usedPercent.toFixed(
                                  1,
                                )}%</span>
                            </div>
                        </div>
                        
                        <button class="storage-analyze-btn" onclick="analyzeStorage('${
                          server.name
                        }', '${drive.mountpoint}')">
                            <i class="fas fa-search-plus"></i>
                            <span>Analyze Storage</span>
                        </button>
                    </div>
                `;
              })
              .join("")}
        </div>
    `;

  document.getElementById("storage-tab").innerHTML = html;

  // Draw mini charts for each storage
  server.storage.forEach((drive, index) => {
    setTimeout(() => {
      drawStorageMiniChart(index, drive.percent, drive.status);
    }, 100);
  });
}

// Global registry to track Chart.js instances by canvas ID
if (!window._storageChartRegistry) window._storageChartRegistry = {};

function drawStorageMiniChart(index, usedPercent, status) {
  const canvasId = `storage-chart-${index}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn("Canvas not found:", canvasId);
    return;
  }

  // ✅ Destroy via registry first (survives DOM innerHTML replacement)
  if (window._storageChartRegistry[canvasId]) {
    try {
      window._storageChartRegistry[canvasId].destroy();
    } catch (e) {}
    delete window._storageChartRegistry[canvasId];
  }
  // ✅ Also destroy via Chart.js v3 API as safety net
  try {
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
  } catch (e) {}

  if (typeof Chart === "undefined") {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      `${usedPercent.toFixed(1)}%`,
      canvas.width / 2,
      canvas.height / 2,
    );
    return;
  }

  canvas.width = 160;
  canvas.height = 160;

  const usedColor =
    status === "critical"
      ? "#ef4444"
      : status === "warning"
        ? "#f59e0b"
        : status === "moderate"
          ? "#3b82f6"
          : "#10b981";

  const instance = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: ["Used", "Free"],
      datasets: [
        {
          data: [usedPercent, 100 - usedPercent],
          backgroundColor: [usedColor, "#1e293b"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      cutout: "75%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { animateRotate: true, animateScale: false },
    },
  });

  // Store in registry
  window._storageChartRegistry[canvasId] = instance;
}

function analyzeStorage(serverName, mountpoint) {
  console.log("🔍 Analyzing storage:", serverName, mountpoint);

  // Show modal with loading state
  const modal = document.getElementById("server-modal");
  const modalTitle = document.getElementById("modal-server-name");
  const overviewTab = document.getElementById("overview-tab");

  if (!modal || !modalTitle || !overviewTab) {
    console.error("Modal elements not found");
    return;
  }

  modalTitle.textContent = `Storage Analysis: ${serverName} - ${mountpoint}`;
  modal.classList.add("show");

  // ✅ Hide tabs during analysis
  const tabsContainer = document.querySelector(".tabs");
  if (tabsContainer) {
    tabsContainer.style.display = "none";
  }

  // Hide all tab contents
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });

  // Show only overview tab with loading
  overviewTab.classList.add("active");
  overviewTab.innerHTML = `
        <div class="analysis-loading-state">
            <div class="loading-spinner"></div>
            <p>Analyzing storage usage for <strong>${mountpoint}</strong>...</p>
            <p class="loading-subtext">This may take a few moments...</p>
        </div>
    `;

  // Fetch analysis
  fetch(`${API_BASE}/api/analyze_storage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      server: serverName,
      mountpoint: mountpoint,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        displayStorageAnalysisModal(data);
      } else {
        overviewTab.innerHTML = `
                <div class="analysis-error-state">
                    <i class="fas fa-exclamation-triangle fa-3x"></i>
                    <h3>Analysis Failed</h3>
                    <p>${data.error || "Failed to analyze storage"}</p>
                    <button class="btn-primary" onclick="closeModal()">Close</button>
                </div>
            `;
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      overviewTab.innerHTML = `
            <div class="analysis-error-state">
                <i class="fas fa-exclamation-triangle fa-3x"></i>
                <h3>Connection Error</h3>
                <p>Failed to connect to server for analysis</p>
                <button class="btn-primary" onclick="closeModal()">Close</button>
            </div>
        `;
    });
}

function displayStorageAnalysisModal(data) {
  const overviewTab = document.getElementById("overview-tab");
  const analysis = data.analysis;
  let html = `
        <div class="storage-analysis-container">
            <div class="analysis-summary-cards">
                <div class="analysis-summary-card">
                    <div class="summary-icon"><i class="fas fa-folder"></i></div>
                    <div class="summary-info">
                        <div class="summary-value">${
    analysis.top_directories.length
  }</div>
                        <div class="summary-label">Directories Analyzed</div>
                    </div>
                </div>
                <div class="analysis-summary-card">
                    <div class="summary-icon"><i class="fas fa-file"></i></div>
                    <div class="summary-info">
                        <div class="summary-value">${
    analysis.top_files.length
  }</div>
                        <div class="summary-label">Files Analyzed</div>
                    </div>
                </div>
                <div class="analysis-summary-card">
                    <div class="summary-icon"><i class="fas fa-chart-bar"></i></div>
                    <div class="summary-info">
                        <div class="summary-value">${
    analysis.file_types.length
  }</div>
                        <div class="summary-label">File Types Found</div>
                    </div>
                </div>
            </div>
            
            <div class="analysis-tabs-modern">
                <button class="analysis-tab-btn active" onclick="switchAnalysisTab(event, 'dirs')">
                    <i class="fas fa-folder-tree"></i> Top Directories
                </button>
                <button class="analysis-tab-btn" onclick="switchAnalysisTab(event, 'files')">
                    <i class="fas fa-file-alt"></i> Largest Files
                </button>
                <button class="analysis-tab-btn" onclick="switchAnalysisTab(event, 'types')">
                    <i class="fas fa-chart-pie"></i> File Types
                </button>
                <button class="analysis-tab-btn" onclick="switchAnalysisTab(event, 'summary')">
                    <i class="fas fa-layer-group"></i> Directory Summary
                </button>
            </div>
            
            <div class="analysis-content-wrapper">
                <div class="analysis-section active" id="analysis-dirs">
                    <h3><i class="fas fa-folder-open"></i> Top 20 Largest Directories</h3>
                    <div class="analysis-table-wrapper">
                        <table class="modern-table">
                            <thead>
                                <tr>
                                    <th width="60">#</th>
                                    <th width="120">Size</th>
                                    <th>Path</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${analysis.top_directories
    .map(
      (dir, index) => `
                                    <tr>
                                        <td><span class="rank-badge">${
        index + 1
      }</span></td>
                                        <td><span class="size-tag">${
        dir.size
      }</span></td>
                                        <td><code class="path-code">${
        dir.path
      }</code></td>
                                    </tr>
                                `,
    )
    .join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="analysis-section" id="analysis-files">
                    <h3><i class="fas fa-file-code"></i> Top 20 Largest Files</h3>
                    <div class="analysis-table-wrapper">
                        <table class="modern-table">
                            <thead>
                                <tr>
                                    <th width="60">#</th>
                                    <th width="120">Size</th>
                                    <th>Path</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${analysis.top_files
    .map(
      (file, index) => `
                                    <tr>
                                        <td><span class="rank-badge">${
        index + 1
      }</span></td>
                                        <td><span class="size-tag">${
        file.size
      }</span></td>
                                        <td><code class="path-code">${
        file.path
      }</code></td>
                                    </tr>
                                `,
    )
    .join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="analysis-section" id="analysis-types">
                    <h3><i class="fas fa-chart-bar"></i> File Type Distribution</h3>
                    <div class="file-types-grid">
                        ${analysis.file_types
    .map((type, index) => {
      const maxCount = analysis.file_types[0].count;
      const percentage = (type.count / maxCount) * 100;
      return `
                                <div class="file-type-card">
                                    <div class="file-type-header">
                                        <span class="file-type-rank">#${
        index + 1
      }</span>
                                        <span class="file-type-ext">.${
        type.extension
      }</span>
                                        <span class="file-type-count">${type.count.toLocaleString()}</span>
                                    </div>
                                    <div class="file-type-progress">
                                        <div class="file-type-progress-bar" style="width: ${percentage}%"></div>
                                    </div>
                                </div>
                            `;
    })
    .join("")}
                    </div>
                </div>
                
                <div class="analysis-section" id="analysis-summary">
                    <h3><i class="fas fa-sitemap"></i> Directory Summary (Level 1)</h3>
                    <div class="analysis-table-wrapper">
                        <table class="modern-table">
                            <thead>
                                <tr>
                                    <th width="120">Size</th>
                                    <th>Path</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${analysis.directory_summary
    .map(
      (dir) => `
                                    <tr>
                                        <td><span class="size-tag">${dir.size}</span></td>
                                        <td><code class="path-code">${dir.path}</code></td>
                                    </tr>
                                `,
    )
    .join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
  overviewTab.innerHTML = html;
}

function switchAnalysisTab(event, tabName) {
  // Remove active from all tabs
  document
    .querySelectorAll(".analysis-tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelectorAll(".analysis-section")
    .forEach((section) => section.classList.remove("active")); // Add active to clicked tab
  event.target.classList.add("active");
  document.getElementById(`analysis-${tabName}`).classList.add("active");
}

function analyzeStorageInline(serverName, mountpoint) {
  const panel = document.getElementById("storage-analysis-panel");
  const content = document.getElementById("analysis-panel-content");
  const title = document.getElementById("analysis-panel-title"); // Show panel with loading
  panel.classList.add("show");
  title.textContent = `Analyzing ${mountpoint}...`;
  content.innerHTML = `
        <div class="analysis-loading">
            <div class="loading-spinner"></div>
            <p>Analyzing storage usage...</p>
        </div>
    `;
  fetch(`${API_BASE}/api/analyze_storage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      server: serverName,
      mountpoint: mountpoint,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        displayStorageAnalysis(data);
      } else {
        content.innerHTML = `
                <div class="analysis-error">
                    <i class="fas fa-exclamation-triangle fa-3x"></i>
                    <p>Error: ${data.error || "Failed to analyze storage"}</p>
                </div>
            `;
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      content.innerHTML = `
            <div class="analysis-error">
                <i class="fas fa-exclamation-triangle fa-3x"></i>
                <p>Failed to analyze storage</p>
            </div>
        `;
    });
}

function displayStorageAnalysis(data) {
  const title = document.getElementById("analysis-panel-title");
  const content = document.getElementById("analysis-panel-content");
  title.textContent = `${data.server} - ${data.mountpoint}`;
  const analysis = data.analysis;
  let html = `
        <div class="analysis-tabs-compact">
            <button class="analysis-tab-compact active" onclick="showAnalysisTabCompact(event, 'directories')">
                <i class="fas fa-folder"></i> Directories
            </button>
            <button class="analysis-tab-compact" onclick="showAnalysisTabCompact(event, 'files')">
                <i class="fas fa-file"></i> Files
            </button>
            <button class="analysis-tab-compact" onclick="showAnalysisTabCompact(event, 'types')">
                <i class="fas fa-chart-pie"></i> Types
            </button>
            <button class="analysis-tab-compact" onclick="showAnalysisTabCompact(event, 'summary')">
                <i class="fas fa-list"></i> Summary
            </button>
        </div>
        
        <div class="analysis-tab-content-compact active" id="analysis-compact-directories">
            <h4><i class="fas fa-folder-open"></i> Top 20 Largest Directories</h4>
            <div class="analysis-list">
                ${analysis.top_directories
    .map(
      (dir, index) => `
                    <div class="analysis-item">
                        <div class="analysis-rank">${index + 1}</div>
                        <div class="analysis-details">
                            <div class="analysis-size">${dir.size}</div>
                            <div class="analysis-path">${dir.path}</div>
                        </div>
                    </div>
                `,
    )
    .join("")}
            </div>
        </div>
        
        <div class="analysis-tab-content-compact" id="analysis-compact-files">
            <h4><i class="fas fa-file-alt"></i> Top 20 Largest Files</h4>
            <div class="analysis-list">
                ${analysis.top_files
    .map(
      (file, index) => `
                    <div class="analysis-item">
                        <div class="analysis-rank">${index + 1}</div>
                        <div class="analysis-details">
                            <div class="analysis-size">${file.size}</div>
                            <div class="analysis-path">${file.path}</div>
                        </div>
                    </div>
                `,
    )
    .join("")}
            </div>
        </div>
        
        <div class="analysis-tab-content-compact" id="analysis-compact-types">
            <h4><i class="fas fa-chart-bar"></i> File Type Distribution</h4>
            <div class="analysis-list">
                ${analysis.file_types
    .map((type, index) => {
      const maxCount = analysis.file_types[0].count;
      const percentage = (type.count / maxCount) * 100;
      return `
                        <div class="analysis-item">
                            <div class="analysis-rank">${index + 1}</div>
                            <div class="analysis-details">
                                <div class="file-type-info">
                                    <span class="file-ext">.${
        type.extension
      }</span>
                                    <span class="file-count">${type.count.toLocaleString()} files</span>
                                </div>
                                <div class="file-type-bar-compact">
                                    <div class="file-type-fill-compact" style="width: ${percentage}%"></div>
                                </div>
                            </div>
                        </div>
                    `;
    })
    .join("")}
            </div>
        </div>
        
        <div class="analysis-tab-content-compact" id="analysis-compact-summary">
            <h4><i class="fas fa-sitemap"></i> Directory Summary</h4>
            <div class="analysis-list">
                ${analysis.directory_summary
    .map(
      (dir, index) => `
                    <div class="analysis-item">
                        <div class="analysis-details">
                            <div class="analysis-size">${dir.size}</div>
                            <div class="analysis-path">${dir.path}</div>
                        </div>
                    </div>
                `,
    )
    .join("")}
            </div>
        </div>
    `;
  content.innerHTML = html;
}

function showAnalysisTabCompact(event, tabName) {
  // Remove active from all tabs and contents
  document
    .querySelectorAll(".analysis-tab-compact")
    .forEach((tab) => tab.classList.remove("active"));
  document
    .querySelectorAll(".analysis-tab-content-compact")
    .forEach((content) => content.classList.remove("active")); // Add active to selected
  event.target.closest(".analysis-tab-compact").classList.add("active");
  document
    .getElementById(`analysis-compact-${tabName}`)
    .classList.add("active");
}

function closeAnalysisPanel() {
  document.getElementById("storage-analysis-panel").classList.remove("show");
}

function renderProcessesTab(server) {
  document.getElementById("processes-tab").innerHTML =
    "<p>Loading processes...</p>";

  fetch(`${API_BASE}/api/user_services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server: server.name }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (!data.processes || data.processes.length === 0) {
        document.getElementById("processes-tab").innerHTML =
          "<p>No processes found</p>";
        return;
      }

      const html = `
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>IP</th>
                        <th>Login</th>
                        <th>TTY</th>
                        <th>PID</th>
                        <th>Command</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.processes
                      .map(
                        (proc) => `
                        <tr>
                            <td>${proc.user}</td>
                            <td>${proc.ip}</td>
                            <td>${proc.login_date} ${proc.login_time}</td>
                            <td>${proc.tty}</td>
                            <td>${proc.pid}</td>
                            <td><code>${proc.cmd}</code></td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        `;

      document.getElementById("processes-tab").innerHTML = html;
    })
    .catch((error) => {
      document.getElementById("processes-tab").innerHTML =
        "<p>Error loading processes</p>";
      console.error("Error:", error);
    });
}

function renderServicesTab(server) {
  const services = server.services || [];
  const failedServices = server.failed_services || [];

  if (services.length === 0 && failedServices.length === 0) {
    document.getElementById("services-tab").innerHTML =
      "<p>No services data available</p>";
    return;
  }

  let html = "";

  if (failedServices.length > 0) {
    html += `
            <div class="stat-section alert-section">
                <h3><i class="fas fa-exclamation-triangle"></i> Failed Services (${
                  failedServices.length
                })</h3>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Service</th>
                            <th>Status</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${failedServices
                          .map(
                            (service) => `
                            <tr class="warning-row">
                                <td><strong>${service.name}</strong></td>
                                <td><span class="status-badge offline">Failed</span></td>
                                <td>${service.reason}</td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        `;
  }

  if (services.length > 0) {
    html += `
            <div class="stat-section">
                <h3><i class="fas fa-check-circle"></i> Running Services (${
                  services.length
                })</h3>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Service</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${services
                          .map(
                            (service) => `
                            <tr>
                                <td><strong>${service.name}</strong></td>
                                <td>${service.description || "N/A"}</td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        `;
  }

  document.getElementById("services-tab").innerHTML = html;
}

function renderSSHTab(server) {
  if (!server.ssh_connections || server.ssh_connections.length === 0) {
    document.getElementById("ssh-tab").innerHTML =
      "<p>No active SSH connections</p>";
    return;
  }

  const html = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>User</th>
                    <th>IP Address</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                ${server.ssh_connections
                  .map(
                    (conn) => `
                    <tr>
                        <td><strong>${conn.user}</strong></td>
                        <td>${conn.ip}</td>
                        <td>
                            <button class="kick-btn" onclick="kickSSHUser('${server.name}', '${conn.ip}')">
                                <i class="fas fa-user-times"></i> Kick
                            </button>
                        </td>
                    </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
    `;

  document.getElementById("ssh-tab").innerHTML = html;
}

function kickSSHUser(serverName, ip) {
  if (!confirm(`Are you sure you want to kick user from ${ip}?`)) return;

  showLoading();
  fetch(`${API_BASE}/api/kick_ssh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server: serverName, ip: ip }),
  })
    .then((response) => response.json())
    .then((data) => {
      hideLoading();
      if (data.success) {
        alert("User kicked successfully");
        showServerDetails(serverName);
      } else {
        alert("Failed to kick user: " + (data.error || "Unknown error"));
      }
    })
    .catch((error) => {
      hideLoading();
      console.error("Error:", error);
      alert("Error kicking user");
    });
}

function renderAlertSection(title, alerts, type) {
  const iconMap = {
    offline: "fa-power-off",
    cpu: "fa-microchip",
    memory: "fa-memory",
    storage: "fa-hdd",
  };

  const colorMap = {
    offline: "danger",
    cpu: "warning",
    memory: "info",
    storage: "warning",
  };

  return `
        <div class="alert-section ${colorMap[type]}">
            <div class="alert-section-header">
                <h3>
                    <i class="fas ${iconMap[type]}"></i>
                    ${title} (${alerts.length})
                </h3>
            </div>
            <div class="alert-items">
                ${alerts.map((alert) => renderAlertItem(alert)).join("")}
            </div>
        </div>
    `;
}

// ==================== Alerts ====================

function loadAlerts() {
  console.log("🚨 Loading alerts...");

  const container = document.getElementById("alerts-container");

  container.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner-large"></div>
      <p>Loading alerts...</p>
    </div>
  `;

  fetch(`${API_BASE}/api/alerts`)
    .then((response) => {
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      console.log("🚨 Alerts response:", data);

      let alertsArray = data.alerts || data || [];

      if (!Array.isArray(alertsArray)) {
        console.error("❌ Alerts is not an array");
        alertsArray = [];
      }

      console.log("🚨 Total alerts:", alertsArray.length);

      if (alertsArray.length === 0) {
        container.innerHTML = `
          <div class="modern-no-alerts">
            <i class="fas fa-check-circle"></i>
            <h3>All Systems Operational</h3>
            <p>No active alerts detected. All servers are running normally.</p>
          </div>
        `;
        return;
      }

      // ── Categorize alerts ────────────────────────────────────
      const cpuAlerts = [];
      const memoryAlerts = [];
      const storageAlerts = [];
      const offlineAlerts = [];
      const sshAlerts = [];
      const affectedServers = new Set();

      // ✅ forEach is ONLY for categorizing — no HTML here
      alertsArray.forEach((alert) => {
        affectedServers.add(alert.server);
        const alertType = alert.type.toLowerCase();
        if (alertType.includes("offline")) offlineAlerts.push(alert);
        else if (alertType.includes("ssh")) sshAlerts.push(alert);
        else if (alertType.includes("cpu")) cpuAlerts.push(alert);
        else if (alertType.includes("memory")) memoryAlerts.push(alert);
        else storageAlerts.push(alert);
      });

      console.log("📊 Categories:", {
        offline: offlineAlerts.length,
        ssh: sshAlerts.length,
        cpu: cpuAlerts.length,
        memory: memoryAlerts.length,
        storage: storageAlerts.length,
      });

      // ── Build HTML ONCE after forEach is done ────────────────
      const html = `
        <div class="modern-alert-summary">
          <div class="modern-summary-box box-total">
            <div class="modern-summary-icon-wrap">
              <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="modern-summary-info">
              <div class="modern-summary-number">${alertsArray.length}</div>
              <div class="modern-summary-label">Total Alerts</div>
            </div>
          </div>

          <div class="modern-summary-box box-servers">
            <div class="modern-summary-icon-wrap">
              <i class="fas fa-server"></i>
            </div>
            <div class="modern-summary-info">
              <div class="modern-summary-number">${affectedServers.size}</div>
              <div class="modern-summary-label">Affected Servers</div>
            </div>
          </div>

          <div class="modern-summary-box box-cpu">
            <div class="modern-summary-icon-wrap">
              <i class="fas fa-microchip"></i>
            </div>
            <div class="modern-summary-info">
              <div class="modern-summary-number">${cpuAlerts.length}</div>
              <div class="modern-summary-label">CPU Alerts</div>
            </div>
          </div>

          <div class="modern-summary-box box-memory">
            <div class="modern-summary-icon-wrap">
              <i class="fas fa-memory"></i>
            </div>
            <div class="modern-summary-info">
              <div class="modern-summary-number">${memoryAlerts.length}</div>
              <div class="modern-summary-label">Memory Alerts</div>
            </div>
          </div>

          <div class="modern-summary-box box-storage">
            <div class="modern-summary-icon-wrap">
              <i class="fas fa-hdd"></i>
            </div>
            <div class="modern-summary-info">
              <div class="modern-summary-number">${storageAlerts.length}</div>
              <div class="modern-summary-label">Storage Alerts</div>
            </div>
          </div>
        </div>

        <div class="modern-alerts-wrapper">
          ${
            offlineAlerts.length > 0
              ? renderModernAlertCategory(
                  "Offline Servers",
                  offlineAlerts,
                  "fa-power-off",
                )
              : ""
          }

          ${
            sshAlerts.length > 0
              ? `
            <div class="alert-category ssh-unreachable">
              <div class="alert-category-header">
                <i class="fas fa-ethernet"></i>
                <span>SSH Unreachable</span>
                <span class="alert-count">${sshAlerts.length}</span>
              </div>
              ${sshAlerts.map((a) => renderAlertItem(a)).join("")}
            </div>`
              : ""
          }

          ${
            storageAlerts.length > 0
              ? renderModernAlertCategory(
                  "Storage Alerts",
                  storageAlerts,
                  "fa-hdd",
                )
              : ""
          }

          ${
            cpuAlerts.length > 0
              ? renderModernAlertCategory(
                  "CPU Alerts",
                  cpuAlerts,
                  "fa-microchip",
                )
              : ""
          }

          ${
            memoryAlerts.length > 0
              ? renderModernAlertCategory(
                  "Memory Alerts",
                  memoryAlerts,
                  "fa-memory",
                )
              : ""
          }
        </div>
      `;

      // ✅ Set innerHTML ONCE here, outside forEach
      container.innerHTML = html;
      console.log("✅ Alerts rendered successfully");
    })
    // ✅ .catch() is on the fetch chain, NOT after forEach
    .catch((error) => {
      console.error("❌ Error loading alerts:", error);
      container.innerHTML = `
        <div class="modern-no-alerts">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Error Loading Alerts</h3>
          <p>${error.message}</p>
        </div>
      `;
    });
}

// Render alert category
function renderModernAlertCategory(title, alerts, icon) {
  return `
        <div class="modern-alert-category">
            <div class="modern-category-title">
                <i class="fas ${icon}"></i>
                <h3>${title} (${alerts.length})</h3>
            </div>
            <div class="modern-alerts-list">
                ${alerts.map((alert) => renderModernAlertCard(alert)).join("")}
            </div>
        </div>
    `;
}

// Render individual alert card
function renderModernAlertCard(alert) {
  const severity = (alert.severity || "warning").toLowerCase();
  const serverName = alert.server || "Unknown Server";
  const message = alert.message || "No details available";
  const timestamp = alert.timestamp || "N/A";

  // Extract mount point
  let mountPoint = "";
  if (alert.mount) {
    mountPoint = alert.mount;
  } else if (message.includes("/")) {
    const match = message.match(/\/[^\s]*/);
    if (match) mountPoint = match[0];
  }

  return `
        <div class="modern-alert-card severity-${severity}">
            <div class="modern-alert-server-badge">
                <div class="modern-server-name">
                    <i class="fas fa-server"></i>
                    ${serverName}
                </div>
                ${
                  mountPoint
                    ? `<div class="modern-mount-path">${mountPoint}</div>`
                    : ""
                }
            </div>
            
            <div class="modern-alert-content">
                <div class="modern-alert-message">${message}</div>
            </div>
            
            <div class="modern-alert-actions">
                <span class="modern-severity-pill pill-${severity}">
                    ${severity === "critical" ? "CRITICAL" : "WARNING"}
                </span>

                <button class="modern-view-btn" onclick="viewServerDetails('${serverName}')">
                    <i class="fas fa-eye"></i> View Server
                </button>
            </div>
        </div>
    `;
}

// View server details function
function viewServerDetails(serverName) {
  const serverData = window.serversData?.find((s) => s.name === serverName);
  if (serverData) {
    showServerModal(serverData);
  } else {
    console.warn("Server not found:", serverName);
  }
}

// Helper function to render individual alert item
function renderAlertItem(alert) {
  const severityClass = alert.severity === "critical" ? "critical" : "warning";

  let timestamp = "N/A";
  if (alert.timestamp) {
    try {
      timestamp = new Date(alert.timestamp).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch (e) {
      timestamp = alert.timestamp;
    }
  }

  let progressBar = "";
  let detailsHtml = "";

  if (alert.type === "cpu") {
    const cpuPercent = parseFloat(alert.value) || 0;
    progressBar = `
            <div class="alert-progress">
                <div class="alert-progress-bar ${severityClass}" style="width: ${Math.min(
                  100,
                  cpuPercent,
                )}%"></div>
                <span class="alert-progress-text">${cpuPercent.toFixed(
                  1,
                )}%</span>
            </div>
        `;
    detailsHtml = `<span class="alert-detail">CPU Usage: <strong>${cpuPercent.toFixed(
      1,
    )}%</strong></span>`;
  } else if (alert.type === "memory") {
    const memPercent = parseFloat(alert.value) || 0;
    progressBar = `
            <div class="alert-progress">
                <div class="alert-progress-bar ${severityClass}" style="width: ${Math.min(
                  100,
                  memPercent,
                )}%"></div>
                <span class="alert-progress-text">${memPercent.toFixed(
                  1,
                )}%</span>
            </div>
        `;
    detailsHtml = `<span class="alert-detail">Memory Usage: <strong>${memPercent.toFixed(
      1,
    )}%</strong></span>`;
  } else if (alert.type === "storage") {
    const storagePercent = parseFloat(alert.value) || 0;
    progressBar = `
            <div class="alert-progress">
                <div class="alert-progress-bar ${severityClass}" style="width: ${Math.min(
                  100,
                  storagePercent,
                )}%"></div>
                <span class="alert-progress-text">${storagePercent.toFixed(
                  1,
                )}%</span>
            </div>
        `;
    const partition = alert.partition || alert.mountpoint || "/";
    detailsHtml = `
            <span class="alert-detail">
                Storage: <strong>${partition}</strong> 
                (<strong>${storagePercent.toFixed(1)}%</strong>)
            </span>
        `;
  } else if (alert.type === "offline") {
    if (alert.type?.toLowerCase().includes("ssh")) {
      detailsHtml = `<span class="alert-detail ssh-badge"><i class="fas fa-ethernet"></i> Ping OK &nbsp;|&nbsp; <i class="fas fa-times-circle"></i> SSH Not Responding</span>`;
    } else {
      detailsHtml = `<span class="alert-detail offline-badge"><i class="fas fa-power-off"></i> Server Offline</span>`;
    }
  }

  return `
        <div class="alert-item ${severityClass}">
            <div class="alert-item-header">
                <div class="alert-item-title">
                    <i class="fas fa-server"></i>
                    <strong>${alert.server || "Unknown"}</strong>
                    <span class="alert-severity-badge ${severityClass}">
                        ${
                          alert.severity === "critical" ? "CRITICAL" : "WARNING"
                        }
                    </span>
                </div>
                <span class="alert-timestamp">${timestamp}</span>
            </div>
            <div class="alert-item-body">
                <p class="alert-message">${
                  alert.message || "No message available"
                }</p>
                ${detailsHtml}
                ${progressBar}
            </div>
            <div class="alert-item-footer">
                <button class="alert-action-btn" onclick="showServerDetails('${
                  alert.server
                }')">
                    <i class="fas fa-eye"></i> View Server
                </button>
                ${
                  alert.type === "offline"
                    ? `
                <button class="alert-action-btn" onclick="fetchServerCrashLogs('${alert.server}')">
                    <i class="fas fa-file-alt"></i> View Logs
                </button>
                `
                    : ""
                }
            </div>
        </div>
    `;
}

// ==================== Analytics with Highcharts ====================
function loadAnalytics() {
  fetch(`${API_BASE}/api/analytics`)
    .then((response) => response.json())
    .then((data) => {
      drawAnalyticsCharts(data);
    })
    .catch((error) => {
      console.error("Error loading analytics:", error);
    });
}

function loadAnalyticsByDateRange() {
  const fromDate = document.getElementById("date-from").value;
  const toDate = document.getElementById("date-to").value;

  if (!fromDate || !toDate) {
    alert("Please select both start and end date.");
    return;
  }

  fetch(`${API_BASE}/api/analytics_range?start=${fromDate}&end=${toDate}`)
    .then((res) => res.json())
    .then(drawAnalyticsCharts)
    .catch((e) => {
      console.error("Error fetching analytics data:", e);
      alert("Error fetching analytics data");
    });
}

function drawAnalyticsCharts(data) {
  if (!data || !data.length) {
    document.getElementById("cpuChart").innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">📊 No analytics data available. Data will appear after collecting metrics.</p>';
    document.getElementById("memoryChart").innerHTML =
      '<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">📊 No analytics data available. Data will appear after collecting metrics.</p>';
    return;
  }

  const labels = data.map((d) =>
    new Date(d.timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  const servers = [
    ...new Set(data.flatMap((d) => d.servers.map((s) => s.name))),
  ];

  const colors = [
    "#7cb5ec",
    "#434348",
    "#90ed7d",
    "#f7a35c",
    "#8085e9",
    "#f15c80",
    "#e4d354",
    "#2b908f",
    "#f45b5b",
    "#91e8e1",
  ];

  const cpuSeries = servers.map((serverName, idx) => ({
    name: serverName,
    data: data.map((d) => {
      const s = d.servers.find((s) => s.name === serverName);
      return s && s.cpu !== null ? s.cpu : null;
    }),
    color: colors[idx % colors.length],
    visible: true,
    lineWidth: 2,
    marker: {
      enabled: false,
      states: {
        hover: {
          enabled: true,
          radius: 5,
        },
      },
    },
  }));

  const memSeries = servers.map((serverName, idx) => ({
    name: serverName,
    data: data.map((d) => {
      const s = d.servers.find((s) => s.name === serverName);
      return s && s.memory_percent !== null ? s.memory_percent : null;
    }),
    color: colors[idx % colors.length],
    visible: true,
    lineWidth: 2,
    marker: {
      enabled: false,
      states: {
        hover: {
          enabled: true,
          radius: 5,
        },
      },
    },
  }));

  // CPU Chart
  // CPU Chart
  const cpuChart = Highcharts.chart("cpuChart", {
    chart: {
      type: "line",
      zoomType: "x",
      backgroundColor: "transparent",
      height: null,
      spacingBottom: 80,
      style: {
        fontFamily: "inherit",
      },
    },
    title: { text: null },
    xAxis: {
      categories: labels,
      labels: {
        rotation: -45,
        style: {
          fontSize: "11px",
          color: getComputedStyle(document.body).getPropertyValue(
            "--text-secondary",
          ),
        },
      },
      gridLineColor: "rgba(255, 255, 255, 0.05)",
    },
    yAxis: {
      title: {
        text: "CPU Usage (%)",
        style: {
          color: getComputedStyle(document.body).getPropertyValue(
            "--text-primary",
          ),
        },
      },
      min: 0,
      max: 100,
      gridLineColor: "rgba(255, 255, 255, 0.05)",
      labels: {
        style: {
          color: getComputedStyle(document.body).getPropertyValue(
            "--text-secondary",
          ),
        },
      },
      plotLines: [
        {
          value: 70,
          color: "#f59e0b",
          label: {
            text: "Warning (70%)",
            style: { color: "#f59e0b" },
            align: "right",
            x: -10,
          },
          dashStyle: "ShortDash",
          width: 2,
          zIndex: 5,
        },
        {
          value: 90,
          color: "#ef4444",
          label: {
            text: "Critical (90%)",
            style: { color: "#ef4444" },
            align: "right",
            x: -10,
          },
          dashStyle: "ShortDash",
          width: 2,
          zIndex: 5,
        },
      ],
    },
    legend: {
      enabled: true,
      align: "center",
      verticalAlign: "bottom",
      layout: "horizontal",
      backgroundColor: "transparent",
      itemStyle: {
        color: getComputedStyle(document.body).getPropertyValue(
          "--text-primary",
        ),
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "500",
      },
      itemHoverStyle: {
        color: getComputedStyle(document.body).getPropertyValue("--accent"),
      },
      itemHiddenStyle: {
        color: getComputedStyle(document.body).getPropertyValue(
          "--text-secondary",
        ),
      },
      padding: 20,
      itemMarginBottom: 10,
      y: 20,
      floating: false,
      maxHeight: 100,
    },
    tooltip: {
      shared: true,
      valueSuffix: "%",
      crosshairs: true,
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      borderColor: "rgba(255, 255, 255, 0.2)",
      borderWidth: 1,
      style: {
        color: "#fff",
        fontSize: "13px",
      },
      formatter: function () {
        let tooltip = "<b>" + this.x + "</b><br/>";
        this.points.forEach((point) => {
          if (point.y !== null) {
            tooltip +=
              '<span style="color:' +
              point.color +
              '">●</span> ' +
              point.series.name +
              ": <b>" +
              point.y.toFixed(1) +
              "%</b><br/>";
          }
        });
        return tooltip;
      },
    },
    plotOptions: {
      series: {
        states: {
          hover: {
            lineWidthPlus: 1,
          },
        },
      },
    },
    series: cpuSeries,
    credits: { enabled: false },
  });

  // Memory Chart
  const memoryChart = Highcharts.chart("memoryChart", {
    chart: {
      type: "line",
      zoomType: "x",
      backgroundColor: "transparent",
      height: null,
      spacingBottom: 80,
      style: {
        fontFamily: "inherit",
      },
    },
    title: { text: null },
    xAxis: {
      categories: labels,
      labels: {
        rotation: -45,
        style: {
          fontSize: "11px",
          color: getComputedStyle(document.body).getPropertyValue(
            "--text-secondary",
          ),
        },
      },
      gridLineColor: "rgba(255, 255, 255, 0.05)",
    },
    yAxis: {
      min: 0,
      max: 100,
      title: {
        text: "Memory Usage (%)",
        style: {
          color: getComputedStyle(document.body).getPropertyValue(
            "--text-primary",
          ),
        },
      },
      gridLineColor: "rgba(255, 255, 255, 0.05)",
      labels: {
        style: {
          color: getComputedStyle(document.body).getPropertyValue(
            "--text-secondary",
          ),
        },
      },
      plotLines: [
        {
          value: 75,
          color: "#f59e0b",
          label: {
            text: "Warning (75%)",
            style: { color: "#f59e0b" },
            align: "right",
            x: -10,
          },
          dashStyle: "ShortDash",
          width: 2,
          zIndex: 5,
        },
        {
          value: 90,
          color: "#ef4444",
          label: {
            text: "Critical (90%)",
            style: { color: "#ef4444" },
            align: "right",
            x: -10,
          },
          dashStyle: "ShortDash",
          width: 2,
          zIndex: 5,
        },
      ],
    },
    legend: {
      enabled: true,
      align: "center",
      verticalAlign: "bottom",
      layout: "horizontal",
      backgroundColor: "transparent",
      itemStyle: {
        color: getComputedStyle(document.body).getPropertyValue(
          "--text-primary",
        ),
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "500",
      },
      itemHoverStyle: {
        color: getComputedStyle(document.body).getPropertyValue("--accent"),
      },
      itemHiddenStyle: {
        color: getComputedStyle(document.body).getPropertyValue(
          "--text-secondary",
        ),
      },
      padding: 20,
      itemMarginBottom: 10,
      y: 20,
      floating: false,
      maxHeight: 100,
    },
    tooltip: {
      shared: true,
      valueSuffix: "%",
      crosshairs: true,
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      borderColor: "rgba(255, 255, 255, 0.2)",
      borderWidth: 1,
      style: {
        color: "#fff",
        fontSize: "13px",
      },
      formatter: function () {
        let tooltip = "<b>" + this.x + "</b><br/>";
        this.points.forEach((point) => {
          if (point.y !== null) {
            tooltip +=
              '<span style="color:' +
              point.color +
              '">●</span> ' +
              point.series.name +
              ": <b>" +
              point.y.toFixed(1) +
              "%</b><br/>";
          }
        });
        return tooltip;
      },
    },
    plotOptions: {
      series: {
        states: {
          hover: {
            lineWidthPlus: 1,
          },
        },
      },
    },
    series: memSeries,
    credits: { enabled: false },
  });

  // Event listeners for CPU Chart
  document
    .getElementById("selectAllCpuBtn")
    .addEventListener("click", function () {
      cpuChart.series.forEach((series) => series.show());
    });

  document
    .getElementById("deselectAllCpuBtn")
    .addEventListener("click", function () {
      cpuChart.series.forEach((series) => series.hide());
    });

  // Event listeners for Memory Chart
  document
    .getElementById("selectAllMemBtn")
    .addEventListener("click", function () {
      memoryChart.series.forEach((series) => series.show());
    });

  document
    .getElementById("deselectAllMemBtn")
    .addEventListener("click", function () {
      memoryChart.series.forEach((series) => series.hide());
    });
}

// ==================== User Tracking ====================
// function loadUserTracking() {
//   fetch(`${API_BASE}/api/user_tracking`)
//     .then((res) => res.json())
//     .then((data) => {
//       const container = document.getElementById("user-tracking-container");

//       if (!data.users || !data.users.length) {
//         container.innerHTML = `
//                     <div class="empty-state">
//                         <i class="fas fa-users fa-3x"></i>
//                         <h3>No User Activity Yet</h3>
//                         <p>User SSH tracking data will appear here once users connect to servers.</p>
//                     </div>
//                 `;
//         return;
//       }

//       // Filter out invalid IPs (like :pts/10:S.0, :1, tty2, :0, etc.)
//       const validUsers = data.users.filter((user) => {
//         const ip = user.user_ip;
//         // Check if it's a valid IP format
//         return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
//       });

//       if (validUsers.length === 0) {
//         container.innerHTML = `
//                     <div class="empty-state">
//                         <i class="fas fa-users fa-3x"></i>
//                         <h3>No External User Activity</h3>
//                         <p>Only local/console sessions detected. External SSH connections will appear here.</p>
//                     </div>
//                 `;
//         return;
//       }

//       let html = `
//                 <div class="user-tracking-grid">
//                     ${validUsers
//                       .map((user) => {
//                         const ipDisplay =
//                           IP_NAME_MAP[user.user_ip] || user.user_ip;
//                         const hasName = IP_NAME_MAP[user.user_ip] !== undefined;

//                         return `
//                             <div class="user-card">
//                                 <div class="user-card-header">
//                                     <div class="user-icon">
//                                         <i class="fas fa-user-circle"></i>
//                                     </div>
//                                     <div class="user-info">
//                                         <h3 class="user-name">${
//                                           user.user_name
//                                         }</h3>
//                                         <p class="user-ip">
//                                             ${
//                                               hasName
//                                                 ? `<span class="ip-badge named">${ipDisplay}</span>`
//                                                 : `<span class="ip-badge">${ipDisplay}</span>`
//                                             }
//                                         </p>
//                                     </div>
//                                 </div>

//                                 <div class="user-stats">
//                                     <div class="user-stat">
//                                         <div class="stat-icon">
//                                             <i class="fas fa-server"></i>
//                                         </div>
//                                         <div class="stat-content">
//                                             <div class="stat-value">${
//                                               user.total_servers
//                                             }</div>
//                                             <div class="stat-label">Servers</div>
//                                         </div>
//                                     </div>
//                                     <div class="user-stat">
//                                         <div class="stat-icon">
//                                             <i class="fas fa-clock"></i>
//                                         </div>
//                                         <div class="stat-content">
//                                             <div class="stat-value">${
//                                               user.total_time_hours
//                                             }h</div>
//                                             <div class="stat-label">Total Time</div>
//                                         </div>
//                                     </div>
//                                 </div>

//                                 <div class="server-sessions">
//                                     <h4><i class="fas fa-list"></i> Server Sessions</h4>
//                                    ${user.servers
//                                      .map((srv) => {
//                                        const firstSeen = new Date(
//                                          srv.first_seen
//                                        );
//                                        const lastSeen = new Date(srv.last_seen);
//                                        const duration =
//                                          (lastSeen - firstSeen) / 1000 / 60; // minutes

//                                        return `
//                                             <div class="session-item">
//                                                 <div class="session-header">
//                                                     <span class="server-name">${
//                                                       srv.server_name
//                                                     }</span>
//                                                     <span class="session-count">${
//                                                       srv.session_count
//                                                     } ${
//                                          srv.session_count === 1
//                                            ? "session"
//                                            : "sessions"
//                                        }</span>
//                                                 </div>
//                                                 <div class="session-details">
//                                                     <div class="session-time">
//                                                         <i class="fas fa-sign-in-alt"></i>
//                                                         Login: ${firstSeen.toLocaleString()}
//                                                     </div>
//                                                     <div class="session-time">
//                                                         <i class="fas fa-clock"></i>
//                                                         Last Seen: ${lastSeen.toLocaleString()}
//                                                     </div>
//                                                     <div class="session-time">
//                                                         <i class="fas fa-hourglass-half"></i>
//                                                         Duration: ${duration.toFixed(
//                                                           1
//                                                         )} minutes
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         `;
//                                      })
//                                      .join("")}
//                                 </div>
//                             </div>
//                         `;
//                       })
//                       .join("")}
//                 </div>
//             `;

//       container.innerHTML = html;
//     })
//     .catch((error) => {
//       console.error("Error loading user tracking:", error);
//       document.getElementById("user-tracking-container").innerHTML = `
//                 <div class="error-state">
//                     <i class="fas fa-exclamation-triangle fa-3x"></i>
//                     <h3>Error Loading Data</h3>
//                     <p>Failed to load user tracking information.</p>
//                 </div>
//             `;
//     });
// }
function loadUserTracking() {
  fetch(`${API_BASE}/api/user_tracking`)
    .then((res) => res.json())
    .then((data) => {
      const container = document.getElementById("user-tracking-container");

      if (!data.users || !data.users.length) {
        container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-users fa-3x"></i>
                        <h3>No User Activity Yet</h3>
                        <p>User SSH tracking data will appear here once users connect to servers.</p>
                    </div>
                `;
        return;
      }

      // ✅ Filter valid IPs
      const validUsers = data.users.filter((user) => {
        const ip = user.user_ip || "";
        return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
      });

      if (validUsers.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-users fa-3x"></i>
                        <h3>No External User Activity</h3>
                        <p>Only local/console sessions detected. External SSH connections will appear here.</p>
                    </div>
                `;
        return;
      }

      let html = `<div class="user-tracking-grid">`;

      validUsers.forEach((user) => {
        // ✅ Get name from IP_NAME_MAP or use username
        const displayName = IP_NAME_MAP[user.user_ip] || user.username;
        const showBothNames =
          IP_NAME_MAP[user.user_ip] &&
          IP_NAME_MAP[user.user_ip] !== user.username;

        html += `
                    <div class="user-card">
                        <div class="user-card-header">
                            <div class="user-icon">
                                <i class="fas fa-user-circle"></i>
                            </div>
                            <div class="user-info">
                                <h3 class="user-name">${displayName}</h3>
                                ${
                                  showBothNames
                                    ? `<p class="user-ip"><span class="ip-badge secondary">${user.username}</span></p>`
                                    : ""
                                }
                                <p class="user-ip">
                                    <span class="ip-badge">${
                                      user.user_ip
                                    }</span>
                                </p>
                            </div>
                        </div>
                        
                        <div class="user-stats">
                            <div class="user-stat">
                                <div class="stat-icon"><i class="fas fa-server"></i></div>
                                <div class="stat-content">
                                    <div class="stat-value">${
                                      user.total_servers
                                    }</div>
                                    <div class="stat-label">Servers</div>
                                </div>
                            </div>
                            <div class="user-stat">
                                <div class="stat-icon"><i class="fas fa-clock"></i></div>
                                <div class="stat-content">
                                    <div class="stat-value">${Math.floor(
                                      user.total_time_hours,
                                    )}h ${Math.floor(
                                      (user.total_time_hours % 1) * 60,
                                    )}m</div>
                                    <div class="stat-label">Total Time</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="server-sessions">
                            <h4><i class="fas fa-list"></i> Server Sessions</h4>
                            ${user.servers
                              .map((srv) => {
                                const firstSeen = new Date(srv.first_seen);
                                const lastSeen = new Date(srv.last_seen);

                                return `
                                    <div class="session-item">
                                        <div class="session-header">
                                            <span class="server-name">${
                                              srv.server_name
                                            }</span>
                                            <span class="session-count">${
                                              srv.session_count
                                            } ${
                                              srv.session_count === 1
                                                ? "session"
                                                : "sessions"
                                            }</span>
                                        </div>
                                        <div class="session-details">
                                            <div class="session-time">
                                                <i class="fas fa-sign-in-alt"></i> First: ${firstSeen.toLocaleDateString()}, ${firstSeen.toLocaleTimeString()}
                                            </div>
                                            <div class="session-time">
                                                <i class="fas fa-clock"></i> Last: ${lastSeen.toLocaleDateString()}, ${lastSeen.toLocaleTimeString()}
                                            </div>
                                            <div class="session-time">
                                                <i class="fas fa-hourglass-half"></i> Total Time: ${Math.floor(
                                                  srv.time_spent_hours,
                                                )}h ${Math.floor(
                                                  (srv.time_spent_hours % 1) *
                                                    60,
                                                )}m
                                            </div>
                                        </div>
                                    </div>
                                `;
                              })
                              .join("")}
                        </div>
                    </div>
                `;
      });

      html += `</div>`;
      container.innerHTML = html;
    })
    .catch((error) => {
      console.error("Error loading user tracking:", error);
      document.getElementById("user-tracking-container").innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle fa-3x"></i>
                    <h3>Error Loading Data</h3>
                    <p>Failed to load user tracking information.</p>
                </div>
            `;
    });
}

// 🔥 Helper function to format duration nicely
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// 🔥 Auto-refresh every 10 seconds for real-time updates
setInterval(() => {
  if (document.getElementById("user-tracking-container")) {
    loadUserTracking();
  }
}, 10000); // Refresh every 10 seconds

// ==================== All Servers ====================
function loadAllServers() {
  fetch(`${API_BASE}/api/status`)
    .then((response) => response.json())
    .then((data) => {
      const container = document.getElementById("all-servers-list");
      container.innerHTML = `
                <div class="servers-grid">
                    ${data.servers
                      .map((server) => {
                        const memory = validateMemoryData(server.memory);
                        const cpuStatus = getCPUStatus(server.cpu);
                        const cpuValue =
                          server.cpu !== null && server.cpu !== undefined
                            ? server.cpu.toFixed(1) + "%"
                            : "N/A";
                        const cpuPercent = server.cpu || 0;

                        const memValue = memory
                          ? calculateMemoryPercent(
                              memory.used,
                              memory.total,
                            ).toFixed(1) + "%"
                          : "N/A";
                        const memPercent = memory
                          ? calculateMemoryPercent(memory.used, memory.total)
                          : 0;
                        const memStatus = memory ? memory.status : "";

                        // Get ROOT storage
                        let storageValue = "N/A";
                        let storagePercent = 0;
                        let storageStatus = "";

                        if (server.storage && server.storage.length > 0) {
                          const rootStorage = server.storage.find(
                            (s) =>
                              s.mountpoint === "/" || s.mountpoint === "/root",
                          );
                          if (
                            rootStorage &&
                            rootStorage.percent !== null &&
                            rootStorage.percent !== undefined
                          ) {
                            storagePercent = rootStorage.percent;
                            storageValue = storagePercent.toFixed(1) + "%";
                            storageStatus = rootStorage.status || "";
                          }
                        }

                        // Blink classes
                        const cpuBlinkClass =
                          cpuPercent >= 90
                            ? "blink-critical"
                            : cpuPercent >= 70
                              ? "blink-warning"
                              : "";
                        const memBlinkClass =
                          memPercent >= 90
                            ? "blink-critical"
                            : memPercent >= 75
                              ? "blink-warning"
                              : "";
                        const storageBlinkClass =
                          storagePercent >= 90
                            ? "blink-critical"
                            : storagePercent >= 80
                              ? "blink-warning"
                              : "";

                        const _sClass =
                          server.status === "ssh_unreachable"
                            ? "ssh-unreachable"
                            : server.status;
                        const _sBadge =
                          server.status === "ssh_unreachable"
                            ? "⚠ SSH UNREACHABLE"
                            : server.status;
                        return;
                        `<div class="server-card ${_sClass}" onclick="showServerDetails('${server.name}')">
                            <div class="server-header">
                                <h3>${server.name}</h3>
                                <span class="status-badge ${server.status === "ssh_unreachable" ? "ssh-unreachable" : server.status}">${_sBadge}</span>
                            </div>
                                <div class="server-stats">
                                    <div class="stat ${cpuBlinkClass}">
                                        <span class="stat-label">CPU</span>
                                        <span class="stat-value ${cpuStatus}">${cpuValue}</span>
                                    </div>
                                    <div class="stat ${memBlinkClass}">
                                        <span class="stat-label">Memory</span>
                                        <span class="stat-value ${memStatus}">${memValue}</span>
                                    </div>
                                    <div class="stat ${storageBlinkClass}">
                                        <span class="stat-label">Storage</span>
                                        <span class="stat-value ${storageStatus}">${storageValue}</span>
                                    </div>
                                </div>
                            </div>
                        `;
                      })
                      .join("")}
                </div>
            `;
    });
}

// ==================== Loading ====================
function showLoading() {
  document.getElementById("loading").classList.add("show");
}

function hideLoading() {
  document.getElementById("loading").classList.remove("show");
}

// ==================== Search ====================
function initSearch() {
  const searchInput = document.getElementById("serverSearch");
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    const cards = document.querySelectorAll(".server-card");

    cards.forEach((card) => {
      const name = card.querySelector("h3").textContent.toLowerCase();
      if (name.includes(query)) {
        card.style.display = "block";
      } else {
        card.style.display = "none";
      }
    });
  });
}

// ==================== FILTERED SERVER VIEWS ====================
// Initialize global variable
if (typeof window.currentServersData === "undefined") {
  window.currentServersData = [];
}

// Filter and display servers (for clickable cards)
function filterServers(type) {
  const servers = window.currentServersData || [];
  console.log("Filtering:", type, "Available servers:", servers.length);

  if (servers.length === 0) {
    alert("No server data available yet. Please wait for data to load.");
    return;
  }

  const filteredView = document.getElementById("filtered-view");
  const serversContainer = document.getElementById("servers-container");
  const statsOverview = document.querySelector(".stats-overview-extended");
  const filteredServersContainer = document.getElementById(
    "filtered-servers-container",
  );
  const filteredTitle = document.getElementById("filtered-title");

  let filteredServers = [];
  let title = "";

  switch (type) {
    case "all":
      filteredServers = [...servers];
      title = `All Servers (${filteredServers.length})`;
      break;
    case "online":
      filteredServers = servers.filter((s) => s.status === "online");
      title = `Online Servers (${filteredServers.length})`;
      break;
    case "alerts":
      filteredServers = servers.filter((s) => {
        if (s.status === "offline") return true;
        if (s.status === "ssh_unreachable") return true;
        if (s.cpu && s.cpu > 75) return true;
        if (s.memory && s.memory.usage_percent > 75) return true;
        if (s.storage && Array.isArray(s.storage)) {
          for (let storage of s.storage) {
            if (
              (storage.mountpoint === "/" || storage.mountpoint === "root") &&
              storage.percent > 75
            ) {
              return true;
            }
          }
        }
        return false;
      });
      title = `Servers with Alerts (${filteredServers.length})`;
      break;
  }

  console.log("Filtered result:", filteredServers.length, "servers");
  filteredTitle.textContent = title;

  // Group servers
  const groups = {};
  filteredServers.forEach((server) => {
    const group = server.group || "default";
    if (!groups[group]) groups[group] = [];
    groups[group].push(server);
  });

  // Render filtered servers
  filteredServersContainer.innerHTML = "";

  if (filteredServers.length === 0) {
    filteredServersContainer.innerHTML = `
            <div style="text-align: center; padding: 4rem; color: var(--text-secondary);">
                <i class="fas fa-inbox fa-4x" style="margin-bottom: 1rem; opacity: 0.5;"></i>
                <h3>No servers found</h3>
                <p>There are no servers matching this filter.</p>
            </div>
        `;
  } else {
    Object.keys(groups).forEach((groupName) => {
      const groupSection = createGroupSection(groupName, groups[groupName]);

      // Add online indicator for online filter
      if (type === "online") {
        const cards = groupSection.querySelectorAll(".server-card");
        cards.forEach((card) => {
          const header = card.querySelector(".server-header h3");
          if (header) {
            const indicator = document.createElement("span");
            indicator.className = "online-indicator";
            header.insertBefore(indicator, header.firstChild);
          }
        });
      }

      filteredServersContainer.appendChild(groupSection);
    });
  }

  // Show/hide appropriate containers
  if (statsOverview) statsOverview.style.display = "none";
  if (serversContainer) serversContainer.style.display = "none";
  if (filteredView) filteredView.style.display = "block";
}

// Close filtered view and return to dashboard
function closeFilteredView() {
  const filteredView = document.getElementById("filtered-view");
  const serversContainer = document.getElementById("servers-container");
  const statsOverview = document.querySelector(".stats-overview-extended");

  if (filteredView) filteredView.style.display = "none";
  if (statsOverview) statsOverview.style.display = "grid";
  if (serversContainer) serversContainer.style.display = "block";
}

function parseStorageToBytes(storageStr) {
  // ✅ FIX: If already a number (bytes), return it directly
  if (typeof storageStr === "number") {
    return storageStr;
  }

  if (!storageStr || typeof storageStr !== "string") return 0;

  const str = String(storageStr).trim().toUpperCase();

  // Extract number and unit
  const match = str.match(/^([\d.]+)\s*([KMGTPEZY]?)(I?)(B?)$/);
  if (!match) {
    console.warn("Cannot parse storage:", storageStr);
    return 0;
  }

  const value = parseFloat(match[1]);
  const unit = match[2];
  const base = 1024;

  const units = {
    "": 1,
    K: base,
    M: base * base,
    G: base * base * base,
    T: base * base * base * base,
    P: base * base * base * base * base,
    E: base * base * base * base * base * base,
  };

  const multiplier = units[unit] || 1;
  return Math.floor(value * multiplier);
}

// ==================== Audio Alerts ====================
// Replace this URL with your hosted IGI alarm sound file
const dangerSoundUrl =
  "https://actions.google.com/sounds/v1/alarms/spaceship_alarm.ogg"; // Placeholder
const dangerAlarm = new Audio(dangerSoundUrl);
dangerAlarm.volume = 1.0;
let lastAlarmTime = 0;
const ALARM_COOLDOWN = 10000; // Prevent spam: Wait 10 seconds before playing again

function playDangerAlarm() {
  const now = Date.now();
  if (now - lastAlarmTime > ALARM_COOLDOWN) {
    // The catch block handles browser autoplay restrictions
    dangerAlarm
      .play()
      .then(() => {
        lastAlarmTime = now;
        console.log("🚨 100% Critical Alert: Playing danger sound!");
      })
      .catch((error) => {
        console.warn(
          "Audio blocked by browser. User must click the page first.",
          error,
        );
      });
  }
}

function showDashboardLoading() {
  const container = document.getElementById("servers-container");
  if (!container) return;

  container.innerHTML = `
        <div class="loading-state">
            <div class="loading-animation-container">
                <div class="server-icon-wrapper left">
                    <i class="fas fa-server"></i>
                </div>
                <div class="data-flow-line">
                    <div class="data-packet"></div>
                    <div class="data-packet"></div>
                    <div class="data-packet"></div>
                </div>
                <div class="server-icon-wrapper right">
                    <i class="fas fa-server"></i>
                </div>
            </div>
            <h3>Synchronizing Server Data...</h3>
            <p>Establishing connections and gathering metrics...</p>
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
}

// ==================== Initialize ====================
// document.addEventListener("DOMContentLoaded", () => {
//   initNavigation();
//   initSidebarToggle();
//   initThemeSwitcher();
//   initSearch();
//   loadSettings();

//   updateTimeDisplay();
//   updateServers();
//   showDashboardLoading();

//   setInterval(updateTimeDisplay, 1000);
//   window.refreshTimer = setInterval(updateServers, refreshInterval);

//   document.getElementById("server-modal").addEventListener("click", (e) => {
//     if (e.target.id === "server-modal") {
//       closeModal();
//     }
//   });
// });

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initSidebarToggle();
  initThemeSwitcher();
  initSearch();
  loadSettings();

  updateTimeDisplay();
  updateServers();
  showDashboardLoading();

  // 1. Call it immediately so the user doesn't wait 10 seconds to see the first batch
  loadAlerts();

  setInterval(updateTimeDisplay, 1000);
  window.refreshTimer = setInterval(updateServers, refreshInterval);

  // 2. Set it to run every 10 seconds (10,000 milliseconds)
  window.alertsTimer = setInterval(loadAlerts, 10000);

  document.getElementById("server-modal").addEventListener("click", (e) => {
    if (e.target.id === "server-modal") {
      closeModal();
    }
  });
});
