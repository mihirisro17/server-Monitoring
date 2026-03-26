class AlertNotificationSystem {
    constructor() {
        this.setupElements();
        this.setupEventListeners();
        this.startUpdateCycle();
    }

    setupElements() {
        this.notifyBtn = document.getElementById('alertNotifyBtn');
        this.notifyCount = document.getElementById('alertNotifyCount');
        this.notifyModal = document.getElementById('alertNotifyModal');
        this.alertList = document.getElementById('alertNotifyList');
        this.totalServersElement = document.getElementById('totalServersCount');
        this.alertServersElement = document.getElementById('alertServersCount');
    }

    setupEventListeners() {
        // Open main modal
        if (this.notifyBtn) {
            this.notifyBtn.addEventListener('click', () => this.openModal());
        }

        // Close modals with X button
        document.querySelectorAll('.alert-notify-close').forEach(btn => {
            btn.addEventListener('click', (e) => this.closeModal(e));
        });

        // Close modals with Esc key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('alert-notify-modal') ||
                e.target.classList.contains('alert-detail-modal')) {
                this.closeAllModals();
            }
        });
    }

    getDangerLevel(alert) {
        const thresholds = {
            CPU: { high: 90, medium: 75 },
            Memory: { high: 90, medium: 75 },
            Storage: { high: 90, medium: 75 }
        };

        if (alert.type === 'Offline') return 'critical';
        
        const value = parseFloat(alert.message.match(/\d+(\.\d+)?/)[0]);
        const threshold = thresholds[alert.type];
        
        if (threshold) {
            if (value >= threshold.high) return 'critical';
            if (value >= threshold.medium) return 'warning';
            return 'normal';
        }
        
        return 'warning';
    }

    formatTimestamp() {
        const now = new Date();
        const options = {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };

        const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(now);
        const dateParts = {};
        parts.forEach(({ type, value }) => {
            dateParts[type] = value;
        });

        return `${dateParts.year}-${dateParts.month}-${dateParts.day} ${dateParts.hour}:${dateParts.minute}:${dateParts.second}`;
    }

    updateAlerts(data) {
        // Update counts
        this.notifyCount.textContent = data.alerts.length;
        this.totalServersElement.textContent = data.total_servers;
        this.alertServersElement.textContent = data.alert_servers;

        // Update alert list
        this.alertList.innerHTML = '';
        data.alerts.forEach(alert => {
            const alertElement = this.createAlertElement(alert);
            this.alertList.appendChild(alertElement);
        });
    }

    createAlertElement(alert) {
        const dangerLevel = this.getDangerLevel(alert);
        const div = document.createElement('div');
        div.className = `alert-notify-item ${dangerLevel}`;
        div.innerHTML = `
            <div class="alert-server-name">${alert.server}</div>
            <span class="alert-type-badge">${alert.type}</span>
            <div class="alert-message">${alert.message}</div>
            <div class="alert-timestamp">${this.formatTimestamp()}</div>
        `;
        div.addEventListener('click', () => this.showAlertDetail(alert));
        return div;
    }

    showAlertDetail(alert) {
        let detailModal = document.getElementById('alertDetailModal');
        if (!detailModal) {
            detailModal = document.createElement('div');
            detailModal.id = 'alertDetailModal';
            detailModal.className = 'alert-detail-modal';
            document.body.appendChild(detailModal);
        }

        const dangerLevel = this.getDangerLevel(alert);
        detailModal.innerHTML = `
            <div class="alert-detail-content">
                <button class="alert-detail-close">&times;</button>
                <h3>${alert.server}</h3>
                <div class="alert-type-badge ${dangerLevel}">${alert.type}</div>
                <p>${alert.message}</p>
                <small>Last Updated: ${this.formatTimestamp()}</small>
            </div>
        `;

        detailModal.style.display = 'block';
        detailModal.querySelector('.alert-detail-close').addEventListener('click', 
            () => detailModal.style.display = 'none');
    }

    openModal() {
        if (this.notifyModal) {
            this.notifyModal.style.display = 'block';
        }
    }

    closeModal(event) {
        const modal = event.target.closest('.alert-notify-modal, .alert-detail-modal');
        if (modal) modal.style.display = 'none';
    }

    closeAllModals() {
        document.querySelectorAll('.alert-notify-modal, .alert-detail-modal')
            .forEach(modal => modal.style.display = 'none');
    }

    startUpdateCycle() {
        this.fetchAlerts();
        setInterval(() => this.fetchAlerts(), 30000);
    }

    fetchAlerts() {
        fetch('/monitoring_server/api/alerts')
            .then(response => response.json())
            .then(data => this.updateAlerts(data))
            .catch(error => console.error('Error fetching alerts:', error));
    }
}

// Initialize the notification system
document.addEventListener('DOMContentLoaded', () => {
    window.alertSystem = new AlertNotificationSystem();
});
