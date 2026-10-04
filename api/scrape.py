# api/scrape.py - Re-export Flask app for direct Vercel routing
from api.index import app

if __name__ == "__main__":
    app.run(port=3000)
