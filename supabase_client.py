"""
Supabase client module for WebsiteDetailsScraper.
Communicates directly with the Supabase PostgREST API using standard HTTP requests.
No heavy third-party SDK required — 100% compatible with both local Flask and Vercel serverless.
"""
import os
import re
import time
from urllib.parse import urlparse
import requests
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()


def get_supabase_config() -> dict:
    """Return configured Supabase settings from environment."""
    url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (
        os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
        or ""
    ).strip()
    table = (os.getenv("SUPABASE_TABLE") or "leads").strip()
    auto_sync = os.getenv("SUPABASE_AUTO_SYNC", "").strip().lower() in (
        "true", "1", "yes", "on"
    )
    return {
        "url": url,
        "key": key,
        "table": table,
        "auto_sync": auto_sync,
    }


def is_configured() -> bool:
    """Check if minimum required Supabase credentials are present."""
    cfg = get_supabase_config()
    return bool(cfg["url"] and cfg["key"])


def get_headers(key: str) -> dict:
    """Construct standard Supabase REST request headers."""
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def generate_identity_key(lead: dict) -> str:
    """
    Generate a deterministic identity key for deduplication and conflict-free upserts.
    Priority:
    1. Canonical website domain (e.g., 'domain:apollodental.com')
    2. Normalized phone number (e.g., 'phone:9820011223')
    3. Business name + address fingerprint (e.g., 'name-address:drbhor:sec11ghansoli')
    """
    # 1. Domain
    website = str(lead.get("website") or "").strip()
    if website:
        netloc = urlparse(website).netloc.lower().split(":")[0]
        if netloc.startswith("www."):
            netloc = netloc[4:]
        if netloc and "google." not in netloc and "." in netloc:
            return f"domain:{netloc}"

    # 2. Normalized Phone
    phone = str(lead.get("phone") or "")
    for part in phone.split(";"):
        digits = re.sub(r"\D", "", part)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        if len(digits) == 11 and digits.startswith("0") and digits[1] in "6789":
            digits = digits[1:]
        if 7 <= len(digits) <= 15:
            return f"phone:{digits}"

    # 3. Name + Address Fingerprint
    name = re.sub(r"[^a-z0-9]", "", str(lead.get("business_name") or "").lower())
    address = re.sub(r"[^a-z0-9]", "", str(lead.get("address") or "").lower())
    if name:
        return f"name-address:{name[:36]}:{address[:36]}"

    # Fallback unique key
    rank = str(lead.get("search_rank") or "N/A").strip()
    return f"fallback:{rank}:{time.time()}"


def format_lead_for_supabase(lead: dict, query: str = "") -> dict:
    """Format and sanitize lead dict into clean PostgreSQL column types."""
    # Convert rating to float or None
    rating = None
    try:
        r_str = str(lead.get("review_rating") or "").strip()
        if r_str:
            rating = float(r_str)
    except (ValueError, TypeError):
        rating = None

    # Lead score (0 - 100)
    score = 0
    try:
        score = int(lead.get("lead_score", 0) or 0)
    except (ValueError, TypeError):
        score = 0

    # Pages checked
    pages_checked = 0
    try:
        pages_checked = int(lead.get("pages_checked", 0) or 0)
    except (ValueError, TypeError):
        pages_checked = 0

    # Duplicate count
    duplicate_count = 1
    try:
        duplicate_count = int(lead.get("duplicate_count", 1) or 1)
    except (ValueError, TypeError):
        duplicate_count = 1

    return {
        "identity_key": generate_identity_key(lead),
        "search_rank": str(lead.get("search_rank") or "").strip(),
        "keyword": str(query or lead.get("keyword") or "").strip(),
        "business_name": str(lead.get("business_name") or "Unknown").strip(),
        "category": str(lead.get("category") or "").strip(),
        "review_rating": rating,
        "review_count": str(lead.get("review_count") or "").strip(),
        "hours_status": str(lead.get("hours_status") or "").strip(),
        "address": str(lead.get("address") or "").strip(),
        "google_maps_directions": str(lead.get("google_maps_directions") or "").strip(),
        "phone": str(lead.get("phone") or "").strip(),
        "website": str(lead.get("website") or "").strip(),
        "email": str(lead.get("email") or "").strip(),
        "contact_page": str(lead.get("contact_page") or "").strip(),
        "about_page": str(lead.get("about_page") or "").strip(),
        "team_page": str(lead.get("team_page") or "").strip(),
        "owner_name_candidates": str(lead.get("owner_name_candidates") or "").strip(),
        "review_snippet": str(lead.get("review_snippet") or "").strip(),
        "pages_checked": pages_checked,
        "status": str(lead.get("status") or "").strip(),
        "lead_score": min(max(score, 0), 100),
        "data_confidence": str(lead.get("data_confidence") or "Low").strip(),
        "data_sources": str(lead.get("data_sources") or "Google Maps").strip(),
        "duplicate_count": max(duplicate_count, 1),
        "merged_ranks": str(lead.get("merged_ranks") or "").strip(),
    }


def test_connection() -> dict:
    """Test live connectivity to the configured Supabase instance."""
    cfg = get_supabase_config()
    if not cfg["url"] or not cfg["key"]:
        return {
            "connected": False,
            "error": "SUPABASE_URL or SUPABASE_KEY is missing in your .env file.",
            "configured": False,
        }

    endpoint = f"{cfg['url']}/rest/v1/{cfg['table']}"
    headers = {
        "apikey": cfg["key"],
        "Authorization": f"Bearer {cfg['key']}",
        "Prefer": "count=exact",
    }
    params = {"select": "id", "limit": "1"}

    try:
        resp = requests.get(endpoint, headers=headers, params=params, timeout=8)
        if resp.status_code == 200:
            # Parse total count from Content-Range header if present (e.g., '0-0/42' or '*/42')
            total = None
            content_range = resp.headers.get("Content-Range", "")
            if "/" in content_range:
                try:
                    total = int(content_range.split("/")[-1])
                except ValueError:
                    total = None

            return {
                "connected": True,
                "configured": True,
                "url": cfg["url"],
                "table": cfg["table"],
                "auto_sync": cfg["auto_sync"],
                "total_leads": total,
                "message": f"Successfully connected to Supabase table '{cfg['table']}'.",
            }
        elif resp.status_code in (401, 403):
            return {
                "connected": False,
                "configured": True,
                "error": f"Authentication failed ({resp.status_code}): Invalid SUPABASE_KEY.",
            }
        elif resp.status_code == 404 or "42P01" in resp.text:
            return {
                "connected": False,
                "configured": True,
                "needs_schema": True,
                "error": f"Table '{cfg['table']}' does not exist yet. Please run 'supabase_schema.sql' in your Supabase SQL Editor.",
            }
        else:
            return {
                "connected": False,
                "configured": True,
                "error": f"Supabase returned status {resp.status_code}: {resp.text[:200]}",
            }
    except requests.exceptions.RequestException as e:
        return {
            "connected": False,
            "configured": True,
            "error": f"Connection to Supabase failed: {str(e)}",
        }


def upsert_leads(leads: list, query: str = "") -> dict:
    """
    Upsert a batch of leads into Supabase using PostgreSQL ON CONFLICT (identity_key).
    Safe against duplicates: updates existing leads and inserts new ones.
    """
    if not leads:
        return {"success": True, "count": 0, "message": "No leads to save"}

    cfg = get_supabase_config()
    if not cfg["url"] or not cfg["key"]:
        return {
            "success": False,
            "error": "Supabase credentials not configured in .env",
        }

    # Format leads and deduplicate within batch to prevent Postgres error 21000
    formatted_leads = []
    seen_keys = set()
    for item in leads:
        formatted = format_lead_for_supabase(item, query=query)
        key = formatted["identity_key"]
        if key not in seen_keys:
            seen_keys.add(key)
            formatted_leads.append(formatted)

    endpoint = f"{cfg['url']}/rest/v1/{cfg['table']}?on_conflict=identity_key"
    headers = {
        "apikey": cfg["key"],
        "Authorization": f"Bearer {cfg['key']}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    # Send in chunks of 50 to avoid request body limits
    chunk_size = 50
    total_saved = 0
    saved_records = []

    for i in range(0, len(formatted_leads), chunk_size):
        chunk = formatted_leads[i:i + chunk_size]
        try:
            resp = requests.post(endpoint, json=chunk, headers=headers, timeout=15)
            if resp.status_code in (200, 201):
                try:
                    data = resp.json()
                    saved_records.extend(data)
                    total_saved += len(data)
                except Exception:
                    total_saved += len(chunk)
            elif resp.status_code == 404 or "42P01" in resp.text:
                return {
                    "success": False,
                    "needs_schema": True,
                    "error": f"Table '{cfg['table']}' not found. Please run supabase_schema.sql in your Supabase SQL Editor.",
                }
            else:
                return {
                    "success": False,
                    "error": f"Supabase error ({resp.status_code}): {resp.text[:300]}",
                }
        except requests.exceptions.RequestException as exc:
            return {
                "success": False,
                "error": f"Network error communicating with Supabase: {str(exc)}",
            }

    return {
        "success": True,
        "count": total_saved or len(formatted_leads),
        "table": cfg["table"],
        "message": f"Successfully synced {total_saved or len(formatted_leads)} leads to Supabase table '{cfg['table']}'",
    }


def fetch_saved_leads(query: str = "", limit: int = 100, min_score: int = 0) -> list:
    """Fetch stored leads from Supabase with optional search query and score filter."""
    cfg = get_supabase_config()
    if not cfg["url"] or not cfg["key"]:
        return []

    endpoint = f"{cfg['url']}/rest/v1/{cfg['table']}"
    headers = {
        "apikey": cfg["key"],
        "Authorization": f"Bearer {cfg['key']}",
    }
    params = {
        "select": "*",
        "order": "lead_score.desc,created_at.desc",
        "limit": str(max(1, min(limit, 500))),
    }

    if min_score > 0:
        params["lead_score"] = f"gte.{min_score}"

    if query:
        clean_q = re.sub(r"[\",*]", "", query).strip()
        if clean_q:
            params["or"] = f"(business_name.ilike.*{clean_q}*,keyword.ilike.*{clean_q}*,category.ilike.*{clean_q}*,address.ilike.*{clean_q}*)"

    try:
        resp = requests.get(endpoint, headers=headers, params=params, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return []
    except requests.exceptions.RequestException:
        return []
