# WebsiteDetailsScraper

A high-performance local business lead scraper & website intelligence extractor. It discovers top local businesses via Google Places (`udm=local`), extracts contact info, reviews, addresses, and crawls their websites in parallel to discover direct doctor/owner names, emails, and contact pages.

---

## Features

- **Google Places Discovery**: Extracts top-ranked local businesses directly with official ratings, review counts, addresses, phone numbers, and Google Maps directions.
- **Top 30 Extraction**: Automatically paginates to extract the top 30 businesses in strict rank order (`#1` to `#30`).
- **Parallel Deep Website Crawling**: Crawls up to 8 pages per website (Homepage, Contact Us, About Us, Team/Doctors) across multi-threaded workers.
- **Lead Intelligence**: Extracts contact emails, phone numbers, and owner/doctor candidate names.
- **Export to CSV**: Automatically writes clean, sorted CSV reports named after your search query.

---

## Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/truelearnerarjun/WebsiteDetailsScraper.git
cd WebsiteDetailsScraper
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
playwright install chromium
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and add your API keys:
```bash
cp .env.example .env
```
*(Your `.env` file is excluded in `.gitignore` and will never be pushed to version control.)*

---

## Usage

### Run from Command Line
```bash
# Search Google Places for top 30 results
python scraper.py "hair transplant doctors in mumbai" -n 30

# Search with distance filter
python scraper.py "best dentist in bandra" -n 20 --distance "within 5km"

# Target only currently open places
python scraper.py "emergency clinics in navi mumbai" --open-now
```

### Run using Default Configuration
Configure default settings inside `scraper.py` (lines 40–54) and run:
```bash
python scraper.py
```
Output results will be saved in a sorted `.csv` file named after your keyword.
