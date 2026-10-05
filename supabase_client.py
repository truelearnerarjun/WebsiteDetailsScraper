"""
Supabase client root bridge.
Re-exports the implementation from api.supabase_client for CLI usage (scraper.py).
"""
import os
import sys

# Ensure api directory is in sys.path
API_DIR = os.path.join(os.path.dirname(__file__), "api")
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

from api.supabase_client import *  # noqa: F401, F403
from api.supabase_client import (
    get_supabase_config,
    is_configured,
    get_headers,
    generate_identity_key,
    format_lead_for_supabase,
    test_connection,
    upsert_leads,
    fetch_saved_leads,
    update_lead_workspace,
)
