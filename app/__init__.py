# from flask import Flask
# from config import Config

# def create_app():
#     app = Flask(__name__)
#     app.config.from_object(Config)

#     from app import routes
#     app.register_blueprint(routes.bp)

#     return app


# from flask import Flask


# app = Flask(__name__)
# app.config.from_object('config.Config')

# from app import routes
# app.register_blueprint(routes.bp, url_prefix = "/monitoring_server")

from flask import Flask
from .routes import bp
import threading

def create_app():
    app = Flask(__name__)
    
    # Register blueprint
    app.register_blueprint(bp, url_prefix='/monitoring_server')
    
    # ✅ START BACKGROUND THREAD FOR SSH TRACKING
    from .routes import collect_server_data
    tracking_thread = threading.Thread(target=collect_server_data, daemon=True)
    tracking_thread.start()
    print("✅ SSH tracking background thread started!")
    
    return app
