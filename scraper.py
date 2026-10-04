# lead_scraper.py

import csv
import json
import os
import re
import sys
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from urllib.parse import unquote, urldefrag, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from ddgs import DDGS

# Parser selection: 'lxml' is much faster than 'html.parser'
try:
    import lxml
    HTML_PARSER = "lxml"
except ImportError:
    HTML_PARSER = "html.parser"

# Fix Windows console encoding for international characters and phone symbols
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Concurrency & Rate Limiting
MAX_WORKERS = 4
REQUEST_DELAY = 1.0  # delay between consecutive requests to the same site (seconds)
MAX_PAGES_PER_SITE = 8
REQUEST_TIMEOUT = 12

# Search Configuration
# 1. Mode: "places" (Google Places local businesses) or "web" (traditional web search)
SEARCH_MODE = "places"

# 2. Keyword / Location to search (leave empty "" to read from websites.csv instead)
DEFAULT_SEARCH_KEYWORD = "best doctor in ghansoli navi mumbai"

# 3. Number of search entries to find and scrape (e.g. 10, 20, 30, 50)
SEARCH_RANK_DEPTH = 30

# 4. Highlight & Filter options (matches Google Places filter chips):
FILTER_TOP_RATED = False      # Highlight top rated places (accurate ratings guaranteed)
FILTER_OPEN_NOW = False       # Highlight currently open places
FILTER_DISTANCE = ""          # Distance filter (e.g. "within 400m", "within 1km", or "" for all)
MIN_RATING_THRESHOLD = 0.0    # Optional minimum rating filter (e.g. 4.0 or 4.5, or 0.0 for all)

# Use a realistic desktop browser User-Agent to avoid immediate 403 Forbidden blocks
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

EMAIL_REGEX = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

# Reject image assets and script files that match email regexes (e.g., logo@2x.png)
INVALID_EMAIL_EXTENSIONS = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    ".bmp", ".tiff", ".ico", ".css", ".js", ".woff", ".woff2"
)

IGNORED_EMAIL_DOMAINS = {
    "example.com",
    "domain.com",
    "email.com",
    "yourdomain.com",
    "sentry.io",
    "wixpress.com",
}

PHONE_REGEX = re.compile(
    r"""
    (?:
        \+?\d{1,3}[\s.-]?
    )?
    (?:\(?\d{2,4}\)?[\s.-]?)?
    \d{3}[\s.-]?
    \d{4}
    """,
    re.VERBOSE,
)

PAGE_KEYWORDS = {
    "contact": [
        "contact",
        "contact-us",
        "contactus",
        "get-in-touch",
    ],
    "about": [
        "about",
        "about-us",
        "our-story",
    ],
    "team": [
        "team",
        "our-team",
        "doctors",
        "dentists",
        "surgeons",
        "specialists",
        "meet-the-team",
        "staff",
    ],
}

TITLE_KEYWORD_REGEX = re.compile(
    r"\b(dr\.?|doctor|dds|dmd|dentist|surgeon|specialist|orthodontist|founder|co-founder|owner|ceo|director|president|principal|partner)\b",
    re.IGNORECASE,
)

GENERIC_HEADING_PATTERNS = [
    re.compile(r"^(meet|about|our|the|why|contact|visit|find)\b", re.IGNORECASE),
    re.compile(r"\b(team|doctors|dentists|surgeons|board|staff|services|philosophy|practice|clinic|hospital|story|mission)\b", re.IGNORECASE),
]

FIELDS = [
    "search_rank",
    "business_name",
    "category",
    "review_rating",
    "review_count",
    "phone",
    "address",
    "hours_status",
    "website",
    "email",
    "keyword",
    "review_snippet",
    "contact_page",
    "about_page",
    "team_page",
    "owner_name_candidates",
    "google_maps_directions",
    "pages_checked",
    "status",
]

PHONE_CLEAN_REGEX = re.compile(r"(?:\+?91[\s.-]?)?0?\d{2,5}[\s.-]?\d{5,8}\b")


csv_lock = Lock()


def clean_netloc(netloc: str) -> str:
    """Strip port and leading www. for uniform domain comparisons."""
    netloc = netloc.lower().split(":")[0]
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc


def normalize_url(url: str) -> str:
    """Normalize input URL, ensuring valid scheme and preserving valid path."""
    url = url.strip()
    if not url:
        return None

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urlparse(url)
    if not parsed.netloc:
        return None

    defragged, _ = urldefrag(url)
    return defragged


def same_domain(base: str, url: str) -> bool:
    """Compare domains ignoring www. prefix differences."""
    base_netloc = clean_netloc(urlparse(base).netloc)
    url_netloc = clean_netloc(urlparse(url).netloc)
    return base_netloc == url_netloc or url_netloc.endswith("." + base_netloc)


def get_robots_parser(session: requests.Session, base_url: str):
    """Fetch robots.txt safely with requests and a strict timeout."""
    robots_url = urljoin(base_url, "/robots.txt")
    rp = RobotFileParser()
    rp.set_url(robots_url)

    try:
        resp = session.get(
            robots_url,
            headers=HEADERS,
            timeout=5,
            allow_redirects=True,
        )
        if resp.status_code == 200 and resp.text:
            rp.parse(resp.text.splitlines())
            return rp
        return None
    except Exception:
        return None


def allowed_by_robots(rp, url):
    if rp is None:
        return True
    try:
        return rp.can_fetch(USER_AGENT, url)
    except Exception:
        return True


def fetch(session: requests.Session, url: str):
    """Fetch HTML content with timeout and encoding fallback."""
    try:
        response = session.get(
            url,
            headers=HEADERS,
            timeout=REQUEST_TIMEOUT,
            allow_redirects=True,
        )

        if response.status_code != 200:
            return None

        content_type = response.headers.get("content-type", "").lower()
        if content_type and "text/html" not in content_type and "application/xhtml+xml" not in content_type:
            return None

        if response.encoding is None or response.encoding.lower() == "iso-8859-1":
            response.encoding = response.apparent_encoding or "utf-8"

        return response.text

    except requests.RequestException:
        return None


def is_valid_email(email: str) -> bool:
    email = email.lower().strip()
    if not EMAIL_REGEX.fullmatch(email):
        return False

    if any(email.endswith(ext) for ext in INVALID_EMAIL_EXTENSIONS):
        return False

    domain = email.split("@")[-1]
    if domain in IGNORED_EMAIL_DOMAINS:
        return False

    parts = domain.split(".")
    if len(parts) < 2 or parts[-1].isdigit():
        return False

    return True


def extract_emails(soup: BeautifulSoup) -> set:
    emails = set()

    # 1. mailto links
    for tag in soup.select('a[href^="mailto:"]'):
        href = tag.get("href", "")
        raw = href.replace("mailto:", "", 1).split("?")[0].strip()
        raw = unquote(raw)
        if is_valid_email(raw):
            emails.add(raw.lower())

    # 2. Visible text
    text = soup.get_text(" ", strip=True)
    for email in EMAIL_REGEX.findall(text):
        if is_valid_email(email):
            emails.add(email.lower())

    return emails


def clean_phone(phone_str: str) -> str:
    cleaned = unquote(phone_str).strip()
    if cleaned.lower().startswith("tel:"):
        cleaned = cleaned[4:].strip()
    # Strip invisible unicode control characters (bidi embeddings, zero-width spaces, etc.)
    cleaned = re.sub(r"[\u200e\u200f\u202a-\u202e\ufeff]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def is_valid_phone(phone: str) -> bool:
    digits = re.sub(r"\D", "", phone)
    if not (7 <= len(digits) <= 15):
        return False
    # Filter out ISO dates like 2024-10-03
    if re.match(r"^(19|20)\d{2}[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])$", phone.strip()):
        return False
    return True


def extract_phones(soup: BeautifulSoup) -> set:
    phones = set()

    # 1. tel: links (most reliable source on modern websites)
    for tag in soup.select('a[href^="tel:"]'):
        href = tag.get("href", "")
        cleaned = clean_phone(href)
        if is_valid_phone(cleaned):
            phones.add(cleaned)

    # 2. Visible text matching
    text = soup.get_text(" ", strip=True)
    for phone in PHONE_REGEX.findall(text):
        cleaned = clean_phone(phone)
        if is_valid_phone(cleaned):
            phones.add(cleaned)

    return phones


def extract_reviews(soup: BeautifulSoup) -> tuple:
    """
    Extract review rating (e.g. '4.9') and reviewer count (e.g. '407')
    from Schema.org JSON-LD, microdata, and widget badges.
    """
    rating = ""
    review_count = ""

    # 1. Check Schema.org JSON-LD
    for s in soup.find_all("script", type="application/ld+json"):
        if not s.string:
            continue
        try:
            data = json.loads(s.string)
            items = data.get("@graph", [data]) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            for item in items:
                if not isinstance(item, dict):
                    continue
                ar = item.get("aggregateRating")
                if isinstance(ar, dict):
                    rv = ar.get("ratingValue")
                    rc = ar.get("reviewCount") or ar.get("ratingCount")
                    if rv and not rating:
                        rating = str(rv).strip()
                    if rc and not review_count:
                        review_count = str(rc).strip()
                    if rating and review_count:
                        return rating, review_count
        except Exception:
            pass

    # 2. Check Microdata itemprop tags
    if not rating:
        rv_tag = soup.find(attrs={"itemprop": "ratingValue"})
        if rv_tag:
            rating = (rv_tag.get("content") or rv_tag.get_text(strip=True)).strip()
    if not review_count:
        rc_tag = soup.find(attrs={"itemprop": lambda x: x in ("reviewCount", "ratingCount")})
        if rc_tag:
            review_count = (rc_tag.get("content") or rc_tag.get_text(strip=True)).strip()

    if rating and review_count:
        return rating, review_count

    # 3. Check page visible text patterns
    text = soup.get_text(" ", strip=True)

    # Pattern: 4.8 stars (1,280+ reviews)
    m_combo = re.search(
        r"([3-5]\.\d)\s*(?:stars?|★)?\s*\(?([0-9,]+(?:\+)?)\s*(?:Google\s*)?reviews?\)?",
        text,
        re.I,
    )
    if m_combo:
        if not rating:
            rating = m_combo.group(1)
        if not review_count:
            review_count = m_combo.group(2)
        return rating, review_count

    # Pattern: based on 407 reviews / 4.9 Google Rating
    m_based = re.search(
        r"(?:([3-5]\.\d)\s*(?:Google\s*Rating|★|stars?)?)?[^0-9\n]{0,25}based on\s*([0-9]+[0-9,]*(?:\+)?)\s*(?:Google\s*)?reviews?",
        text,
        re.I,
    )
    if m_based:
        if m_based.group(1) and not rating:
            rating = m_based.group(1)
        if not review_count:
            review_count = m_based.group(2)

    if not review_count:
        m_count = re.search(r"\b([0-9]+[0-9,]*(?:\+)?)\s*(?:Google\s*)?reviews", text, re.I)
        if m_count:
            review_count = m_count.group(1)

    if not rating:
        m_rate = re.search(r"\b([3-5]\.\d)\s*(?:Google\s*Rating|out of 5|\/ 5|\/5|\bstars?\b)", text, re.I)
        if m_rate:
            rating = m_rate.group(1)

    # 4. Check star widgets (e.g. Trustindex with star images)
    if not rating and review_count:
        if soup.find("img", alt=re.compile(r"star 5\b", re.I)):
            rating = "5.0"
        elif soup.find("img", alt=re.compile(r"star 4\b", re.I)):
            rating = "4.0"

    if review_count:
        review_count = re.sub(r"^[,\s]+|[,\s]+$", "", review_count)

    return rating, review_count


def find_candidate_pages(base_url: str, soup: BeautifulSoup) -> dict:
    pages = {
        "contact": set(),
        "about": set(),
        "team": set(),
    }

    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
            continue

        absolute = urljoin(base_url, href)
        absolute = urldefrag(absolute)[0]

        if not same_domain(base_url, absolute):
            continue

        text = link.get_text(" ", strip=True).lower()
        path = urlparse(absolute).path.lower()

        for page_type, keywords in PAGE_KEYWORDS.items():
            for kw in keywords:
                if kw in path or kw in text:
                    pages[page_type].add(absolute)
                    break

    return pages


def extract_name_candidates(soup: BeautifulSoup) -> list:
    candidates = []

    for tag in soup.find_all(["h1", "h2", "h3", "h4"]):
        text = tag.get_text(" ", strip=True)
        if not text:
            continue

        # Keep reasonably concise headings (names & titles are typically < 65 chars)
        if len(text) > 65:
            continue

        if TITLE_KEYWORD_REGEX.search(text):
            is_generic = any(pat.search(text) for pat in GENERIC_HEADING_PATTERNS)
            if not is_generic or len(text.split()) <= 4:
                candidates.append(text)

    return candidates


def check_search_rank(target_website: str, keyword: str, max_depth: int = SEARCH_RANK_DEPTH) -> str:
    """
    Search the live web for `keyword` and find what rank (1-based position)
    the `target_website` appears at. Free, no API keys needed.
    """
    if not keyword:
        return "NO_KEYWORD"

    target_domain = clean_netloc(urlparse(target_website).netloc)
    if not target_domain:
        return "N/A"

    try:
        results = []
        max_pages = (max_depth // 10) + 2
        for page in range(1, max_pages + 1):
            try:
                batch = DDGS().text(keyword, page=page, max_results=10)
                if batch:
                    results.extend(batch)
                if len(results) >= max_depth:
                    break
            except Exception:
                break

        for idx, item in enumerate(results[:max_depth], start=1):
            item_url = item.get("href", "")
            item_domain = clean_netloc(urlparse(item_url).netloc)

            # Match domain exactly or as subdomain
            if (
                item_domain == target_domain
                or item_domain.endswith("." + target_domain)
                or target_domain.endswith("." + item_domain)
            ):
                page_num = ((idx - 1) // 10) + 1
                return f"#{idx} (Page {page_num})" if page_num > 1 else f"#{idx}"

        return f"Not in top {max_depth}"

    except Exception as err:
        return f"SEARCH_ERR: {str(err)[:25]}"


def search_google_places(
    keyword: str,
    max_results: int = SEARCH_RANK_DEPTH,
    top_rated: bool = FILTER_TOP_RATED,
    open_now: bool = FILTER_OPEN_NOW,
    distance: str = FILTER_DISTANCE,
    min_rating: float = MIN_RATING_THRESHOLD,
    max_rating: float = 0.0,
) -> list:
    """
    Search Google Places (udm=local) for real local business listings.
    Supports filter highlights: Top rated (accurate ratings), Open now, and Distance radius.
    """
    print(f"\n[+] Searching Google Places for: '{keyword}' (targeting {max_results} places)...")

    # Build search query incorporating filter highlights
    query_parts = [keyword]
    if top_rated and not any(k in keyword.lower() for k in ["best", "top rated", "top-rated"]):
        query_parts.append("top rated")
    if open_now and "open now" not in keyword.lower():
        query_parts.append("open now")
    if distance and distance.lower() not in keyword.lower():
        query_parts.append(distance)

    full_query = " ".join(query_parts)
    print(f"[+] Effective Places Query: '{full_query}'")
    if top_rated:
        print("[+] Filter Highlight: [Top rated] enabled (accurate official Google ratings)")
    if open_now:
        print("[+] Filter Highlight: [Open now] enabled (currently open places only)")
    if distance:
        print(f"[+] Filter Highlight: [{distance}] enabled")

    discovered = []
    seen_names = set()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[!] Playwright is not installed. Falling back to web search...")
        return search_keyword_leads(keyword, max_results=max_results)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ],
                ignore_default_args=["--enable-automation"],
            )
            context = browser.new_context(
                user_agent=USER_AGENT,
                viewport={"width": 1366, "height": 900},
                locale="en-IN",
            )
            context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            page = context.new_page()

            start = 0
            max_start = max(100, ((max_results // 20) + 3) * 20)
            while len(discovered) < max_results and start < max_start:
                url = f"https://www.google.com/search?q={full_query.replace(' ', '+')}&udm=local&start={start}"
                page.goto(url, wait_until="domcontentloaded", timeout=25000)
                time.sleep(3)

                page_items = page.evaluate("""() => {
                    const results = [];
                    const cards = Array.from(document.querySelectorAll('div.cXedhc'));
                    for (const card of cards) {
                        const nameEl = card.querySelector('span.OSrXXb, div.dbg0pd');
                        const name = nameEl ? nameEl.innerText.trim() : '';
                        if (!name) continue;

                        const ratingEl = card.querySelector('span.yi40Hd');
                        const rating = ratingEl ? ratingEl.innerText.trim() : '';

                        const reviewEl = card.querySelector('span.RDApEe');
                        const reviewCount = reviewEl ? reviewEl.innerText.trim().replace(/[()]/g, '') : '';

                        const details = card.querySelector('div.rllt__details');
                        const lines = details ? Array.from(details.children).map(c => c.innerText.trim()) : [];

                        let container = card;
                        while (container && container !== document.body) {
                            if (container.querySelector('a.yYlJEf, a[href*="/goto"], a[aria-label*="Website"]')) {
                                break;
                            }
                            container = container.parentElement;
                        }

                        let gotoHref = '';
                        let directionsHref = '';
                        if (container && container !== document.body) {
                            const webA = container.querySelector('a.yYlJEf, a[href*="/goto"], a[aria-label*="Website"]');
                            if (webA) gotoHref = webA.getAttribute('href') || webA.href;
                            const dirA = container.querySelector('a[href*="/maps/dir/"]');
                            if (dirA) directionsHref = dirA.href;
                        }

                        results.push({
                            name,
                            rating,
                            reviewCount,
                            lines,
                            gotoHref,
                            directionsHref,
                        });
                    }
                    return results;
                }""")

                if not page_items:
                    break

                for item in page_items:
                    name = item["name"]
                    if not name or name in seen_names:
                        continue

                    rating = item.get("rating", "")
                    reviews = item.get("reviewCount", "")

                    if min_rating > 0.0 and rating:
                        try:
                            if float(rating) < min_rating:
                                continue
                        except ValueError:
                            pass

                    if max_rating > 0.0 and rating:
                        try:
                            if float(rating) >= max_rating:
                                continue
                        except ValueError:
                            pass

                    seen_names.add(name)
                    lines = item.get("lines", [])

                    category = ""
                    address = ""
                    phone = ""
                    hours_status = ""
                    snippet = ""

                    for idx_l, line in enumerate(lines):
                        if "·" in line and any(c.isdigit() for c in line) and idx_l <= 1:
                            parts = line.split("·")
                            if len(parts) > 1:
                                category = parts[-1].strip()
                        elif any(k in line.lower() for k in ["road", "marg", "sector", "shop", "plot", "building", "complex", "society", "nagar", "station", "opp", "near"]):
                            m_phone = PHONE_CLEAN_REGEX.search(line)
                            if m_phone and len(re.sub(r"\D", "", m_phone.group(0))) >= 10:
                                phone = m_phone.group(0).strip()
                                clean_addr = line.replace(phone, "").replace("·", "").strip()
                                address = clean_addr.strip(",.- ")
                            else:
                                address = line.strip("· ")
                        elif not phone and PHONE_CLEAN_REGEX.search(line):
                            m_phone = PHONE_CLEAN_REGEX.search(line)
                            if m_phone and len(re.sub(r"\D", "", m_phone.group(0))) >= 10:
                                phone = m_phone.group(0).strip()
                        elif any(k in line.lower() for k in ["open", "closed", "closes"]):
                            hours_status = line.strip()
                        elif line.startswith('"'):
                            snippet = line.strip()

                    website = ""
                    goto_href = item.get("gotoHref", "")
                    if goto_href:
                        if goto_href.startswith("/"):
                            goto_href = "https://www.google.com" + goto_href
                        try:
                            resp = page.request.get(goto_href, headers={"Referer": page.url}, timeout=6000)
                            website = resp.url
                        except Exception:
                            website = goto_href

                    directions_url = item.get("directionsHref", "")
                    if "google.com/maps" in website:
                        if not directions_url:
                            directions_url = website
                        website = ""

                    rank_num = len(discovered) + 1
                    discovered.append({
                        "search_rank": f"#{rank_num}",
                        "business_name": name,
                        "category": category,
                        "review_rating": rating,
                        "review_count": reviews,
                        "phone": phone,
                        "address": address,
                        "hours_status": hours_status,
                        "review_snippet": snippet,
                        "website": website,
                        "google_maps_directions": directions_url,
                        "keyword": keyword,
                    })

                    if len(discovered) >= max_results:
                        break

                start += 20

            browser.close()
    except Exception as e:
        print(f"[!] Error during Google Places search: {e}")
        if not discovered:
            print("[*] Falling back to web search discovery...")
            return search_keyword_leads(keyword, max_results=max_results)

    if not discovered:
        print("[*] No Google Places entries found (or bot check triggered). Falling back to web search discovery...")
        return search_keyword_leads(keyword, max_results=max_results)

    print(f"[+] Discovered {len(discovered)} Google Places entries for '{keyword}'.\n")
    return discovered


def search_keyword_leads(keyword: str, max_results: int = SEARCH_RANK_DEPTH) -> list:
    """
    Query the live web for a keyword, discover the top N ranked entries (#1, #2...),
    and return them as targets ready for scraping.
    Guarantees discovery rate using multi-page pagination and semantic query variations.
    """
    print(f"\n[+] Searching live web for: '{keyword}' (targeting {max_results} entries)...")
    discovered = []
    seen_urls = set()

    def _collect_batch(items):
        for item in (items or []):
            href = item.get("href", "").strip()
            if not href or not href.startswith("http"):
                continue

            clean_href = urldefrag(href)[0].rstrip("/")
            if clean_href in seen_urls:
                continue
            seen_urls.add(clean_href)

            rank_num = len(discovered) + 1
            discovered.append({
                "search_rank": f"#{rank_num}",
                "business_name": item.get("title", ""),
                "category": "",
                "review_rating": "",
                "review_count": "",
                "phone": "",
                "address": "",
                "hours_status": "",
                "review_snippet": "",
                "website": href,
                "google_maps_directions": "",
                "keyword": keyword,
            })
            if len(discovered) >= max_results:
                return True
        return False

    pages_to_fetch = (max_results // 6) + 4
    for page in range(1, pages_to_fetch + 1):
        if len(discovered) >= max_results:
            break
        try:
            batch = DDGS().text(keyword, page=page, max_results=10)
            if batch:
                if _collect_batch(batch):
                    break
            time.sleep(0.4)
        except Exception:
            time.sleep(0.4)
            continue

    if len(discovered) < max_results:
        print(f"[*] Found {len(discovered)} entries so far; expanding search query to reach {max_results}...")
        variations = []
        lower_kw = keyword.lower()
        if "best " in lower_kw:
            variations.append(re.sub(r"\bbest\b\s*", "", keyword, flags=re.IGNORECASE).strip())
            variations.append(re.sub(r"\bbest\b\s*", "top ", keyword, flags=re.IGNORECASE).strip())
        else:
            variations.append(f"best {keyword}")
            variations.append(f"top {keyword}")
        variations.append(f"{keyword} clinics")
        variations.append(f"{keyword} reviews")
        variations.append(f"{keyword} list")

        for v_kw in variations:
            if len(discovered) >= max_results:
                break
            for p in range(1, 4):
                if len(discovered) >= max_results:
                    break
                try:
                    batch = DDGS().text(v_kw, page=p, max_results=10)
                    if batch:
                        if _collect_batch(batch):
                            break
                    time.sleep(0.4)
                except Exception:
                    time.sleep(0.4)
                    continue

    print(f"[+] Discovered {len(discovered)} top ranked entries for '{keyword}'.\n")
    return discovered


def scrape_site(target_info: dict) -> dict:
    """
    Scrape website details if website URL exists, or return Google Places data directly.
    """
    url = target_info.get("website", "").strip()
    keyword = target_info.get("keyword", "")
    predefined_rank = target_info.get("search_rank", "N/A")
    predefined_name = target_info.get("business_name", "")
    category = target_info.get("category", "")
    review_rating = target_info.get("review_rating", "")
    review_count = target_info.get("review_count", "")
    phone_from_places = target_info.get("phone", "")
    address = target_info.get("address", "")
    hours_status = target_info.get("hours_status", "")
    review_snippet = target_info.get("review_snippet", "")
    google_maps_directions = target_info.get("google_maps_directions", "")

    # If place has no external website or is google maps, return places data immediately
    if not url or not url.startswith("http") or "google.com/maps" in url:
        return {
            "search_rank": predefined_rank,
            "business_name": predefined_name or url,
            "category": category,
            "review_rating": review_rating,
            "review_count": review_count,
            "phone": phone_from_places,
            "address": address,
            "hours_status": hours_status,
            "website": "" if "google.com/maps" in url else url,
            "email": "",
            "keyword": keyword,
            "review_snippet": review_snippet,
            "contact_page": "",
            "about_page": "",
            "team_page": "",
            "owner_name_candidates": "",
            "google_maps_directions": google_maps_directions or (url if "google.com/maps" in url else ""),
            "pages_checked": 0,
            "status": "places_only",
        }

    target_url = normalize_url(url)
    if not target_url:
        return {
            "search_rank": predefined_rank,
            "business_name": predefined_name or url,
            "category": category,
            "review_rating": review_rating,
            "review_count": review_count,
            "phone": phone_from_places,
            "address": address,
            "hours_status": hours_status,
            "website": url,
            "email": "",
            "keyword": keyword,
            "review_snippet": review_snippet,
            "contact_page": "",
            "about_page": "",
            "team_page": "",
            "owner_name_candidates": "",
            "google_maps_directions": google_maps_directions,
            "pages_checked": 0,
            "status": "invalid_url",
        }

    session = requests.Session()
    robots = get_robots_parser(session, target_url)

    queue = deque([target_url])
    visited = set()

    emails = set()
    phones = set()
    if phone_from_places:
        phones.add(phone_from_places)
    names = []

    contact_page = ""
    about_page = ""
    team_page = ""
    business_name = predefined_name

    pages_checked = 0

    while queue and pages_checked < MAX_PAGES_PER_SITE:
        current = queue.popleft()
        if current in visited:
            continue
        visited.add(current)

        if not allowed_by_robots(robots, current):
            continue

        time.sleep(REQUEST_DELAY)

        html = fetch(session, current)
        if not html:
            continue

        pages_checked += 1
        soup = BeautifulSoup(html, HTML_PARSER)

        if not business_name:
            og_site = soup.find("meta", property="og:site_name")
            if og_site and og_site.get("content"):
                business_name = og_site["content"].strip()
            elif soup.title and soup.title.get_text(strip=True):
                business_name = soup.title.get_text(" ", strip=True)

        emails.update(extract_emails(soup))
        phones.update(extract_phones(soup))
        names.extend(extract_name_candidates(soup))

        # Fallback to schema.org reviews only if not provided by Google Places
        if not review_rating or not review_count:
            p_rating, p_count = extract_reviews(soup)
            if p_rating and not review_rating:
                review_rating = p_rating
            if p_count and not review_count:
                review_count = p_count

        candidate_pages = find_candidate_pages(target_url, soup)
        if not contact_page and candidate_pages["contact"]:
            contact_page = next(iter(candidate_pages["contact"]))
        if not about_page and candidate_pages["about"]:
            about_page = next(iter(candidate_pages["about"]))
        if not team_page and candidate_pages["team"]:
            team_page = next(iter(candidate_pages["team"]))

        for page_type in ("contact", "team", "about"):
            for page in candidate_pages[page_type]:
                if page not in visited and page not in queue:
                    queue.append(page)

    clean_business_name = business_name.strip() if business_name.strip() else (predefined_name or target_url)
    status = "success" if pages_checked > 0 else "failed_to_fetch"

    return {
        "search_rank": predefined_rank,
        "business_name": clean_business_name,
        "category": category,
        "review_rating": review_rating,
        "review_count": review_count,
        "phone": "; ".join(sorted(phones)),
        "address": address,
        "hours_status": hours_status,
        "website": target_url,
        "email": "; ".join(sorted(emails)),
        "keyword": keyword,
        "review_snippet": review_snippet,
        "contact_page": contact_page,
        "about_page": about_page,
        "team_page": team_page,
        "owner_name_candidates": "; ".join(dict.fromkeys(names)),
        "google_maps_directions": google_maps_directions,
        "pages_checked": pages_checked,
        "status": status,
    }


def read_input(filename: str) -> list:
    """Read URLs and optional keywords from CSV."""
    if not os.path.exists(filename):
        return []

    targets = []
    with open(filename, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            url = (
                row.get("website")
                or row.get("url")
                or row.get("Website")
                or row.get("URL")
                or ""
            )
            keyword = (
                row.get("keyword")
                or row.get("Keyword")
                or row.get("query")
                or row.get("Query")
                or ""
            )
            if url.strip():
                targets.append({
                    "website": url.strip(),
                    "keyword": keyword.strip(),
                    "search_rank": "",
                    "business_name": "",
                    "category": "",
                    "review_rating": "",
                    "review_count": "",
                    "phone": "",
                    "address": "",
                    "hours_status": "",
                    "review_snippet": "",
                    "google_maps_directions": "",
                })
    return targets


def init_output_file(filename: str):
    """Initialize CSV header for output file."""
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()


def append_result(filename: str, result: dict):
    """Thread-safe append of a single result row, immediately flushed to disk."""
    with csv_lock:
        with open(filename, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writerow(result)


def parse_rank_num(rank_str: str) -> int:
    """Extract integer rank for numeric sorting, e.g. '#4' -> 4."""
    m = re.search(r"\d+", str(rank_str or ""))
    return int(m.group(0)) if m else 999999


def sort_and_save_csv(filename: str, results: list):
    """Sort all scraped results by rank (#1, #2, #3...) and write to CSV."""
    sorted_results = sorted(results, key=lambda r: parse_rank_num(r.get("search_rank", "")))
    with csv_lock:
        with open(filename, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(sorted_results)


def create_sample_input_file(filename: str):
    """Create a sample input CSV with keyword support."""
    sample_targets = [
        {
            "website": "https://www.scrapethissite.com/",
            "keyword": "scrape this site sandbox",
        },
        {
            "website": "https://quotes.toscrape.com/",
            "keyword": "quotes to scrape",
        },
    ]
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["website", "keyword"])
        writer.writeheader()
        writer.writerows(sample_targets)


def sanitize_filename(keyword: str) -> str:
    """Convert a search query to a clean, safe filename."""
    cleaned = re.sub(r"[^\w\s-]", "", keyword).strip().lower()
    cleaned = re.sub(r"[-\s]+", "_", cleaned)
    return f"{cleaned}.csv" if cleaned else "leads.csv"


def main():
    input_file = "websites.csv"

    # Command line argument parser & default settings
    search_query = None
    search_mode = SEARCH_MODE
    top_rated = FILTER_TOP_RATED
    open_now = FILTER_OPEN_NOW
    distance = FILTER_DISTANCE
    max_results = SEARCH_RANK_DEPTH
    max_rating = 0.0

    # Parse arguments
    args = sys.argv[1:]
    idx = 0
    query_tokens = []

    while idx < len(args):
        arg = args[idx]
        if arg in ("--top-rated", "-tr"):
            top_rated = True
        elif arg == "--no-top-rated":
            top_rated = False
        elif arg in ("--under-4", "-u4"):
            top_rated = False
            max_rating = 4.0
        elif arg in ("--max-rating", "-mr") and idx + 1 < len(args):
            idx += 1
            try:
                max_rating = float(args[idx])
            except ValueError:
                pass
        elif arg in ("--open-now", "-on"):
            open_now = True
        elif arg in ("--distance", "-dist") and idx + 1 < len(args):
            idx += 1
            distance = args[idx]
        elif arg in ("-n", "--max") and idx + 1 < len(args):
            idx += 1
            try:
                max_results = int(args[idx])
            except ValueError:
                pass
        elif arg in ("--mode", "-m") and idx + 1 < len(args):
            idx += 1
            search_mode = args[idx].lower()
        elif arg in ("--places", "-p"):
            search_mode = "places"
        elif arg in ("--web", "-w"):
            search_mode = "web"
        elif arg in ("--search", "-s") and idx + 1 < len(args):
            idx += 1
            query_tokens.append(args[idx])
        elif not arg.startswith("-"):
            query_tokens.append(arg)
        idx += 1

    if query_tokens:
        search_query = " ".join(query_tokens).strip()
    elif DEFAULT_SEARCH_KEYWORD.strip():
        search_query = DEFAULT_SEARCH_KEYWORD.strip()

    # Dynamic output CSV: name after search query, overwriting if same search is repeated
    if search_query:
        output_file = sanitize_filename(search_query)
    else:
        output_file = "leads.csv"

    targets = []

    if search_query:
        print(f"=== Discovery Mode: '{search_query}' (Engine: Google {search_mode.capitalize()}) ===")
        if search_mode == "places":
            targets = search_google_places(
                search_query,
                max_results=max_results,
                top_rated=top_rated,
                open_now=open_now,
                distance=distance,
                max_rating=max_rating,
            )
        else:
            targets = search_keyword_leads(search_query, max_results=max_results)

        if not targets:
            print(f"[!] No entries found for '{search_query}'.")
            return
    else:
        # File mode: read from websites.csv
        if not os.path.exists(input_file):
            print(f"[!] '{input_file}' not found. Creating a starter sample file...")
            create_sample_input_file(input_file)
            print(f"[+] Created '{input_file}' with sample websites and keywords.")
            print(f"[i] You can also search directly by running:\n    python scraper.py \"best doctor in ghansoli navi mumbai\"\n")

        targets = read_input(input_file)
        if not targets:
            print(f"[!] No valid URLs found in '{input_file}'.")
            return

        print(f"Loaded {len(targets)} target(s) from {input_file}.")

    print(f"Saving to: '{output_file}' (creates new file or overwrites existing)")
    print(f"Starting crawl with {MAX_WORKERS} worker threads (Parser: {HTML_PARSER})...\n")

    init_output_file(output_file)

    completed = 0
    total = len(targets)
    all_results = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_target = {
            executor.submit(scrape_site, t): t
            for t in targets
        }

        for future in as_completed(future_to_target):
            completed += 1
            target = future_to_target[future]
            url = target.get("website", "")
            keyword = target.get("keyword", "")

            try:
                result = future.result()
            except Exception as exc:
                result = {
                    "search_rank": target.get("search_rank", "N/A"),
                    "business_name": target.get("business_name", url),
                    "category": target.get("category", ""),
                    "review_rating": target.get("review_rating", ""),
                    "review_count": target.get("review_count", ""),
                    "phone": target.get("phone", ""),
                    "address": target.get("address", ""),
                    "hours_status": target.get("hours_status", ""),
                    "website": url,
                    "email": "",
                    "keyword": keyword,
                    "review_snippet": target.get("review_snippet", ""),
                    "contact_page": "",
                    "about_page": "",
                    "team_page": "",
                    "owner_name_candidates": "",
                    "google_maps_directions": target.get("google_maps_directions", ""),
                    "pages_checked": 0,
                    "status": f"error: {str(exc)}",
                }

            all_results.append(result)
            append_result(output_file, result)

            phone_disp = result.get('phone', '') or 'None'
            if len(phone_disp) > 35:
                phone_disp = phone_disp[:32] + "..."
            email_disp = result.get('email', '') or 'None'
            if len(email_disp) > 35:
                email_disp = email_disp[:32] + "..."

            rating_disp = result.get('review_rating') or ''
            count_disp = result.get('review_count') or ''
            if rating_disp and count_disp:
                review_str = f"Rating: {rating_disp} ({count_disp} reviews)"
            elif rating_disp:
                review_str = f"Rating: {rating_disp}"
            elif count_disp:
                review_str = f"Reviews: {count_disp}"
            else:
                review_str = "Rating: N/A"

            clean_title = (result.get('business_name') or url).strip()
            if len(clean_title) > 32:
                clean_title = clean_title[:29] + "..."

            rank_str = result.get("search_rank") or "N/A"
            print(
                f"[Progress {completed}/{total}] {rank_str} {clean_title} -> {result.get('status')} "
                f"({result.get('pages_checked', 0)} pages) | "
                f"{review_str} | "
                f"Emails: {email_disp} | "
                f"Phone: {phone_disp}"
            )

    # Sort final CSV in exact order of Google search rank (#1, #2, #3, ...)
    sort_and_save_csv(output_file, all_results)
    print(f"\n[+] Finished! All {total} results sorted by rank (#1 -> #{total}) and saved to '{output_file}'.")


if __name__ == "__main__":
    main()