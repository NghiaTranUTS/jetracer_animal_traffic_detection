import os
from typing import Dict
from threading import Thread, Event

import user_agents
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO


class Server:
    def __init__(self):
        self.app = Flask(__name__)
        self.app.config['SECRET_KEY'] = 'secret!'
        self.socketio = SocketIO(self.app)
        CORS(self.app, resources={r"/*": {"origins": "*"}})  # Enable CORS for all routes and origins

        self.web_command: Dict[str, str] = {'racer': 'pause'}
        self.IMG_SIZE: int = 416
        self.END_PIX: int = self.IMG_SIZE - 1

        # Get the directory containing the current file
        self.SERVER_DIR: str = os.path.dirname(os.path.abspath(__file__))
        self.STATIC_DIR: str = os.path.join(self.SERVER_DIR, 'static')

        # Shared data
        self.shared_data = {}
        self.step = 0
        self.step_broadcast = 0
        self.broadcast_event = Event()

        # Route definitions
        self.app.route('/')(self.index_guest)
        self.app.route('/dev')(self.index_dev)
        self.app.route('/jetson_command', methods=['GET'])(self.get_jetson_command)
        self.app.route('/display', methods=['POST'])(self.display)

        # SocketIO event handler
        self.socketio.on('connect')(self.handle_connect)

        # Start a thread to continuously broadcast data
        broadcast_thread = Thread(target=self.broadcast_data)
        broadcast_thread.daemon = True
        broadcast_thread.start()

    def index_guest(self):
        user_agent: str = request.headers.get('User-Agent')
        ua = user_agents.parse(user_agent)

        if ua.is_mobile:
            return send_from_directory(self.STATIC_DIR, 'dashboard_mobile.html')
        else:
            return send_from_directory(self.STATIC_DIR, 'dashboard_pc.html')

    def index_dev(self):
        user_agent: str = request.headers.get('User-Agent')
        ua = user_agents.parse(user_agent)

        if ua.is_mobile:
            return send_from_directory(self.STATIC_DIR, 'dev_mobile.html')
        else:
            return send_from_directory(self.STATIC_DIR, 'dev_pc.html')

    def get_jetson_command(self):
        command = request.args.get('racer')
        self.web_command['racer'] = command
        print(f'web_command {command}')
        return jsonify({'racer': self.web_command['racer']})

    def display(self):
        img_base64: str = request.form.get('img_base64', type=str)
        throttle: float = request.form.get('throttle', type=float, default=0.0)
        steer_real: float = request.form.get('steer_real', type=float, default=0.0)
        steer_calc: float = request.form.get('steer_calc', type=float, default=0.0)
        lane_x = max(0.0, min((steer_calc + 0.5) * self.END_PIX, self.END_PIX))
        list_lane_dense: str = request.form.get('list_lane')
        sign_dense: str = request.form.get('sign')
        list_anim_dense: str = request.form.get('list_anim')
        logo_dense: str = request.form.get('logo')

        # Update shared data directly
        self.shared_data.update({
            'image': img_base64,
            'list_lane_dense': list_lane_dense,
            'sign_dense': sign_dense,
            'list_anim_dense': list_anim_dense,
            'logo_dense': logo_dense,
            'throttle': throttle,
            'steering': steer_real,
            'lane_x': lane_x
        })
        self.step += 1
        self.broadcast_event.set()  # Signal the broadcast thread

        return jsonify({'racer': self.web_command['racer']})

    def broadcast_data(self):
        while True:
            self.broadcast_event.wait()  # Wait for the event to be set
            self.broadcast_event.clear()  # Clear the event

            if self.shared_data and self.step_broadcast < self.step:
                self.socketio.emit('image_update', self.shared_data)
                self.step_broadcast = self.step

    def handle_connect(self):
        print('Client connected')

    def run(self, host='0.0.0.0', port=8485):
        self.socketio.run(self.app, host=host, port=port, allow_unsafe_werkzeug=True)


if __name__ == '__main__':
    server = Server()
    server.run()
