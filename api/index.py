import csv
import json
import os
import re
import time
import urllib.parse
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import parse_qs, unquote, urldefrag, urljoin, urlparse

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
import requests
from bs4 import BeautifulSoup
from ddgs import DDGS

# Load environment variables from .env if present locally
load_dotenv()

# Initialize Flask app (native Vercel Python entrypoint)
app = Flask(__name__, static_folder="../public")

# Environment configuration
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "").strip()
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID", "").strip()

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_CLEAN_REGEX = re.compile(r"(?:\+?91[\s.-]?)?0?\d{2,5}[\s.-]?\d{5,8}\b")

INVALID_EMAIL_EXTENSIONS = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    ".bmp", ".tiff", ".ico", ".css", ".js", ".woff", ".woff2"
)
IGNORED_EMAIL_DOMAINS = {
    "example.com", "domain.com", "email.com", "yourdomain.com",
    "sentry.io", "wixpress.com"
}

TITLE_KEYWORD_REGEX = re.compile(
    r"\b(dr\.?|doctor|dds|dmd|dentist|surgeon|specialist|orthodontist|founder|co-founder|owner|ceo|director|president|principal|partner)\b",
    re.IGNORECASE,
)


def clean_netloc(netloc: str) -> str:
    netloc = netloc.lower().split(":")[0]
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc


def same_domain(base: str, url: str) -> bool:
    b = clean_netloc(urlparse(base).netloc)
    u = clean_netloc(urlparse(url).netloc)
    return b == u or u.endswith("." + b)


def extract_emails(soup: BeautifulSoup) -> set:
    found = set()
    for a in soup.find_all("a", href=True):
        if a["href"].startswith("mailto:"):
            addr = a["href"][7:].split("?")[0].strip().lower()
            if addr and "@" in addr:
                found.add(addr)
    for text in soup.stripped_strings:
        for match in EMAIL_REGEX.findall(text):
            m = match.strip().lower()
            if not any(m.endswith(ext) for ext in INVALID_EMAIL_EXTENSIONS):
                domain = m.split("@")[-1]
                if domain not in IGNORED_EMAIL_DOMAINS:
                    found.add(m)
    return found


def extract_phones(soup: BeautifulSoup) -> set:
    found = set()
    for a in soup.find_all("a", href=True):
        if a["href"].startswith("tel:"):
            tel = a["href"][4:].strip()
            digits = re.sub(r"\D", "", tel)
            if 7 <= len(digits) <= 15:
                found.add(tel)
    return found


def extract_name_candidates(soup: BeautifulSoup) -> list:
    candidates = []
    for tag in soup.find_all(["h1", "h2", "h3", "h4"]):
        t = tag.get_text(" ", strip=True)
        if 4 < len(t) < 65 and TITLE_KEYWORD_REGEX.search(t):
            candidates.append(t)
            if len(candidates) >= 5:
                break
    return candidates


def crawl_site(target_info: dict) -> dict:
    url = (target_info.get("website") or "").strip()
    result = dict(target_info)
    if not url or not url.startswith("http"):
        result["status"] = "places_only"
        return result

    session = requests.Session()
    session.headers.update(HEADERS)
    visited = set()
    queue = deque([url])
    emails = set()
    phones = set()
    if target_info.get("phone"):
        phones.add(target_info["phone"])
    names = []
    pages_checked = 0

    while queue and pages_checked < 4:
        curr = queue.popleft()
        if curr in visited:
            continue
        visited.add(curr)

        try:
            resp = session.get(curr, timeout=5)
            if resp.status_code != 200 or "text/html" not in resp.headers.get("content-type", ""):
                continue
            pages_checked += 1
            soup = BeautifulSoup(resp.text, "html.parser")
            emails.update(extract_emails(soup))
            phones.update(extract_phones(soup))
            names.extend(extract_name_candidates(soup))

            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
                    continue
                abs_url = urldefrag(urljoin(curr, href))[0]
                if abs_url not in visited and same_domain(url, abs_url):
                    path = urlparse(abs_url).path.lower()
                    if any(k in path for k in ["contact", "about", "team", "doctor"]):
                        queue.append(abs_url)
        except Exception:
            continue

    result["email"] = "; ".join(sorted(emails))
    result["phone"] = "; ".join(sorted(phones))
    result["owner_name_candidates"] = "; ".join(dict.fromkeys(names)[:4])
    result["pages_checked"] = pages_checked
    result["status"] = "success" if pages_checked > 0 else "site_unreachable"
    return result


def search_google_places_api(query: str, max_results: int = 30) -> tuple:
    """
    Search official Google Places API (New) for authentic local business listings.
    Returns (places_list, status_message).
    """
    api_key = os.getenv("GOOGLE_API_KEY", "").strip() or GOOGLE_API_KEY
    if not api_key:
        return [], "NO_API_KEY"

    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "places.displayName,places.formattedAddress,places.rating,"
            "places.userRatingCount,places.nationalPhoneNumber,places.internationalPhoneNumber,"
            "places.websiteUri,places.googleMapsUri,places.currentOpeningHours,places.primaryTypeDisplayName,"
            "nextPageToken"
        ),
    }

    discovered = []
    page_token = None

    while len(discovered) < max_results:
        fetch_size = min(max_results - len(discovered), 20)
        body = {
            "textQuery": query,
            "pageSize": fetch_size,
        }
        if page_token:
            body["pageToken"] = page_token

        try:
            resp = requests.post(url, headers=headers, json=body, timeout=12)
            if resp.status_code == 403:
                data = resp.json()
                msg = data.get("error", {}).get("message", "Permission denied")
                return [], f"API_KEY_DISABLED: {msg}"
            if resp.status_code != 200:
                return [], f"API_HTTP_{resp.status_code}"

            data = resp.json()
            places = data.get("places", [])
            if not places:
                break

            for p in places:
                name = (p.get("displayName") or {}).get("text", "")
                if not name:
                    continue

                rating = p.get("rating", "")
                rating_str = f"{rating:.1f}" if isinstance(rating, (int, float)) else str(rating or "")
                reviews = str(p.get("userRatingCount") or "")
                phone = p.get("nationalPhoneNumber") or p.get("internationalPhoneNumber") or ""
                address = p.get("formattedAddress") or ""
                website = p.get("websiteUri") or ""
                maps_url = p.get("googleMapsUri") or ""

                hours_info = p.get("currentOpeningHours") or {}
                open_now = hours_info.get("openNow")
                hours_status = "Open now" if open_now is True else ("Closed" if open_now is False else "Operational")

                type_info = p.get("primaryTypeDisplayName") or {}
                category = type_info.get("text") or "Healthcare / Business"

                rank_num = len(discovered) + 1
                discovered.append({
                    "search_rank": f"#{rank_num}",
                    "business_name": name,
                    "category": category,
                    "review_rating": rating_str,
                    "review_count": reviews,
                    "phone": phone,
                    "address": address,
                    "hours_status": hours_status,
                    "website": website,
                    "keyword": query,
                    "review_snippet": "",
                    "google_maps_directions": maps_url,
                    "contact_page": "",
                    "about_page": "",
                    "team_page": "",
                    "owner_name_candidates": "",
                    "email": "",
                    "pages_checked": 0,
                    "status": "google_places_official",
                })
                if len(discovered) >= max_results:
                    break

            page_token = data.get("nextPageToken")
            if not page_token:
                break
            time.sleep(1.0)
        except Exception as e:
            return discovered, f"EXCEPTION: {str(e)}"

    return discovered, "OK"


def search_web_fallback(query: str, max_results: int = 30) -> list:
    """Fallback search using live web discovery when Places API is not active."""
    discovered = []
    seen = set()

    variations = [query, f"{query} contact clinic", f"{query} address phone"]
    for q in variations:
        if len(discovered) >= max_results:
            break
        try:
            results = DDGS().text(q, max_results=15)
            for item in (results or []):
                href = item.get("href", "")
                title = item.get("title", "")
                body = item.get("body", "")
                domain = clean_netloc(urlparse(href).netloc)
                if not domain or domain in seen or any(x in domain for x in ["youtube", "facebook", "twitter", "instagram", "wikipedia"]):
                    continue
                seen.add(domain)

                m_phone = PHONE_CLEAN_REGEX.search(body)
                phone = m_phone.group(0) if m_phone else ""

                # Extract rating ONLY if genuine in snippet, do not fabricate ratings
                m_rate = re.search(r"(\b[3-5]\.\d\b)\s*(?:stars?|★)?", body)
                rating = m_rate.group(1) if m_rate else ""

                clean_name = re.split(r"[-|:·]", title)[0].strip() or title
                rank = len(discovered) + 1
                discovered.append({
                    "search_rank": f"#{rank}",
                    "business_name": clean_name,
                    "category": "Clinic / Healthcare",
                    "review_rating": rating,
                    "review_count": "",
                    "phone": phone,
                    "address": body[:90] + "..." if len(body) > 90 else body,
                    "hours_status": "Operational",
                    "website": href,
                    "keyword": query,
                    "review_snippet": body[:120] if body else "",
                    "google_maps_directions": f"https://www.google.com/maps/search/{urllib.parse.quote(clean_name)}",
                    "contact_page": "",
                    "about_page": "",
                    "team_page": "",
                    "owner_name_candidates": "",
                    "email": "",
                    "pages_checked": 0,
                    "status": "web_discovery",
                })
                if len(discovered) >= max_results:
                    break
        except Exception:
            continue

    return discovered


def is_local_env():
    """Check if running on local developer machine vs cloud deployment (Vercel)."""
    return not bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


def find_business_website(name: str, query: str) -> str:
    """Auto-discover official website for a Google Places listing if missing."""
    if not name:
        return ""
    try:
        clean_name = re.split(r"[-|:·]", name)[0].strip()
        search_term = f"{clean_name} official website"
        results = list(DDGS().text(search_term, max_results=2))
        for r in results:
            href = r.get("href", "")
            if href and "google.com" not in href and not any(x in href for x in ["facebook.com", "instagram.com", "youtube.com"]):
                return href
    except Exception:
        pass
    return ""


def run_local_scraper(query: str, max_results: int, mode: str = "places") -> list:
    """Connect UI directly to scraper.py when running locally."""
    try:
        import sys
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        import scraper

        if mode == "web":
            print(f"[Local UI] Calling scraper.py (Web Search Engine) for: '{query}' ({max_results} entries)...")
            targets = scraper.search_keyword_leads(query, max_results=max_results)
        else:
            print(f"[Local UI] Calling scraper.py (Playwright Places Engine) for: '{query}' ({max_results} places)...")
            targets = scraper.search_google_places(query, max_results=max_results)
            # Auto-enrich any places missing a website URL
            for t in targets:
                if not t.get("website"):
                    discovered_site = find_business_website(t.get("business_name", ""), query)
                    if discovered_site:
                        t["website"] = discovered_site

        if not targets:
            print(f"[Local UI] scraper.py returned 0 results for mode='{mode}', falling back...")
            return []

        enriched = []
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(scraper.scrape_site, t): t for t in targets}
            for f in as_completed(futures):
                try:
                    enriched.append(f.result())
                except Exception:
                    enriched.append(futures[f])

        enriched.sort(key=lambda r: scraper.parse_rank_num(r.get("search_rank", "")))
        return enriched
    except Exception as e:
        print(f"[Local UI] Error in local scraper.py: {e}")
        return []


def discover_places(query: str, max_results: int = 30, mode: str = "places") -> tuple:
    # 1. Local mode: connect UI directly to scraper.py
    if is_local_env():
        local_leads = run_local_scraper(query, max_results=max_results, mode=mode)
        if local_leads:
            return local_leads, {
                "source": f"scraper_py_{mode}",
                "api_status": f"Connected to local scraper.py ({mode.capitalize()} Mode)",
            }

    # 2. Deployment mode (Vercel)
    if mode == "web":
        places = search_web_fallback(query, max_results=max_results)
        api_status = "Web Discovery Active"
    else:
        places, api_status = search_google_places_api(query, max_results=max_results)
        if not places:
            places = search_web_fallback(query, max_results=max_results)

    meta = {
        "source": "google_places_official" if (mode == "places" and "OK" in api_status) else "web_fallback",
        "api_status": api_status,
    }

    # 3. Parallel crawl websites for direct emails & doctor names
    enriched = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(crawl_site, d): d for d in places}
        for f in as_completed(futures):
            try:
                enriched.append(f.result())
            except Exception:
                enriched.append(futures[f])

    def parse_rank(item):
        m = re.search(r"\d+", str(item.get("search_rank", "")))
        return int(m.group(0)) if m else 999

    enriched.sort(key=parse_rank)
    return enriched, meta


# Global CORS handler for all responses
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


@app.route("/api/health", methods=["GET"])
@app.route("/api", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "google_api_configured": bool(os.getenv("GOOGLE_API_KEY", "") or GOOGLE_API_KEY),
        "timestamp": int(time.time()),
    })


@app.route("/api/scrape", methods=["GET", "POST"])
def scrape_endpoint():
    query = ""
    count = 15
    mode = "places"

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        query = data.get("query", "").strip()
        count = int(data.get("count", 15))
        mode = data.get("mode", "places").strip().lower()
    else:
        query = request.args.get("q", "").strip() or request.args.get("query", "").strip()
        count = int(request.args.get("n", 15) or request.args.get("count", 15))
        mode = request.args.get("mode", "places").strip().lower()

    count = max(1, min(count, 30))
    if mode not in ("places", "web"):
        mode = "places"

    if not query:
        return jsonify({"error": "Missing 'query' or 'q' parameter"}), 400

    leads, meta = discover_places(query, max_results=count, mode=mode)
    return jsonify({
        "query": query,
        "count": len(leads),
        "source": meta.get("source"),
        "api_status": meta.get("api_status"),
        "leads": leads,
    })


# Fallback for root / and static assets when running server.py locally
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path):
    public_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public"))
    if path != "" and os.path.exists(os.path.join(public_dir, path)):
        return send_from_directory(public_dir, path)
    return send_from_directory(public_dir, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=True)
