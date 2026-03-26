<div align="center">
  <h1>🖥️ Server Monitoring Dashboard</h1>
  <p>
    A real-time server monitoring and SSH user tracking dashboard built with <strong>Flask</strong> (Python) and <strong>Vanilla JavaScript</strong>. Designed for monitoring multiple Linux servers over SSH with live metrics, alerting, user session tracking, and storage analysis.
  </p>
</div>

<hr>

<h2>📸 Screenshots</h2>

<h3>Dashboard Overview</h3>
<img src="screenshots/server1.png" alt="Dashboard Overview" width="100%">

<h3>Server Details</h3>
<img src="screenshots/s2.png" alt="Server Details" width="100%">

<h3>User Tracking</h3>
<img src="screenshots/user.png" alt="User Tracking Dashboard" width="100%">

<h3>Alerts</h3>
<img src="screenshots/alerts.png" alt="Alerts Panel" width="100%">

<h3>Analytics</h3>
<img src="screenshots/analytics.png" alt="Analytics Charts" width="100%">

<hr>

<h2>✨ Features</h2>

<h3>📊 Real-Time Monitoring</h3>
<ul>
  <li>Live <strong>CPU</strong>, <strong>Memory</strong>, and <strong>Storage</strong> usage per server</li>
  <li>Auto-refresh every 5 seconds (configurable)</li>
  <li>Color-coded status badges (<code>online</code>, <code>offline</code>, <code>error</code>)</li>
  <li>Warning/Critical threshold alerts with blinking indicators</li>
</ul>

<h3>👥 SSH User Tracking</h3>
<ul>
  <li>Tracks <strong>who is connected</strong> to which server</li>
  <li>Captures <strong>actual login times</strong> from the <code>who</code> command (not polling time)</li>
  <li>Calculates <strong>total time spent</strong> per user per server</li>
  <li>IP-to-Name mapping for friendly display names</li>
  <li>Filters out server-to-server SSH and console/display sessions (<code>:0</code>, <code>:1</code>)</li>
  <li>Background thread collects sessions every 30 seconds</li>
</ul>

<h3>🚨 Alert System</h3>
<ul>
  <li>Real-time alerts for CPU, Memory, Storage, and Offline servers</li>
  <li><strong>Warning</strong> and <strong>Critical</strong> severity levels</li>
  <li>WebSocket-based push notifications</li>
  <li>Alert trends and history</li>
</ul>

<h3>📈 Analytics</h3>
<ul>
  <li>Historical CPU and Memory charts (Highcharts)</li>
  <li>Per-server comparison charts</li>
  <li>Server health scores</li>
  <li>24-hour detailed history (288 data points)</li>
</ul>

<h3>🗂️ Storage Analysis</h3>
<ul>
  <li>Detailed per-partition storage breakdown</li>
  <li>Deep storage analysis — top 20 largest files and directories</li>
  <li>File type distribution</li>
  <li>Directory summary (Level 1)</li>
</ul>

<h3>🔧 Server Management</h3>
<ul>
  <li>View <strong>running services</strong> and <strong>failed services</strong></li>
  <li>View <strong>top CPU and Memory processes</strong></li>
  <li><strong>Kick SSH users</strong> (terminate their session)</li>
  <li>View <strong>journalctl logs</strong> directly from the dashboard</li>
  <li>Network interface stats, uptime, and load average</li>
</ul>

<h3>🎨 UI/UX</h3>
<ul>
  <li>Multiple <strong>themes</strong> (Dark, Light, etc.)</li>
  <li>Compact view toggle</li>
  <li>Responsive sidebar navigation</li>
  <li>Smooth animations and transitions</li>
</ul>

<hr>

<h2>🏗️ Project Structure</h2>
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

<h2>⚙️ Configuration</h2>
<p>Edit <code>config.py</code> to add your servers:</p>

<pre><code>class Config:
    SERVER_GROUPS = {
        "gpu": [
            {
                "name": "23 - H100 - V1G1",
                "ip": "192.168.1.23",
                "username": "your_user",
                "password": "your_password",
                "group": "gpus"
            },
            # Add more servers...
        ]
    }

    # Flatten all servers into a single list
    SERVERS = [s for group in SERVER_GROUPS.values() for s in group]</code></pre>

<p>Edit <strong>IP to Name mapping</strong> in <code>monitor.js</code>:</p>

<pre><code>const IP_NAME_MAP = {
  "192.168.1.22": "user1",
  "192.168.1.14": "user2",
  "192.168.1.22": "user3",
  "192.168.1.20": "user4",
  "192.168.1.21": "user5",
  // Add more...
};</code></pre>

<hr>

<h2>🚀 Installation</h2>

<h3>1. Clone the Repository</h3>
<pre><code>git clone https://github.com/yourusername/server-monitoring.git
cd server-monitoring</code></pre>

<h3>2. Create Virtual Environment</h3>
<pre><code>python3 -m venv flask_env
source flask_env/bin/activate   # Linux/Mac
flask_env\Scripts\activate      # Windows</code></pre>

<h3>3. Install Dependencies</h3>
<pre><code>pip install -r requirements.txt</code></pre>

<h3>4. Install <code>sshpass</code> (required for SSH commands)</h3>
<pre><code>sudo apt install sshpass       # Ubuntu/Debian
sudo yum install sshpass       # RHEL/CentOS</code></pre>

<h3>5. Configure Servers</h3>
<p>Edit <code>config.py</code> with your server details (IPs, credentials, groups).</p>

<h3>6. Run the Application</h3>
<pre><code>python run.py</code></pre>
<p>Open your browser at: <code>http://127.0.0.1:5011/monitoring_server/home</code></p>

<hr>

<h2>📦 Requirements</h2>

<pre><code>flask>=2.3.0
flask-socketio>=5.3.0
paramiko>=3.0.0
eventlet>=0.33.0</code></pre>
<p><em>Note: System package <code>sshpass</code> is also required.</em></p>

<hr>

<h2>🔌 API Endpoints</h2>

<table width="100%">
  <thead>
    <tr>
      <th align="left">Method</th>
      <th align="left">Endpoint</th>
      <th align="left">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr><td><code>GET</code></td><td><code>/api/status</code></td><td>All server statuses (cached)</td></tr>
    <tr><td><code>POST</code></td><td><code>/api/live_metrics</code></td><td>Live metrics for selected servers</td></tr>
    <tr><td><code>GET</code></td><td><code>/api/alerts</code></td><td>Current alerts</td></tr>
    <tr><td><code>GET</code></td><td><code>/api/user_tracking</code></td><td>SSH user tracking data</td></tr>
    <tr><td><code>GET</code></td><td><code>/api/debug/tracking</code></td><td>Raw tracking JSON (debug)</td></tr>
    <tr><td><code>POST</code></td><td><code>/api/server_logs</code></td><td>Fetch journalctl logs</td></tr>
    <tr><td><code>POST</code></td><td><code>/api/kick_ssh</code></td><td>Terminate SSH user session</td></tr>
    <tr><td><code>POST</code></td><td><code>/api/user_services</code></td><td>Active processes per user</td></tr>
    <tr><td><code>POST</code></td><td><code>/api/analyze_storage</code></td><td>Deep storage analysis</td></tr>
    <tr><td><code>GET</code></td><td><code>/api/server_health_score</code></td><td>Server health scores</td></tr>
    <tr><td><code>GET</code></td><td><code>/api/alert_trends</code></td><td>Alert trend history</td></tr>
    <tr><td><code>GET</code></td><td><code>/api/server_comparison</code></td><td>Cross-server metric comparison</td></tr>
    <tr><td><code>GET</code></td><td><code>/api/test/who/&lt;server&gt;</code></td><td>Debug <code>who</code> command output</td></tr>
  </tbody>
</table>

<hr>

<h2>🔄 Background Thread</h2>
<p>The app starts a background thread on launch that:</p>
<ol>
  <li>SSHs into each server every <strong>30 seconds</strong></li>
  <li>Runs the <code>who</code> command to get active sessions with <strong>actual login times</strong></li>
  <li>Updates <code>user_tracking.json</code> with session data</li>
  <li>Marks sessions as ended if no longer in <code>who</code> output</li>
</ol>

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

<p>Each active session is stored and updated in JSON format:</p>

<pre><code>{
  "login_time":  "2026-02-10T11:08:00",
  "first_seen":  "2026-02-10T11:08:00",
  "last_seen":   "2026-02-10T17:30:00",
  "terminal":    "pts/1",
  "logout_time": null
}</code></pre>

<p><strong>Filtered out:</strong></p>
<ul>
  <li>Server-to-server SSH (e.g., <code>192.168.1.13</code> connecting to another server)</li>
  <li>Local display sessions (<code>:0</code>, <code>:1</code>, <code>:pts/9:S.0</code>)</li>
</ul>

<hr>

<h2>📊 Thresholds (Configurable in <code>routes.py</code>)</h2>

<table width="50%">
  <thead>
    <tr>
      <th align="left">Metric</th>
      <th align="left">Warning</th>
      <th align="left">Critical</th>
    </tr>
  </thead>
  <tbody>
    <tr><td><strong>CPU</strong></td><td>75%</td><td>90%</td></tr>
    <tr><td><strong>Memory</strong></td><td>75%</td><td>90%</td></tr>
    <tr><td><strong>Storage (root)</strong></td><td>80%</td><td>90%</td></tr>
  </tbody>
</table>

<hr>

<h2>🤝 Contributing</h2>
<ol>
  <li>Fork the repository</li>
  <li>Create your feature branch: <code>git checkout -b feature/my-feature</code></li>
  <li>Commit your changes: <code>git commit -m 'Add my feature'</code></li>
  <li>Push to the branch: <code>git push origin feature/my-feature</code></li>
  <li>Open a Pull Request</li>
</ol>

<hr>

<h2>📄 License</h2>
<p>This project is licensed under the MIT License - see the <a href="LICENSE">LICENSE</a> file for details.</p>

<hr>

<div align="center">
  <h2>👨‍💻 Brought to you by</h2>
  <p>
    <b>Mihir Bulsara</b><br>
    <i>Vedas Team</i>
  </p>
  <p>
    🏢 <b>Organization:</b> SAC (Space Applications Centre)<br>
    🎯 <b>Project Scope:</b> Internal GPU & compute server monitoring
  </p>
</div>

<hr>

<h2>⭐ Acknowledgements</h2>
<ul>
  <li><a href="https://flask.palletsprojects.com/">Flask</a></li>
  <li><a href="https://www.highcharts.com/">Highcharts</a></li>
  <li><a href="https://www.chartjs.org/">Chart.js</a></li>
  <li><a href="https://www.paramiko.org/">Paramiko</a></li>
  <li><a href="https://fontawesome.com/">Font Awesome</a></li>
</ul>
