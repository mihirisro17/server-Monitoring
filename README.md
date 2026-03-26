<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=32&duration=3000&pause=1000&color=3B82F6&center=true&vCenter=true&width=800&lines=Server+Monitoring+Dashboard;Real-Time+SSH+%26+System+Tracking;Built+with+Flask+%2B+Vanilla+JS" alt="Typing SVG - Server Monitoring Dashboard" />

<br/>

<p>
  A <strong>real-time server monitoring</strong> and <strong>SSH user tracking</strong> dashboard built with
  <strong>Flask</strong> (Python) and <strong>Vanilla JavaScript</strong>. Designed for monitoring multiple Linux
  servers over SSH with live metrics, alerting, user session tracking, and storage analysis.
</p>

<br/>

<a href="#"><img src="https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge&logo=python&logoColor=white"/></a>
<a href="#"><img src="https://img.shields.io/badge/Flask-2.3+-000000?style=for-the-badge&logo=flask&logoColor=white"/></a>
<a href="#"><img src="https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black"/></a>
<a href="#"><img src="https://img.shields.io/badge/WebSocket-Enabled-10B981?style=for-the-badge&logo=socket.io&logoColor=white"/></a>
<a href="#"><img src="https://img.shields.io/badge/SSH-Monitoring-EF4444?style=for-the-badge&logo=gnubash&logoColor=white"/></a>
<a href="#"><img src="https://img.shields.io/badge/License-MIT-8B5CF6?style=for-the-badge"/></a>

<br/><br/>

<a href="#-screenshots">Screenshots</a> •
<a href="#-features">Features</a> •
<a href="#-installation">Installation</a> •
<a href="#-api-endpoints">API Docs</a> •
<a href="#-ssh-user-tracking--how-it-works">How It Works</a>

</div>

---

## 📸 Screenshots

<table>
  <tr>
    <td align="center" width="50%">
      <img src="screenshots/server1.png" alt="Dashboard Overview" width="100%"/>
      <br/><sub><b>🏠 Dashboard Overview</b></sub>
    </td>
    <td align="center" width="50%">
      <img src="screenshots/s2.png" alt="Server Details" width="100%"/>
      <br/><sub><b>🖥️ Server Details Panel</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="screenshots/user.png" alt="User Tracking" width="100%"/>
      <br/><sub><b>👥 SSH User Tracking</b></sub>
    </td>
    <td align="center" width="50%">
      <img src="screenshots/alerts.png" alt="Alerts Panel" width="100%"/>
      <br/><sub><b>🚨 Alerts Dashboard</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <img src="screenshots/analytics.png" alt="Analytics Charts" width="100%"/>
      <br/><sub><b>📈 Analytics & Historical Charts</b></sub>
    </td>
  </tr>
</table>

---

## ✨ Features

<table>
  <tr>
    <td valign="top" width="50%">

### 📊 Real-Time Monitoring

- Live **CPU**, **Memory**, and **Storage** usage per server
- Auto-refresh every 5 seconds (configurable)
- Color-coded status badges (`online`, `offline`, `error`)
- Warning/Critical threshold alerts with blinking indicators

### 👥 SSH User Tracking

- Tracks **who is connected** to which server
- Captures **actual login times** from the `who` command
- Calculates **total time spent** per user per server
- IP-to-Name mapping for friendly display names
- Filters out server-to-server SSH and console sessions
- Background thread collects sessions every 30 seconds

### 🚨 Alert System

- Real-time alerts for CPU, Memory, Storage & Offline
- **Warning** and **Critical** severity levels
- WebSocket-based push notifications
- Alert trends and history

  </td>
  <td valign="top" width="50%">

### 📈 Analytics

- Historical CPU and Memory charts (Highcharts)
- Per-server comparison charts
- Server health scores
- 24-hour detailed history (288 data points)

### 🗂️ Storage Analysis

- Detailed per-partition storage breakdown
- Top 20 largest files and directories
- File type distribution
- Directory summary (Level 1)

### 🔧 Server Management

- View **running** and **failed services**
- View **top CPU and Memory processes**
- **Kick SSH users** (terminate their session)
- View **journalctl logs** from the dashboard
- Network interface stats, uptime, load average

### 🎨 UI/UX

- Multiple **themes** (Dark, Light, etc.)
- Compact view toggle + responsive sidebar
- Smooth animations and transitions

  </td>
  </tr>
</table>

---

## 🏗️ Project Structure

<p>Below is the core directory structure for the server monitoring application:</p>

<pre><code>server_monitoring/
│
├── app/
│   ├── __init__.py      ← Flask app factory + background thread start
│   ├── routes.py        ← All API routes and SSH logic
│   └── alert_push.py    ← WebSocket alert pusher
│
├── static/
│   ├── css/
│   │   └── style.css    ← All styles + themes
│   └── js/
│       ├── monitor.js   ← Main frontend logic
│       └── lib/         ← Highcharts, Chart.js, etc.
│
├── templates/
│   └── index.html       ← Single-page app template
│
├── config.py            ← Server list and SSH credentials
├── database.py          ← SQLite DB for analytics history
├── run.py               ← App entry point
├── user_tracking.json   ← Auto-generated SSH session store
└── requirements.txt</code></pre>

<hr>

---

## ⚙️ Configuration

<details>
<summary><b>🖥️ Click to expand — Server Configuration (config.py)</b></summary>
<br/>

```python
class Config:
    SERVER_GROUPS = {
        "gpu": [
            {
                "name": "231 - H100 - V1G1",
                "ip": "192.168.1.231",
                "username": "your_user",
                "password": "your_password",
                "group": "gpus"
            },
        ],
        "cpu": [
            {
                "name": "2.136 - V1C2",
                "ip": "192.168.2.136",
                "username": "your_user",
                "password": "your_password",
                "group": "data"
            },
        ]
    }
    SERVERS = [s for group in SERVER_GROUPS.values() for s in group]
```

</details>

<details>
<summary><b>👤 Click to expand — IP to Name Mapping (monitor.js)</b></summary>
<br/>

```javascript
const IP_NAME_MAP = {
  "192.168.1.220": "Harish",
  "192.168.1.141": "Vikrant",
  "192.168.1.221": "Karnav",
  "192.168.1.205": "Vidit",
  "192.168.1.210": "Arpan",
};
```

</details>

---

## 🚀 Installation

> **Prerequisites:** Python 3.8+, `pip`, and `sshpass` on your system.

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/server-monitoring.git
cd server-monitoring

# 2. Create and activate virtual environment
python3 -m venv flask_env
source flask_env/bin/activate        # Linux/Mac
# flask_env\Scripts\activate         # Windows

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Install sshpass
sudo apt install sshpass             # Ubuntu/Debian
# sudo yum install sshpass           # RHEL/CentOS

# 5. Configure your servers
nano config.py

# 6. Run
python run.py
```

<div align="center">

🌐 **Open:** `http://127.0.0.1:5011/monitoring_server/home`

</div>

---

## 📦 Requirements

```txt
flask>=2.3.0
flask-socketio>=5.3.0
paramiko>=3.0.0
eventlet>=0.33.0
```

> 💡 System package `sshpass` is also required — install via `apt` / `yum`.

---

## 🔌 API Endpoints

<details>
<summary><b>📋 Click to expand — Full API Reference</b></summary>
<br/>

| Method | Endpoint                   | Description                       |
| :----: | -------------------------- | --------------------------------- |
| `GET`  | `/api/status`              | All server statuses (cached)      |
| `POST` | `/api/live_metrics`        | Live metrics for selected servers |
| `GET`  | `/api/alerts`              | Current alerts                    |
| `GET`  | `/api/user_tracking`       | SSH user tracking data            |
| `GET`  | `/api/debug/tracking`      | Raw tracking JSON (debug)         |
| `POST` | `/api/server_logs`         | Fetch journalctl logs             |
| `POST` | `/api/kick_ssh`            | Terminate SSH user session        |
| `POST` | `/api/user_services`       | Active processes per user         |
| `POST` | `/api/analyze_storage`     | Deep storage analysis             |
| `GET`  | `/api/server_health_score` | Server health scores              |
| `GET`  | `/api/alert_trends`        | Alert trend history               |
| `GET`  | `/api/server_comparison`   | Cross-server metric comparison    |
| `GET`  | `/api/test/who/<server>`   | Debug `who` command output        |

</details>

---

## 🔄 Background Thread

```python
# run.py
tracking_thread = threading.Thread(target=collect_server_data, daemon=True)
tracking_thread.start()
```

| Step | Action                                                   |
| :--: | -------------------------------------------------------- |
|  ①   | SSHs into each server every **30 seconds**               |
|  ②   | Runs `who` to get sessions with **actual login times**   |
|  ③   | Updates `user_tracking.json` with parsed session data    |
|  ④   | Marks sessions as **ended** if no longer in `who` output |

---

<pre><code># run.py
tracking_thread = threading.Thread(target=collect_server_data, daemon=True)
tracking_thread.start()</code></pre>

<hr>

<div align="center">
  <h1>🛡️ SSH User Tracking Dashboard</h1>
  <p>A real-time server monitoring application that tracks active SSH user sessions across multiple Linux servers. Built with Flask and WebSockets, this tool provides a live dashboard to monitor who is logged in, their session durations, and their client IPs.</p>
</div>

<h2>✨ Core Functionality</h2>
<ul>
  <li><strong>Real-Time Tracking:</strong> Parses live session data directly from the servers using native Linux commands.</li>
  <li><strong>Live Dashboard:</strong> Single-page web interface built with modern chart libraries (Chart.js/Highcharts) to visualize server traffic.</li>
  <li><strong>WebSocket Alerts:</strong> Pushes immediate notifications to the frontend when a new user logs in or a session drops.</li>
  <li><strong>Analytics History:</strong> Logs all session data into a local SQLite database for historical reporting and auditing.</li>
  <li><strong>Multi-Server Support:</strong> Monitor multiple nodes concurrently from a centralized <code>config.py</code> file.</li>
</ul>

<h2>⚙️ How It Works</h2>
<p>The tracker runs the Linux <code>who</code> command on each server and parses real login times:</p>

<pre><code>$ who
sac       pts/1     2026-02-10 11:08  (192.168.3.208)
│         │         │                 │
│         │         │                 └─ Client IP (user's machine)
│         │         └─ Actual login time (not poll time)
│         └─ Terminal
└─ Username</code></pre>

</div>

Each session stored in `user_tracking.json`:

```json
{
  "login_time": "2026-02-10T11:08:00",
  "first_seen": "2026-02-10T11:08:00",
  "last_seen": "2026-02-10T17:30:00",
  "terminal": "pts/1",
  "logout_time": null
}
```

> ⏱️ **Duration** = `last_seen − first_seen`

### 🚫 Filtered Out Automatically

| Type                     | Example                        | Reason                    |
| ------------------------ | ------------------------------ | ------------------------- |
| Server-to-server SSH     | `192.168.2.137` → another node | Not an end user           |
| Local display sessions   | `:0`, `:1`                     | Physical console, not SSH |
| Tmux/Screen sub-sessions | `:pts/9:S.0`                   | Internal multiplexer      |

---

## 📊 Alert Thresholds

<div align="center">

|       Metric       | 🟡 Warning | 🔴 Critical |
| :----------------: | :--------: | :---------: |
|      **CPU**       |    75%     |     90%     |
|     **Memory**     |    75%     |     90%     |
| **Storage (root)** |    80%     |     90%     |

</div>

---

## 🤝 Contributing

```bash
git checkout -b feature/my-feature
git commit -m "✨ Add my feature"
git push origin feature/my-feature
# Then open a Pull Request on GitHub
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=18&duration=2000&pause=500&color=6366F1&center=true&vCenter=true&width=400&lines=Mihir+Bulsara;VEDAS+Team;Space+Applications+Centre" alt="Author"/>

<br/>

🏢 **Organization:** SAC — Space Applications Centre
🎯 **Project:** Internal GPU & compute server monitoring

<br/>

[![Flask](https://img.shields.io/badge/Flask-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Highcharts](https://img.shields.io/badge/Highcharts-1496BB?style=flat-square)](https://www.highcharts.com/)
[![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=flat-square&logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)
[![Paramiko](https://img.shields.io/badge/Paramiko-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.paramiko.org/)
[![Font Awesome](https://img.shields.io/badge/Font_Awesome-528DD7?style=flat-square&logo=fontawesome&logoColor=white)](https://fontawesome.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socket.io&logoColor=white)](https://socket.io/)

<br/>

---

<sub>⭐ Star this repo if you found it useful!</sub>

</div>
