# # from app import app

# # if __name__ == '__main__':
# #     app.run(host='127.0.0.1', port=5011, debug=True)

# from app import create_app
# from app.routes import collect_server_data
# import threading

# app = create_app()

# # ✅ START BACKGROUND THREAD
# tracking_thread = threading.Thread(target=collect_server_data, daemon=True)
# tracking_thread.start()
# print("✅ SSH tracking background thread started!")

# if __name__ == '__main__':
#     app.run(host='0.0.0.0', port=5011, debug=True, use_reloader=False)

# run.py
import sys
import os

# Ensure project root is on path before anything else
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
import threading

app = create_app()

# Import AFTER create_app so routes.py is already loaded cleanly
from app.routes import collect_server_data

def _bg():
    with app.app_context():
        collect_server_data()

tracking_thread = threading.Thread(target=_bg, daemon=True)
tracking_thread.start()
print("✅ SSH tracking background thread started!")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5011, debug=True, use_reloader=False)
