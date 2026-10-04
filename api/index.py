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


def parse_rank(item: dict) -> int:
    """Return a stable numeric rank for sorting and duplicate resolution."""
    match = re.search(r"\d+", str(item.get("search_rank", "")))
    return int(match.group(0)) if match else 999999


def normalize_phone_key(phone: str) -> str:
    """Create a comparison key without changing the number shown to the user."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0") and digits[1] in "6789":
        digits = digits[1:]
    return digits if 7 <= len(digits) <= 15 else ""


def normalize_domain_key(url: str) -> str:
    domain = clean_netloc(urlparse(url or "").netloc)
    return domain if domain and "google." not in domain else ""


def unique_values(*values: str) -> str:
    """Combine semicolon-separated contact values while retaining display text."""
    seen = set()
    items = []
    for value in values:
        for item in str(value or "").split(";"):
            item = item.strip()
            key = item.lower()
            if item and key not in seen:
                seen.add(key)
                items.append(item)
    return "; ".join(items)


def unique_phone_values(*values: str) -> str:
    """Keep one display value per normalized phone number when merging duplicates."""
    seen = set()
    items = []
    for value in values:
        for item in str(value or "").split(";"):
            item = item.strip()
            key = normalize_phone_key(item) or item.lower()
            if item and key not in seen:
                seen.add(key)
                items.append(item)
    return "; ".join(items)


def lead_identity_keys(lead: dict) -> set:
    """Use independent, conservative identifiers to avoid merging different businesses."""
    keys = set()
    domain = normalize_domain_key(lead.get("website", ""))
    if domain:
        keys.add(f"domain:{domain}")
    for number in str(lead.get("phone", "")).split(";"):
        phone_key = normalize_phone_key(number)
        if phone_key:
            keys.add(f"phone:{phone_key}")

    name = re.sub(r"[^a-z0-9]", "", str(lead.get("business_name", "")).lower())
    address = re.sub(r"[^a-z0-9]", "", str(lead.get("address", "")).lower())
    if len(name) >= 6 and len(address) >= 12:
        keys.add(f"name-address:{name[:36]}:{address[:36]}")
    return keys


def merge_duplicate_leads(leads: list) -> list:
    """Merge only leads sharing a domain, phone, or matching name/address fingerprint."""
    merged = []
    key_to_index = {}

    for lead in sorted(leads, key=parse_rank):
        item = dict(lead)
        keys = lead_identity_keys(item)
        matching_indexes = {key_to_index[key] for key in keys if key in key_to_index}
        if not matching_indexes:
            item["duplicate_count"] = int(item.get("duplicate_count") or 1)
            item["merged_ranks"] = str(item.get("search_rank", ""))
            index = len(merged)
            merged.append(item)
            for key in keys:
                key_to_index[key] = index
            continue

        index = min(matching_indexes)
        primary = merged[index]
        primary["duplicate_count"] = int(primary.get("duplicate_count") or 1) + int(item.get("duplicate_count") or 1)
        primary["merged_ranks"] = unique_values(primary.get("merged_ranks", ""), item.get("search_rank", ""))
        primary["phone"] = unique_phone_values(primary.get("phone", ""), item.get("phone", ""))
        for field in ("email", "owner_name_candidates", "contact_page", "about_page", "team_page"):
            primary[field] = unique_values(primary.get(field, ""), item.get(field, ""))
        for field in ("website", "address", "category", "hours_status", "review_rating", "review_count", "review_snippet"):
            if not primary.get(field) and item.get(field):
                primary[field] = item[field]
        for key in keys | lead_identity_keys(primary):
            key_to_index[key] = index

    return merged


def add_lead_intelligence(leads: list) -> list:
    """Attach explainable score, confidence, and provenance metadata for the UI/export."""
    intelligent_leads = []
    for lead in merge_duplicate_leads(leads):
        item = dict(lead)
        score = 0
        if item.get("business_name") and item.get("address"):
            score += 10
        if item.get("website"):
            score += 10
        if item.get("phone"):
            score += 20
        if item.get("email"):
            score += 30
        if item.get("owner_name_candidates"):
            score += 10
        if item.get("contact_page") or item.get("about_page") or item.get("team_page"):
            score += 5
        if item.get("review_rating"):
            score += 5
        try:
            review_count = int(re.sub(r"\D", "", str(item.get("review_count", ""))) or 0)
            if review_count >= 50:
                score += 5
        except ValueError:
            pass
        if int(item.get("pages_checked") or 0) > 0:
            score += 5

        sources = []
        status = str(item.get("status", "")).lower()
        if item.get("google_maps_directions") or "places" in status or "google_places" in status:
            sources.append("Google Maps")
        if "web_discovery" in status:
            sources.append("Web search")
        if int(item.get("pages_checked") or 0) > 0 or item.get("email") or item.get("owner_name_candidates"):
            sources.append("Website crawl")
        if not sources:
            sources.append("Search result")

        if score >= 65 and (item.get("email") or item.get("phone")):
            confidence = "High"
        elif score >= 35:
            confidence = "Medium"
        else:
            confidence = "Low"

        item["lead_score"] = min(score, 100)
        item["data_confidence"] = confidence
        item["data_sources"] = "; ".join(sources)
        item["duplicate_count"] = int(item.get("duplicate_count") or 1)
        item["merged_ranks"] = item.get("merged_ranks") or str(item.get("search_rank", ""))
        intelligent_leads.append(item)

    return sorted(intelligent_leads, key=parse_rank)


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
        for p in str(target_info["phone"]).split(";"):
            p_clean = p.strip()
            if p_clean:
                phones.add(p_clean)
    names = []
    contact_page = target_info.get("contact_page", "")
    about_page = target_info.get("about_page", "")
    team_page = target_info.get("team_page", "")
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
                    if not contact_page and any(k in path for k in ["contact", "get-in-touch"]):
                        contact_page = abs_url
                    if not about_page and any(k in path for k in ["about", "our-story"]):
                        about_page = abs_url
                    if not team_page and any(k in path for k in ["team", "doctor", "specialist", "staff"]):
                        team_page = abs_url
                    if any(k in path for k in ["contact", "about", "team", "doctor"]):
                        queue.append(abs_url)
        except Exception:
            continue

    result["email"] = "; ".join(sorted(emails))
    result["phone"] = "; ".join(sorted(phones))
    result["owner_name_candidates"] = "; ".join(dict.fromkeys(names)[:4])
    result["contact_page"] = contact_page
    result["about_page"] = about_page
    result["team_page"] = team_page
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

    variations = [
        query,
        f"{query} contact clinic",
        f"{query} address phone",
        f"best {query}",
        f"top {query} directory",
        f"{query} clinic locations",
        f"{query} appointments",
        f"{query} reviews list",
    ]
    for q in variations:
        if len(discovered) >= max_results:
            break
        try:
            results = DDGS().text(q, max_results=30)
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
        results = list(DDGS().text(search_term, max_results=3))
        for r in results:
            href = r.get("href", "")
            if href and "google.com" not in href and not any(x in href.lower() for x in [
                "facebook.com", "instagram.com", "youtube.com", "zomato.com", "swiggy.com",
                "justdial.com", "indiamart.com", "sulekha.com", "practo.com", "lybrate.com",
                "wikipedia.org", "twitter.com", "x.com", "linkedin.com"
            ]):
                return href
    except Exception:
        pass
    return ""


def run_local_scraper(query: str, max_results: int, mode: str = "places", min_rating: float = 0.0, max_rating: float = 0.0) -> list:
    """Connect UI directly to scraper.py when running locally."""
    try:
        import sys
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        import scraper

        fetch_count = min(int(max_results * 1.5) + 3, 60) if (min_rating > 0.0 or max_rating > 0.0) else max_results

        if mode == "web":
            print(f"[Local UI] Calling scraper.py (Web Search Engine) for: '{query}' ({fetch_count} entries)...", flush=True)
            targets = scraper.search_keyword_leads(query, max_results=fetch_count)
        else:
            print(f"[Local UI] Calling scraper.py (Google Places Engine) for: '{query}' ({fetch_count} places, max_rating={max_rating})...", flush=True)
            targets = scraper.search_google_places(
                query,
                max_results=fetch_count,
                min_rating=min_rating,
                max_rating=max_rating,
            )

        if not targets:
            print(f"[Local UI] scraper.py returned 0 results for mode='{mode}', falling back...", flush=True)
            return []

        def _enrich_single(t):
            if not t.get("website"):
                try:
                    discovered_web = find_business_website(t.get("business_name", ""), query)
                    if discovered_web:
                        t["website"] = discovered_web
                except Exception:
                    pass
            return scraper.scrape_site(t)

        enriched = []
        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = {executor.submit(_enrich_single, t): t for t in targets}
            for f in as_completed(futures):
                try:
                    enriched.append(f.result())
                except Exception:
                    enriched.append(futures[f])

        # Filter enriched items by rating after crawl if requested
        if min_rating > 0.0 or max_rating > 0.0:
            filtered_enriched = []
            for item in enriched:
                r_val = None
                try:
                    r_str = item.get("review_rating") or ""
                    if r_str:
                        r_val = float(r_str)
                except Exception:
                    pass
                if r_val is not None:
                    if min_rating > 0.0 and r_val < min_rating:
                        continue
                    if max_rating > 0.0 and r_val >= max_rating:
                        continue
                filtered_enriched.append(item)
            enriched = filtered_enriched

        enriched.sort(key=lambda r: scraper.parse_rank_num(r.get("search_rank", "")))
        final_leads = add_lead_intelligence(enriched)[:max_results]

        # Auto-save to CSV on disk matching CLI output format
        try:
            output_filename = scraper.sanitize_filename(query)
            output_filepath = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", output_filename))
            scraper.sort_and_save_csv(output_filepath, final_leads)
            print(f"[Local UI] Saved {len(final_leads)} leads to '{output_filename}'", flush=True)
        except Exception as save_err:
            print(f"[Local UI] Warning: Could not auto-save CSV to disk: {save_err}", flush=True)

        return final_leads
    except Exception as e:
        print(f"[Local UI] Error in local scraper.py: {e}", flush=True)
        return []



def discover_places(query: str, max_results: int = 30, mode: str = "places", min_rating: float = 0.0, max_rating: float = 0.0) -> tuple:
    # 1. Local mode: connect UI directly to scraper.py
    if is_local_env():
        local_leads = run_local_scraper(query, max_results=max_results, mode=mode, min_rating=min_rating, max_rating=max_rating)
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

    # Filter by rating if requested
    if min_rating > 0.0 or max_rating > 0.0:
        filtered_places = []
        for p in places:
            r_val = None
            try:
                if p.get("review_rating"):
                    r_val = float(p["review_rating"])
            except Exception:
                pass
            if r_val is not None:
                if min_rating > 0.0 and r_val < min_rating:
                    continue
                if max_rating > 0.0 and r_val >= max_rating:
                    continue
            filtered_places.append(p)
        places = filtered_places

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

    return add_lead_intelligence(enriched)[:max_results], meta


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
    min_rating = 0.0
    max_rating = 0.0

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        query = data.get("query", "").strip()
        count = int(data.get("count", 15))
        mode = data.get("mode", "places").strip().lower()
        try:
            min_rating = float(data.get("min_rating", 0.0) or 0.0)
        except (ValueError, TypeError):
            pass
        try:
            max_rating = float(data.get("max_rating", 0.0) or 0.0)
        except (ValueError, TypeError):
            pass
    else:
        query = request.args.get("q", "").strip() or request.args.get("query", "").strip()
        count = int(request.args.get("n", 15) or request.args.get("count", 15))
        mode = request.args.get("mode", "places").strip().lower()
        try:
            min_rating = float(request.args.get("min_rating", 0.0) or 0.0)
        except (ValueError, TypeError):
            pass
        try:
            max_rating = float(request.args.get("max_rating", 0.0) or 0.0)
        except (ValueError, TypeError):
            pass

    count = max(1, min(count, 200))
    if mode not in ("places", "web"):
        mode = "places"

    if not query:
        return jsonify({"error": "Missing 'query' or 'q' parameter"}), 400

    leads, meta = discover_places(query, max_results=count, mode=mode, min_rating=min_rating, max_rating=max_rating)
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
