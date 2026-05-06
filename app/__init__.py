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

# app/__init__.py
import sys
import os

# ── Add project root to path so routes.py can find database.py ──
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
import threading


def create_app():
    app = Flask(__name__)

    # Import bp INSIDE create_app — after sys.path is set
    from .routes import bp
    app.register_blueprint(bp, url_prefix='/monitoring_server')

    return app
