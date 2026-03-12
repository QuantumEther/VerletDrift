"""
Development HTTP server with caching disabled.
Run: python3 serve.py
"""
import http.server

PORT = 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        pass  # suppress request noise

if __name__ == '__main__':
    http.server.test(HandlerClass=NoCacheHandler, port=PORT)
