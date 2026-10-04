"""
Local development server for WebsiteDetailsScraper.
Serves the frontend (public/) AND the API (/api/scrape) from one Flask app.

Run:   python server.py
Open:  http://localhost:5050

NOTE: Do not use `python -m http.server` — it only serves static files
and cannot handle POST /api/scrape.
"""
import os

from api.index import app

PORT = int(os.getenv("PORT", 5050))

if __name__ == "__main__":
    print("\n=======================================================")
    print("  Places Scraper local server running")
    print(f"  Open in your browser: http://localhost:{PORT}")
    print("=======================================================\n")
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)
