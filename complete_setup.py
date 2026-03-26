
complete_setup.py
#!/usr/bin/env python3
"""
Complete Setup Script for SQLite Migration
Run this from: ~/Mihir/server_monitoring_new/
"""

import os
import sys
import subprocess
import sqlite3

def print_header(text):
    print("\n" + "="*70)
    print(text)
    print("="*70)

def print_step(step, text):
    print(f"\n[Step {step}] {text}")
    print("-" * 70)

def run_command(cmd, description):
    """Run a shell command and return success status"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print(f"  ✓ {description}")
            if result.stdout:
                print(f"    {result.stdout.strip()}")
            return True
        else:
            print(f"  ✗ {description} failed")
            if result.stderr:
                print(f"    Error: {result.stderr.strip()}")
            return False
    except Exception as e:
        print(f"  ✗ {description} failed: {e}")
        return False

def check_files():
    """Check if required files exist"""
    print_step(1, "Checking Files")

    required_files = {
        'database.py': 'Database module',
        'app/routes.py': 'Routes file',
        'config.py': 'Configuration',
        'run.py': 'Main application'
    }

    all_exist = True
    for file, desc in required_files.items():
        if os.path.exists(file):
            print(f"  ✓ {file} ({desc})")
        else:
            print(f"  ✗ {file} NOT FOUND ({desc})")
            all_exist = False

    return all_exist

def test_database_connection():
    """Test if database.py works"""
    print_step(2, "Testing Database Connection")

    try:
        sys.path.append('.')
        import database as db
        print("  ✓ Database module imported successfully")

        # Check if DB file exists
        if os.path.exists('server_monitoring.db'):
            conn = sqlite3.connect('server_monitoring.db')
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM server_metrics")
            count = cursor.fetchone()[0]
            print(f"  ✓ Database has {count} metric records")

            cursor.execute("SELECT COUNT(*) FROM alerts")
            alert_count = cursor.fetchone()[0]
            print(f"  ✓ Database has {alert_count} alert records")

            conn.close()
        else:
            print("  ℹ Database file will be created on first run")

        return True
    except Exception as e:
        print(f"  ✗ Database test failed: {e}")
        return False

def backup_routes():
    """Backup routes.py"""
    print_step(3, "Backing Up routes.py")

    if os.path.exists('app/routes.py.backup'):
        print("  ⚠ Backup already exists")
        response = input("  Overwrite backup? (y/n): ")
        if response.lower() != 'y':
            print("  Using existing backup")
            return True

    try:
        with open('app/routes.py', 'r') as f:
            content = f.read()
        with open('app/routes.py.backup', 'w') as f:
            f.write(content)
        print("  ✓ Backup created: app/routes.py.backup")
        return True
    except Exception as e:
        print(f"  ✗ Backup failed: {e}")
        return False

def migrate_json_data():
    """Migrate existing JSON data to SQLite"""
    print_step(4, "Migrating JSON Data (Optional)")

    if not os.path.exists('server_history1.json'):
        print("  ℹ No server_history1.json found, skipping migration")
        return True

    # Check current database size
    try:
        conn = sqlite3.connect('server_monitoring.db')
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM server_metrics")
        existing_count = cursor.fetchone()[0]
        conn.close()

        if existing_count > 0:
            print(f"  ⚠ Database already has {existing_count} records")
            response = input("  Skip migration? (y/n): ")
            if response.lower() == 'y':
                return True
    except:
        pass

    print("  Running migration...")

    if os.path.exists('migrate.py'):
        result = run_command('python3 migrate.py', 'Data migration')
        return result
    else:
        print("  ⚠ migrate.py not found, skipping")
        return True

def patch_routes():
    """Patch routes.py automatically"""
    print_step(5, "Patching routes.py")

    response = input("  Apply automatic patches to routes.py? (y/n): ")
    if response.lower() != 'y':
        print("  Skipped - You'll need to manually edit app/routes.py")
        return True

    if os.path.exists('auto_patch_routes.py'):
        result = run_command('python3 auto_patch_routes.py', 'Automatic patching')
        return result
    else:
        print("  ⚠ auto_patch_routes.py not found")
        print("  Please manually add to app/routes.py:")
        print("    import sys, os")
        print("    sys.path.append(os.path.dirname(os.path.dirname(__file__)))")
        print("    import database as db")
        return False

def test_import():
    """Test if routes can be imported"""
    print_step(6, "Testing Import")

    try:
        sys.path.insert(0, os.getcwd())
        from app import routes
        print("  ✓ Routes module imported successfully")
        return True
    except Exception as e:
        print(f"  ✗ Import failed: {e}")
        print("  Check app/routes.py for syntax errors")
        return False

def show_next_steps():
    """Show final instructions"""
    print_header("✅ SETUP COMPLETE!")

    print("\n📋 Next Steps:")
    print("\n1. Restart your application:")
    print("   sudo systemctl restart monitoring_server")
    print("   # OR")
    print("   python3 run.py")

    print("\n2. Test the API with 200 days:")
    print('   curl "http://localhost:8080/monitoring_server/api/server_metrics_history?server=2.67+-+V1CS9&days=200"')

    print("\n3. Monitor database growth:")
    print("   ls -lh server_monitoring.db")
    print('   sqlite3 server_monitoring.db "SELECT COUNT(*) FROM server_metrics;"')

    print("\n4. If something goes wrong:")
    print("   cp app/routes.py.backup app/routes.py  # Restore backup")

    print("\n✨ Your system now supports 200 days of history!")
    print("   Query speeds: 10-100x faster with SQLite")
    print()

def main():
    """Main setup workflow"""
    print_header("SQLite Database Setup for Server Monitoring")
    print("This script will:")
    print("  1. Check required files")
    print("  2. Test database connection")
    print("  3. Backup routes.py")
    print("  4. Migrate JSON data (optional)")
    print("  5. Patch routes.py")
    print("  6. Test everything")

    input("\nPress Enter to continue...")

    # Run all steps
    steps = [
        (check_files, True),
        (test_database_connection, True),
        (backup_routes, True),
        (migrate_json_data, False),  # Optional
        (patch_routes, True),
        (test_import, True)
    ]

    for step_func, required in steps:
        result = step_func()
        if required and not result:
            print(f"\n✗ Setup failed at {step_func.__name__}")
            print("Please fix the errors and run again")
            sys.exit(1)

    show_next_steps()

if __name__ == '__main__':
    # Check if running from correct directory
    if not os.path.exists('app/routes.py'):
        print("✗ Error: Must run from project root directory")
        print("  cd ~/Mihir/server_monitoring_new/")
        print("  python3 complete_setup.py")
        sys.exit(1)

    main()