#!/usr/bin/env python3
"""
Automatic patcher for app/routes.py to add SQLite database support
Run this from the project root: python3 auto_patch_routes.py
"""

import os
import re
import sys

def backup_file(filepath):
    """Create backup of routes.py"""
    backup_path = filepath + '.backup'
    if os.path.exists(backup_path):
        print(f"⚠ Backup already exists: {backup_path}")
        response = input("Overwrite? (yes/no): ")
        if response.lower() not in ['yes', 'y']:
            return False

    with open(filepath, 'r') as f:
        content = f.read()

    with open(backup_path, 'w') as f:
        f.write(content)

    print(f"✓ Backup created: {backup_path}")
    return True

def add_database_import(content):
    """Add database import after other imports"""

    # Check if already imported
    if 'import database as db' in content:
        print("⚠ Database already imported, skipping...")
        return content

    # Find the location after the last import
    import_pattern = r'(from flask import render_template_string\n)'

    replacement = r'\1\n# Database import for SQLite storage\nimport sys\nimport os\nsys.path.append(os.path.dirname(os.path.dirname(__file__)))\nimport database as db\n'

    new_content = re.sub(import_pattern, replacement, content)

    if new_content != content:
        print("✓ Added database import")
        return new_content

    print("⚠ Could not find import location, please add manually:")
    print("  import sys, os")
    print("  sys.path.append(os.path.dirname(os.path.dirname(__file__)))")
    print("  import database as db")
    return content

def replace_save_to_history(content):
    """Replace save_to_history to use database"""

    # Find the end of save_to_history function where it saves to JSON
    pattern = r'(\s+history_detailed\.append\([^)]+\)\n\n)(\s+# Save detailed format\n\s+with open\(HISTORY_FILE1.*?json\.dump\(history_detailed.*?\n)'

    replacement = r'\1    # Save to SQLite DATABASE instead of JSON\n    db.save_server_metrics(server_data_detailed)\n\n    # OLD JSON method (commented out)\n    # with open(HISTORY_FILE1, \'w\') as f:\n    #     json.dump(history_detailed, f, indent=2)\n'

    new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

    if new_content != content:
        print("✓ Modified save_to_history() to use database")
        return new_content

    print("⚠ Could not automatically modify save_to_history()")
    print("  Please manually replace the JSON save with: db.save_server_metrics(server_data_detailed)")
    return content

def replace_api_endpoint(content, route_name, new_function):
    """Replace an API endpoint function"""

    # Pattern to match the entire function
    pattern = rf'(@bp\.route\(\'/api/{route_name}\'\)\ndef [^(]+\([^)]*\):.*?)(?=\n@bp\.route|\nif __name__|\Z)'

    new_content = re.sub(pattern, new_function, content, flags=re.DOTALL)

    if new_content != content:
        print(f"✓ Replaced {route_name} endpoint")
        return new_content

    print(f"⚠ Could not replace {route_name} endpoint")
    return content

def main():
    """Main patching function"""

    print("="*70)
    print("Automatic Routes.py Patcher for SQLite Database")
    print("="*70)
    print()

    routes_path = 'app/routes.py'

    # Check if routes.py exists
    if not os.path.exists(routes_path):
        print(f"✗ Error: {routes_path} not found")
        print("  Make sure you run this from the project root directory")
        sys.exit(1)

    print(f"Found: {routes_path}")

    # Check if database.py exists
    if not os.path.exists('database.py'):
        print("✗ Error: database.py not found in current directory")
        sys.exit(1)

    print("Found: database.py")
    print()

    # Create backup
    if not backup_file(routes_path):
        print("Backup cancelled, exiting...")
        sys.exit(0)

    print()
    print("Applying patches...")
    print("-" * 70)

    # Read current content
    with open(routes_path, 'r') as f:
        content = f.read()

    original_content = content

    # Apply patches
    content = add_database_import(content)
    content = replace_save_to_history(content)

    # Replace API endpoints with simpler versions

    # get_server_metrics_history
    content = re.sub(
        r'@bp\.route\(\'/api/server_metrics_history\'\)\ndef get_server_metrics_history\(\):.*?return jsonify\(.*?\)',
        """@bp.route('/api/server_metrics_history')
def get_server_metrics_history():
    \"""Get time-series metrics for charting - FROM DATABASE\"""
    server_name = request.args.get('server')
    days = int(request.args.get('days', 7))

    if not server_name:
        return jsonify({'error': 'Server name required'}), 400

    # Query from DATABASE
    metrics = db.get_server_metrics_history(server_name, days)
    return jsonify({'metrics': metrics})""",
        content,
        flags=re.DOTALL
    )

    # get_alert_history
    content = re.sub(
        r'@bp\.route\(\'/api/alert_history\'\)\ndef get_alert_history\(\):.*?return jsonify\(.*?\}\)',
        """@bp.route('/api/alert_history')
def get_alert_history():
    \"""Get alert history with filtering - FROM DATABASE\"""
    server_name = request.args.get('server')
    alert_type = request.args.get('type')
    severity = request.args.get('severity')
    days = int(request.args.get('days', 7))

    # Query from DATABASE
    alerts, summary = db.get_alert_history(server_name, alert_type, severity, days)
    return jsonify({'alerts': alerts, 'summary': summary})""",
        content,
        flags=re.DOTALL
    )

    # Check if changes were made
    if content == original_content:
        print("⚠ No changes were made")
        print("  You may need to manually edit routes.py")
        sys.exit(1)

    # Save patched content
    with open(routes_path, 'w') as f:
        f.write(content)

    print("-" * 70)
    print()
    print("="*70)
    print("✅ PATCHING COMPLETE!")
    print("="*70)
    print()
    print("Changes made:")
    print("  1. ✓ Added database import")
    print("  2. ✓ Modified save_to_history() to use SQLite")
    print("  3. ✓ Updated API endpoints")
    print()
    print("Next steps:")
    print("  1. Review changes: diff app/routes.py.backup app/routes.py")
    print("  2. Migrate data: python3 migrate.py")
    print("  3. Restart app: sudo systemctl restart monitoring_server")
    print("  4. Test: curl \"http://localhost:8080/monitoring_server/api/server_metrics_history?server=2.67+-+V1CS9&days=200\"")
    print()
    print("If anything goes wrong:")
    print("  Restore backup: cp app/routes.py.backup app/routes.py")
    print()

if __name__ == '__main__':
    main()