from flask import Blueprint, render_template, jsonify, request, current_app
import subprocess
import json
import os
from functools import lru_cache
import time
from config import Config
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
import re
from collections import defaultdict
import threading
from .alert_push import send_alert_to_socket
from flask import render_template_string
import paramiko
import traceback
# At the top with other imports
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
import database as db



bp = Blueprint('main', __name__)

# Cache file path
CACHE_FILE = 'server_cache.json'
HISTORY_FILE = 'server_history.json'
HISTORY_FILE1 = 'server_history1.json'
DETAILED_HISTORY_DIR = 'detailed_history'
USER_TRACKING_FILE = 'user_tracking.json'




def get_service_status(server, service_name):
    """Get detailed service status"""
    cmd = f"systemctl status {service_name} | head -10"
    output = execute_ssh_command(server, cmd)

    status_info = {
        'active': False,
        'enabled': False,
        'reason': 'Unknown'
    }

    if output:
        if 'Active: active (running)' in output:
            status_info['active'] = True
        elif 'Active: failed' in output:
            status_info['reason'] = 'Failed to start'
            # Get failure reason
            reason_match = re.search(r'Main PID.*\((.*?)\)', output)
            if reason_match:
                status_info['reason'] = reason_match.group(1)
        elif 'Active: inactive (dead)' in output:
            status_info['reason'] = 'Stopped/Inactive'

        if 'enabled' in output:
            status_info['enabled'] = True

    return status_info

def get_cpu_usage(server):
    cmd = "top -bn1 | grep '%Cpu' | awk '{print $2}'"
    output = execute_ssh_command(server, cmd)
    return float(output) if output else None

def get_memory_info(server):
    cmd = "free -b | grep Mem"
    output = execute_ssh_command(server, cmd)

    if output:
        parts = output.split()
        if len(parts) >= 7:
            total = int(parts[1])
            used = int(parts[2])
            free = int(parts[3])
            shared = int(parts[4])
            buffers = int(parts[5])
            cached = int(parts[6])

            # Calculate actual used (subtract buffers and cache)
            # Some systems show buffers+cache already subtracted, check if used is reasonable
            actual_used = used - (buffers + cached)

            # If the calculation gives negative, use raw used value
            if actual_used < 0 or actual_used > total:
                actual_used = used

            # Calculate percentage
            if total > 0:
                usage_percent = (actual_used / total) * 100
            else:
                usage_percent = 0

            # Ensure non-negative
            usage_percent = max(0, min(100, usage_percent))
            actual_used = max(0, actual_used)

            return {
                'total': total,
                'used': used,
                'free': free,
                'shared': shared,
                'buffers': buffers,
                'cached': cached,
                'actual_used': actual_used,
                'usage_percent': round(usage_percent, 1),
                'status': 'critical' if usage_percent >= 90 else 'warning' if usage_percent >= 75 else 'normal'
            }
    return None

def run_command_async(server, command, result_container):
    """Runs a command in a separate thread."""
    result_container["output"] = execute_ssh_command(server, command, timeout=30)

def get_fallback_storage(server):
    # Get partition for "/"
    cmd_lsblk = 'lsblk -b -o NAME,SIZE,MOUNTPOINT | grep " /$"'
    output = execute_ssh_command(server, cmd_lsblk)

    if not output:
        return []

    parts = output.split()
    device = parts[0]
    total_size = int(parts[1])
    mountpoint = parts[2]

    # Get filesystem stats for used/free
    cmd_stat = 'stat -f -c "%b %f %S" /'
    stat_out = execute_ssh_command(server, cmd_stat)

    if not stat_out:
        return []

    b_total, b_free, b_size = stat_out.split()
    b_total = int(b_total)
    b_free = int(b_free)
    b_size = int(b_size)

    total = b_total * b_size
    free = b_free * b_size
    used = total - free
    percent = (used / total) * 100 if total > 0 else 0

    return [{
        "filesystem": device,
        "size": total_size,
        "used": used,
        "available": free,
        "percent": percent,
        "mountpoint": mountpoint,
        "status": get_status_(percent)
    }]


def parse_df(output):
    storage = []
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 6:
            try:
                total = int(parts[1])
                used = int(parts[2])
                available = int(parts[3])
                percent = float(parts[4].rstrip('%'))
                mountpoint = parts[5]

                storage.append({
                    'filesystem': parts[0],
                    'size': total,
                    'used': used,
                    'available': available,
                    'percent': percent,
                    'mountpoint': mountpoint,
                    'status': get_status_(percent)
                })
            except:
                continue
    return storage

def get_status_(percent):
    if percent >= 90:
        return "critical"
    elif percent >= 80:
        return "warning"
    elif percent >= 60:
        return "moderate"
    return "normal"

def get_storage_info(server):
    slow_timeout = 5  # seconds for slow detection
    result_df = {"output": None}

    # Start df in a background thread
    df_thread = threading.Thread(
        target=run_command_async,
        args=(server, "df -B1 | tail -n +2", result_df)
    )
    df_thread.start()

    # Wait for df for <= slow_timeout seconds
    df_thread.join(timeout=slow_timeout)

    # If df finished on time
    if result_df["output"]:
        return parse_df(result_df["output"])

    # Otherwise df is slow → use fallback lsblk + stat
    fallback_data = get_fallback_storage(server)

    # df is still running; let it finish in background
    # When df completes, patch fallback data
    df_thread.join(timeout=10)  # Additional wait, optional
    if result_df["output"]:
        corrected = parse_df(result_df["output"])
        return corrected

    # DF never finished → return fallback only
    return fallback_data


def get_load_average(server):
    cmd = "cat /proc/loadavg"
    output = execute_ssh_command(server, cmd)
    if output:
        parts = output.split()
        return {
            'load_1min': float(parts[0]),
            'load_5min': float(parts[1]),
            'load_15min': float(parts[2]),
            'running_processes': parts[3].split('/')[0],
            'total_processes': parts[3].split('/')[1]
        }
    return None

def get_network_stats(server):
    cmd = "cat /proc/net/dev | tail -n +3"
    output = execute_ssh_command(server, cmd)
    interfaces = []

    if output:
        for line in output.splitlines():
            parts = line.split()
            if len(parts) >= 10:
                iface = parts[0].rstrip(':')
                if iface == 'lo':
                    continue
                interfaces.append({
                    'interface': iface,
                    'rx_bytes': int(parts[1]),
                    'rx_packets': int(parts[2]),
                    'tx_bytes': int(parts[9]),
                    'tx_packets': int(parts[10])
                })
    return interfaces

def get_uptime(server):
    cmd = "uptime -p && uptime -s"
    output = execute_ssh_command(server, cmd)
    if output:
        lines = output.splitlines()
        return {
            'uptime_human': lines[0] if len(lines) > 0 else 'unknown',
            'boot_time': lines[1] if len(lines) > 1 else 'unknown'
        }
    return None

def get_ssh_connections(server):
    cmd = "who | awk '{print $1,$5}'"
    output = execute_ssh_command(server, cmd)
    ssh_connections = []

    if output:
        for line in output.splitlines():
            if '(' in line and ')' in line:
                user, ip_with_parens = line.split()
                ip = ip_with_parens.strip('()')
                ssh_connections.append({'user': user, 'ip': ip})
    return ssh_connections

def get_running_services(server):
    cmd = "systemctl list-units --type=service --state=running --no-legend | awk '{print $1,$4}'"
    output = execute_ssh_command(server, cmd)
    services = []

    if output:
        for line in output.splitlines():
            parts = line.split(None, 1)
            if len(parts) == 2:
                service_name = parts[0].replace('.service', '')
                services.append({
                    'name': service_name,
                    'description': parts[1],
                    'status': 'running'
                })
    return services

def get_failed_services(server):
    """Get failed services"""
    cmd = "systemctl list-units --type=service --state=failed --no-legend | awk '{print $1}'"
    output = execute_ssh_command(server, cmd)
    failed = []

    if output:
        for line in output.splitlines():
            service_name = line.strip().replace('.service', '')
            status = get_service_status(server, service_name)
            failed.append({
                'name': service_name,
                'status': 'failed',
                'reason': status['reason']
            })
    return failed

def get_top_processes_cpu(server, limit=5):
    cmd = f"ps aux --sort=-%cpu | head -n {limit + 1} | tail -n {limit}"
    output = execute_ssh_command(server, cmd)
    processes = []

    if output:
        for line in output.splitlines():
            parts = line.split(None, 10)
            if len(parts) >= 11:
                processes.append({
                    'user': parts[0],
                    'pid': parts[1],
                    'cpu': float(parts[2]),
                    'mem': float(parts[3]),
                    'command': parts[10][:60]
                })
    return processes

def get_top_processes_memory(server, limit=5):
    cmd = f"ps aux --sort=-%mem | head -n {limit + 1} | tail -n {limit}"
    output = execute_ssh_command(server, cmd)
    processes = []

    if output:
        for line in output.splitlines():
            parts = line.split(None, 10)
            if len(parts) >= 11:
                processes.append({
                    'user': parts[0],
                    'pid': parts[1],
                    'cpu': float(parts[2]),
                    'mem': float(parts[3]),
                    'command': parts[10][:60]
                })
    return processes


def check_ping(ip, timeout = 2):
    try:
        result = subprocess.run(['ping', '-c', '1', '-W', str(timeout), ip], capture_output=True, timeout = timeout+1)
        return result.returncode == 0
    except:
        return False

def get_server_status(server):
    """Get comprehensive server status"""
    try:
        test_cmd = "echo 'ok'"
        status = execute_ssh_command(server, test_cmd)


        if status == 'ok':

            ssh_connections = get_ssh_connections(server)
            track_ssh_users(server, ssh_connections)

            return {
                'name': server['name'],
                'group': server.get('group', 'default'),
                'status': 'online',
                'cpu': get_cpu_usage(server),
                'memory': get_memory_info(server),
                'storage': get_storage_info(server),
                'load_average': get_load_average(server),
                'network_stats': get_network_stats(server),
                'uptime': get_uptime(server),
                'ssh_connections': get_ssh_connections(server),
                'services': get_running_services(server),
                'failed_services': get_failed_services(server),
                'top_cpu_processes': get_top_processes_cpu(server),
                'top_mem_processes': get_top_processes_memory(server),
                'last_updated': datetime.now().isoformat()
            }
        else:
            return {
                'name': server['name'],
                'group': server.get('group', 'default'),
                'status': 'offline',
                'error': 'Connection failed',
                'last_updated': datetime.now().isoformat()
            }
    except Exception as e:
        return {
            'name': server['name'],
            'group': server.get('group', 'default'),
            'status': 'offline',
            'error': str(e),
            'last_updated': datetime.now().isoformat()
        }

def update_server_cache():
    """Update server cache in background"""
    servers = []
    with ThreadPoolExecutor(max_workers=30) as executor:
        future_to_server = {executor.submit(get_server_status, server): server for server in Config.SERVERS}
        for future in as_completed(future_to_server):
            result = future.result()
            servers.append(result)

    cache_data = {
        'servers': servers,
        'timestamp': time.time()
    }

    # Save to file
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache_data, f)

    # Save to history for analytics
    save_to_history(servers)

    return cache_data

def save_to_history(servers):
    '''Save server metrics to history - CAPTURES SERVICES/PROCESSES ON ALERTS'''

    cutoff_date = datetime.now() - timedelta(days=200)
    current_time = datetime.now().isoformat()

    # Define thresholds
    CPU_WARNING = 75
    CPU_CRITICAL = 90
    MEM_WARNING = 75
    MEM_CRITICAL = 90
    STORAGE_WARNING = 80
    STORAGE_CRITICAL = 90

    # ==========================================
    # PART 1: Save SIMPLE format for old API
    # ==========================================
    history_simple = []
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r') as f:
            try:
                history_simple = json.load(f)
            except:
                history_simple = []

    if len(history_simple) >= 100:
        history_simple = history_simple[-99:]

    server_data_simple = []
    for s in servers:
        memory_percent = None
        if s.get('memory'):
            mem = s['memory']
            if isinstance(mem, dict) and 'usage_percent' in mem:
                memory_percent = mem['usage_percent']
            elif isinstance(mem, dict) and 'actual_used' in mem and 'total' in mem:
                total = mem.get('total', 0)
                actual_used = mem.get('actual_used', 0)
                if total > 0:
                    memory_percent = round((actual_used / total) * 100, 1)

        server_data_simple.append({
            'name': s['name'],
            'cpu': s.get('cpu'),
            'memory_percent': memory_percent,
            'status': s['status']
        })

    history_simple.append({
        'timestamp': current_time,
        'servers': server_data_simple
    })

    with open(HISTORY_FILE, 'w') as f:
        json.dump(history_simple, f, indent=2)

    # ==========================================
    # PART 2: Build DETAILED format for DATABASE
    # ==========================================
    server_data_detailed = []

    for s in servers:
        # Get memory percentage
        memory_percent = None
        memory_status = 'normal'
        if s.get('memory'):
            mem = s['memory']
            if isinstance(mem, dict) and 'usage_percent' in mem:
                memory_percent = mem['usage_percent']
            elif isinstance(mem, dict) and 'actual_used' in mem and 'total' in mem:
                total = mem.get('total', 0)
                actual_used = mem.get('actual_used', 0)
                if total > 0:
                    memory_percent = round((actual_used / total) * 100, 1)

            if memory_percent:
                if memory_percent > MEM_CRITICAL:
                    memory_status = 'critical'
                elif memory_percent > MEM_WARNING:
                    memory_status = 'warning'

        # Get CPU status
        cpu_usage = s.get('cpu')
        cpu_status = 'normal'
        if cpu_usage:
            if cpu_usage > CPU_CRITICAL:
                cpu_status = 'critical'
            elif cpu_usage > CPU_WARNING:
                cpu_status = 'warning'

        # Get storage status
        storage_data = []
        root_storage_status = 'normal'
        root_storage_percent = None

        for storage in s.get('storage', []):
            storage_info = {
                'mountpoint': storage['mountpoint'],
                'percent': storage.get('percent', 0),
                'size': storage.get('size', 0),
                'used': storage.get('used', 0),
                'available': storage.get('available', 0),
                'status': storage.get('status', 'normal')
            }
            storage_data.append(storage_info)

            if storage['mountpoint'] in ('/', '/root'):
                root_storage_percent = storage.get('percent', 0)
                if root_storage_percent > STORAGE_CRITICAL:
                    root_storage_status = 'critical'
                elif root_storage_percent > STORAGE_WARNING:
                    root_storage_status = 'warning'

        # Collect active alerts
        alerts = []

        if s['status'] != 'online':
            alerts.append({
                'type': 'offline',
                'message': f"Server '{s['name']}' is offline",
                'severity': 'critical'
            })
        else:
            if cpu_status == 'critical':
                alerts.append({
                    'type': 'cpu',
                    'message': f"CPU usage is CRITICAL ({cpu_usage}%)",
                    'severity': 'critical',
                    'value': cpu_usage
                })
            elif cpu_status == 'warning':
                alerts.append({
                    'type': 'cpu',
                    'message': f"CPU usage is HIGH ({cpu_usage}%)",
                    'severity': 'warning',
                    'value': cpu_usage
                })

            if memory_status == 'critical':
                alerts.append({
                    'type': 'memory',
                    'message': f"Memory usage is CRITICAL ({memory_percent}%)",
                    'severity': 'critical',
                    'value': memory_percent
                })
            elif memory_status == 'warning':
                alerts.append({
                    'type': 'memory',
                    'message': f"Memory usage is HIGH ({memory_percent}%)",
                    'severity': 'warning',
                    'value': memory_percent
                })

            if root_storage_status == 'critical':
                alerts.append({
                    'type': 'storage',
                    'message': f"Root storage is CRITICAL ({root_storage_percent}%)",
                    'severity': 'critical',
                    'value': root_storage_percent
                })
            elif root_storage_status == 'warning':
                alerts.append({
                    'type': 'storage',
                    'message': f"Root storage is HIGH ({root_storage_percent}%)",
                    'severity': 'warning',
                    'value': root_storage_percent
                })

        # ==========================================
        # NEW: CAPTURE SERVICES/PROCESSES WHEN ALERT
        # ==========================================
        # If ANY alert exists (warning or critical), capture full context
        if alerts:
            captured_services = s.get('services', [])
            captured_failed_services = s.get('failed_services', [])
            captured_top_cpu = s.get('top_cpu_processes', [])
            captured_top_mem = s.get('top_mem_processes', [])
        else:
            # No alerts = don't waste space storing processes
            captured_services = []
            captured_failed_services = []
            captured_top_cpu = []
            captured_top_mem = []

        server_data_detailed.append({
            'name': s['name'],
            'group': s.get('group', 'default'),
            'status': s['status'],
            'cpu': {
                'value': cpu_usage,
                'status': cpu_status
            },
            'memory': {
                'percent': memory_percent,
                'status': memory_status,
                'total': s.get('memory', {}).get('total') if s.get('memory') else None,
                'used': s.get('memory', {}).get('actual_used') if s.get('memory') else None
            },
            'storage': storage_data,
            'root_storage': {
                'percent': root_storage_percent,
                'status': root_storage_status
            },
            'load_average': s.get('load_average'),
            'uptime': s.get('uptime'),
            'alerts': alerts,
            'alert_count': len(alerts),

            # NEW FIELDS - Services and Processes
            'services': captured_services,
            'failed_services': captured_failed_services,
            'top_cpu_processes': captured_top_cpu,
            'top_mem_processes': captured_top_mem
        })

    # Save to SQLite DATABASE
    db.save_server_metrics(server_data_detailed)



def load_cache():
    """Load cache from file"""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return None

@bp.route('/home')
def index():
    return render_template('index.html', user='Admin', url_prefix="/monitoring_server")

@bp.route('/api/time')
def get_time():
    return jsonify({
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
        'timezone': 'UTC'
    })

@bp.route('/api/status')
def get_status():
    """Get server status from cache or update"""
    cache = load_cache()

    # If cache is old or doesn't exist, update in background
    if not cache or (time.time() - cache['timestamp']) > Config.CACHE_TIMEOUT:
        cache = update_server_cache()

    return jsonify(cache)

@bp.route('/api/refresh')
def force_refresh():
    """Force refresh server data"""
    cache = update_server_cache()
    return jsonify(cache)

@bp.route('/api/analytics')
def get_analytics():
    """Get historical data for analytics"""
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r') as f:
            try:
                history = json.load(f)
                return jsonify(history)
            except:
                return jsonify([])
    return jsonify([])

# @bp.route('/api/server_metrics_history')
# def get_server_metrics_history():
#     """Get time-series metrics for charting"""
#     server_name = request.args.get('server')
#     days = int(request.args.get('days', 7))

#     if not server_name:
#         return jsonify({'error': 'Server name required'}), 400

#     if os.path.exists(HISTORY_FILE1):
#         with open(HISTORY_FILE1, 'r') as f:
#             try:
#                 history = json.load(f)
#             except json.JSONDecodeError as e:
#                 print(f"Error loading history: {e}")
#                 return jsonify({'error': 'Failed to load history'}), 500
#     else:
#         return jsonify({'metrics': []})

#     cutoff_date = datetime.now() - timedelta(days=days)

#     metrics = []
#     for entry in history:
#         try:
#             entry_date = datetime.fromisoformat(entry['timestamp'])
#             if entry_date < cutoff_date:
#                 continue

#             for server in entry['servers']:
#                 if server['name'] == server_name:
#                     # Safely extract values with defaults
#                     cpu_data = server.get('cpu', {})
#                     memory_data = server.get('memory', {})
#                     storage_data = server.get('root_storage', {})

#                     metrics.append({
#                         'timestamp': entry['timestamp'],
#                         'cpu': cpu_data.get('value') if isinstance(cpu_data, dict) else cpu_data,
#                         'cpu_status': cpu_data.get('status', 'unknown') if isinstance(cpu_data, dict) else 'normal',
#                         'memory': memory_data.get('percent') if isinstance(memory_data, dict) else memory_data,
#                         'memory_status': memory_data.get('status', 'unknown') if isinstance(memory_data, dict) else 'normal',
#                         'root_storage': storage_data.get('percent') if isinstance(storage_data, dict) else None,
#                         'storage_status': storage_data.get('status', 'unknown') if isinstance(storage_data, dict) else 'normal',
#                         'status': server.get('status', 'unknown'),
#                         'alert_count': server.get('alert_count', 0)
#                     })
#                     break
#         except Exception as e:
#             print(f"Error processing history entry: {e}")
#             continue

#     return jsonify({'metrics': metrics})

@bp.route('/api/server_metrics_history')
def get_server_metrics_history():
    """Get time-series metrics for charting - FROM DATABASE"""
    server_name = request.args.get('server')
    days = int(request.args.get('days', 7))

    if not server_name:
        return jsonify({'error': 'Server name required'}), 400

    # Query from DATABASE
    metrics = db.get_server_metrics_history(server_name, days)
    return jsonify({'metrics': metrics}), 400

    # Query from DATABASE
    metrics = db.get_server_metrics_history(server_name, days)

    return jsonify({'metrics': metrics})



# @bp.route('/api/alert_history')
# def get_alert_history():
#     """Get alert history with filtering options"""
#     server_name = request.args.get('server')
#     alert_type = request.args.get('type')  # cpu, memory, storage, offline
#     severity = request.args.get('severity')  # warning, critical
#     days = int(request.args.get('days', 7))  # Default last 7 days

#     if os.path.exists(HISTORY_FILE1):
#         with open(HISTORY_FILE1, 'r') as f:
#             try:
#                 history = json.load(f)
#             except json.JSONDecodeError as e:
#                 print(f"Error loading history: {e}")
#                 return jsonify({'error': 'Failed to load history'}), 500
#     else:
#         return jsonify({'alerts': [], 'summary': {}})

#     # Calculate cutoff date
#     cutoff_date = datetime.now() - timedelta(days=days)

#     # Filter and collect alerts
#     alerts_timeline = []
#     alert_summary = {
#         'total_alerts': 0,
#         'by_server': defaultdict(int),
#         'by_type': defaultdict(int),
#         'by_severity': defaultdict(int)
#     }

#     for entry in history:
#         try:
#             entry_date = datetime.fromisoformat(entry['timestamp'])
#             if entry_date < cutoff_date:
#                 continue

#             for server in entry['servers']:
#                 # Apply filters
#                 if server_name and server['name'] != server_name:
#                     continue

#                 for alert in server.get('alerts', []):
#                     # Apply type filter
#                     if alert_type and alert['type'] != alert_type:
#                         continue

#                     # Apply severity filter
#                     if severity and alert['severity'] != severity:
#                         continue

#                     alerts_timeline.append({
#                         'timestamp': entry['timestamp'],
#                         'server': server['name'],
#                         'group': server.get('group', 'default'),
#                         'type': alert['type'],
#                         'severity': alert['severity'],
#                         'message': alert['message'],
#                         'value': alert.get('value')
#                     })

#                     # Update summary
#                     alert_summary['total_alerts'] += 1
#                     alert_summary['by_server'][server['name']] += 1
#                     alert_summary['by_type'][alert['type']] += 1
#                     alert_summary['by_severity'][alert['severity']] += 1
#         except Exception as e:
#             print(f"Error processing alert history: {e}")
#             continue

#     # Convert defaultdicts to regular dicts
#     summary = {
#         'total_alerts': alert_summary['total_alerts'],
#         'by_server': dict(alert_summary['by_server']),
#         'by_type': dict(alert_summary['by_type']),
#         'by_severity': dict(alert_summary['by_severity']),
#         'date_range': {
#             'from': cutoff_date.isoformat(),
#             'to': datetime.now().isoformat()
#         }
#     }

#     return jsonify({
#         'alerts': alerts_timeline,
#         'summary': summary
#     })

@bp.route('/api/alert_history')
def get_alert_history():
    """Get alert history with filtering - FROM DATABASE"""
    server_name = request.args.get('server')
    alert_type = request.args.get('type')
    severity = request.args.get('severity')
    days = int(request.args.get('days', 7))

    # Query from DATABASE
    alerts, summary = db.get_alert_history(server_name, alert_type, severity, days)
    return jsonify({'alerts': alerts, 'summary': summary})


# @bp.route('/api/server_comparison')
# def get_server_comparison():
#     """Compare metrics across multiple servers"""
#     server_names = request.args.getlist('servers')  # Can pass multiple servers
#     days = int(request.args.get('days', 1))

#     if not server_names:
#         return jsonify({'error': 'At least one server name required'}), 400

#     if os.path.exists(HISTORY_FILE1):
#         with open(HISTORY_FILE1, 'r') as f:
#             try:
#                 history = json.load(f)
#             except json.JSONDecodeError as e:
#                 print(f"Error loading history: {e}")
#                 return jsonify({'error': 'Failed to load history'}), 500
#     else:
#         return jsonify({'comparison': []})

#     cutoff_date = datetime.now() - timedelta(days=days)

#     # Structure: {timestamp: {server_name: metrics}}
#     comparison_data = defaultdict(dict)

#     for entry in history:
#         try:
#             entry_date = datetime.fromisoformat(entry['timestamp'])
#             if entry_date < cutoff_date:
#                 continue

#             timestamp = entry['timestamp']

#             for server in entry['servers']:
#                 if server['name'] in server_names:
#                     cpu_data = server.get('cpu', {})
#                     memory_data = server.get('memory', {})
#                     storage_data = server.get('root_storage', {})

#                     comparison_data[timestamp][server['name']] = {
#                         'cpu': cpu_data.get('value') if isinstance(cpu_data, dict) else cpu_data,
#                         'memory': memory_data.get('percent') if isinstance(memory_data, dict) else memory_data,
#                         'root_storage': storage_data.get('percent') if isinstance(storage_data, dict) else None,
#                         'status': server.get('status'),
#                         'alert_count': server.get('alert_count', 0)
#                     }
#         except Exception as e:
#             print(f"Error processing comparison data: {e}")
#             continue

#     # Convert to list format
#     comparison_list = [
#         {'timestamp': ts, 'servers': servers}
#         for ts, servers in sorted(comparison_data.items())
#     ]

#     return jsonify({'comparison': comparison_list})

@bp.route('/api/server_comparison')
def get_server_comparison():
    """Compare metrics across multiple servers - FROM DATABASE"""
    server_names = request.args.getlist('servers')
    days = int(request.args.get('days', 1))

    if not server_names:
        return jsonify({'error': 'At least one server name required'}), 400

    # Query from DATABASE
    comparison = db.get_server_comparison(server_names, days)

    return jsonify({'comparison': comparison})



@bp.route('/api/alert_trends')
def get_alert_trends():
    """Get alert trends over time"""
    days = int(request.args.get('days', 30))

    if os.path.exists(HISTORY_FILE1):
        with open(HISTORY_FILE1, 'r') as f:
            try:
                history = json.load(f)
            except json.JSONDecodeError as e:
                print(f"Error loading history: {e}")
                return jsonify({'error': 'Failed to load history'}), 500
    else:
        return jsonify({'trends': []})

    cutoff_date = datetime.now() - timedelta(days=days)

    # Group by date
    daily_alerts = defaultdict(lambda: {
        'total': 0,
        'critical': 0,
        'warning': 0,
        'by_type': defaultdict(int)
    })

    for entry in history:
        try:
            entry_date = datetime.fromisoformat(entry['timestamp'])
            if entry_date < cutoff_date:
                continue

            date_key = entry_date.strftime('%Y-%m-%d')

            for server in entry['servers']:
                for alert in server.get('alerts', []):
                    daily_alerts[date_key]['total'] += 1

                    if alert['severity'] == 'critical':
                        daily_alerts[date_key]['critical'] += 1
                    elif alert['severity'] == 'warning':
                        daily_alerts[date_key]['warning'] += 1

                    daily_alerts[date_key]['by_type'][alert['type']] += 1
        except Exception as e:
            print(f"Error processing alert trends: {e}")
            continue

    # Convert to list
    trends = [
        {
            'date': date,
            'total': stats['total'],
            'critical': stats['critical'],
            'warning': stats['warning'],
            'by_type': dict(stats['by_type'])
        }
        for date, stats in sorted(daily_alerts.items())
    ]

    return jsonify({'trends': trends})


# @bp.route('/api/server_health_score')
# def get_server_health_score():
#     """Calculate health score for servers"""
#     days = int(request.args.get('days', 7))

#     if os.path.exists(HISTORY_FILE1):
#         with open(HISTORY_FILE1, 'r') as f:
#             try:
#                 history = json.load(f)
#             except json.JSONDecodeError as e:
#                 print(f"Error loading history: {e}")
#                 return jsonify({'error': 'Failed to load history'}), 500
#     else:
#         return jsonify({'health_scores': []})

#     cutoff_date = datetime.now() - timedelta(days=days)

#     server_stats = defaultdict(lambda: {
#         'total_checks': 0,
#         'online_checks': 0,
#         'critical_alerts': 0,
#         'warning_alerts': 0,
#         'avg_cpu': [],
#         'avg_memory': [],
#         'avg_storage': []
#     })

#     for entry in history:
#         try:
#             entry_date = datetime.fromisoformat(entry['timestamp'])
#             if entry_date < cutoff_date:
#                 continue

#             for server in entry['servers']:
#                 name = server['name']
#                 stats = server_stats[name]

#                 stats['total_checks'] += 1

#                 if server['status'] == 'online':
#                     stats['online_checks'] += 1

#                 # Handle both dict and scalar formats
#                 cpu_data = server.get('cpu', {})
#                 if isinstance(cpu_data, dict):
#                     cpu_value = cpu_data.get('value')
#                 else:
#                     cpu_value = cpu_data
#                 if cpu_value:
#                     stats['avg_cpu'].append(cpu_value)

#                 memory_data = server.get('memory', {})
#                 if isinstance(memory_data, dict):
#                     memory_value = memory_data.get('percent')
#                 else:
#                     memory_value = memory_data
#                 if memory_value:
#                     stats['avg_memory'].append(memory_value)

#                 storage_data = server.get('root_storage', {})
#                 if isinstance(storage_data, dict):
#                     storage_value = storage_data.get('percent')
#                 else:
#                     storage_value = None
#                 if storage_value:
#                     stats['avg_storage'].append(storage_value)

#                 # Count alerts
#                 for alert in server.get('alerts', []):
#                     if alert['severity'] == 'critical':
#                         stats['critical_alerts'] += 1
#                     elif alert['severity'] == 'warning':
#                         stats['warning_alerts'] += 1
#         except Exception as e:
#             print(f"Error processing health score: {e}")
#             continue

#     # Calculate health scores
#     health_scores = []
#     for server_name, stats in server_stats.items():
#         if stats['total_checks'] == 0:
#             continue

#         # Health score factors (0-100)
#         uptime_score = (stats['online_checks'] / stats['total_checks']) * 100

#         # Average resource usage (lower is better)
#         avg_cpu = sum(stats['avg_cpu']) / len(stats['avg_cpu']) if stats['avg_cpu'] else 0
#         avg_memory = sum(stats['avg_memory']) / len(stats['avg_memory']) if stats['avg_memory'] else 0
#         avg_storage = sum(stats['avg_storage']) / len(stats['avg_storage']) if stats['avg_storage'] else 0

#         resource_score = max(0, 100 - ((avg_cpu + avg_memory + avg_storage) / 3))

#         # Alert penalty
#         alert_penalty = (stats['critical_alerts'] * 10) + (stats['warning_alerts'] * 5)

#         # Final health score
#         health_score = max(0, min(100, (uptime_score * 0.4 + resource_score * 0.4) - alert_penalty * 0.2))

#         health_scores.append({
#             'server': server_name,
#             'health_score': round(health_score, 1),
#             'uptime_percent': round(uptime_score, 1),
#             'avg_cpu': round(avg_cpu, 1),
#             'avg_memory': round(avg_memory, 1),
#             'avg_storage': round(avg_storage, 1),
#             'critical_alerts': stats['critical_alerts'],
#             'warning_alerts': stats['warning_alerts']
#         })

#     return jsonify({'health_scores': sorted(health_scores, key=lambda x: x['health_score'], reverse=True)})

@bp.route('/api/server_health_score')
def get_server_health_score():
    """Calculate health score for servers - FROM DATABASE"""
    days = int(request.args.get('days', 7))

    # Query from DATABASE
    health_scores = db.get_server_health_scores(days)

    return jsonify({'health_scores': health_scores})


@bp.route('/api/alerts')
def alerts():
    cache = load_cache()
    if not cache:
        cache = update_server_cache()

    alerts = []
    alert_servers = set()

    # --- CONFIGURATION: Define Warning & Critical Limits ---
    # CPU Thresholds
    CPU_WARNING = 75        # Warning > 75%
    CPU_CRITICAL = 90       # Critical > 90%

    # Memory Thresholds
    MEM_WARNING = 75        # Warning > 75%
    MEM_CRITICAL = 90       # Critical > 90%

    # Storage Thresholds (Root partition)
    STORAGE_WARNING = 80    # Warning > 80%
    STORAGE_CRITICAL = 90   # Critical > 90%
    # -----------------------------------------------------

    for server in cache['servers']:
        server_has_alert = False

        # 1) Server offline (Always Critical)
        if server['status'] != 'online':
            msg = f"Server '{server['name']}' is offline"
            alerts.append({
                'server': server['name'],
                'type': 'Offline',
                'message': msg,
                'state': 'alert' # Offline is always critical
            })
            alert_servers.add(server['name'])

            send_alert_to_socket(
                category="server",
                alert_type="offline",
                message=msg,
                server_name=server['name'],
                metadata={"source_system": "server_monitor", "status": server['status']},
            )
            continue

        # 2) CPU (Updated to have Warning & Critical)
        cpu_usage = server.get('cpu')
        if cpu_usage:
            state = None
            alert_type = None

            if cpu_usage > CPU_CRITICAL:
                state = "alert"
                msg = f"CPU usage is CRITICAL ({cpu_usage}%)"
                alert_type = "alert"
            elif cpu_usage > CPU_WARNING:
                state = "warning"
                msg = f"CPU usage is HIGH ({cpu_usage}%)"
                alert_type = "warning"

            if state:
                alerts.append({
                    'server': server['name'],
                    'type': 'CPU',
                    'message': msg,
                    'state': state,
                })
                server_has_alert = True

                send_alert_to_socket(
                    category="server",
                    alert_type=alert_type,
                    message=msg,
                    server_name=server['name'],
                    metadata={"cpu": cpu_usage, "state": state},
                )

        # 3) Memory (Existing Warning/Critical Logic)
        mem = server.get('memory')
        if mem:
            usage = mem.get('usage_percent', 0)
            state = None
            alert_type = None

            if usage > MEM_CRITICAL:
                state = "alert"
                msg = f"Memory usage is CRITICAL ({usage}%)"
                alert_type = "alert"
            elif usage > MEM_WARNING:
                state = "warning"
                msg = f"Memory usage is HIGH ({usage}%)"
                alert_type = "warning"

            if state:
                alerts.append({
                    'server': server['name'],
                    'type': 'Memory',
                    'message': msg,
                    'state': state,
                })
                server_has_alert = True

                send_alert_to_socket(
                    category="server",
                    alert_type=alert_type,
                    message=msg,
                    server_name=server['name'],
                    metadata={"memory_usage": usage, "state": state},
                )

        # 4) Storage (Updated to have Warning & Critical)
        for storage in server.get('storage', []):
            # Check strictly for root or main mountpoints
            if storage['mountpoint'] in ('/', '/root'):
                usage = storage.get('percent', 0)
                state = None
                alert_type = None

                if usage > STORAGE_CRITICAL:
                    state = "alert"
                    msg = f"Root storage is CRITICAL ({usage}%)"
                    alert_type = "alert"
                elif usage > STORAGE_WARNING:
                    state = "warning"
                    msg = f"Root storage is HIGH ({usage}%)"
                    alert_type = "warning"

                if state:
                    alerts.append({
                        'server': server['name'],
                        'type': 'Storage',
                        'message': msg,
                        'state': state,
                    })
                    server_has_alert = True

                    send_alert_to_socket(
                        category="server",
                        alert_type=alert_type,
                        message=msg,
                        server_name=server['name'],
                        metadata={
                            "mountpoint": storage['mountpoint'],
                            "percent": usage,
                            "state": state
                        },
                    )
                    break

        if server_has_alert:
            alert_servers.add(server['name'])

    return jsonify({
        'alerts': alerts,
        'total_servers': len(cache['servers']),
        'alert_servers': len(alert_servers),
    })

@bp.route('/api/kick_ssh', methods=['POST'])
def kick_ssh_user():
    data = request.get_json()

    if not data or 'server' not in data or 'ip' not in data:
        return jsonify({'success': False, 'error': 'Missing parameters'})

    server = next((s for s in Config.SERVERS if s['name'] == data['server']), None)

    if not server:
        return jsonify({'success': False, 'error': 'Server not found'})

    try:
        cmd = f"who | grep {data['ip']} | awk '{{print $2}}' | xargs -r pkill -9 -t"
        execute_ssh_command(server, cmd)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@bp.route('/api/user_services', methods=['POST'])
def user_services():
    data = request.get_json()

    if not data or 'server' not in data:
        return jsonify({'success': False, 'error': 'Missing parameters'}), 400

    server = next((s for s in Config.SERVERS if s['name'] == data['server']), None)

    if not server:
        return jsonify({'success': False, 'error': 'Server not found'}), 404

    remote_cmd = """
    who | awk '{print $1, $2, $3, $4, $5}' | tr -d '()' | while read user tty date time ip; do ps -ft "$tty" | awk -v u="$user" -v i="$ip" -v d="$date" -v t="$time" 'NR>1 {printf "USER=%s IP=%s LOGIN=%s %s TTY=%s PID=%s CMD=%s\n", u, i, d, t, $2, $1, substr($0, index($0,$8))}'; done
    """

    output = execute_ssh_command(server, remote_cmd)
    process_list = []

    if output:
        for line in output.splitlines():
            parts = line.split()
            try:
                user = parts[0].split('=')[1]
                ip = parts[1].split('=')[1]
                login_date = parts[2].split('=')[1]
                login_time = parts[3]
                tty = parts[4].split('=')[1]
                pid = parts[5].split('=')[1]
                cmd = ' '.join(parts[6:])[4:]

                process_list.append({
                    "user": user,
                    "ip": ip,
                    "login_date": login_date,
                    "login_time": login_time,
                    "tty": tty,
                    "pid": pid,
                    "cmd": cmd
                })
            except:
                continue

    return jsonify({"success": True, "processes": process_list})

# Create directories
os.makedirs(DETAILED_HISTORY_DIR, exist_ok=True)

def execute_ssh_command(server, command, timeout=10):
    """Execute SSH command using subprocess"""
    ssh_command = [
        'sshpass', '-p', server['password'],
        'ssh', '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=5',
        f"{server['username']}@{server['ip']}",
        command
    ]

    try:
        result = subprocess.run(ssh_command, capture_output=True, text=True, timeout=timeout)
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except:
        return None

def track_ssh_users(server, ssh_connections):
    """Track SSH user sessions with accurate per-session timestamps"""
    tracking_data = load_user_tracking()
    current_time = datetime.now()
    config_ips = [s['ip'] for s in Config.SERVERS]

    if not ssh_connections:
        # No connections - mark active sessions as logged out for this server
        for session_key, session_info in tracking_data.items():
            if session_info['server_name'] == server['name']:
                if session_info['session_history']:
                    last_session = session_info['session_history'][-1]
                    if last_session['logout_time'] is None:
                        last_session['logout_time'] = current_time.isoformat()

                        login_time = datetime.fromisoformat(last_session['login_time'])
                        duration_seconds = (current_time - login_time).total_seconds()
                        last_session['duration'] = round(duration_seconds, 2)

        save_user_tracking(tracking_data)
        return

    # Get active IPs on this server
    active_ips_on_server = set()
    active_users = {}

    for conn in ssh_connections:
        user_ip = conn['ip']
        if user_ip not in config_ips:
            active_ips_on_server.add(user_ip)
            active_users[user_ip] = conn['user']

    # Check existing sessions and mark logged out if not in active list
    for session_key, session_info in list(tracking_data.items()):
        if session_info['server_name'] == server['name']:
            user_ip = session_info['user_ip']

            if user_ip not in active_ips_on_server:
                if session_info['session_history']:
                    last_session = session_info['session_history'][-1]
                    if last_session['logout_time'] is None:
                        last_session['logout_time'] = current_time.isoformat()

                        login_time = datetime.fromisoformat(last_session['login_time'])
                        duration_seconds = (current_time - login_time).total_seconds()
                        last_session['duration'] = round(duration_seconds, 2)

    # Process active connections
    for conn in ssh_connections:
        user_ip = conn['ip']
        user_name = conn['user']

        if user_ip in config_ips:
            continue

        session_key = f"{user_ip}_{server['name']}"

        if session_key not in tracking_data:
            # Brand new session for this user on this server
            tracking_data[session_key] = {
                'user_ip': user_ip,
                'user_name': user_name,
                'server_name': server['name'],
                'server_ip': server['ip'],
                'first_seen': current_time.isoformat(),
                'last_seen': current_time.isoformat(),
                'total_sessions': 1,
                'session_history': [{
                    'login_time': current_time.isoformat(),
                    'logout_time': None,
                    'duration': None,
                    'last_updated': current_time.isoformat()
                }]
            }
        else:
            # Existing session - update last_seen
            tracking_data[session_key]['last_seen'] = current_time.isoformat()
            tracking_data[session_key]['user_name'] = user_name

            if tracking_data[session_key]['session_history']:
                last_session = tracking_data[session_key]['session_history'][-1]

                # If last session was closed, start new one
                if last_session['logout_time'] is not None:
                    # New session started
                    tracking_data[session_key]['total_sessions'] += 1
                    tracking_data[session_key]['session_history'].append({
                        'login_time': current_time.isoformat(),
                        'logout_time': None,
                        'duration': None,
                        'last_updated': current_time.isoformat()
                    })
                else:
                    # Update existing active session
                    last_session['last_updated'] = current_time.isoformat()

    save_user_tracking(tracking_data)

def save_detailed_history(server_data):
    """Save detailed server history by date"""
    today = datetime.now().strftime('%Y-%m-%d')
    history_file = os.path.join(DETAILED_HISTORY_DIR, f'{today}.json')

    history = []
    if os.path.exists(history_file):
        with open(history_file, 'r') as f:
            try:
                history = json.load(f)
            except:
                history = []

    # Build server metrics with proper memory percentage
    server_metrics = []
    for s in server_data:
        memory_percent = None

        if s.get('memory'):
            mem = s['memory']
            if isinstance(mem, dict) and 'usage_percent' in mem:
                memory_percent = mem['usage_percent']
            elif isinstance(mem, dict) and 'actual_used' in mem and 'total' in mem:
                total = mem.get('total', 0)
                actual_used = mem.get('actual_used', 0)
                if total > 0:
                    memory_percent = round((actual_used / total) * 100, 1)

        server_metrics.append({
            'name': s['name'],
            'cpu': s.get('cpu'),
            'memory_percent': memory_percent,
            'status': s['status']
        })

    history.append({
        'timestamp': datetime.now().isoformat(),
        'servers': server_metrics
    })

    # Keep only last 288 entries (24 hours at 5-minute intervals)
    if len(history) > 288:
        history = history[-288:]

    with open(history_file, 'w') as f:
        json.dump(history, f, indent=2)



def load_user_tracking():
    """Load user tracking data"""
    if os.path.exists(USER_TRACKING_FILE):
        with open(USER_TRACKING_FILE, 'r') as f:
            try:
                return json.load(f)
            except:
                return {}
    return {}

def save_user_tracking(data):
    """Save user tracking data"""
    with open(USER_TRACKING_FILE, 'w') as f:
        json.dump(data, f, indent=2)

# @bp.route('/api/user_tracking')
# def get_user_tracking():
#     """Get user tracking information"""
#     tracking_data = load_user_tracking()

#     # Process and format data
#     users_by_ip = defaultdict(list)

#     for session_key, session_data in tracking_data.items():
#         user_ip = session_data['user_ip']
#         users_by_ip[user_ip].append(session_data)

#     formatted_data = []
#     for user_ip, sessions in users_by_ip.items():
#         total_time_seconds = 0
#         servers = []

#         for session in sessions:
#             servers.append({
#                 'server_name': session['server_name'],
#                 'server_ip': session['server_ip'],
#                 'first_seen': session['first_seen'],
#                 'last_seen': session['last_seen'],
#                 'session_count': session['total_sessions']
#             })

#             # Calculate total time from all session histories
#             for history in session.get('session_history', []):
#                 if history.get('duration'):
#                     total_time_seconds += history['duration']
#                 elif history.get('logout_time') is None and history.get('login_time'):
#                     # Session still active, calculate current duration
#                     try:
#                         login_time = datetime.fromisoformat(history['login_time'])
#                         current_duration = (datetime.now() - login_time).total_seconds()
#                         total_time_seconds += current_duration
#                     except:
#                         pass

#         formatted_data.append({
#             'user_ip': user_ip,
#             'user_name': sessions[0]['user_name'],
#             'servers': servers,
#             'total_servers': len(servers),
#             'total_time_hours': round(total_time_seconds / 3600, 2)
#         })

#     return jsonify({'users': formatted_data})

@bp.route('/api/user_tracking')
def get_user_tracking():
    tracking_data = load_user_tracking()
    users_by_ip = defaultdict(list)
    
    # ✅ Get all server IPs from config to exclude
    server_ips = {server['ip'] for server in Config.SERVERS}
    
    for session_key, session_data in tracking_data.items():
        user_ip = session_data['user_ip']
        
        # ✅ Skip if user_ip is a server IP (server-to-server connection)
        if user_ip in server_ips:
            continue
        
        # ✅ Skip if user_ip looks like a display (starts with :)
        if user_ip.startswith(':'):
            continue
        
        users_by_ip[user_ip].append(session_data)
    
    formatted_data = []
    current_time = datetime.now()
    
    for user_ip, sessions in users_by_ip.items():
        user_total_time_seconds = 0
        servers = []
        
        for session in sessions:
            # ✅ SIMPLE: Calculate duration from first_seen to last_seen
            try:
                first_seen = datetime.fromisoformat(session['first_seen'])
                last_seen = datetime.fromisoformat(session['last_seen'])
                
                # Calculate total duration for this server
                server_time_seconds = (last_seen - first_seen).total_seconds()
                
                # Check if currently active (last_seen within 5 minutes)
                time_since_last_seen = (current_time - last_seen).total_seconds() / 60
                is_active = time_since_last_seen <= 5
                
            except Exception as e:
                print(f"Error calculating duration for {user_ip} on {session['server_name']}: {e}")
                server_time_seconds = 0
                is_active = False
            
            user_total_time_seconds += server_time_seconds
            
            servers.append({
                'server_name': session['server_name'],
                'server_ip': session['server_ip'],
                'first_seen': session['first_seen'],
                'last_seen': session['last_seen'],
                'session_count': session['total_sessions'],
                'time_spent_seconds': round(server_time_seconds, 2),
                'time_spent_minutes': round(server_time_seconds / 60, 2),
                'time_spent_hours': round(server_time_seconds / 3600, 2),
                'is_active': is_active
            })
        
        formatted_data.append({
            'user_ip': user_ip,
            'username': sessions[0]['user_name'],
            'servers': servers,
            'total_servers': len(servers),
            'total_time_seconds': round(user_total_time_seconds, 2),
            'total_time_hours': round(user_total_time_seconds / 3600, 2)
        })
    
    return jsonify({'users': formatted_data})






def collect_ssh_sessions(server_config):
    """Collect SSH sessions with ACTUAL login times from 'who' command"""
    try:
        print(f"🔍 Collecting sessions from {server_config['name']}")
        
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(
            hostname=server_config['ip'],
            username=server_config['username'],
            password=server_config['password'],
            timeout=10
        )
        
        stdin, stdout, stderr = ssh.exec_command('who')
        who_output = stdout.read().decode('utf-8')
        ssh.close()
        
        print(f"📋 WHO output for {server_config['name']}:")
        print(who_output)
        
        sessions = []
        for line in who_output.strip().split('\n'):
            if not line.strip():
                continue
            
            parts = line.split()
            print(f"   Parts: {parts} (length: {len(parts)})")
            
            if len(parts) < 5:
                print(f"   ⚠️ Skipping line (less than 5 parts): {line}")
                continue
            
            user = parts[0]
            terminal = parts[1]
            date_str = parts[2]
            time_str = parts[3]
            ip_with_parens = parts[4]
            
            try:
                login_datetime_str = f"{date_str} {time_str}"
                login_datetime = datetime.strptime(login_datetime_str, '%Y-%m-%d %H:%M')
                from_ip = ip_with_parens.strip('()')
                
                print(f"   ✅ Parsed: {user} @ {from_ip}, login: {login_datetime.isoformat()}")
                
                sessions.append({
                    'user': user,
                    'terminal': terminal,
                    'login_time': login_datetime.isoformat(),
                    'from': from_ip
                })
                
            except Exception as e:
                print(f"   ❌ Error parsing: {e}")
                continue
        
        print(f"✅ Collected {len(sessions)} sessions from {server_config['name']}")
        return sessions
        
    except Exception as e:
        print(f"❌ Error collecting from {server_config['name']}: {e}")
        return []




def get_server_current_time(server_name, server_ip):
    """Get current time from the actual server"""
    try:
        # Find server credentials
        server_config = None
        for group_servers in Config.SERVER_GROUPS.values():
            for srv in group_servers:
                if srv['name'] == server_name or srv['ip'] == server_ip:
                    server_config = srv
                    break
            if server_config:
                break
        
        if not server_config:
            print(f"Server config not found for {server_name}")
            return datetime.now()
        
        # SSH to server and get current time
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(
            hostname=server_config['ip'],
            username=server_config['username'],
            password=server_config['password'],
            timeout=5
        )
        
        # Get server's current time
        stdin, stdout, stderr = ssh.exec_command('date "+%Y-%m-%d %H:%M:%S"')
        time_str = stdout.read().decode().strip()
        ssh.close()
        
        # Parse the time
        server_time = datetime.strptime(time_str, '%Y-%m-%d %H:%M:%S')
        return server_time
        
    except Exception as e:
        print(f"Error getting server time for {server_name}: {e}")
        # Fallback to current time
        return datetime.now()


@bp.route('/api/debug/tracking')
def debug_tracking():
    tracking_data = load_user_tracking()
    return jsonify({
        'tracking_data': tracking_data,
        'total_entries': len(tracking_data)
    })


def update_user_tracking(server_name, server_ip, ssh_sessions):
    """Update user tracking with ACTUAL login times"""
    tracking_data = load_user_tracking()
    current_time = datetime.now().isoformat()
    
    # Track which sessions are currently active
    active_keys = set()
    
    for session in ssh_sessions:
        user_name = session['user']
        user_ip = session['from']
        terminal = session['terminal']
        login_time = session['login_time']  # ✅ Use actual login time from 'who'
        
        # Create unique session key (per user IP and server)
        session_key = f"{user_ip}_{server_name}"
        active_keys.add(session_key)
        
        if session_key in tracking_data:
            # 🔥 UPDATE EXISTING SESSION
            tracking_data[session_key]['last_seen'] = current_time
            
            # Check if this terminal already exists in session history
            session_history = tracking_data[session_key].get('session_history', [])
            terminal_found = False
            
            for hist in session_history:
                # If same terminal and login time, just update timestamp
                if (hist.get('terminal') == terminal and 
                    hist.get('login_time') == login_time and
                    hist.get('logout_time') is None):
                    hist['last_updated'] = current_time
                    terminal_found = True
                    break
            
            # If this is a new terminal/session, add it
            if not terminal_found:
                session_history.append({
                    'login_time': login_time,  # ✅ Actual login time
                    'logout_time': None,
                    'duration': None,
                    'terminal': terminal,
                    'last_updated': current_time
                })
                tracking_data[session_key]['total_sessions'] += 1
            
            tracking_data[session_key]['session_history'] = session_history
            
        else:
            # 🔥 NEW SESSION
            tracking_data[session_key] = {
                'user_name': user_name,
                'user_ip': user_ip,
                'server_name': server_name,
                'server_ip': server_ip,
                'first_seen': login_time,  # ✅ Use actual login time as first_seen
                'last_seen': current_time,
                'total_sessions': 1,
                'session_history': [{
                    'login_time': login_time,  # ✅ Actual login time
                    'logout_time': None,
                    'duration': None,
                    'terminal': terminal,
                    'last_updated': current_time
                }]
            }
    
    # 🔥 Mark sessions that are no longer active
    for session_key, session_data in tracking_data.items():
        if session_data['server_ip'] == server_ip:
            if session_key not in active_keys:
                # Session ended - mark all active sessions as ended
                for hist in session_data.get('session_history', []):
                    if hist.get('logout_time') is None:
                        hist['logout_time'] = current_time
                        
                        # Calculate duration
                        try:
                            login = datetime.fromisoformat(hist['login_time'])
                            logout = datetime.fromisoformat(current_time)
                            hist['duration'] = (logout - login).total_seconds()
                        except:
                            pass
    
    save_user_tracking(tracking_data)


@bp.route('/api/test/who/<server_name>')
def test_who_parsing(server_name):
    """Test who command parsing for a specific server"""
    try:
        # Find server config
        server_config = None
        for group_servers in Config.SERVER_GROUPS.values():
            for srv in group_servers:
                if srv['name'] == server_name:
                    server_config = srv
                    break
            if server_config:
                break
        
        if not server_config:
            return jsonify({'error': f'Server {server_name} not found'}), 404
        
        # Connect and get who output
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(
            hostname=server_config['ip'],
            username=server_config['username'],
            password=server_config['password'],
            timeout=10
        )
        
        stdin, stdout, stderr = ssh.exec_command('who')
        who_output = stdout.read().decode('utf-8')
        ssh.close()
        
        # Parse each line
        parsed_sessions = []
        for line in who_output.strip().split('\n'):
            if not line.strip():
                continue
            
            parts = line.split()
            parsed_sessions.append({
                'raw_line': line,
                'parts': parts,
                'part_count': len(parts)
            })
        
        return jsonify({
            'server': server_name,
            'raw_output': who_output,
            'parsed_sessions': parsed_sessions
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def collect_server_data():
    """Background thread to collect server data"""
    while True:
        try:
            for server in Config.SERVERS:
                try:
                    # OLD CODE - REMOVE THIS
                    # ssh_connections = get_ssh_connections(server)
                    # track_ssh_users(server, ssh_connections)
                    
                    # ✅ NEW CODE - ADD THIS
                    sessions = collect_ssh_sessions(server)
                    update_user_tracking(server['name'], server['ip'], sessions)
                    
                except Exception as e:
                    print(f"Error processing server {server['name']}: {e}")
            
            time.sleep(30)
            
        except Exception as e:
            print(f"Error in collection loop: {e}")
            time.sleep(30)




def get_ssh_sessions(ssh_client):
    """Get SSH sessions with ACTUAL login times from 'who' command"""
    try:
        stdin, stdout, stderr = ssh_client.exec_command('who')
        who_output = stdout.read().decode('utf-8')
        
        sessions = []
        for line in who_output.strip().split('\n'):
            if not line.strip():
                continue
            
            parts = line.split()
            if len(parts) < 5:
                continue
            
            user = parts[0]
            terminal = parts[1]
            
            # Parse login date and time
            # Format: "2026-02-10 11:56"
            try:
                # who output format: user terminal date time (ip)
                # Example: sac pts/0 2026-02-10 11:56 (192.168.3.208)
                date_part = parts[2]  # "2026-02-10"
                time_part = parts[3]  # "11:56"
                login_time_str = f"{date_part} {time_part}"
                
                # Parse the IP from parentheses
                ip_match = line.split('(')
                if len(ip_match) > 1:
                    from_ip = ip_match[1].rstrip(')')
                else:
                    from_ip = terminal  # Fallback to terminal if no IP
                
                sessions.append({
                    'user': user,
                    'terminal': terminal,
                    'login_time': login_time_str,  # ✅ Actual login time
                    'from': from_ip
                })
            except Exception as e:
                print(f"Error parsing who line: {line}, Error: {e}")
                continue
        
        return sessions
        
    except Exception as e:
        print(f"Error getting SSH sessions: {e}")
        return []



@bp.route('/api/analyze_storage', methods=['POST'])
def analyze_storage():
    """EXTREMELY optimized storage analysis."""
    data = request.get_json()

    if not data or 'server' not in data or 'mountpoint' not in data:
        return jsonify({'success': False, 'error': 'Missing parameters'}), 400

    server = next((s for s in Config.SERVERS if s['name'] == data['server']), None)

    if not server:
        return jsonify({'success': False, 'error': 'Server not found'}), 404

    mountpoint = data['mountpoint']

    try:
        # ------------------------------------------------------------------
        # 1) GET TOP FILES + FILE TYPE COUNTS (SINGLE SCAN, NO DU)
        # ------------------------------------------------------------------
        cmd_find = (
            f"find {mountpoint} -type f -printf \"%s %p\\n\" 2>/dev/null"
        )
        find_output = execute_ssh_command(server, cmd_find, timeout=40)

        top_files = []
        filetype_counts = {}

        if find_output:
            for line in find_output.splitlines():
                try:
                    size_str, path = line.split(" ", 1)
                    size = int(size_str)

                    # Track top 20 files
                    top_files.append((size, path))
                    if len(top_files) > 1000:
                        # keep memory small
                        top_files.sort(reverse=True)
                        top_files = top_files[:20]

                    # track file types
                    ext = path.rsplit(".", 1)[-1] if "." in path else ""
                    if ext:
                        filetype_counts[ext] = filetype_counts.get(ext, 0) + 1

                except:
                    continue

        # final top 20
        top_files.sort(reverse=True)
        top_files = [
            {"size": format_size(s), "path": p} for s, p in top_files[:20]
        ]

        # final file types (top 10)
        filetypes = sorted(
            [{"extension": k, "count": v} for k, v in filetype_counts.items()],
            key=lambda x: x["count"],
            reverse=True
        )[:10]

        # ------------------------------------------------------------------
        # 2) DIRECTORY SUMMARY (VERY FAST)
        # ------------------------------------------------------------------
        cmd_summary = (
            f"du -B1 --max-depth=1 {mountpoint} 2>/dev/null | sort -rn"
        )
        summary_output = execute_ssh_command(server, cmd_summary, timeout=30)

        dir_summary = []
        if summary_output:
            for line in summary_output.splitlines():
                parts = line.split("\t", 1)
                if len(parts) == 2:
                    size = int(parts[0])
                    path = parts[1]
                    dir_summary.append({
                        "size": format_size(size),
                        "path": path
                    })

        return jsonify({
            "success": True,
            "server": data['server'],
            "mountpoint": mountpoint,
            "analysis": {
                "top_directories": dir_summary[:20],  # best dirs
                "top_files": top_files,
                "file_types": filetypes,
                "directory_summary": dir_summary
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def format_size(bytes_value):
    """Convert bytes to human readable."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_value < 1024:
            return f"{bytes_value:.2f}{unit}"
        bytes_value /= 1024
    return f"{bytes_value:.2f}PB"


@bp.route('/api/history/<date>')
def get_history_by_date(date):
    """Get server history for specific date"""
    history_file = os.path.join(DETAILED_HISTORY_DIR, f'{date}.json')

    if os.path.exists(history_file):
        with open(history_file, 'r') as f:
            try:
                return jsonify(json.load(f))
            except:
                return jsonify([])
    return jsonify([])

@bp.route('/api/analytics_range')
def get_analytics_range():
    """Get analytics data for date range"""
    start_date = request.args.get('start')
    end_date = request.args.get('end')

    if not start_date or not end_date:
        return jsonify({'error': 'Missing date parameters'}), 400

    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except:
        return jsonify({'error': 'Invalid date format'}), 400

    all_data = []
    current_date = start

    while current_date <= end:
        date_str = current_date.strftime('%Y-%m-%d')
        history_file = os.path.join(DETAILED_HISTORY_DIR, f'{date_str}.json')

        if os.path.exists(history_file):
            with open(history_file, 'r') as f:
                try:
                    day_data = json.load(f)
                    all_data.extend(day_data)
                except:
                    pass

        current_date += timedelta(days=1)

    return jsonify(all_data)



@bp.route('/api/server_crash_analysis', methods=['POST'])
def get_server_crash_analysis():
    """
    Analyze why a server crashed by checking:
    - OOM (Out of Memory) killer logs
    - Service failures
    - Kernel panics
    - High CPU/Memory processes before crash
    """
    try:
        data = request.get_json()
        server_name = data.get('server')

        # Find server config
        server_config = None
        for server in config['servers']:
            if server['name'] == server_name:
                server_config = server
                break

        if not server_config:
            return jsonify({'success': False, 'error': 'Server not found'}), 404

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            ssh.connect(
                server_config['host'],
                port=server_config.get('port', 22),
                username=server_config['username'],
                key_filename=server_config.get('key_file')
            )

            analysis = {
                'oom_kills': [],
                'failed_services': [],
                'kernel_errors': [],
                'segfaults': []
            }

            # Check for OOM killer
            cmd = "sudo journalctl -n 500 --no-pager | grep -i 'out of memory\|oom\|killed process'"
            stdin, stdout, stderr = ssh.exec_command(cmd)
            oom_logs = stdout.read().decode('utf-8', errors='ignore').strip()
            if oom_logs:
                analysis['oom_kills'] = oom_logs.split('\n')

            # Check for failed services
            cmd = "sudo journalctl -n 500 --no-pager -p err | grep -i 'failed\|error'"
            stdin, stdout, stderr = ssh.exec_command(cmd)
            failed_logs = stdout.read().decode('utf-8', errors='ignore').strip()
            if failed_logs:
                analysis['failed_services'] = failed_logs.split('\n')[:20]

            # Check for kernel errors
            cmd = "sudo journalctl -n 500 --no-pager -k | grep -i 'panic\|bug\|error'"
            stdin, stdout, stderr = ssh.exec_command(cmd)
            kernel_logs = stdout.read().decode('utf-8', errors='ignore').strip()
            if kernel_logs:
                analysis['kernel_errors'] = kernel_logs.split('\n')[:20]

            # Check for segfaults
            cmd = "sudo journalctl -n 500 --no-pager | grep -i 'segfault\|segmentation fault'"
            stdin, stdout, stderr = ssh.exec_command(cmd)
            segfault_logs = stdout.read().decode('utf-8', errors='ignore').strip()
            if segfault_logs:
                analysis['segfaults'] = segfault_logs.split('\n')[:20]

            ssh.close()

            # Determine likely cause
            likely_cause = "Unknown"
            if analysis['oom_kills']:
                likely_cause = "Out of Memory (OOM Killer activated)"
            elif analysis['kernel_errors']:
                likely_cause = "Kernel Error or Panic"
            elif analysis['segfaults']:
                likely_cause = "Segmentation Fault"
            elif analysis['failed_services']:
                likely_cause = "Service Failures"

            return jsonify({
                'success': True,
                'server': server_name,
                'analysis': analysis,
                'likely_cause': likely_cause
            })

        except Exception as ssh_error:
            return jsonify({
                'success': False,
                'error': f'SSH connection failed: {str(ssh_error)}'
            }), 500
        finally:
            try:
                ssh.close()
            except:
                pass

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/endpoints_info')
def get_endpoints_info():
    """Complete API documentation with working RUN and TEST buttons"""
    import json
    from config import Config
    from flask import request, jsonify

    format_param = request.args.get('format', 'html')
    base_url = 'http://192.168.2.137:8080/monitoring_server'

    # Get server list with groups
    servers_by_group = {}
    for server in Config.SERVERS:
        group = server.get('group', 'default')
        if group not in servers_by_group:
            servers_by_group[group] = []
        servers_by_group[group].append({
            'name': server['name'],
            'host': server['ip'],
            'group': group
        })

    server_names = [server['name'] for server in Config.SERVERS]

    endpoints_data = {
        "title": "Server Monitoring API",
        "description": "Real-time server metrics with intelligent alerting and historical analytics",
        "base_url": base_url,
        "servers": server_names,
        "servers_by_group": servers_by_group,
        "total_servers": len(server_names),
        "version": "2.1",
        "last_updated": datetime.now().strftime('%Y-%m-%d'),
        "endpoints": [
            {
                "name": "Live Metrics (Real-time)",
                "url": "/api/live_metrics",
                "method": "POST",
                "category": "Live Metrics",
                "tags": ["real-time", "monitoring", "metrics"],
                "params": {"servers": "optional (array of server names)"},
                "description": "Get LIVE CPU, Memory, Storage at this exact moment (no cache). Parallel execution for multiple servers with sub-5s response time.",
                "response_time": "2-5 seconds",
                "testable": True
            },
            {
                "name": "Live Metrics (GET method)",
                "url": "/api/live_metrics_get",
                "method": "GET",
                "category": "Live Metrics",
                "tags": ["real-time", "monitoring"],
                "params": {"servers": "optional (multiple)"},
                "description": "Same as POST version but via GET request for easier browser testing",
                "response_time": "2-5 seconds",
                "testable": True
            },
            {
                "name": "Server Status (Cached)",
                "url": "/api/status",
                "method": "GET",
                "category": "Metrics",
                "tags": ["monitoring", "cached"],
                "params": {},
                "description": "Get comprehensive server metrics from cache (updates every 30 seconds). Includes CPU, memory, storage, services, processes, and more.",
                "response_time": "< 100ms",
                "cache_duration": "30 seconds",
                "testable": True
            },
            {
                "name": "Force Refresh Cache",
                "url": "/api/refresh",
                "method": "GET",
                "category": "Metrics",
                "tags": ["monitoring", "refresh"],
                "params": {},
                "description": "Force immediate cache refresh for all servers. Use sparingly to avoid server load.",
                "response_time": "5-15 seconds",
                "testable": True
            },
            {
                "name": "Server Metrics History",
                "url": "/api/server_metrics_history",
                "method": "GET",
                "category": "Analytics",
                "tags": ["history", "analytics", "trends"],
                "params": {
                    "server": "required (server name)",
                    "days": "optional (default: 7, max: 200)"
                },
                "description": "Time-series metrics for charting. When server enters WARNING/ALERT: includes services, failed services, and top processes for forensic analysis.",
                "response_time": "< 1 second",
                "data_retention": "200 days",
                "testable": True
            },
            {
                "name": "Alert History",
                "url": "/api/alert_history",
                "method": "GET",
                "category": "Alerts",
                "tags": ["alerts", "history", "monitoring"],
                "params": {
                    "server": "optional (filter by server)",
                    "type": "optional (cpu|memory|storage|offline)",
                    "severity": "optional (warning|critical)",
                    "days": "optional (default: 7, max: 200)"
                },
                "description": "Historical alert timeline with advanced filtering. Includes alert summary statistics and trends.",
                "response_time": "< 500ms",
                "testable": True
            },
            {
                "name": "Current Alerts",
                "url": "/api/alerts",
                "method": "GET",
                "category": "Alerts",
                "tags": ["alerts", "real-time"],
                "params": {},
                "description": "Get current active alerts across all servers. Categorized by severity (critical/warning).",
                "response_time": "< 100ms",
                "testable": True
            },
            {
                "name": "Server Comparison",
                "url": "/api/server_comparison",
                "method": "GET",
                "category": "Analytics",
                "tags": ["comparison", "analytics"],
                "params": {
                    "servers": "required (multiple server names)",
                    "days": "optional (default: 1, max: 30)"
                },
                "description": "Side-by-side metric comparison for analyzing performance patterns across multiple servers.",
                "response_time": "< 1 second",
                "testable": True
            },
            {
                "name": "Alert Trends",
                "url": "/api/alert_trends",
                "method": "GET",
                "category": "Analytics",
                "tags": ["trends", "analytics", "alerts"],
                "params": {"days": "optional (default: 30, max: 90)"},
                "description": "Daily alert statistics aggregated by type and severity for trend analysis.",
                "response_time": "< 1 second",
                "testable": True
            },
            {
                "name": "Server Health Score",
                "url": "/api/server_health_score",
                "method": "GET",
                "category": "Analytics",
                "tags": ["health", "analytics", "scoring"],
                "params": {"days": "optional (default: 7, max: 30)"},
                "description": "Health score (0-100) calculation based on uptime, resource usage, and alert frequency. Higher is better.",
                "response_time": "< 1 second",
                "testable": True
            },
            {
                "name": "User Tracking",
                "url": "/api/user_tracking",
                "method": "GET",
                "category": "Users",
                "tags": ["ssh", "users", "security"],
                "params": {},
                "description": "Track SSH user sessions across all servers. Shows active connections, login history, and user activity.",
                "response_time": "< 200ms",
                "testable": True
            },
            {
                "name": "Storage Analysis",
                "url": "/api/analyze_storage",
                "method": "POST",
                "category": "Storage",
                "tags": ["storage", "analysis", "disk"],
                "params": {
                    "server": "required (server name)",
                    "mountpoint": "required (e.g., /)"
                },
                "description": "Deep storage analysis: top files, directories, file types, and space usage patterns. Use for troubleshooting disk space issues.",
                "response_time": "5-20 seconds",
                "testable": True
            },
            {
                "name": "Server Logs",
                "url": "/api/server_logs",
                "method": "POST",
                "category": "Logs",
                "tags": ["logs", "debugging", "journalctl"],
                "params": {
                    "server": "required (server name)",
                    "lines": "optional (default: 200, max: 1000)"
                },
                "description": "Fetch journalctl or syslog from server for debugging. Returns recent system logs.",
                "response_time": "1-3 seconds",
                "testable": True
            },
            {
                "name": "Current Time",
                "url": "/api/time",
                "method": "GET",
                "category": "Utility",
                "tags": ["time", "utility"],
                "params": {},
                "description": "Get current server time in UTC. Useful for time synchronization checks.",
                "response_time": "< 50ms",
                "testable": True
            }
        ]
    }

    if format_param == 'json':
        return jsonify(endpoints_data)

    # Generate complete HTML
    html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27><text y=%27.9em%27 font-size=%2790%27>🖥️</text></svg>">
    <title>{{ data.title }} - API Documentation</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            min-height: 100vh;
            padding: 30px 20px;
        }
        .container {
            max-width: 1600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 50px;
            position: relative;
        }
        .header h1 {
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .header p { font-size: 16px; opacity: 0.95; margin-bottom: 20px; }
        .header-stats { display: flex; gap: 30px; flex-wrap: wrap; }
        .stat {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 20px;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 999px;
        }
        .stat-value { font-weight: 700; font-size: 18px; }
        .stat-label { font-size: 13px; }
        .nav-tabs {
            display: flex;
            background: #f7fafc;
            border-bottom: 2px solid #e2e8f0;
        }
        .nav-tab {
            padding: 18px 35px;
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
            color: #4a5568;
            transition: all 0.2s;
            border-bottom: 3px solid transparent;
        }
        .nav-tab.active {
            color: #667eea;
            border-bottom-color: #667eea;
            background: white;
        }
        .tab-content { display: none; padding: 40px 50px; }
        .tab-content.active { display: block; }
        .servers-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 3px solid #667eea;
        }
        .servers-header h2 {
            font-size: 26px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .test-all-btn {
            padding: 12px 25px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
        }
        .server-group { margin-bottom: 35px; }
        .group-title {
            font-size: 18px;
            font-weight: 600;
            color: #4a5568;
            margin-bottom: 15px;
            padding: 10px 15px;
            background: #f7fafc;
            border-radius: 8px;
        }
        .servers-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
        }
        .server-card {
            background: white;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            transition: all 0.3s;
        }
        .server-card.success { border-color: #10b981; background: #ecfdf5; }
        .server-card.error { border-color: #ef4444; background: #fef2f2; }
        .server-name {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .server-host {
            font-size: 13px;
            color: #718096;
            font-family: 'Courier New', monospace;
            margin-bottom: 15px;
        }
        .test-btn {
            width: 100%;
            padding: 10px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
        }
        .test-btn.success { background: #10b981; }
        .test-btn.error { background: #ef4444; }
        .server-status {
            font-size: 12px;
            padding: 4px 10px;
            border-radius: 999px;
            font-weight: 600;
        }
        .server-status.online { background: #d1fae5; color: #065f46; }
        .server-status.offline { background: #fee2e2; color: #991b1b; }
        .controls {
            padding: 25px 50px;
            background: #f7fafc;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 20px;
        }
        .search-box {
            flex: 1;
            min-width: 300px;
            max-width: 500px;
            position: relative;
        }
        .search-box input {
            width: 100%;
            padding: 14px 20px 14px 50px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            font-size: 15px;
        }
        .search-box i {
            position: absolute;
            left: 18px;
            top: 50%;
            transform: translateY(-50%);
            color: #a0aec0;
        }
        .filter-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
        .filter-btn {
            padding: 10px 18px;
            border: 2px solid #e2e8f0;
            background: white;
            border-radius: 999px;
            font-size: 14px;
            cursor: pointer;
            color: #4a5568;
        }
        .filter-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }
        .category-section { margin-bottom: 50px; }
        .category-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 3px solid #667eea;
        }
        .category-icon {
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
        }
        .category-header h2 {
            font-size: 26px;
            font-weight: 700;
        }
        .endpoints-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
            gap: 25px;
        }
        .endpoint-card {
            background: white;
            border: 2px solid #e2e8f0;
            border-radius: 16px;
            padding: 25px;
            transition: all 0.3s;
        }
        .endpoint-card:hover {
            border-color: #667eea;
            box-shadow: 0 10px 30px -10px rgba(102, 126, 234, 0.3);
            transform: translateY(-4px);
        }
        .endpoint-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .method-badge {
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
        }
        .method-badge.get { background: #c6f6d5; color: #22543d; }
        .method-badge.post { background: #feebc8; color: #7c2d12; }
        .endpoint-description {
            font-size: 14px;
            color: #4a5568;
            line-height: 1.6;
            margin-bottom: 15px;
        }
        .endpoint-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 15px; }
        .tag {
            padding: 4px 10px;
            background: #edf2f7;
            color: #4a5568;
            border-radius: 4px;
            font-size: 11px;
        }
        .endpoint-url {
            background: #1a202c;
            color: #48bb78;
            padding: 12px 15px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            margin-bottom: 15px;
            word-break: break-all;
        }
        .test-form {
            background: #f0f4ff;
            border: 2px solid #c7d2fe;
            border-radius: 12px;
            padding: 15px;
            margin-top: 15px;
        }
        .test-form h4 {
            font-size: 14px;
            color: #4f46e5;
            margin-bottom: 12px;
        }
        .form-group { margin-bottom: 12px; }
        .form-group label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: #4a5568;
            margin-bottom: 6px;
        }
        .form-group select,
        .form-group input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            font-size: 14px;
            background: white;
        }
        .form-group select[multiple] { height: 120px; }
        .button-group { display: flex; gap: 10px; margin-top: 12px; }
        .run-btn, .test-submit-btn {
            flex: 1;
            padding: 10px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .run-btn {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
        }
        .test-submit-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }
        .test-submit-btn.loading { background: #f59e0b; }
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 1000;
            padding: 20px;
        }
        .modal.active { display: flex; align-items: center; justify-content: center; }
        .modal-content {
            background: white;
            border-radius: 16px;
            max-width: 900px;
            width: 100%;
            max-height: 90vh;
        }
        .modal-header {
            padding: 25px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            display: flex;
            justify-content: space-between;
            border-radius: 16px 16px 0 0;
        }
        .close-modal {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 35px;
            height: 35px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 20px;
        }
        .modal-body { padding: 25px; overflow-y: auto; max-height: 70vh; }
        .result-box {
            background: #1a202c;
            color: #e2e8f0;
            padding: 20px;
            border-radius: 12px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            overflow-x: auto;
        }
        .spinner {
            border: 3px solid #f3f4f6;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            animation: spin 1s linear infinite;
            display: inline-block;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
            .endpoints-grid, .servers-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><i class="fas fa-server"></i> {{ data.title }}</h1>
            <p>{{ data.description }}</p>
            <div class="header-stats">
                <div class="stat">
                    <i class="fas fa-code"></i>
                    <div>
                        <div class="stat-value">{{ data.endpoints|length }}</div>
                        <div class="stat-label">Endpoints</div>
                    </div>
                </div>
                <div class="stat">
                    <i class="fas fa-server"></i>
                    <div>
                        <div class="stat-value">{{ data.total_servers }}</div>
                        <div class="stat-label">Servers</div>
                    </div>
                </div>
                <div class="stat">
                    <i class="fas fa-code-branch"></i>
                    <div>
                        <div class="stat-value">v{{ data.version }}</div>
                        <div class="stat-label">Version</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="nav-tabs">
            <button class="nav-tab active" data-tab="servers">
                <i class="fas fa-server"></i> Servers ({{ data.total_servers }})
            </button>
            <button class="nav-tab" data-tab="endpoints">
                <i class="fas fa-code"></i> API Endpoints ({{ data.endpoints|length }})
            </button>
        </div>

        <div class="tab-content active" id="servers-tab">
            <div class="servers-header">
                <h2><i class="fas fa-server"></i> Connected Servers</h2>
                <button class="test-all-btn" onclick="testAllServers()">
                    <i class="fas fa-play-circle"></i> Test All Servers
                </button>
            </div>
            {% for group, servers in data.servers_by_group.items() %}
            <div class="server-group">
                <div class="group-title">
                    <i class="fas fa-folder"></i> {{ group|title }} Group ({{ servers|length }} servers)
                </div>
                <div class="servers-grid">
                    {% for server in servers %}
                    <div class="server-card" data-server="{{ server.name }}">
                        <div class="server-name">
                            <i class="fas fa-server" style="color: #667eea;"></i>
                            {{ server.name }}
                            <span class="server-status">Unknown</span>
                        </div>
                        <div class="server-host">{{ server.host }}</div>
                        <button class="test-btn" onclick="testServer('{{ server.name }}')">
                            <i class="fas fa-vial"></i> Test Connection
                        </button>
                    </div>
                    {% endfor %}
                </div>
            </div>
            {% endfor %}
        </div>

        <div class="tab-content" id="endpoints-tab">
            <div class="controls">
                <div class="search-box">
                    <i class="fas fa-search"></i>
                    <input type="text" id="searchInput" placeholder="Search endpoints...">
                </div>
                <div class="filter-buttons">
                    <button class="filter-btn active" data-category="all">All</button>
                    <button class="filter-btn" data-category="Live Metrics">Live</button>
                    <button class="filter-btn" data-category="Metrics">Metrics</button>
                    <button class="filter-btn" data-category="Analytics">Analytics</button>
                    <button class="filter-btn" data-category="Alerts">Alerts</button>
                </div>
            </div>

            <div class="endpoints-content">
                {% set categories = {} %}
                {% for endpoint in data.endpoints %}
                    {% if endpoint.category not in categories %}
                        {% set _ = categories.update({endpoint.category: []}) %}
                    {% endif %}
                    {% set _ = categories[endpoint.category].append(endpoint) %}
                {% endfor %}

                {% for category, endpoints in categories.items() %}
                <div class="category-section" data-category="{{ category }}">
                    <div class="category-header">
                        <div class="category-icon">
                            <i class="fas fa-{% if category == 'Live Metrics' %}bolt{% elif category == 'Metrics' %}chart-line{% elif category == 'Analytics' %}chart-bar{% elif category == 'Alerts' %}exclamation-triangle{% elif category == 'Storage' %}hdd{% elif category == 'Logs' %}file-alt{% elif category == 'Users' %}users{% else %}cog{% endif %}"></i>
                        </div>
                        <h2>{{ category }}</h2>
                    </div>

                    <div class="endpoints-grid">
                        {% for ep in endpoints %}
                        <div class="endpoint-card" data-ep-id="{{ loop.index0 }}" data-ep-url="{{ ep.url }}" data-ep-method="{{ ep.method }}">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                                <div class="endpoint-title">{{ ep.name }}</div>
                                <span class="method-badge {{ ep.method|lower }}">{{ ep.method }}</span>
                            </div>
                            <div class="endpoint-tags">
                                {% for tag in ep.tags %}
                                <span class="tag">{{ tag }}</span>
                                {% endfor %}
                            </div>
                            <div class="endpoint-description">{{ ep.description }}</div>
                            <div class="endpoint-url">{{ data.base_url }}{{ ep.url }}</div>

                            {% if ep.testable %}
                            <div class="test-form">
                                <h4><i class="fas fa-vial"></i> Test This Endpoint</h4>

                                {% if 'server' in ep.params %}
                                <div class="form-group">
                                    <label>Server</label>
                                    <select class="ep-param" data-param="server">
                                        {% for name in data.servers %}
                                        <option value="{{ name }}">{{ name }}</option>
                                        {% endfor %}
                                    </select>
                                </div>
                                {% endif %}

                                {% if 'servers' in ep.params %}
                                <div class="form-group">
                                    <label>Servers (Ctrl+Click for multiple)</label>
                                    <select class="ep-param" data-param="servers" multiple>
                                        {% for name in data.servers %}
                                        <option value="{{ name }}">{{ name }}</option>
                                        {% endfor %}
                                    </select>
                                </div>
                                {% endif %}

                                {% if 'type' in ep.params %}
                                <div class="form-group">
                                    <label>Alert Type</label>
                                    <select class="ep-param" data-param="type">
                                        <option value="">All</option>
                                        <option value="cpu">CPU</option>
                                        <option value="memory">Memory</option>
                                        <option value="storage">Storage</option>
                                        <option value="offline">Offline</option>
                                    </select>
                                </div>
                                {% endif %}

                                {% if 'severity' in ep.params %}
                                <div class="form-group">
                                    <label>Severity</label>
                                    <select class="ep-param" data-param="severity">
                                        <option value="">All</option>
                                        <option value="warning">Warning</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                                {% endif %}

                                {% if 'days' in ep.params %}
                                <div class="form-group">
                                    <label>Days</label>
                                    <input type="number" class="ep-param" data-param="days" placeholder="7" min="1">
                                </div>
                                {% endif %}

                                {% if 'mountpoint' in ep.params %}
                                <div class="form-group">
                                    <label>Mountpoint</label>
                                    <input type="text" class="ep-param" data-param="mountpoint" value="/" placeholder="/">
                                </div>
                                {% endif %}

                                {% if 'lines' in ep.params %}
                                <div class="form-group">
                                    <label>Lines</label>
                                    <input type="number" class="ep-param" data-param="lines" placeholder="200" min="1">
                                </div>
                                {% endif %}

                                <div class="button-group">
                                    <button class="run-btn" onclick="runAPI(this)">
                                        <i class="fas fa-rocket"></i> Run
                                    </button>
                                    <button class="test-submit-btn" onclick="testAPI(this)">
                                        <i class="fas fa-vial"></i> Test
                                    </button>
                                </div>
                            </div>
                            {% endif %}
                        </div>
                        {% endfor %}
                    </div>
                </div>
                {% endfor %}
            </div>
        </div>
    </div>

    <div class="modal" id="resultModal" onclick="if(event.target===this) closeModal()">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="modalTitle">Test Result</h3>
                <button class="close-modal" onclick="closeModal()">×</button>
            </div>
            <div class="modal-body">
                <div class="result-box">
                    <pre id="modalResult">Loading...</pre>
                </div>
            </div>
        </div>
    </div>

    <script>
        const BASE_URL = '{{ data.base_url }}';
        const testResults = {};

        // Get parameters from form
        function getParams(card) {
            const params = {};
            card.querySelectorAll('.ep-param').forEach(input => {
                const paramName = input.dataset.param;
                if (input.tagName === 'SELECT' && input.multiple) {
                    const selected = Array.from(input.selectedOptions).map(opt => opt.value);
                    if (selected.length > 0) params[paramName] = selected;
                } else if (input.value) {
                    params[paramName] = input.value;
                }
            });
            return params;
        }

        // RUN button - Opens API in new window/tab
        function runAPI(btn) {
            const card = btn.closest('.endpoint-card');
            const url = card.dataset.epUrl;
            const method = card.dataset.epMethod;
            const params = getParams(card);

            console.log('RUN:', method, url, params);

            if (method === 'GET') {
                // Build query string
                const queryParams = new URLSearchParams();
                Object.entries(params).forEach(([key, val]) => {
                    if (Array.isArray(val)) {
                        val.forEach(v => queryParams.append(key, v));
                    } else {
                        queryParams.append(key, val);
                    }
                });
                const fullUrl = BASE_URL + url + (queryParams.toString() ? '?' + queryParams.toString() : '');
                console.log('Opening:', fullUrl);
                window.open(fullUrl, '_blank');
            } else {
                // POST - test it and show modal
                testAPI(btn);
            }
        }

        // TEST button - Tests and shows result in modal
        async function testAPI(btn) {
            const card = btn.closest('.endpoint-card');
            const url = card.dataset.epUrl;
            const method = card.dataset.epMethod;
            const params = getParams(card);

            btn.classList.add('loading');
            btn.innerHTML = '<span class="spinner"></span> Testing...';

            try {
                let response;
                if (method === 'GET') {
                    const queryParams = new URLSearchParams();
                    Object.entries(params).forEach(([key, val]) => {
                        if (Array.isArray(val)) {
                            val.forEach(v => queryParams.append(key, v));
                        } else {
                            queryParams.append(key, val);
                        }
                    });
                    const fullUrl = BASE_URL + url + (queryParams.toString() ? '?' + queryParams.toString() : '');
                    console.log('Testing GET:', fullUrl);
                    response = await fetch(fullUrl);
                } else {
                    console.log('Testing POST:', url, params);
                    response = await fetch(BASE_URL + url, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(params)
                    });
                }

                const data = await response.json();
                document.getElementById('modalTitle').textContent = 'Test Result: ' + card.querySelector('.endpoint-title').textContent;
                document.getElementById('modalResult').textContent = JSON.stringify(data, null, 2);
                document.getElementById('resultModal').classList.add('active');
            } catch (error) {
                console.error('Test error:', error);
                document.getElementById('modalTitle').textContent = 'Error';
                document.getElementById('modalResult').textContent = 'Error: ' + error.message;
                document.getElementById('resultModal').classList.add('active');
            } finally {
                btn.classList.remove('loading');
                btn.innerHTML = '<i class="fas fa-vial"></i> Test';
            }
        }

        function closeModal() {
            document.getElementById('resultModal').classList.remove('active');
        }

        // Tab switching
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                document.getElementById(this.dataset.tab + '-tab').classList.add('active');
            });
        });

        // Server testing
        async function testServer(serverName) {
            const card = document.querySelector(`[data-server="${serverName}"]`);
            const btn = card.querySelector('.test-btn');
            const status = card.querySelector('.server-status');

            card.classList.remove('success', 'error');
            btn.innerHTML = '<span class="spinner"></span> Testing...';
            status.textContent = 'Testing...';

            try {
                const response = await fetch(BASE_URL + '/api/live_metrics', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({servers: [serverName]})
                });
                const data = await response.json();
                testResults[serverName] = data;

                if (data.success && data.servers[0].status === 'online') {
                    card.classList.add('success');
                    btn.classList.add('success');
                    btn.innerHTML = '<i class="fas fa-check"></i> Online';
                    status.className = 'server-status online';
                    status.textContent = 'Online';
                } else {
                    throw new Error('Offline');
                }
            } catch (error) {
                card.classList.add('error');
                btn.classList.add('error');
                btn.innerHTML = '<i class="fas fa-times"></i> Offline';
                status.className = 'server-status offline';
                status.textContent = 'Offline';
            }
        }

        async function testAllServers() {
            const btn = document.querySelector('.test-all-btn');
            btn.innerHTML = '<span class="spinner"></span> Testing All...';

            try {
                const response = await fetch(BASE_URL + '/api/live_metrics', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({})
                });
                const data = await response.json();

                if (data.success) {
                    data.servers.forEach(server => {
                        const card = document.querySelector(`[data-server="${server.name}"]`);
                        if (!card) return;
                        const testBtn = card.querySelector('.test-btn');
                        const status = card.querySelector('.server-status');

                        if (server.status === 'online') {
                            card.classList.add('success');
                            testBtn.innerHTML = '<i class="fas fa-check"></i> Online';
                            status.className = 'server-status online';
                            status.textContent = 'Online';
                        } else {
                            card.classList.add('error');
                            testBtn.innerHTML = '<i class="fas fa-times"></i> Offline';
                            status.className = 'server-status offline';
                            status.textContent = 'Offline';
                        }
                    });
                }
            } finally {
                btn.innerHTML = '<i class="fas fa-play-circle"></i> Test All Servers';
            }
        }

        // Search
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const term = this.value.toLowerCase();
                document.querySelectorAll('.endpoint-card').forEach(card => {
                    const text = card.textContent.toLowerCase();
                    card.style.display = text.includes(term) ? 'block' : 'none';
                });
            });
        }

        // Filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const category = this.dataset.category;
                document.querySelectorAll('.category-section').forEach(section => {
                    section.style.display = (category === 'all' || section.dataset.category === category) ? 'block' : 'none';
                });
            });
        });
    </script>
</body>
</html>'''

    return render_template_string(html, data=endpoints_data)



@bp.route('/api/live_metrics', methods=['POST'])
def get_live_metrics():
    """
    Get LIVE CPU, Memory, and Storage metrics for multiple servers
    No cache - fetches data in real-time
    """
    try:
        data = request.get_json()

        # Get server names from request (or use all servers)
        requested_servers = data.get('servers', []) if data else []

        # If no servers specified, use all servers
        if not requested_servers:
            servers_to_check = Config.SERVERS
        else:
            # Filter servers by name
            servers_to_check = [
                s for s in Config.SERVERS 
                if s['name'] in requested_servers
            ]

        if not servers_to_check:
            return jsonify({
                'success': False, 
                'error': 'No valid servers specified'
            }), 400

        # Fetch metrics in parallel using ThreadPoolExecutor
        def fetch_live_metrics(server):
            """Fetch live metrics for a single server"""
            try:
                # Test connection first
                test_cmd = "echo 'ok'"
                status = execute_ssh_command(server, test_cmd)

                if status != 'ok':
                    return {
                        'name': server['name'],
                        'group': server.get('group', 'default'),
                        'status': 'offline',
                        'timestamp': datetime.now().isoformat()
                    }

                # Fetch live metrics
                cpu = get_cpu_usage(server)
                memory = get_memory_info(server)
                storage = get_storage_info(server)

                return {
                    'name': server['name'],
                    'group': server.get('group', 'default'),
                    'status': 'online',
                    'cpu': cpu,
                    'memory': memory,
                    'storage': storage,
                    'timestamp': datetime.now().isoformat()
                }

            except Exception as e:
                return {
                    'name': server['name'],
                    'group': server.get('group', 'default'),
                    'status': 'error',
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                }

        # Execute in parallel with max 20 workers
        results = []
        max_workers = min(20, len(servers_to_check))

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_server = {
                executor.submit(fetch_live_metrics, server): server 
                for server in servers_to_check
            }

            for future in as_completed(future_to_server):
                result = future.result()
                results.append(result)

        # Sort results by server name
        results.sort(key=lambda x: x['name'])

        return jsonify({
            'success': True,
            'total_servers': len(results),
            'online_servers': sum(1 for r in results if r['status'] == 'online'),
            'offline_servers': sum(1 for r in results if r['status'] == 'offline'),
            'servers': results,
            'fetched_at': datetime.now().isoformat()
        })

    except Exception as e:
        current_app.logger.error(f"Error in get_live_metrics: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'success': False, 
            'error': str(e)
        }), 500


# ============================================
# ALTERNATIVE: GET method version (simpler)
# ============================================

@bp.route('/api/live_metrics_get', methods=['GET'])
def get_live_metrics_simple():
    """
    Get LIVE metrics via GET request
    Usage: /api/live_metrics_get?servers=Server1&servers=Server2
    Or: /api/live_metrics_get (for all servers)
    """
    try:
        # Get server names from query params
        requested_servers = request.args.getlist('servers')

        # If no servers specified, use all servers
        if not requested_servers:
            servers_to_check = Config.SERVERS
        else:
            servers_to_check = [
                s for s in Config.SERVERS 
                if s['name'] in requested_servers
            ]

        if not servers_to_check:
            return jsonify({
                'success': False, 
                'error': 'No valid servers specified'
            }), 400

        # Fetch metrics function
        def fetch_live_metrics(server):
            try:
                test_cmd = "echo 'ok'"
                status = execute_ssh_command(server, test_cmd)

                if status != 'ok':
                    return {
                        'name': server['name'],
                        'status': 'offline',
                        'timestamp': datetime.now().isoformat()
                    }

                return {
                    'name': server['name'],
                    'group': server.get('group', 'default'),
                    'status': 'online',
                    'cpu': get_cpu_usage(server),
                    'memory': get_memory_info(server),
                    'storage': get_storage_info(server),
                    'timestamp': datetime.now().isoformat()
                }
            except Exception as e:
                return {
                    'name': server['name'],
                    'status': 'error',
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                }

        # Execute in parallel
        results = []
        with ThreadPoolExecutor(max_workers=min(20, len(servers_to_check))) as executor:
            future_to_server = {
                executor.submit(fetch_live_metrics, server): server 
                for server in servers_to_check
            }

            for future in as_completed(future_to_server):
                results.append(future.result())

        results.sort(key=lambda x: x['name'])

        return jsonify({
            'success': True,
            'total_servers': len(results),
            'servers': results,
            'fetched_at': datetime.now().isoformat()
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500



# ============================================
# ADD THIS AT THE VERY END OF app/routes.py
# ============================================


@bp.route('/api/server_logs', methods=['POST'])
def get_server_logs():
    """Fetch journalctl logs from a server"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400

        server_name = data.get('server')
        lines = data.get('lines', 200)

        if not server_name:
            return jsonify({'success': False, 'error': 'Server name required'}), 400

        # CORRECT: Import from root config.py
        # Add root directory to path
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if root_dir not in sys.path:
            sys.path.insert(0, root_dir)

        # Import the Config class
        from config import Config

        # Find server in Config.SERVERS list
        server_config = None
        for server in Config.SERVERS:
            if server['name'] == server_name:
                server_config = server
                break

        if not server_config:
            return jsonify({'success': False, 'error': f'Server "{server_name}" not found'}), 404

        # Extract connection details
        host = server_config.get('ip')
        username = server_config.get('username')
        password = server_config.get('password')

        if not all([host, username, password]):
            return jsonify({'success': False, 'error': 'Server configuration incomplete'}), 400

        # SSH connect using password
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            ssh.connect(
                hostname=host,
                port=22,
                username=username,
                password=password,
                timeout=10
            )

            # Try multiple commands to get logs
            commands = [
                f"sudo journalctl -n {lines} --no-pager -p err 2>&1 || journalctl -n {lines} --no-pager 2>&1",
                f"tail -n {lines} /var/log/syslog 2>&1 || tail -n {lines} /var/log/messages 2>&1",
            ]

            logs = None
            for cmd in commands:
                try:
                    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
                    output = stdout.read().decode('utf-8', errors='ignore').strip()

                    if output and 'No such file' not in output and 'command not found' not in output.lower():
                        logs = output
                        break
                except Exception as e:
                    current_app.logger.warning(f"Command failed: {cmd} - {str(e)}")
                    continue

            ssh.close()

            if not logs:
                return jsonify({
                    'success': True, 
                    'server': server_name,
                    'logs': ['No logs available or journalctl not accessible'],
                    'count': 1
                })

            # Parse logs into lines
            log_lines = [line.strip() for line in logs.split('\n') if line.strip()]
            log_lines = log_lines[-lines:]  # Get last N lines

            return jsonify({
                'success': True,
                'server': server_name,
                'logs': log_lines,
                'count': len(log_lines)
            })

        except Exception as ssh_error:
            current_app.logger.error(f"SSH error for {server_name}: {str(ssh_error)}")
            return jsonify({'success': False, 'error': f'SSH connection failed: {str(ssh_error)}'}), 500
        finally:
            try:
                ssh.close()
            except:
                pass

    except Exception as e:
        current_app.logger.error(f"Error in get_server_logs: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== START BACKGROUND THREAD ====================
def start_background_collection():
    """Start background thread for SSH session tracking"""
    collection_thread = threading.Thread(target=collect_server_data, daemon=True)
    collection_thread.start()
    print("✅ Background SSH tracking started!")

# Start immediately when module loads
start_background_collection()
