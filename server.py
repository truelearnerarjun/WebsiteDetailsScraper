"""
Local development server for WebsiteDetailsScraper.
Serves static frontend from public/ and executes Python API endpoints from api/.
Run with: python server.py
"""

import http.server
import json
import os
import socketserver
import urllib.parse
from api.scrape import handler as ScrapeHandler

PORT = int(os.getenv("PORT", 3000))
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")


class LocalDevHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_OPTIONS(self):
        if self.path.startswith("/api"):
            ScrapeHandler.do_OPTIONS(self)
        else:
            super().do_OPTIONS()

    def do_GET(self):
        if self.path.startswith("/api/scrape") or self.path == "/api/scrape":
            ScrapeHandler.do_GET(self)
        elif self.path.startswith("/api"):
            from api.index import handler as IndexHandler
            IndexHandler.do_GET(self)
        else:
            # Handle root / and static files
            if self.path == "/" or self.path == "":
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/scrape") or self.path == "/api/scrape":
            ScrapeHandler.do_POST(self)
        elif self.path.startswith("/api"):
            from api.index import handler as IndexHandler
            IndexHandler.do_POST(self)
        else:
            self.send_error(404, "File not found")


def run():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), LocalDevHandler) as httpd:
        print(f"\n=======================================================")
        print(f"  Places Scraper Local Server Running!")
        print(f"  Access Frontend & API at: http://localhost:{PORT}")
        print(f"=======================================================\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")


if __name__ == "__main__":
    run()
