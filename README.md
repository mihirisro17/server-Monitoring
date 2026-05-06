<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=40&duration=3000&pause=1000&color=38BDF8&center=true&vCenter=true&width=900&lines=Server+Monitoring+Dashboard;Real-Time+SSH+%26+System+Tracking;Flask+%2B+WebSockets+%2B+Paramiko;Built+at+SAC+%E2%80%94+ISRO" alt="Typing SVG" />

<br/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=16&duration=4000&pause=500&color=94A3B8&center=true&vCenter=true&width=700&lines=Monitor+CPU+%7C+Memory+%7C+Storage+%E2%80%94+Live;Track+every+SSH+session+across+all+servers;WebSocket+alerts+the+moment+thresholds+are+crossed" alt="Subtitle SVG" />

<br/><br/>

![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.3+-000000?style=for-the-badge&logo=flask&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![WebSocket](https://img.shields.io/badge/WebSocket-Enabled-10B981?style=for-the-badge&logo=socket.io&logoColor=white)
![SSH](https://img.shields.io/badge/SSH-Monitoring-EF4444?style=for-the-badge&logo=gnubash&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-8B5CF6?style=for-the-badge)

<br/>

![Paramiko](https://img.shields.io/badge/Paramiko-SSH-3776AB?style=flat-square&logo=python&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Analytics-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Highcharts](https://img.shields.io/badge/Highcharts-Charts-1496BB?style=flat-square)
![Chart.js](https://img.shields.io/badge/Chart.js-Graphs-FF6384?style=flat-square&logo=chartdotjs&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101?style=flat-square&logo=socket.io&logoColor=white)
![Eventlet](https://img.shields.io/badge/Eventlet-Async-4B5563?style=flat-square)

<br/><br/>

**[📸 Screenshots](#-screenshots)** &nbsp;•&nbsp;
**[✨ Features](#-features)** &nbsp;•&nbsp;
**[🚀 Installation](#-installation)** &nbsp;•&nbsp;
**[🔌 API Docs](#-api-endpoints)** &nbsp;•&nbsp;
**[👥 SSH Tracking](#-ssh-user-tracking--how-it-works)** &nbsp;•&nbsp;
**[📊 Alerts](#-alert-thresholds)**

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
> Live metrics. Every 5 seconds. Always current.

- 🔵 Live **CPU**, **Memory**, and **Storage** per server
- 🔄 Auto-refresh every **5 seconds** (configurable)
- 🟢 Color-coded status badges — `online` · `offline` · `error`
- ⚡ Warning/Critical threshold alerts with blinking indicators

---

### 👥 SSH User Tracking
> Know exactly who's on your servers and for how long.

- 👤 Tracks **who is connected** to which server
- 🕐 Captures **actual login times** from the `who` command
- ⏱️ Calculates **total time spent** per user per server
- 🗺️ IP-to-Name mapping for friendly display names
- 🚫 Filters out server-to-server SSH and console sessions
- 🔁 Background thread polls every **30 seconds**

---

### 🚨 Alert System
> Never miss a critical event.

- ⚠️ Real-time alerts for CPU, Memory, Storage & Offline
- 🟡 **Warning** and 🔴 **Critical** severity levels
- 📡 WebSocket-based **push notifications**
- 📉 Alert trends and full history

</td>
<td valign="top" width="50%">

### 📈 Analytics
> 24 hours of history, always at your fingertips.

- 📊 Historical CPU and Memory charts via **Highcharts**
- 🆚 Per-server comparison charts
- 💯 Server health scores
- 🗃️ **288 data points** — full 24-hour detailed history

---

### 🗂️ Storage Analysis
> Deep-dive into every byte.

- 💾 Detailed per-partition storage breakdown
- 📁 Top **20 largest files** and directories
- 🗂️ File type distribution charts
- 📂 Directory summary (Level 1)

---

### 🔧 Server Management
> Full control from the dashboard.

- ⚙️ View **running** and **failed** services
- 🔝 Top CPU and Memory **processes**
- 🦵 **Kick SSH users** — terminate sessions instantly
- 📜 Browse **journalctl logs** from the UI
- 🌐 Network stats, uptime, load average

---

### 🎨 UI/UX
> Designed to be used, not just looked at.

- 🌗 Multiple **themes** — Dark, Light, and more
- 📐 Compact view toggle + responsive sidebar
- 🎞️ Smooth animations and transitions

</td>
</tr>
</table>

---

## 🏗️ Project Structure

```
server_monitoring/
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
└── requirements.txt
```

---

## ⚙️ Configuration

<details>
<summary><b>🖥️ Server Configuration — config.py</b></summary>
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
<summary><b>👤 IP to Name Mapping — monitor.js</b></summary>
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

> **Prerequisites:** Python 3.8+, `pip`, and `sshpass` installed on your system.

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/server-monitoring.git
cd server-monitoring

# 2. Create and activate virtual environment
python3 -m venv flask_env
source flask_env/bin/activate        # Linux / macOS
# flask_env\Scripts\activate         # Windows

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Install sshpass
sudo apt install sshpass             # Ubuntu / Debian
# sudo yum install sshpass           # RHEL / CentOS

# 5. Configure your servers
nano config.py

# 6. Run the dashboard
python run.py
```

<div align="center">

🌐 &nbsp;**Open in browser:** &nbsp;`http://127.0.0.1:5011/monitoring_server/home`

</div>

---

## 📦 Requirements

```txt
flask>=2.3.0
flask-socketio>=5.3.0
paramiko>=3.0.0
eventlet>=0.33.0
```

> 💡 System package `sshpass` is also required — install via `apt` or `yum`.

---

## 🔌 API Endpoints

<details>
<summary><b>📋 Full API Reference — click to expand</b></summary>
<br/>

| Method | Endpoint | Description |
|:------:|----------|-------------|
| `GET` | `/api/status` | All server statuses (cached) |
| `POST` | `/api/live_metrics` | Live metrics for selected servers |
| `GET` | `/api/alerts` | Current active alerts |
| `GET` | `/api/user_tracking` | SSH user tracking data |
| `GET` | `/api/debug/tracking` | Raw tracking JSON (debug) |
| `POST` | `/api/server_logs` | Fetch journalctl logs |
| `POST` | `/api/kick_ssh` | Terminate an SSH user session |
| `POST` | `/api/user_services` | Active processes per user |
| `POST` | `/api/analyze_storage` | Deep storage analysis |
| `GET` | `/api/server_health_score` | Server health scores |
| `GET` | `/api/alert_trends` | Alert trend history |
| `GET` | `/api/server_comparison` | Cross-server metric comparison |
| `GET` | `/api/test/who/<server>` | Debug `who` command output |

</details>

---

## 🔄 Background Thread

```python
# run.py
tracking_thread = threading.Thread(target=collect_server_data, daemon=True)
tracking_thread.start()
```

| Step | Action |
|:----:|--------|
| ① | SSHs into each server every **30 seconds** |
| ② | Runs `who` to capture sessions with **actual login times** |
| ③ | Updates `user_tracking.json` with parsed session data |
| ④ | Marks sessions as **ended** if no longer in `who` output |

---

## 👥 SSH User Tracking — How It Works

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=15&duration=3500&pause=800&color=34D399&center=true&vCenter=true&width=700&lines=Parses+the+native+Linux+%60who%60+command;Captures+actual+login+times%2C+not+poll+times;IP+%E2%86%92+Name+mapping+for+friendly+display;Auto-filters+noise+%E2%80%94+only+real+users+shown" alt="Tracking SVG" />

</div>

<br/>

The tracker SSHs into each server and runs `who`, parsing real login times — not the time of polling:

```
$ who
sac       pts/1     2026-02-10 11:08  (192.168.3.208)
│         │         │                 │
│         │         │                 └─ Client IP (user's machine)
│         │         └─ Actual login time (not poll time)
│         └─ Terminal identifier
└─ Username
```

Each session is stored in `user_tracking.json`:

```json
{
  "login_time":   "2026-02-10T11:08:00",
  "first_seen":   "2026-02-10T11:08:00",
  "last_seen":    "2026-02-10T17:30:00",
  "terminal":     "pts/1",
  "logout_time":  null
}
```

> ⏱️ **Duration** is calculated as `last_seen − first_seen`

### 🚫 Auto-Filtered Sessions

| Type | Example | Reason |
|------|---------|--------|
| Server-to-server SSH | `192.168.2.137 → node` | Not an end user |
| Local display sessions | `:0`, `:1` | Physical console, not SSH |
| Tmux / Screen sub-sessions | `:pts/9:S.0` | Internal multiplexer |

---

## 📊 Alert Thresholds

<div align="center">

| Metric | 🟡 Warning | 🔴 Critical |
|:------:|:----------:|:-----------:|
| **CPU** | 75% | 90% |
| **Memory** | 75% | 90% |
| **Storage (root)** | 80% | 90% |

</div>

---

## 🤝 Contributing

```bash
# Fork the repo, then:
git checkout -b feature/my-feature
git commit -m "✨ Add my feature"
git push origin feature/my-feature
# Open a Pull Request on GitHub
```

---

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=20&duration=2500&pause=600&color=818CF8&center=true&vCenter=true&width=500&lines=Made+by+Mihir+Bulsara;VEDAS+Team+%E2%80%94+SAC%2C+ISRO;Space+Applications+Centre" alt="Author" />

<br/>

🏢 &nbsp;**Organization:** SAC — Space Applications Centre, ISRO
&nbsp;&nbsp;|&nbsp;&nbsp;
🎯 &nbsp;**Project:** Internal GPU & compute server monitoring

<br/>

[![Flask](https://img.shields.io/badge/Flask-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Highcharts](https://img.shields.io/badge/Highcharts-1496BB?style=flat-square)](https://www.highcharts.com/)
[![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=flat-square&logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)
[![Paramiko](https://img.shields.io/badge/Paramiko-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.paramiko.org/)
[![Font Awesome](https://img.shields.io/badge/Font_Awesome-528DD7?style=flat-square&logo=fontawesome&logoColor=white)](https://fontawesome.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socket.io&logoColor=white)](https://socket.io/)

<br/><br/>

---

<sub>⭐ &nbsp;Star this repo if you found it useful! &nbsp;·&nbsp; 🐛 &nbsp;Open an issue for bugs &nbsp;·&nbsp; 💡 &nbsp;PRs are welcome</sub>

</div>
