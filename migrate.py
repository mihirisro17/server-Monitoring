#!/usr/bin/env python3
"""
Migration script to convert existing JSON history to SQLite database
Run this ONCE after setting up database.py
"""

import json
import os
from datetime import datetime
import database as db

def migrate_json_to_sqlite():
    """Migrate existing server_history1.json to SQLite database"""

    HISTORY_FILE1 = 'server_history1.json'

    if not os.path.exists(HISTORY_FILE1):
        print("⚠ Warning: server_history1.json not found")
        print("  Starting with empty database")
        return

    print("Starting migration from JSON to SQLite...")

    try:
        with open(HISTORY_FILE1, 'r') as f:
            history = json.load(f)

        print(f"Found {len(history)} historical entries")

        # Process each historical entry
        migrated_count = 0
        error_count = 0

        for entry in history:
            try:
                # Override timestamp for proper historical data
                timestamp_str = entry.get('timestamp')
                if not timestamp_str:
                    continue

                timestamp = datetime.fromisoformat(timestamp_str)
                servers_data = entry.get('servers', [])

                # Save to database (modified to accept custom timestamp)
                save_historical_entry(timestamp, servers_data)
                migrated_count += 1

                if migrated_count % 100 == 0:
                    print(f"  Migrated {migrated_count} entries...")

            except Exception as e:
                error_count += 1
                if error_count < 10:  # Only show first 10 errors
                    print(f"  Error processing entry: {e}")

        print(f"\n✓ Migration completed!")
        print(f"  Migrated: {migrated_count} entries")
        print(f"  Errors: {error_count} entries")
        print(f"\nYou can now safely delete or backup server_history1.json")

    except Exception as e:
        print(f"✗ Migration failed: {e}")
        return False

    return True


def save_historical_entry(timestamp, servers_data):
    """Save a historical entry with custom timestamp"""
    with db.get_db() as conn:
        cursor = conn.cursor()

        for server in servers_data:
            # Extract CPU data
            cpu_data = server.get('cpu', {})
            if isinstance(cpu_data, dict):
                cpu_value = cpu_data.get('value')
                cpu_status = cpu_data.get('status', 'normal')
            else:
                cpu_value = cpu_data
                cpu_status = 'normal'

            # Extract memory data
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

            # Extract storage data
            storage_data = server.get('root_storage', {})
            if isinstance(storage_data, dict):
                root_storage_percent = storage_data.get('percent')
                root_storage_status = storage_data.get('status', 'normal')
            else:
                root_storage_percent = storage_data
                root_storage_status = 'normal'

            # Extract load average
            load_avg = server.get('load_average', {})
            load_1min = load_avg.get('load_1min') if load_avg else None
            load_5min = load_avg.get('load_5min') if load_avg else None
            load_15min = load_avg.get('load_15min') if load_avg else None

            # Extract uptime
            uptime = server.get('uptime', {})
            uptime_human = uptime.get('uptime_human') if uptime else None
            boot_time = uptime.get('boot_time') if uptime else None

            # Insert main metrics
            cursor.execute('''
                INSERT INTO server_metrics (
                    timestamp, server_name, server_group, status,
                    cpu_value, cpu_status, memory_percent, memory_status,
                    memory_total, memory_used, root_storage_percent, root_storage_status,
                    load_1min, load_5min, load_15min, uptime_human, boot_time, alert_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                timestamp,
                server['name'],
                server.get('group', 'default'),
                server['status'],
                cpu_value,
                cpu_status,
                memory_percent,
                memory_status,
                memory_total,
                memory_used,
                root_storage_percent,
                root_storage_status,
                load_1min,
                load_5min,
                load_15min,
                uptime_human,
                boot_time,
                len(server.get('alerts', []))
            ))

            metric_id = cursor.lastrowid

            # Insert storage details
            for storage in server.get('storage', []):
                cursor.execute('''
                    INSERT INTO storage_details (
                        metric_id, mountpoint, percent, size, used, available, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    metric_id,
                    storage.get('mountpoint'),
                    storage.get('percent'),
                    storage.get('size'),
                    storage.get('used'),
                    storage.get('available'),
                    storage.get('status', 'normal')
                ))

            # Insert alerts
            for alert in server.get('alerts', []):
                cursor.execute('''
                    INSERT INTO alerts (
                        metric_id, alert_type, severity, message, value,
                        timestamp, server_name, server_group
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    metric_id,
                    alert['type'],
                    alert['severity'],
                    alert['message'],
                    alert.get('value'),
                    timestamp,
                    server['name'],
                    server.get('group', 'default')
                ))

        conn.commit()


if __name__ == '__main__':
    print("="*50)
    print("JSON to SQLite Migration Tool")
    print("="*50)
    print()

    # Check if database exists
    if os.path.exists(db.DB_FILE):
        print(f"⚠ Database '{db.DB_FILE}' already exists")
        response = input("Do you want to continue? (yes/no): ")
        if response.lower() not in ['yes', 'y']:
            print("Migration cancelled")
            exit(0)

    success = migrate_json_to_sqlite()

    if success:
        print("\n" + "="*50)
        print("Next steps:")
        print("="*50)
        print("1. Update your routes.py with the modifications")
        print("2. Test the API endpoints")
        print("3. Backup server_history1.json")
        print("4. Monitor database size: ls -lh server_monitoring.db")
        print()
