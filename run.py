# from app import app

# if __name__ == '__main__':
#     app.run(host='127.0.0.1', port=5011, debug=True)

from app import create_app
from app.routes import collect_server_data
import threading

app = create_app()

# ✅ START BACKGROUND THREAD
tracking_thread = threading.Thread(target=collect_server_data, daemon=True)
tracking_thread.start()
print("✅ SSH tracking background thread started!")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5011, debug=True, use_reloader=False)
