import sqlite3
import json
from datetime import datetime, timedelta
from contextlib import contextmanager
import threading

DB_FILE = 'server_monitoring.db'
_local = threading.local()

def get_db_connection():
    if not hasattr(_local, 'connection'):
        _local.connection = sqlite3.connect(DB_FILE, check_same_thread=False)
        _local.connection.row_factory = sqlite3.Row
    return _local.connection

@contextmanager
def get_db():
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e

def init_database():
    with get_db() as conn:
        cursor = conn.cursor()

        # Main metrics table with services and processes
        cursor.execute('''CREATE TABLE IF NOT EXISTS server_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            server_name TEXT NOT NULL,
            server_group TEXT DEFAULT 'default',
            status TEXT NOT NULL,
            cpu_value REAL,
            cpu_status TEXT,
            memory_percent REAL,
            memory_status TEXT,
            memory_total INTEGER,
            memory_used INTEGER,
            root_storage_percent REAL,
            root_storage_status TEXT,
            load_1min REAL,
            load_5min REAL,
            load_15min REAL,
            uptime_human TEXT,
            boot_time TEXT,
            alert_count INTEGER DEFAULT 0,
            services_json TEXT,
            failed_services_json TEXT,
            top_cpu_processes_json TEXT,
            top_mem_processes_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')

        cursor.execute('''CREATE TABLE IF NOT EXISTS storage_details (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric_id INTEGER NOT NULL,
            mountpoint TEXT NOT NULL,
            percent REAL,
            size INTEGER,
            used INTEGER,
            available INTEGER,
            status TEXT,
            FOREIGN KEY (metric_id) REFERENCES server_metrics(id) ON DELETE CASCADE
        )''')

        cursor.execute('''CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric_id INTEGER NOT NULL,
            alert_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            message TEXT NOT NULL,
            value REAL,
            timestamp DATETIME NOT NULL,
            server_name TEXT NOT NULL,
            server_group TEXT,
            FOREIGN KEY (metric_id) REFERENCES server_metrics(id) ON DELETE CASCADE
        )''')

        # Indexes
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON server_metrics(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_metrics_server ON server_metrics(server_name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_metrics_server_timestamp ON server_metrics(server_name, timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_alerts_server ON alerts(server_name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_storage_metric ON storage_details(metric_id)')

        conn.commit()
        print("Database initialized with services/processes support")

def save_server_metrics(servers_data):
    with get_db() as conn:
        cursor = conn.cursor()
        current_time = datetime.now()
        cutoff_date = current_time - timedelta(days=200)
        cursor.execute('DELETE FROM server_metrics WHERE timestamp < ?', (cutoff_date,))

        for server in servers_data:
            cpu_data = server.get('cpu', {})
            cpu_value = cpu_data.get('value') if isinstance(cpu_data, dict) else cpu_data
            cpu_status = cpu_data.get('status', 'normal') if isinstance(cpu_data, dict) else 'normal'

            memory_data = server.get('memory', {})
            if isinstance(memory_data, dict):
                memory_percent = memory_data.get('percent')
                memory_status = memory_data.get('status', 'normal')
                memory_total = memory_data.get('total')
                memory_used = memory_data.get('used')
            else:
                memory_percent = memory_data
                memory_status = 'normal'
                memory_total = None
                memory_used = None

            storage_data = server.get('root_storage', {})
            root_storage_percent = storage_data.get('percent') if isinstance(storage_data, dict) else storage_data
            root_storage_status = storage_data.get('status', 'normal') if isinstance(storage_data, dict) else 'normal'

            load_avg = server.get('load_average', {})
            load_1min = load_avg.get('load_1min') if load_avg else None
            load_5min = load_avg.get('load_5min') if load_avg else None
            load_15min = load_avg.get('load_15min') if load_avg else None

            uptime = server.get('uptime', {})
            uptime_human = uptime.get('uptime_human') if uptime else None
            boot_time = uptime.get('boot_time') if uptime else None

            # Services and processes (stored as JSON)
            services_json = json.dumps(server.get('services', [])) if server.get('services') else None
            failed_services_json = json.dumps(server.get('failed_services', [])) if server.get('failed_services') else None
            top_cpu_processes_json = json.dumps(server.get('top_cpu_processes', [])) if server.get('top_cpu_processes') else None
            top_mem_processes_json = json.dumps(server.get('top_mem_processes', [])) if server.get('top_mem_processes') else None

            cursor.execute('''INSERT INTO server_metrics (
                timestamp, server_name, server_group, status,
                cpu_value, cpu_status, memory_percent, memory_status,
                memory_total, memory_used, root_storage_percent, root_storage_status,
                load_1min, load_5min, load_15min, uptime_human, boot_time, alert_count,
                services_json, failed_services_json, top_cpu_processes_json, top_mem_processes_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
                current_time, server['name'], server.get('group', 'default'), server['status'],
                cpu_value, cpu_status, memory_percent, memory_status,
                memory_total, memory_used, root_storage_percent, root_storage_status,
                load_1min, load_5min, load_15min, uptime_human, boot_time,
                len(server.get('alerts', [])),
                services_json, failed_services_json, top_cpu_processes_json, top_mem_processes_json
            ))

            metric_id = cursor.lastrowid

            for storage in server.get('storage', []):
                cursor.execute('''INSERT INTO storage_details (
                    metric_id, mountpoint, percent, size, used, available, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?)''', (
                    metric_id, storage.get('mountpoint'), storage.get('percent'),
                    storage.get('size'), storage.get('used'), storage.get('available'),
                    storage.get('status', 'normal')
                ))

            for alert in server.get('alerts', []):
                cursor.execute('''INSERT INTO alerts (
                    metric_id, alert_type, severity, message, value,
                    timestamp, server_name, server_group
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)''', (
                    metric_id, alert['type'], alert['severity'], alert['message'],
                    alert.get('value'), current_time, server['name'], server.get('group', 'default')
                ))

        conn.commit()

def get_server_metrics_history(server_name, days=7):
    with get_db() as conn:
        cursor = conn.cursor()
        cutoff_date = datetime.now() - timedelta(days=days)

        cursor.execute('''SELECT timestamp, status, cpu_value, cpu_status, memory_percent, memory_status,
            root_storage_percent, root_storage_status, alert_count,
            services_json, failed_services_json, top_cpu_processes_json, top_mem_processes_json
            FROM server_metrics WHERE server_name = ? AND timestamp >= ?
            ORDER BY timestamp ASC''', (server_name, cutoff_date))

        metrics = []
        for row in cursor.fetchall():
            metric = {
                'timestamp': row['timestamp'],
                'status': row['status'],
                'cpu': row['cpu_value'],
                'cpu_status': row['cpu_status'],
                'memory': row['memory_percent'],
                'memory_status': row['memory_status'],
                'root_storage': row['root_storage_percent'],
                'storage_status': row['root_storage_status'],
                'alert_count': row['alert_count']
            }

            if row['services_json']:
                metric['services'] = json.loads(row['services_json'])
            if row['failed_services_json']:
                metric['failed_services'] = json.loads(row['failed_services_json'])
            if row['top_cpu_processes_json']:
                metric['top_cpu_processes'] = json.loads(row['top_cpu_processes_json'])
            if row['top_mem_processes_json']:
                metric['top_mem_processes'] = json.loads(row['top_mem_processes_json'])

            metrics.append(metric)

        return metrics

def get_alert_history(server_name=None, alert_type=None, severity=None, days=7):
    with get_db() as conn:
        cursor = conn.cursor()
        cutoff_date = datetime.now() - timedelta(days=days)

        query = 'SELECT timestamp, server_name, server_group, alert_type, severity, message, value FROM alerts WHERE timestamp >= ?'
        params = [cutoff_date]

        if server_name:
            query += ' AND server_name = ?'
            params.append(server_name)
        if alert_type:
            query += ' AND alert_type = ?'
            params.append(alert_type)
        if severity:
            query += ' AND severity = ?'
            params.append(severity)

        query += ' ORDER BY timestamp DESC'
        cursor.execute(query, params)

        alerts = []
        summary = {'total_alerts': 0, 'by_server': {}, 'by_type': {}, 'by_severity': {}}

        for row in cursor.fetchall():
            alert = {
                'timestamp': row['timestamp'],
                'server': row['server_name'],
                'group': row['server_group'],
                'type': row['alert_type'],
                'severity': row['severity'],
                'message': row['message'],
                'value': row['value']
            }
            alerts.append(alert)
            summary['total_alerts'] += 1
            summary['by_server'][row['server_name']] = summary['by_server'].get(row['server_name'], 0) + 1
            summary['by_type'][row['alert_type']] = summary['by_type'].get(row['alert_type'], 0) + 1
            summary['by_severity'][row['severity']] = summary['by_severity'].get(row['severity'], 0) + 1

        summary['date_range'] = {'from': cutoff_date.isoformat(), 'to': datetime.now().isoformat()}
        return alerts, summary

def get_server_comparison(server_names, days=1):
    with get_db() as conn:
        cursor = conn.cursor()
        cutoff_date = datetime.now() - timedelta(days=days)
        placeholders = ','.join('?' * len(server_names))

        cursor.execute(f'''SELECT timestamp, server_name, status, cpu_value, memory_percent,
            root_storage_percent, alert_count FROM server_metrics
            WHERE server_name IN ({placeholders}) AND timestamp >= ?
            ORDER BY timestamp ASC''', list(server_names) + [cutoff_date])

        comparison_data = {}
        for row in cursor.fetchall():
            ts = row['timestamp']
            if ts not in comparison_data:
                comparison_data[ts] = {}
            comparison_data[ts][row['server_name']] = {
                'cpu': row['cpu_value'],
                'memory': row['memory_percent'],
                'root_storage': row['root_storage_percent'],
                'status': row['status'],
                'alert_count': row['alert_count']
            }

        return [{'timestamp': ts, 'servers': servers} for ts, servers in sorted(comparison_data.items())]

def get_alert_trends(days=30):
    with get_db() as conn:
        cursor = conn.cursor()
        cutoff_date = datetime.now() - timedelta(days=days)

        cursor.execute('''SELECT DATE(timestamp) as date, COUNT(*) as total,
            SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
            SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning,
            alert_type FROM alerts WHERE timestamp >= ?
            GROUP BY DATE(timestamp), alert_type ORDER BY date ASC''', (cutoff_date,))

        daily_data = {}
        for row in cursor.fetchall():
            date = row['date']
            if date not in daily_data:
                daily_data[date] = {'date': date, 'total': 0, 'critical': 0, 'warning': 0, 'by_type': {}}
            daily_data[date]['total'] += row['total']
            daily_data[date]['critical'] += row['critical']
            daily_data[date]['warning'] += row['warning']
            daily_data[date]['by_type'][row['alert_type']] = row['total']

        return list(daily_data.values())

def get_server_health_scores(days=7):
    with get_db() as conn:
        cursor = conn.cursor()
        cutoff_date = datetime.now() - timedelta(days=days)

        cursor.execute('''SELECT server_name, COUNT(*) as total_checks,
            SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_checks,
            AVG(CASE WHEN cpu_value IS NOT NULL THEN cpu_value ELSE 0 END) as avg_cpu,
            AVG(CASE WHEN memory_percent IS NOT NULL THEN memory_percent ELSE 0 END) as avg_memory,
            AVG(CASE WHEN root_storage_percent IS NOT NULL THEN root_storage_percent ELSE 0 END) as avg_storage
            FROM server_metrics WHERE timestamp >= ? GROUP BY server_name''', (cutoff_date,))

        health_scores = []
        for server in cursor.fetchall():
            server_name = server['server_name']
            cursor.execute('''SELECT 
                SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_alerts,
                SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning_alerts
                FROM alerts WHERE server_name = ? AND timestamp >= ?''', (server_name, cutoff_date))

            alerts = cursor.fetchone()
            total_checks = server['total_checks'] or 1
            uptime_score = (server['online_checks'] / total_checks) * 100
            avg_cpu = server['avg_cpu'] or 0
            avg_memory = server['avg_memory'] or 0
            avg_storage = server['avg_storage'] or 0
            resource_score = max(0, 100 - ((avg_cpu + avg_memory + avg_storage) / 3))

            critical_alerts = alerts['critical_alerts'] or 0
            warning_alerts = alerts['warning_alerts'] or 0
            alert_penalty = (critical_alerts * 10) + (warning_alerts * 5)
            health_score = max(0, min(100, (uptime_score * 0.4 + resource_score * 0.4) - alert_penalty * 0.2))

            health_scores.append({
                'server': server_name,
                'health_score': round(health_score, 1),
                'uptime_percent': round(uptime_score, 1),
                'avg_cpu': round(avg_cpu, 1),
                'avg_memory': round(avg_memory, 1),
                'avg_storage': round(avg_storage, 1),
                'critical_alerts': critical_alerts,
                'warning_alerts': warning_alerts
            })

        return sorted(health_scores, key=lambda x: x['health_score'], reverse=True)

init_database()