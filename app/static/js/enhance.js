// ============================================
// Enhanced Monitoring - Filter Network Mounts
// Only shows server's INTERNAL storage
// ============================================

const serverStates = new Map();
const criticalServers = new Set();
let alertBannerTimeout = null;

// Filter out network/external mounts - only keep internal storage
function filterInternalStorage(storageArray) {
    if (!storageArray || !Array.isArray(storageArray)) return [];
    
    // Patterns for NETWORK/EXTERNAL mounts to EXCLUDE
    const externalPatterns = [
        /^\/mnt\//,           // /mnt/anything
        /^\/vol/,             // /vol1, /vol2_159, etc.
        /^\/vedas_pools\//,   // /vedas_pools/master/pool1, etc.
        /^\/netapp/,          // /netapp_6233_ssd, etc.
        /^\/home\/sac\//,     // /home/sac/vol1_159, /home/sac/67_data, etc.
        /^\/home\/isro\//,    // /home/isro/infortrend_nas_nlsas6, etc.
        /\/(67_data|115_data|Pix2Poly)/,  // Specific project mounts
        /^\/vol\d+/,          // /vol2_159, /vol3_102, etc.
        /^\/home_\d+/,        // /home_137, etc.
    ];
    
    // Patterns for INTERNAL mounts to KEEP
    const internalPatterns = [
        /^\/$/,               // Root
        /^\/boot/,            // /boot
        /^\/home$/,           // /home (but NOT /home/sac/*, /home/isro/*)
        /^\/var/,             // /var, /var/log, etc.
        /^\/tmp/,             // /tmp
        /^\/usr/,             // /usr
        /^\/opt/,             // /opt
    ];
    
    return storageArray.filter(storage => {
        const mount = storage.mountpoint;
        
        // Check if it matches INTERNAL patterns
        const isInternal = internalPatterns.some(pattern => pattern.test(mount));
        
        // Check if it matches EXTERNAL patterns
        const isExternal = externalPatterns.some(pattern => pattern.test(mount));
        
        // Keep only if:
        // - It matches internal patterns AND doesn't match external patterns
        // - OR it's root (/)
        return (isInternal && !isExternal) || mount === '/';
    });
}

// Track server state with FILTERED storage
function trackServerState(server) {
    const serverName = server.name;
    const previousState = serverStates.get(serverName);
    
    let currentState = 'normal';
    let stateReason = '';
    
    if (server.status === 'offline') {
        currentState = 'offline';
        stateReason = 'Server offline';
    } else {
        // Check CPU
        if (server.cpu >= 90) {
            currentState = 'critical';
            stateReason = `CPU critical: ${server.cpu.toFixed(1)}`;
        } else if (server.cpu >= 75 && currentState === 'normal') {
            currentState = 'warning';
            stateReason = `CPU warning: ${server.cpu.toFixed(1)}`;
        }
        
        // Check Memory
        if (server.memory && server.memory.used && server.memory.total) {
            const memPercent = calculateMemoryPercent(server.memory.used, server.memory.total);
            if (memPercent >= 90) {
                currentState = 'critical';
                stateReason = `Memory critical: ${memPercent.toFixed(1)}`;
            } else if (memPercent >= 75 && currentState === 'normal') {
                currentState = 'warning';
                stateReason = `Memory warning: ${memPercent.toFixed(1)}`;
            }
        }
        
        // Check ONLY INTERNAL storage partitions
        const internalStorage = filterInternalStorage(server.storage);
        if (internalStorage && internalStorage.length > 0) {
            for (const storage of internalStorage) {
                if (storage.percent >= 90) {
                    currentState = 'critical';
                    stateReason = `Storage critical: ${storage.mountpoint} (${storage.percent.toFixed(1)})`;
                    break;
                } else if (storage.percent >= 80) {
                    if (currentState !== 'critical') {
                        currentState = 'warning';
                        stateReason = `Storage warning: ${storage.mountpoint} (${storage.percent.toFixed(1)})`;
                    }
                }
            }
        }
    }
    
    const timestamp = new Date();
    
    if (!previousState) {
        serverStates.set(serverName, {
            current: currentState,
            previous: null,
            timestamp: timestamp,
            history: [{ state: currentState, timestamp, reason: stateReason }]
        });
    } else {
        if (previousState.current !== currentState) {
            const history = previousState.history || [];
            history.push({ state: currentState, timestamp, reason: stateReason });
            
            if (history.length > 20) {
                history.shift();
            }
            
            serverStates.set(serverName, {
                current: currentState,
                previous: previousState.current,
                timestamp: timestamp,
                history: history,
                transition: `${previousState.current} → ${currentState}`
            });
            
            if (shouldShowCriticalBanner(previousState, currentState)) {
                criticalServers.add(serverName);
                showCriticalAlertBanner();
                
                if (currentState === 'offline' && previousState.current !== 'offline') {
                    setTimeout(() => fetchServerCrashLogs(serverName), 1000);
                }
            }
        } else {
            serverStates.set(serverName, {
                ...previousState,
                timestamp: timestamp
            });
        }
    }
    
    // Manage critical servers set
    if (currentState === 'critical' || currentState === 'offline') {
        criticalServers.add(serverName);
    } else {
        criticalServers.delete(serverName);
    }
    
    return {
        current: currentState,
        previous: previousState ? previousState.current : null,
        changed: previousState && previousState.current !== currentState,
        history: serverStates.get(serverName).history
    };
}

function shouldShowCriticalBanner(previousState, currentState) {
    const criticalTransitions = [
        ['warning', 'critical'],
        ['warning', 'offline'],
        ['critical', 'offline'],
        ['normal', 'critical'],
        ['normal', 'offline']
    ];
    
    return criticalTransitions.some(([from, to]) => 
        previousState.current === from && currentState === to
    );
}

// ============================================
// CRITICAL ALERT BANNER
// ============================================

function showCriticalAlertBanner() {
    let banner = document.getElementById('critical-alert-banner');
    if (!banner) {
        createCriticalBanner();
        banner = document.getElementById('critical-alert-banner');
    }
    
    updateCriticalBannerContent();
    
    banner.classList.add('active', 'blink-animation');
    document.body.classList.add('has-critical-banner');
    
    if (alertBannerTimeout) clearTimeout(alertBannerTimeout);
    alertBannerTimeout = setTimeout(() => {
        banner.classList.remove('blink-animation');
    }, 10000);
}

function createCriticalBanner() {
    const banner = document.createElement('div');
    banner.id = 'critical-alert-banner';
    banner.className = 'critical-alert-banner';
    banner.innerHTML = `
        <div class="critical-banner-content">
            <i class="fas fa-exclamation-triangle critical-banner-icon"></i>
            <div class="critical-banner-text">
                <div class="critical-banner-title" id="critical-banner-title"></div>
                <div class="critical-banner-servers" id="critical-banner-servers"></div>
            </div>
        </div>
        <div class="critical-banner-actions">
            <button class="critical-banner-btn" onclick="viewCriticalServers()">
                <i class="fas fa-eye"></i> View Details
            </button>
            <button class="critical-banner-btn" onclick="viewAllLogs()">
                <i class="fas fa-file-alt"></i> View Logs
            </button>
        </div>
        <button class="critical-banner-close" onclick="hideCriticalBanner()">
            <i class="fas fa-times"></i>
        </button>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
}

function updateCriticalBannerContent() {
    const titleEl = document.getElementById('critical-banner-title');
    const serversEl = document.getElementById('critical-banner-servers');
    
    if (!titleEl || !serversEl) return;
    
    const count = criticalServers.size;
    if (count === 0) {
        hideCriticalBanner();
        return;
    }
    
    titleEl.textContent = `⚠️ ${count} Server${count > 1 ? 's' : ''} in Critical State!`;
    
    const serverList = Array.from(criticalServers).map(name => {
        const state = serverStates.get(name);
        return `<strong>${name}</strong> (${state ? state.current : 'unknown'})`;
    }).join(' • ');
    
    serversEl.innerHTML = serverList;
}

function hideCriticalBanner() {
    const banner = document.getElementById('critical-alert-banner');
    if (banner) {
        banner.classList.remove('active', 'blink-animation');
    }
    document.body.classList.remove('has-critical-banner');
}

function viewCriticalServers() {
    const dashboardNav = document.querySelector('[data-page="dashboard"]');
    if (dashboardNav) {
        dashboardNav.click();
        setTimeout(() => {
            const criticalGroup = document.querySelector('.critical-group');
            if (criticalGroup) {
                criticalGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
    }
}

function viewAllLogs() {
    const servers = Array.from(criticalServers);
    if (servers.length > 0) {
        fetchServerCrashLogs(servers[0]);
    }
}

// ============================================
// STORAGE ALERTS - INTERNAL ONLY
// ============================================

function getStorageAlertDetails(server) {
    if (!server || !server.storage || server.storage.length === 0) return null;
    
    // Filter to ONLY internal storage
    const internalStorage = filterInternalStorage(server.storage);
    
    const alerts = { critical: [], warning: [] };
    
    internalStorage.forEach(storage => {
        if (storage.percent >= 90) {
            alerts.critical.push(storage);
        } else if (storage.percent >= 80) {
            alerts.warning.push(storage);
        }
    });
    
    if (alerts.critical.length === 0 && alerts.warning.length === 0) {
        return null;
    }
    
    return alerts;
}

function renderStorageAlertDetails(alerts, server) {
    if (!alerts || !server || (alerts.critical.length === 0 && alerts.warning.length === 0)) {
        return '';
    }
    
    const severity = alerts.critical.length > 0 ? 'critical' : 'warning';
    const items = [...alerts.critical, ...alerts.warning];
    
    const escapeForOnclick = (str) => {
        return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    };
    
    return `
        <div class="storage-alert-details ${severity}">
            <div class="storage-alert-title ${severity}">
                <i class="fas fa-hdd"></i>
                Storage Alert - ${items.length} Partition${items.length > 1 ? 's' : ''}
            </div>
            <div class="storage-alert-items">
                ${items.map(storage => `
                    <div class="storage-alert-item">
                        <span class="storage-mountpoint">
                            <i class="fas fa-folder"></i> ${storage.mountpoint}
                        </span>
                        <div class="storage-usage-bar">
                            <div class="storage-usage-progress">
                                <div class="storage-usage-fill ${storage.percent >= 90 ? 'critical' : 'warning'}" 
                                     style="width: ${storage.percent}%"></div>
                            </div>
                            <span class="storage-usage-value">${storage.percent.toFixed(1)}%</span>
                        </div>
                        <button class="storage-analyze-inline-btn" 
                                onclick="event.stopPropagation(); analyzeStorage('${escapeForOnclick(server.name)}', '${escapeForOnclick(storage.mountpoint)}')">
                            <i class="fas fa-search-plus"></i> Analyze
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}


// ============================================
// LOGS VIEWER
// ============================================

function fetchServerCrashLogs(serverName) {
    showLogsModal(serverName);
    
    fetch(`${API_BASE}/api/server_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            server: serverName,
            lines: 200,
            filter: 'error'
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || `Server returned ${response.status}`);
            }).catch(() => {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            displayLogs(data.logs, serverName);
        } else {
            displayLogsError(data.error || 'Failed to fetch logs');
        }
    })
    .catch(error => {
        console.error('Error fetching logs:', error);
        displayLogsError(`Connection error: ${error.message}`);
    });
}

function showLogsModal(serverName) {
    let modal = document.getElementById('logs-modal-overlay');
    if (!modal) {
        modal = createLogsModal();
    }
    
    document.getElementById('logs-modal-server-name').textContent = serverName;
    document.getElementById('logs-container').innerHTML = `
        <div class="logs-empty-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Fetching logs from ${serverName}...</p>
        </div>
    `;
    
    modal.classList.add('active');
}

function createLogsModal() {
    const modal = document.createElement('div');
    modal.id = 'logs-modal-overlay';
    modal.className = 'logs-modal-overlay';
    modal.innerHTML = `
        <div class="logs-modal">
            <div class="logs-modal-header">
                <div class="logs-modal-title">
                    <i class="fas fa-file-alt"></i>
                    <span>Server Logs: <strong id="logs-modal-server-name"></strong></span>
                </div>
                <button class="logs-modal-close" onclick="closeLogsModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="logs-modal-filters">
                <input type="text" id="logs-search-input" class="logs-filter-input" 
                       placeholder="Search logs..." onkeyup="filterLogs(this.value)">
                <button class="logs-filter-btn" onclick="refreshLogs()">
                    <i class="fas fa-sync"></i> Refresh
                </button>
            </div>
            <div class="logs-modal-content">
                <div id="logs-container" class="logs-container"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeLogsModal();
    });
    
    return modal;
}

function displayLogs(logs, serverName) {
    const container = document.getElementById('logs-container');
    if (!logs || logs.length === 0) {
        container.innerHTML = `
            <div class="logs-empty-state">
                <i class="fas fa-check-circle"></i>
                <h3>No Critical Logs Found</h3>
                <p>No errors or warnings detected.</p>
            </div>
        `;
        return;
    }
    
    const html = logs.map((log, index) => {
        const level = detectLogLevel(log);
        const parts = parseLogEntry(log);
        
        return `
            <div class="log-entry" data-level="${level}">
                ${parts.timestamp ? `<span class="log-timestamp">${parts.timestamp}</span>` : ''}
                <span class="log-level ${level}">${level.toUpperCase()}</span>
                <span class="log-message ${parts.highlight ? 'highlight' : ''}">${escapeHtml(parts.message)}</span>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

function parseLogEntry(log) {
    const timestampMatch = log.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})|^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    const timestamp = timestampMatch ? timestampMatch[0] : null;
    let message = timestamp ? log.substring(timestamp.length).trim() : log;
    
    const criticalKeywords = ['error', 'fail', 'crash', 'killed', 'segfault', 'fatal', 'panic', 'oom'];
    const highlight = criticalKeywords.some(kw => message.toLowerCase().includes(kw));
    
    return { timestamp, message, highlight };
}

function detectLogLevel(log) {
    const logLower = log.toLowerCase();
    if (logLower.includes('error') || logLower.includes('fail') || logLower.includes('fatal') || logLower.includes('crit')) {
        return 'error';
    } else if (logLower.includes('warn')) {
        return 'warning';
    }
    return 'info';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeLogsModal() {
    const modal = document.getElementById('logs-modal-overlay');
    if (modal) {
        modal.classList.remove('active');
    }
}

function filterLogs(searchText) {
    const entries = document.querySelectorAll('.log-entry');
    entries.forEach(entry => {
        const message = entry.textContent.toLowerCase();
        const matches = !searchText || message.includes(searchText.toLowerCase());
        entry.style.display = matches ? 'block' : 'none';
    });
}

function refreshLogs() {
    const serverName = document.getElementById('logs-modal-server-name').textContent;
    fetchServerCrashLogs(serverName);
}

function displayLogsError(error) {
    const container = document.getElementById('logs-container');
    container.innerHTML = `
        <div class="logs-empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Failed to Load Logs</h3>
            <p>${escapeHtml(error)}</p>
        </div>
    `;
}

// ============================================
// ENHANCED updateServers
// ============================================

window.updateServers = function() {
    fetch(`${API_BASE}/api/status`)
        .then(response => response.json())
        .then(data => {
            // ✅ CRITICAL FIX: Store servers data for filtering
            window.currentServersData = data.servers || [];
            console.log('✅ Enhanced: Stored', window.currentServersData.length, 'servers');
            
            // Track states
            data.servers.forEach(server => {
                const stateInfo = trackServerState(server);
                server._stateInfo = stateInfo;
            });
            
            updateStats(data.servers);
            
            // Separate critical servers
            const criticalServersList = [];
            const normalGroups = {};
            
            data.servers.forEach(server => {
                if (!showOfflineServers && server.status === 'offline') return;
                
                const stateInfo = server._stateInfo;
                if (stateInfo && (stateInfo.current === 'critical' || stateInfo.current === 'offline')) {
                    criticalServersList.push(server);
                } else {
                    const group = server.group || 'default';
                    if (!normalGroups[group]) normalGroups[group] = [];
                    normalGroups[group].push(server);
                }
            });
            
            // Render
            const container = document.getElementById('servers-container');
            container.innerHTML = '';

            // Critical group first
            if (criticalServersList.length > 0) {
                const criticalGroup = createCriticalGroupSection(criticalServersList);
                container.appendChild(criticalGroup);
                
                // ✨ ADD SEPARATOR BETWEEN CRITICAL AND NORMAL SERVERS
                if (Object.keys(normalGroups).length > 0) {
                    const separator = createServersSeparator(Object.keys(normalGroups).length);
                    container.appendChild(separator);
                }
            }

            // Normal groups
            Object.keys(normalGroups).forEach(groupName => {
                const groupSection = createGroupSection(groupName, normalGroups[groupName]);
                container.appendChild(groupSection);
            });

            
            // Update banner
            if (criticalServers.size > 0) {
                showCriticalAlertBanner();
            } else {
                hideCriticalBanner();
            }
        })
        .catch(error => {
            console.error('Error fetching servers:', error);
        });
};

// Create critical servers group
function createCriticalGroupSection(servers) {
    const section = document.createElement('div');
    section.className = 'server-group critical-group';
    
    section.innerHTML = `
        <div class="group-header">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <i class="fas fa-exclamation-triangle" style="color: var(--danger); animation: pulse 2s infinite;"></i>
                <h2 style="color: var(--danger);">⚠️ CRITICAL SERVERS</h2>
            </div>
            <span class="server-count" style="background: rgba(239, 68, 68, 0.2); color: var(--danger); border: 1px solid var(--danger);">
                ${servers.length} server${servers.length !== 1 ? 's' : ''}
            </span>
        </div>
        <div class="servers-grid" id="group-critical"></div>
    `;
    
    const grid = section.querySelector('.servers-grid');
    servers.forEach(server => {
        const card = createServerCard(server);
        grid.appendChild(card);
    });
    
    return section;
}


// Create separator between critical and normal servers
function createServersSeparator(normalServerCount) {
    const separator = document.createElement('div');
    separator.className = 'servers-separator';
    
    separator.innerHTML = `
        <div class="servers-separator-text">
            <i class="fas fa-server"></i>
            <span>All Servers (${normalServerCount} Groups)</span>
        </div>
    `;
    
    return separator;
}

// Alternative: Simple icon separator
function createSimpleSeparator() {
    const separator = document.createElement('div');
    separator.className = 'servers-divider';
    separator.innerHTML = `
        <div class="servers-divider-icon">
            <i class="fas fa-grip-lines"></i>
        </div>
    `;
    return separator;
}


// Export functions
window.trackServerState = trackServerState;
window.showCriticalAlertBanner = showCriticalAlertBanner;
window.hideCriticalBanner = hideCriticalBanner;
window.viewCriticalServers = viewCriticalServers;
window.viewAllLogs = viewAllLogs;
window.getStorageAlertDetails = getStorageAlertDetails;
window.renderStorageAlertDetails = renderStorageAlertDetails;
window.fetchServerCrashLogs = fetchServerCrashLogs;
window.closeLogsModal = closeLogsModal;
window.filterLogs = filterLogs;
window.refreshLogs = refreshLogs;
window.filterInternalStorage = filterInternalStorage;

console.log('✓ Enhanced monitoring loaded - INTERNAL STORAGE ONLY');
