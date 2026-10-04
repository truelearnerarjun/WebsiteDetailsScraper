"""
Local development server for WebsiteDetailsScraper.
Serves static frontend from public/ and executes Python API endpoints from api/.
Run with: python server.py
Then open: http://localhost:3000 in your browser.
"""
import os
import sys

from api.index import app

PORT = int(os.getenv("PORT", 3000))

if __name__ == "__main__":
    print(f"\n=======================================================")
    print(f"  Places Scraper Local Server Running!")
    print(f"  Open in your browser: http://localhost:{PORT}")
    print(f"  (Do NOT double-click index.html directly via file://)")
    print(f"=======================================================\n")
    app.run(host="0.0.0.0", port=PORT, debug=False)
