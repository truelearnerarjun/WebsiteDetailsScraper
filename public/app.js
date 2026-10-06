// public/app.js - Clean, fast client interactions

document.addEventListener("DOMContentLoaded", () => {
  const searchForm = document.getElementById("search-form");
  const queryInput = document.getElementById("search-query-input");
  const clearBtn = document.getElementById("clear-search-btn");
  const submitBtn = document.getElementById("submit-btn");
  const btnSpinner = document.getElementById("btn-spinner");
  const btnText = document.getElementById("btn-text");

  const statusBar = document.getElementById("status-bar");
  const statusMessage = document.getElementById("status-message");
  const statusCount = document.getElementById("status-count");

  const resultsPanel = document.getElementById("results-panel");
  const emptyState = document.getElementById("empty-state");

  const statTotalLeads = document.getElementById("stat-total-leads");
  const statTotalEmails = document.getElementById("stat-total-emails");
  const statTotalPhones = document.getElementById("stat-total-phones");
  const statAvgRating = document.getElementById("stat-avg-rating");

  const filterResultsInput = document.getElementById("filter-results-input");
  const leadQualityFilter = document.getElementById("lead-quality-filter");
  const leadSortSelect = document.getElementById("lead-sort-select");
  const tableWrapper = document.getElementById("table-wrapper");
  const tableBody = document.getElementById("table-body");
  const cardsContainer = document.getElementById("cards-container");
  const viewTableBtn = document.getElementById("view-table-btn");
  const viewCardsBtn = document.getElementById("view-cards-btn");

  const copyEmailsBtn = document.getElementById("copy-emails-btn");
  const downloadCsvBtn = document.getElementById("download-csv-btn");
  const toast = document.getElementById("toast");

  // Supabase Elements
  const supabaseStatusBtn = document.getElementById("supabase-status-btn");
  const supabaseStatusLabel = document.getElementById("supabase-status-label");
  const autoSyncSupabaseInput = document.getElementById("auto-sync-supabase");
  const saveSupabaseBtn = document.getElementById("save-supabase-btn");
  const saveSupabaseText = document.getElementById("save-supabase-text");
  const loadSupabaseBtn = document.getElementById("load-supabase-btn");
  const supabaseModal = document.getElementById("supabase-modal");
  const closeSupabaseModalBtn = document.getElementById("close-supabase-modal-btn");
  const supabaseModalBanner = document.getElementById("supabase-modal-banner");
  const supabaseModalBannerText = document.getElementById("supabase-modal-banner-text");
  const supabaseConnectedInfo = document.getElementById("supabase-connected-info");
  const supabaseInfoUrl = document.getElementById("supabase-info-url");
  const supabaseInfoTable = document.getElementById("supabase-info-table");
  const supabaseInfoCount = document.getElementById("supabase-info-count");
  const modalTestBtn = document.getElementById("modal-test-btn");
  const modalLoadLeadsBtn = document.getElementById("modal-load-leads-btn");
  const modalRecheckBtn = document.getElementById("modal-recheck-btn");
  const copyEnvBtn = document.getElementById("copy-env-btn");
  const copySqlBtn = document.getElementById("copy-sql-btn");

  // Lead Pipeline Elements
  const leadPipelineBar = document.getElementById("lead-pipeline-bar");
  const countStatusAll = document.getElementById("count-status-all");
  const countStatusNew = document.getElementById("count-status-new");
  const countStatusReviewed = document.getElementById("count-status-reviewed");
  const countStatusContacted = document.getElementById("count-status-contacted");
  const countStatusQualified = document.getElementById("count-status-qualified");
  const countStatusRejected = document.getElementById("count-status-rejected");

  // Mobile Action Dock
  const mobileDock = document.getElementById("mobile-dock");
  const mobileDockCsvBtn = document.getElementById("mobile-dock-csv-btn");
  const mobileDockSyncBtn = document.getElementById("mobile-dock-sync-btn");
  const mobileDockSyncText = document.getElementById("mobile-dock-sync-text");
  const mobileDockViewBtn = document.getElementById("mobile-dock-view-btn");
  const mobileDockViewIcon = document.getElementById("mobile-dock-view-icon");
  const mobileDockViewText = document.getElementById("mobile-dock-view-text");

  // Lead Workspace Drawer Modal Elements
  const leadWorkspaceModal = document.getElementById("lead-workspace-modal");
  const closeWorkspaceModalBtn = document.getElementById("close-workspace-modal-btn");
  const workspaceLeadTitle = document.getElementById("workspace-modal-title");
  const workspaceLeadSubtitle = document.getElementById("workspace-lead-subtitle");
  const workspaceQuickActions = document.getElementById("workspace-quick-actions");
  const workspaceOwnerInput = document.getElementById("workspace-owner-input");
  const workspaceTagsInput = document.getElementById("workspace-tags-input");
  const workspaceNotesInput = document.getElementById("workspace-notes-input");
  const workspaceSaveBtn = document.getElementById("workspace-save-btn");
  const workspaceSaveStatus = document.getElementById("workspace-save-status");
  const quickTagChips = document.querySelectorAll(".quick-tag-chip");

  // Supabase env & table elements
  const supabaseInfoEnv = document.getElementById("supabase-info-env");
  const supabaseTablePicker = document.querySelectorAll("#supabase-table-picker .pill-btn");

  // State
  let currentLeads = [];
  let currentQuery = "";
  let selectedMode = "places";
  let selectedCount = 30;
  let selectedStatusFilter = "all";
  let activeWorkspaceLead = null;
  let activeModalStatus = "New";
  let currentSupabaseTable = ""; // dynamically resolved from /api/supabase/status ('leads' on Vercel, 'leads_local' locally)

  // Detect if opened via file:// protocol directly
  if (window.location.protocol === "file:") {
    const banner = document.createElement("div");
    banner.style.cssText = "background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); padding: 0.85rem 1rem; border-radius: 8px; font-size: 0.82rem; margin-bottom: 1.5rem; line-height: 1.5;";
    banner.innerHTML = `
      <strong>⚠️ Local Setup Notice:</strong> You opened this file directly from your disk (<code>file://</code>). 
      Browsers block all API requests on file:// URLs for security (CORS).<br>
      <strong>To run locally:</strong> Open your terminal, run <code>python server.py</code>, and open 
      <a href="http://localhost:5050" style="color: #38bdf8; text-decoration: underline; font-weight: 600;">http://localhost:5050</a>!
    `;
    const main = document.querySelector(".main-content");
    if (main) main.prepend(banner);
  }

  // Clear query button
  clearBtn.addEventListener("click", () => {
    queryInput.value = "";
    queryInput.focus();
  });

  // Esc key clears input
  queryInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      queryInput.value = "";
    }
  });

  // Preset queries
  document.querySelectorAll(".preset-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      queryInput.value = btn.dataset.query;
      queryInput.focus();
    });
  });

  // Mode pill buttons
  document.querySelectorAll("#mode-group .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mode-group .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedMode = btn.dataset.mode;
    });
  });

  // Limit pill buttons & custom limit input
  const customCountInput = document.getElementById("custom-count-input");
  document.querySelectorAll("#count-group .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#count-group .pill-btn").forEach((b) => b.classList.remove("active"));
      if (customCountInput) {
        customCountInput.value = "";
        customCountInput.classList.remove("active");
      }
      btn.classList.add("active");
      selectedCount = parseInt(btn.dataset.count, 10);
    });
  });

  if (customCountInput) {
    customCountInput.addEventListener("input", () => {
      const val = parseInt(customCountInput.value, 10);
      if (val && val > 0) {
        document.querySelectorAll("#count-group .pill-btn").forEach((b) => b.classList.remove("active"));
        customCountInput.classList.add("active");
        selectedCount = val;
      }
    });
  }

  // View switcher (Table / Cards)
  function setView(view) {
    if (view === "cards") {
      viewCardsBtn.classList.add("active");
      viewTableBtn.classList.remove("active");
      cardsContainer.classList.remove("hidden");
      tableWrapper.classList.add("hidden");
      if (mobileDockViewText) mobileDockViewText.textContent = "Table";
      if (mobileDockViewIcon) mobileDockViewIcon.textContent = "📋";
    } else {
      viewTableBtn.classList.add("active");
      viewCardsBtn.classList.remove("active");
      tableWrapper.classList.remove("hidden");
      cardsContainer.classList.add("hidden");
      if (mobileDockViewText) mobileDockViewText.textContent = "Cards";
      if (mobileDockViewIcon) mobileDockViewIcon.textContent = "📱";
    }
  }

  viewTableBtn.addEventListener("click", () => setView("table"));
  viewCardsBtn.addEventListener("click", () => setView("cards"));

  if (mobileDockViewBtn) {
    mobileDockViewBtn.addEventListener("click", () => {
      const isCards = viewCardsBtn.classList.contains("active");
      setView(isCards ? "table" : "cards");
    });
  }

  // Default to cards view on mobile screens (<= 768px)
  if (window.innerWidth <= 768) {
    setView("cards");
  }

  // Toast notification
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 2800);
  }

  // Rating filter segmented control (Any / Under < / Over ≥ / Custom threshold)
  let selectedRatingMode = "any";
  const ratingCustomInput = document.getElementById("rating-custom-input");

  document.querySelectorAll("#rating-filter-group .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#rating-filter-group .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedRatingMode = btn.dataset.ratingMode;

      if (ratingCustomInput) {
        if (selectedRatingMode === "under") {
          ratingCustomInput.style.display = "inline-block";
          if (!ratingCustomInput.value || parseFloat(ratingCustomInput.value) <= 0 || parseFloat(ratingCustomInput.value) > 4.5) {
            ratingCustomInput.value = "4.0";
          }
          ratingCustomInput.placeholder = "4.0";
          ratingCustomInput.focus();
        } else if (selectedRatingMode === "over") {
          ratingCustomInput.style.display = "inline-block";
          if (!ratingCustomInput.value || parseFloat(ratingCustomInput.value) < 4.0) {
            ratingCustomInput.value = "4.5";
          }
          ratingCustomInput.placeholder = "4.5";
          ratingCustomInput.focus();
        } else {
          ratingCustomInput.style.display = "none";
        }
      }
    });
  });

  // Global Expand / Collapse State
  let isGlobalExpanded = false;
  const toggleExpandAllBtn = document.getElementById("toggle-expand-all-btn");
  const expandAllIcon = document.getElementById("expand-all-icon");
  const expandAllText = document.getElementById("expand-all-text");

  if (toggleExpandAllBtn) {
    toggleExpandAllBtn.addEventListener("click", () => {
      isGlobalExpanded = !isGlobalExpanded;
      if (expandAllIcon) expandAllIcon.textContent = isGlobalExpanded ? "⤡" : "⤢";
      if (expandAllText) expandAllText.textContent = isGlobalExpanded ? "Collapse All" : "Expand All";

      document.querySelectorAll(".expandable-content").forEach((el) => {
        if (isGlobalExpanded) {
          el.classList.remove("collapsed");
          el.classList.add("expanded");
        } else {
          el.classList.remove("expanded");
          el.classList.add("collapsed");
        }
      });

      document.querySelectorAll(".expand-toggle-btn").forEach((btn) => {
        btn.textContent = isGlobalExpanded ? "Less ▴" : "More ▾";
      });
    });
  }

  // Handle Form Submission
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = queryInput.value.trim();
    if (!query) return;
    currentQuery = query;

    if (window.location.protocol === "file:") {
      showToast("Blocked by browser on file://. Run 'python server.py' & open http://localhost:5050");
      return;
    }

    let minRating = 0.0;
    let maxRating = 0.0;
    const rVal = parseFloat(ratingCustomInput?.value || "0.0") || 0.0;

    if (selectedRatingMode === "under") {
      maxRating = rVal > 0 ? rVal : 4.0;
    } else if (selectedRatingMode === "over") {
      minRating = rVal > 0 ? rVal : 4.5;
    }

    // Update UI for loading state
    submitBtn.disabled = true;
    btnSpinner.style.display = "inline-block";
    btnText.textContent = "Scanning...";

    statusBar.classList.remove("hidden");
    let filterMsg = "";
    if (selectedRatingMode === "under") filterMsg = ` (Rating < ${maxRating})`;
    else if (selectedRatingMode === "over") filterMsg = ` (Rating ≥ ${minRating})`;

    statusMessage.textContent = `Searching ${selectedMode === 'places' ? 'Google Places / Maps' : 'live web'} for "${query}"${filterMsg}...`;
    statusCount.textContent = `Targeting ${selectedCount}`;

    emptyState.classList.add("hidden");

    // Timeout controller (120 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const autoSave = autoSyncSupabaseInput ? autoSyncSupabaseInput.checked : false;
      const getUrl = `/api/scrape?q=${encodeURIComponent(query)}&n=${selectedCount}&mode=${selectedMode}&min_rating=${minRating}&max_rating=${maxRating}&auto_save_supabase=${autoSave}`;
      let response;
      try {
        response = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            count: selectedCount,
            mode: selectedMode,
            min_rating: minRating,
            max_rating: maxRating,
            auto_save_supabase: autoSave,
          }),
          signal: controller.signal,
        });
      } catch (postErr) {
        if (postErr.name === "AbortError") throw new Error("Request timed out after 120 seconds");
        // Fallback retry with GET
        response = await fetch(getUrl, { signal: controller.signal });
      }

      if ([404, 405, 501].includes(response.status)) {
        response = await fetch(getUrl, { signal: controller.signal });
      }

      const isJson = (response.headers.get("content-type") || "").includes("application/json");
      if (!response.ok || !isJson) {
        if ([404, 405, 501].includes(response.status) || !isJson) {
          throw new Error("Backend server not responding. Please make sure `python server.py` is running on port 5050");
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      currentLeads = data.leads || [];

      renderResults(currentLeads);
      if (data.supabase_synced) {
        showToast(`Extracted ${currentLeads.length} places (auto-synced to Supabase)`);
        checkSupabaseStatus();
      } else {
        showToast(`Extracted ${currentLeads.length} places in exact rank order`);
      }
    } catch (err) {
      console.error("Search error:", err);
      const msg = err.name === "AbortError"
        ? "Request timed out. Please try again with a lower limit."
        : (err instanceof TypeError
            ? "Could not reach local server. Start it with `python server.py` and open http://localhost:5050"
            : err.message);
      showToast(`Error: ${msg}`);
      if (currentLeads.length === 0) {
        emptyState.classList.remove("hidden");
      }
    } finally {
      clearTimeout(timeoutId);
      statusBar.classList.add("hidden");
      submitBtn.disabled = false;
      btnSpinner.style.display = "none";
      btnText.textContent = "Extract";
    }
  });

  // Helper to ensure all workspace fields exist on every lead object
  function ensureWorkspaceFields(lead) {
    if (!lead.lead_status) lead.lead_status = "New";
    if (lead.notes === undefined || lead.notes === null) lead.notes = "";
    if (lead.tags === undefined || lead.tags === null) lead.tags = "";
    if (lead.owner === undefined || lead.owner === null) lead.owner = "";
    if (!lead.identity_key) {
      if (lead.website) {
        try {
          const u = new URL(lead.website.startsWith("http") ? lead.website : "http://" + lead.website);
          lead.identity_key = "domain:" + u.hostname.replace(/^www\./, "").toLowerCase();
        } catch (e) {
          lead.identity_key = "lead:" + (lead.business_name || "unknown").toLowerCase().replace(/\W+/g, "");
        }
      } else if (lead.phone) {
        lead.identity_key = "phone:" + lead.phone.replace(/\D/g, "");
      } else {
        lead.identity_key = "name:" + (lead.business_name || "unknown").toLowerCase().replace(/\W+/g, "");
      }
    }
  }

  // Update pipeline counts across all categories
  function updatePipelineCounters() {
    const counts = { all: currentLeads.length, New: 0, Reviewed: 0, Contacted: 0, Qualified: 0, Rejected: 0 };
    currentLeads.forEach((lead) => {
      ensureWorkspaceFields(lead);
      const s = lead.lead_status || "New";
      if (counts[s] !== undefined) {
        counts[s]++;
      } else {
        counts.New++;
      }
    });

    if (countStatusAll) countStatusAll.textContent = counts.all;
    if (countStatusNew) countStatusNew.textContent = counts.New;
    if (countStatusReviewed) countStatusReviewed.textContent = counts.Reviewed;
    if (countStatusContacted) countStatusContacted.textContent = counts.Contacted;
    if (countStatusQualified) countStatusQualified.textContent = counts.Qualified;
    if (countStatusRejected) countStatusRejected.textContent = counts.Rejected;
  }

  // Pipeline filter button clicks
  document.querySelectorAll("#lead-pipeline-bar .pipeline-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#lead-pipeline-bar .pipeline-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedStatusFilter = btn.dataset.status;
      renderLeadView();
    });
  });

  // Cycle status on one tap: New -> Reviewed -> Contacted -> Qualified -> Rejected -> New
  const STATUS_CYCLE = ["New", "Reviewed", "Contacted", "Qualified", "Rejected"];
  function cycleNextStatus(lead) {
    const currentIndex = STATUS_CYCLE.indexOf(lead.lead_status || "New");
    const nextStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
    updateLeadWorkspaceField(lead, { lead_status: nextStatus });
  }

  // Live workspace field updater (syncs locally and to Supabase)
  async function updateLeadWorkspaceField(lead, updates) {
    Object.assign(lead, updates);
    updatePipelineCounters();
    renderLeadView();

    try {
      const payload = {
        identity_key: lead.identity_key,
        table: currentSupabaseTable,
        ...updates,
      };
      await fetch("/api/leads/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast(`Updated ${lead.business_name} (${updates.lead_status || "details"})`);
    } catch (e) {
      console.warn("Workspace field sync error:", e);
    }
  }

  // Render metrics and tables
  function renderResults(leads) {
    if (!leads || leads.length === 0) {
      resultsPanel.classList.add("hidden");
      emptyState.classList.remove("hidden");
      if (mobileDock) mobileDock.classList.add("hidden");
      return;
    }

    // Ensure all leads have workspace defaults
    leads.forEach(ensureWorkspaceFields);

    resultsPanel.classList.remove("hidden");
    emptyState.classList.add("hidden");
    if (mobileDock) mobileDock.classList.remove("hidden");

    let emailCount = 0;
    let phoneCount = 0;
    let totalScore = 0;
    let scoreCount = 0;

    leads.forEach((l) => {
      if (l.email) emailCount++;
      if (l.phone) phoneCount++;
      const r = parseFloat(l.review_rating);
      if (!isNaN(r) && r > 0) {
        totalScore += r;
        scoreCount++;
      }
    });

    statTotalLeads.textContent = leads.length;
    statTotalEmails.textContent = emailCount;
    statTotalPhones.textContent = phoneCount;
    statAvgRating.textContent = scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : "—";

    updatePipelineCounters();
    renderLeadView();
  }

  function getDisplayedLeads() {
    const term = filterResultsInput.value.toLowerCase().trim();
    const quality = leadQualityFilter.value;
    const sortBy = leadSortSelect.value;
    const filtered = currentLeads.filter((lead) => {
      ensureWorkspaceFields(lead);

      // Pipeline status filter
      if (selectedStatusFilter !== "all") {
        if ((lead.lead_status || "New").toLowerCase() !== selectedStatusFilter.toLowerCase()) {
          return false;
        }
      }

      const matchesText = !term || [
        lead.business_name, lead.category, lead.address, lead.phone, lead.email,
        lead.owner_name_candidates, lead.review_snippet, lead.hours_status,
        lead.data_sources, lead.data_confidence, lead.lead_status, lead.notes,
        lead.tags, lead.owner,
      ].some((value) => (value || "").toLowerCase().includes(term));
      if (!matchesText) return false;
      if (quality === "email") return Boolean(lead.email);
      if (quality === "phone") return Boolean(lead.phone);
      if (quality === "high") return lead.data_confidence === "High";
      if (quality === "duplicates") return Number(lead.duplicate_count || 1) > 1;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "score") return Number(b.lead_score || 0) - Number(a.lead_score || 0);
      if (sortBy === "rating") return Number(b.review_rating || 0) - Number(a.review_rating || 0);
      return Number((a.search_rank || "").replace(/\D/g, "")) - Number((b.search_rank || "").replace(/\D/g, ""));
    });
  }

  function renderLeadView() {
    const displayedLeads = getDisplayedLeads();
    renderTable(displayedLeads);
    renderCards(displayedLeads);
  }

  // Helper to create expandable cell content
  function createExpandableHtml(text, charThreshold = 55, extraClass = "", copyable = false) {
    if (text === null || text === undefined || String(text).trim() === "") {
      return '<span style="color: var(--text-muted);">—</span>';
    }

    const clean = String(text).trim();
    const isLong = clean.length > charThreshold || clean.includes(";") || clean.includes("\n");
    const escaped = escapeHtml(clean);
    const initialClass = isGlobalExpanded ? "expanded" : (isLong ? "collapsed" : "expanded");

    if (!isLong) {
      return `<div class="expandable-wrap"><div class="expandable-content expanded ${extraClass}" ${copyable ? `title="Click to copy"` : ""}>${escaped}</div></div>`;
    }

    const toggleText = isGlobalExpanded ? "Less ▴" : "More ▾";
    return `
      <div class="expandable-wrap">
        <div class="expandable-content ${initialClass} ${extraClass}" ${copyable ? `title="Click to copy"` : ""}>${escaped}</div>
        <button type="button" class="expand-toggle-btn">${toggleText}</button>
      </div>
    `;
  }

  // Render Table View
  function renderTable(leads) {
    tableBody.innerHTML = "";

    if (leads.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching listings found in this filter.</td></tr>`;
      return;
    }

    leads.forEach((lead) => {
      ensureWorkspaceFields(lead);
      const tr = document.createElement("tr");

      const rankStr = lead.search_rank || "";
      const rankNum = rankStr.replace("#", "").padStart(2, "0");
      const currentStatus = lead.lead_status || "New";
      const statusClass = currentStatus.toLowerCase();

      // Hours tag style
      const hoursLower = (lead.hours_status || "").toLowerCase();
      let hoursClass = "";
      if (hoursLower.includes("open") && !hoursLower.includes("opens")) hoursClass = "open";
      else if (hoursLower.includes("closed") || hoursLower.includes("closes")) hoursClass = "closed";

      // Tags display
      const tagsList = (lead.tags || "").split(",").map(t => t.trim()).filter(Boolean);
      let tagsHtml = tagsList.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join(" ");

      tr.innerHTML = `
        <!-- Rank -->
        <td class="rank-cell">#${escapeHtml(rankNum)}</td>

        <!-- Contactability score -->
        <td><span class="lead-score-badge" title="Lead Score">${escapeHtml(String(lead.lead_score ?? 0))}</span></td>

        <!-- Workspace Status (Inline Dropdown) -->
        <td>
          <select class="table-status-select ${statusClass}" data-key="${escapeHtml(lead.identity_key)}">
            <option value="New" ${currentStatus === "New" ? "selected" : ""}>New</option>
            <option value="Reviewed" ${currentStatus === "Reviewed" ? "selected" : ""}>Reviewed</option>
            <option value="Contacted" ${currentStatus === "Contacted" ? "selected" : ""}>Contacted</option>
            <option value="Qualified" ${currentStatus === "Qualified" ? "selected" : ""}>Qualified</option>
            <option value="Rejected" ${currentStatus === "Rejected" ? "selected" : ""}>Rejected</option>
          </select>
        </td>

        <!-- Business Name & Category -->
        <td>
          <div class="business-col">
            <div class="business-name">${escapeHtml(lead.business_name || "Unknown")}</div>
            ${lead.category ? `<span class="category-tag">${escapeHtml(lead.category)}</span>` : ""}
          </div>
        </td>

        <!-- Rating & Reviews -->
        <td>
          <div class="rating-col">
            ${lead.review_rating ? `<span class="rating-tag">★ ${escapeHtml(lead.review_rating)}</span>` : '<span style="color: var(--text-muted);">—</span>'}
            ${lead.review_count ? `<span class="review-count-tag">${escapeHtml(lead.review_count)} reviews</span>` : ""}
          </div>
        </td>

        <!-- Phone -->
        <td>
          ${createExpandableHtml(lead.phone, 25, "phone-tag", true)}
        </td>

        <!-- Email -->
        <td>
          ${createExpandableHtml(lead.email, 25, "email-tag", true)}
        </td>

        <!-- Owner -->
        <td>
          <span class="owner-chip">👤 ${escapeHtml(lead.owner || "Unassigned")}</span>
        </td>

        <!-- Notes & Tags -->
        <td>
          <div style="display: flex; flex-direction: column; gap: 0.25rem;">
            ${tagsHtml ? `<div>${tagsHtml}</div>` : ""}
            ${lead.notes ? `<div style="font-size: 0.72rem; color: var(--text-secondary); line-height: 1.3;">📝 ${escapeHtml(lead.notes.length > 50 ? lead.notes.slice(0, 50) + '...' : lead.notes)}</div>` : '<span style="color: var(--text-muted); font-size: 0.72rem;">—</span>'}
          </div>
        </td>

        <!-- Address -->
        <td>
          ${createExpandableHtml(lead.address, 45, "")}
        </td>

        <!-- Hours -->
        <td>
          ${lead.hours_status ? `<span class="hours-tag ${hoursClass}">${escapeHtml(lead.hours_status)}</span>` : '<span style="color: var(--text-muted);">—</span>'}
        </td>

        <!-- Doctor / Owner -->
        <td>
          ${createExpandableHtml(lead.owner_name_candidates, 35, "owner-tag")}
        </td>

        <!-- Links -->
        <td style="text-align: right; white-space: nowrap;">
          ${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="cell-link" title="Visit Official Website">Website ↗</a><br>` : ""}
          ${lead.google_maps_directions ? `<a href="${escapeHtml(lead.google_maps_directions)}" target="_blank" rel="noopener" class="cell-link" title="Open Google Maps Directions" style="color: var(--text-muted);">Maps ↗</a>` : ""}
        </td>

        <!-- Workspace Manage Action -->
        <td style="text-align: center;">
          <button type="button" class="secondary-btn table-manage-btn" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;">
            ✏️ Manage
          </button>
        </td>
      `;

      // Status dropdown change
      const statusSelect = tr.querySelector(".table-status-select");
      if (statusSelect) {
        statusSelect.addEventListener("change", (e) => {
          updateLeadWorkspaceField(lead, { lead_status: e.target.value });
        });
      }

      // Manage button click
      const manageBtn = tr.querySelector(".table-manage-btn");
      if (manageBtn) {
        manageBtn.addEventListener("click", () => openWorkspaceModal(lead));
      }

      // Copy phone or email on click
      tr.querySelectorAll(".phone-tag").forEach((el) => {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
          if (lead.phone) {
            navigator.clipboard.writeText(lead.phone).then(() => showToast(`Copied phone: ${lead.phone}`));
          }
        });
      });

      tr.querySelectorAll(".email-tag").forEach((el) => {
        el.addEventListener("click", () => {
          if (lead.email) {
            navigator.clipboard.writeText(lead.email).then(() => showToast(`Copied email: ${lead.email}`));
          }
        });
      });

      // Expand/Collapse toggle button in cell
      tr.querySelectorAll(".expand-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", (evt) => {
          evt.stopPropagation();
          const content = btn.previousElementSibling;
          if (!content) return;
          const isCollapsed = content.classList.contains("collapsed");
          if (isCollapsed) {
            content.classList.remove("collapsed");
            content.classList.add("expanded");
            btn.textContent = "Less ▴";
          } else {
            content.classList.remove("expanded");
            content.classList.add("collapsed");
            btn.textContent = "More ▾";
          }
        });
      });

      tableBody.appendChild(tr);
    });
  }

  // Render Cards View (Mobile Optimized)
  function renderCards(leads) {
    cardsContainer.innerHTML = "";

    if (leads.length === 0) {
      cardsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem; grid-column: 1/-1;">No matching listings found in this filter.</div>`;
      return;
    }

    leads.forEach((lead) => {
      ensureWorkspaceFields(lead);
      const card = document.createElement("div");
      card.className = "card-item";

      const rankStr = lead.search_rank || "";
      const rankNum = rankStr.replace("#", "").padStart(2, "0");
      const currentStatus = lead.lead_status || "New";
      const statusClass = currentStatus.toLowerCase();

      // Phone formatting for click-to-call and WhatsApp
      const firstPhone = (lead.phone || "").split(";")[0].trim();
      const phoneDigits = firstPhone.replace(/\D/g, "");
      let waDigits = phoneDigits;
      if (waDigits.length === 10) waDigits = "91" + waDigits;
      else if (waDigits.length === 11 && waDigits.startsWith("0")) waDigits = "91" + waDigits.slice(1);
      const hasValidPhone = phoneDigits.length >= 7;

      // Extract tags into badges
      const tagsList = (lead.tags || "").split(",").map(t => t.trim()).filter(Boolean);
      let tagsHtml = tagsList.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join("");

      // Google maps link
      const mapsUrl = lead.google_maps_directions || (lead.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((lead.business_name || "") + " " + lead.address)}` : "");

      card.innerHTML = `
        <div class="card-item-top">
          <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
            <span style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 700; color: var(--accent-primary);">#${escapeHtml(rankNum)}</span>
            <span class="lead-score-badge" title="Lead Score (${lead.data_confidence || 'Low'} Confidence)">${escapeHtml(String(lead.lead_score ?? 0))}</span>
            ${lead.category ? `<span class="category-tag">${escapeHtml(lead.category)}</span>` : ""}
          </div>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span class="status-pill ${statusClass}" title="Tap to advance status">${escapeHtml(currentStatus)} ▾</span>
            ${lead.review_rating ? `<span class="rating-tag">★ ${escapeHtml(lead.review_rating)}</span>` : ""}
            ${lead.review_count ? `<span class="review-count-tag">(${escapeHtml(lead.review_count)})</span>` : ""}
          </div>
        </div>

        <div class="card-item-title">${escapeHtml(lead.business_name || "Unknown")}</div>

        <!-- Workspace Meta Preview -->
        <div class="card-workspace-meta">
          <span class="owner-chip" title="Lead Owner">👤 ${escapeHtml(lead.owner || "Unassigned")}</span>
          ${tagsHtml || '<span style="color: var(--text-muted); font-size: 0.7rem;">No tags</span>'}
        </div>

        <!-- Notes Preview (Click to edit) -->
        <div class="card-notes-preview" title="Click to view or edit notes">
          ${lead.notes ? `📝 ${escapeHtml(lead.notes.length > 90 ? lead.notes.slice(0, 90) + '...' : lead.notes)}` : '<span style="color: var(--text-muted); font-style: italic;">+ Tap to add notes...</span>'}
        </div>

        <!-- Details -->
        <div class="card-details" style="margin-top: 0.65rem;">
          ${lead.phone ? `
            <div class="card-row">
              <span class="card-row-label">Phone</span>
              <div style="flex: 1;">${createExpandableHtml(lead.phone, 35, "phone-tag", true)}</div>
            </div>` : ""
          }
          ${lead.email ? `
            <div class="card-row">
              <span class="card-row-label">Email</span>
              <div style="flex: 1;">${createExpandableHtml(lead.email, 35, "email-tag", true)}</div>
            </div>` : ""
          }
          ${lead.address ? `
            <div class="card-row">
              <span class="card-row-label">Address</span>
              <div style="flex: 1;">${createExpandableHtml(lead.address, 45, "")}</div>
            </div>` : ""
          }
          ${lead.hours_status ? `
            <div class="card-row">
              <span class="card-row-label">Hours</span>
              <span style="font-size: 0.74rem; color: var(--text-secondary);">${escapeHtml(lead.hours_status)}</span>
            </div>` : ""
          }
        </div>

        <!-- Mobile Touch Target Actions Grid -->
        <div class="mobile-action-grid">
          ${hasValidPhone ? `
            <a href="tel:${escapeHtml(firstPhone)}" class="mobile-action-btn call-btn" title="Call directly">
              <span>📞</span> <span>Call</span>
            </a>
            <a href="https://wa.me/${escapeHtml(waDigits)}" target="_blank" rel="noopener" class="mobile-action-btn whatsapp-btn" title="Chat on WhatsApp">
              <span>💬</span> <span>WhatsApp</span>
            </a>` : `
            <button type="button" class="mobile-action-btn" disabled style="opacity: 0.4;">
              <span>📞</span> <span>No phone</span>
            </button>
            <button type="button" class="mobile-action-btn" disabled style="opacity: 0.4;">
              <span>💬</span> <span>WhatsApp</span>
            </button>`
          }
          ${lead.email ? `
            <a href="mailto:${escapeHtml(lead.email.split(';')[0].trim())}" class="mobile-action-btn email-btn" title="Send Email">
              <span>✉️</span> <span>Email</span>
            </a>` : (mapsUrl ? `
            <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" class="mobile-action-btn" title="Google Maps Directions">
              <span>📍</span> <span>Maps</span>
            </a>` : `
            <button type="button" class="mobile-action-btn" disabled style="opacity: 0.4;">
              <span>✉️</span> <span>Email</span>
            </button>`)
          }
          ${mapsUrl ? `
            <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" class="mobile-action-btn" title="Google Maps Directions">
              <span>📍</span> <span>Maps</span>
            </a>` : ""
          }
          ${lead.website ? `
            <a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="mobile-action-btn" title="Visit Website">
              <span>🌐</span> <span>Web</span>
            </a>` : `
            <button type="button" class="mobile-action-btn" disabled style="opacity: 0.4;">
              <span>🌐</span> <span>No site</span>
            </button>`
          }
          <button type="button" class="mobile-action-btn manage-btn" title="Edit status, notes, tags & owner">
            <span>✏️</span> <span>Manage</span>
          </button>
        </div>
      `;

      // Status pill click: cycles to next status
      const statusPill = card.querySelector(".status-pill");
      if (statusPill) {
        statusPill.addEventListener("click", (e) => {
          e.stopPropagation();
          cycleNextStatus(lead);
        });
      }

      // Notes preview click: opens modal
      const notesPrev = card.querySelector(".card-notes-preview");
      if (notesPrev) {
        notesPrev.addEventListener("click", () => openWorkspaceModal(lead));
      }

      // Manage button click: opens modal
      const manageBtn = card.querySelector(".manage-btn");
      if (manageBtn) {
        manageBtn.addEventListener("click", () => openWorkspaceModal(lead));
      }

      cardsContainer.appendChild(card);
    });
  }

  // Lead search, qualification filters, and score/rating sorting
  filterResultsInput.addEventListener("input", renderLeadView);
  leadQualityFilter.addEventListener("change", renderLeadView);
  leadSortSelect.addEventListener("change", renderLeadView);

  // Copy all emails
  copyEmailsBtn.addEventListener("click", () => {
    const emails = [];
    currentLeads.forEach((l) => {
      if (l.email) {
        l.email.split(";").forEach((e) => {
          const em = e.trim();
          if (em && !emails.includes(em)) emails.push(em);
        });
      }
    });

    if (emails.length === 0) {
      showToast("No emails found to copy.");
      return;
    }

    navigator.clipboard.writeText(emails.join(", ")).then(() => {
      showToast(`Copied ${emails.length} emails to clipboard`);
    }).catch(() => {
      showToast("Failed to access clipboard");
    });
  });

  // Download CSV - Workspace fields included right at the top for clean CRM management
  downloadCsvBtn.addEventListener("click", () => {
    if (currentLeads.length === 0) {
      showToast("No leads available to export.");
      return;
    }

    const fields = [
      "search_rank",
      "lead_status",
      "notes",
      "tags",
      "owner",
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
      "lead_score",
      "data_confidence",
      "data_sources",
      "duplicate_count",
      "merged_ranks",
    ];

    const rows = [fields.join(",")];
    currentLeads.forEach((lead) => {
      ensureWorkspaceFields(lead);
      const row = fields.map((h) => {
        let val = lead[h] !== undefined && lead[h] !== null ? lead[h].toString() : "";
        val = val.replace(/"/g, '""');
        return `"${val}"`;
      });
      rows.push(row.join(","));
    });

    const csvBlob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement("a");
    const cleanQuery = currentQuery.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").toLowerCase();
    a.href = url;
    a.download = `${cleanQuery || "leads"}_workspace.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${currentLeads.length} leads with statuses & notes to CSV`);
  });

  // Mobile Action Dock Listeners
  if (mobileDockCsvBtn) {
    mobileDockCsvBtn.addEventListener("click", () => downloadCsvBtn.click());
  }
  if (mobileDockSyncBtn) {
    mobileDockSyncBtn.addEventListener("click", () => saveSupabaseBtn.click());
  }

  // -------------------------------------------------------------
  // Lead Workspace Drawer / Bottom Sheet Modal Logic
  // -------------------------------------------------------------

  function openWorkspaceModal(lead) {
    if (!lead) return;
    ensureWorkspaceFields(lead);
    activeWorkspaceLead = lead;
    activeModalStatus = lead.lead_status || "New";

    if (workspaceLeadTitle) workspaceLeadTitle.textContent = lead.business_name || "Lead Details";
    if (workspaceLeadSubtitle) {
      workspaceLeadSubtitle.textContent = [lead.category, lead.address].filter(Boolean).join(" • ") || "Local Business Listing";
    }

    // Quick Action Contacts in Drawer
    if (workspaceQuickActions) {
      workspaceQuickActions.innerHTML = "";
      const firstPhone = (lead.phone || "").split(";")[0].trim();
      const phoneDigits = firstPhone.replace(/\D/g, "");
      let waDigits = phoneDigits;
      if (waDigits.length === 10) waDigits = "91" + waDigits;
      else if (waDigits.length === 11 && waDigits.startsWith("0")) waDigits = "91" + waDigits.slice(1);

      if (phoneDigits.length >= 7) {
        workspaceQuickActions.innerHTML += `
          <a href="tel:${escapeHtml(firstPhone)}" class="mobile-action-btn call-btn">📞 Call</a>
          <a href="https://wa.me/${escapeHtml(waDigits)}" target="_blank" rel="noopener" class="mobile-action-btn whatsapp-btn">💬 WhatsApp</a>
        `;
      }
      if (lead.email) {
        workspaceQuickActions.innerHTML += `
          <a href="mailto:${escapeHtml(lead.email.split(';')[0].trim())}" class="mobile-action-btn email-btn">✉️ Email</a>
        `;
      }
      const mapsUrl = lead.google_maps_directions || (lead.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((lead.business_name || "") + " " + lead.address)}` : "");
      if (mapsUrl) {
        workspaceQuickActions.innerHTML += `
          <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" class="mobile-action-btn">📍 Maps</a>
        `;
      }
      if (lead.website) {
        workspaceQuickActions.innerHTML += `
          <a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="mobile-action-btn">🌐 Web</a>
        `;
      }
    }

    // Set Status Buttons
    const statusBtns = document.querySelectorAll("#workspace-status-selector .status-select-btn");
    statusBtns.forEach((btn) => {
      if (btn.dataset.status === activeModalStatus) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    if (workspaceOwnerInput) workspaceOwnerInput.value = lead.owner || "";
    if (workspaceTagsInput) workspaceTagsInput.value = lead.tags || "";
    if (workspaceNotesInput) workspaceNotesInput.value = lead.notes || "";
    if (workspaceSaveStatus) workspaceSaveStatus.textContent = "";

    if (leadWorkspaceModal) leadWorkspaceModal.classList.remove("hidden");
  }

  function closeWorkspaceModal() {
    if (leadWorkspaceModal) leadWorkspaceModal.classList.add("hidden");
    activeWorkspaceLead = null;
  }

  if (closeWorkspaceModalBtn) {
    closeWorkspaceModalBtn.addEventListener("click", closeWorkspaceModal);
  }

  if (leadWorkspaceModal) {
    leadWorkspaceModal.addEventListener("click", (e) => {
      if (e.target === leadWorkspaceModal) closeWorkspaceModal();
    });
  }

  // Status button click in modal
  document.querySelectorAll("#workspace-status-selector .status-select-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#workspace-status-selector .status-select-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeModalStatus = btn.dataset.status;
    });
  });

  // Quick tag chips in modal
  quickTagChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const tag = chip.dataset.tag;
      const current = (workspaceTagsInput.value || "").trim();
      if (!current) {
        workspaceTagsInput.value = tag;
      } else if (!current.toLowerCase().includes(tag.toLowerCase())) {
        workspaceTagsInput.value = current + ", " + tag;
      }
      workspaceTagsInput.focus();
    });
  });

  // Save Lead Workspace details button
  if (workspaceSaveBtn) {
    workspaceSaveBtn.addEventListener("click", async () => {
      if (!activeWorkspaceLead) return;
      const newOwner = workspaceOwnerInput.value.trim();
      const newTags = workspaceTagsInput.value.trim();
      const newNotes = workspaceNotesInput.value.trim();

      workspaceSaveBtn.disabled = true;
      if (workspaceSaveStatus) workspaceSaveStatus.textContent = "Saving...";

      const updates = {
        lead_status: activeModalStatus,
        owner: newOwner,
        tags: newTags,
        notes: newNotes,
      };

      await updateLeadWorkspaceField(activeWorkspaceLead, updates);

      if (workspaceSaveStatus) workspaceSaveStatus.textContent = "✓ Saved!";
      setTimeout(() => {
        workspaceSaveBtn.disabled = false;
        closeWorkspaceModal();
      }, 350);
    });
  }

  // Escape key closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (leadWorkspaceModal && !leadWorkspaceModal.classList.contains("hidden")) {
        closeWorkspaceModal();
      }
      if (supabaseModal && !supabaseModal.classList.contains("hidden")) {
        closeSupabaseModal();
      }
    }
  });

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // -------------------------------------------------------------
  // Supabase Database Integration Handlers
  // -------------------------------------------------------------

  async function checkSupabaseStatus(showToastFeedback = false, tableOverride = null) {
    if (!supabaseStatusBtn) return;
    const url = tableOverride
      ? `/api/supabase/status?table=${encodeURIComponent(tableOverride)}`
      : `/api/supabase/status`;
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.table) {
        currentSupabaseTable = data.table;
      }

      if (data.connected) {
        supabaseStatusBtn.classList.remove("not-configured");
        supabaseStatusBtn.classList.add("connected");
        if (supabaseStatusLabel) {
          supabaseStatusLabel.textContent = `Supabase (${currentSupabaseTable})`;
        }

        if (supabaseModalBanner) {
          supabaseModalBanner.className = "modal-status-banner connected";
          if (supabaseModalBannerText) {
            supabaseModalBannerText.textContent = `Connected to Supabase table '${currentSupabaseTable}' (${data.env || "local"} env)`;
          }
        }
        if (supabaseConnectedInfo) supabaseConnectedInfo.classList.remove("hidden");
        if (supabaseInfoUrl) supabaseInfoUrl.textContent = data.url || "—";
        if (supabaseInfoTable) supabaseInfoTable.textContent = currentSupabaseTable;
        if (supabaseInfoEnv) supabaseInfoEnv.textContent = data.env || "local";
        if (supabaseInfoCount) {
          supabaseInfoCount.textContent = data.total_leads !== null && data.total_leads !== undefined ? data.total_leads : "Ready";
        }

        // Highlight selected table pill
        if (supabaseTablePicker) {
          supabaseTablePicker.forEach((pill) => {
            if (pill.dataset.table === currentSupabaseTable) {
              pill.classList.add("active");
            } else {
              pill.classList.remove("active");
            }
          });
        }

        if (showToastFeedback) showToast(`✓ Connected to '${currentSupabaseTable}'!`);
      } else {
        supabaseStatusBtn.classList.remove("connected");
        supabaseStatusBtn.classList.add("not-configured");
        if (supabaseStatusLabel) supabaseStatusLabel.textContent = `Supabase (${currentSupabaseTable})`;

        if (supabaseModalBanner) {
          supabaseModalBanner.className = "modal-status-banner not-configured";
          if (supabaseModalBannerText) {
            supabaseModalBannerText.textContent = data.error || `Table '${currentSupabaseTable}' not configured or not created in Supabase yet.`;
          }
        }
        if (supabaseConnectedInfo) supabaseConnectedInfo.classList.add("hidden");

        if (showToastFeedback) showToast(data.error || "Supabase not connected. Check .env or SQL schema.");
      }
    } catch (err) {
      if (supabaseStatusBtn) {
        supabaseStatusBtn.classList.remove("connected");
        supabaseStatusBtn.classList.add("not-configured");
      }
    }
  }

  // Supabase Table Picker Click in Modal
  if (supabaseTablePicker) {
    supabaseTablePicker.forEach((btn) => {
      btn.addEventListener("click", () => {
        supabaseTablePicker.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentSupabaseTable = btn.dataset.table;
        checkSupabaseStatus(true, currentSupabaseTable);
      });
    });
  }

  function openSupabaseModal() {
    if (supabaseModal) {
      supabaseModal.classList.remove("hidden");
      checkSupabaseStatus(false, currentSupabaseTable || null);
    }
  }

  function closeSupabaseModal() {
    if (supabaseModal) {
      supabaseModal.classList.add("hidden");
    }
  }

  if (supabaseStatusBtn) supabaseStatusBtn.addEventListener("click", openSupabaseModal);
  if (closeSupabaseModalBtn) closeSupabaseModalBtn.addEventListener("click", closeSupabaseModal);
  if (modalTestBtn) modalTestBtn.addEventListener("click", () => checkSupabaseStatus(true, currentSupabaseTable || null));
  if (modalRecheckBtn) modalRecheckBtn.addEventListener("click", () => checkSupabaseStatus(true, currentSupabaseTable || null));

  if (supabaseModal) {
    supabaseModal.addEventListener("click", (e) => {
      if (e.target === supabaseModal) closeSupabaseModal();
    });
  }

  // Copy .env template
  if (copyEnvBtn) {
    copyEnvBtn.addEventListener("click", async () => {
      const code = document.getElementById("env-sample-code")?.innerText || "";
      try {
        await navigator.clipboard.writeText(code);
        const originalText = copyEnvBtn.textContent;
        copyEnvBtn.textContent = "✓ Copied!";
        setTimeout(() => { copyEnvBtn.textContent = originalText; }, 2000);
        showToast("Copied Supabase .env template to clipboard");
      } catch (err) {
        showToast("Could not copy to clipboard");
      }
    });
  }

  // Copy SQL schema
  if (copySqlBtn) {
    copySqlBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/supabase/schema");
        const sql = await res.text();
        await navigator.clipboard.writeText(sql);
        const originalText = copySqlBtn.textContent;
        copySqlBtn.textContent = "✓ SQL Copied!";
        setTimeout(() => { copySqlBtn.textContent = originalText; }, 2500);
        showToast("Copied schema to clipboard! Paste into Supabase SQL Editor.");
      } catch (err) {
        showToast("Could not fetch SQL schema to copy");
      }
    });
  }

  // Save current leads to Supabase
  if (saveSupabaseBtn) {
    saveSupabaseBtn.addEventListener("click", async () => {
      if (!currentLeads || currentLeads.length === 0) {
        showToast("No leads to save. Extract leads first!");
        return;
      }
      saveSupabaseBtn.disabled = true;
      if (saveSupabaseText) saveSupabaseText.textContent = "Saving...";
      if (mobileDockSyncText) mobileDockSyncText.textContent = "Saving...";

      try {
        const res = await fetch("/api/supabase/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leads: currentLeads,
            query: currentQuery,
            table: currentSupabaseTable,
          }),
        });
        const result = await res.json();
        if (res.ok && result.success) {
          showToast(`⚡ Saved ${result.count} leads to table '${result.table}'!`);
          checkSupabaseStatus(false, currentSupabaseTable);
        } else if (result.needs_schema) {
          showToast(`⚠️ Table '${currentSupabaseTable}' not found in Supabase. Please run the SQL schema.`);
          openSupabaseModal();
        } else if (!result.configured) {
          showToast("⚠️ Supabase not configured in .env. Click Supabase to set up.");
          openSupabaseModal();
        } else {
          showToast(`Supabase save error: ${result.error || "Unknown error"}`);
        }
      } catch (err) {
        showToast(`Network error: ${err.message}`);
      } finally {
        saveSupabaseBtn.disabled = false;
        if (saveSupabaseText) saveSupabaseText.textContent = "Save to Supabase";
        if (mobileDockSyncText) mobileDockSyncText.textContent = "Save DB";
      }
    });
  }

  // Load leads from Supabase
  async function loadLeadsFromSupabase() {
    closeSupabaseModal();
    showToast(`Fetching leads from table '${currentSupabaseTable}'...`);
    try {
      const res = await fetch(`/api/supabase/leads?limit=100&table=${encodeURIComponent(currentSupabaseTable)}`);
      const data = await res.json();
      if (res.ok && data.leads && data.leads.length > 0) {
        currentLeads = data.leads;
        currentQuery = `Supabase (${currentSupabaseTable})`;
        resultsPanel.classList.remove("hidden");
        emptyState.classList.add("hidden");
        renderResults(currentLeads);
        showToast(`Loaded ${data.leads.length} leads from Supabase (${currentSupabaseTable})!`);
      } else if (data.leads && data.leads.length === 0) {
        showToast(`No leads found in table '${currentSupabaseTable}' yet. Extract leads and save!`);
      } else {
        showToast(`Could not load leads from '${currentSupabaseTable}'. Check configuration.`);
        openSupabaseModal();
      }
    } catch (err) {
      showToast(`Error fetching leads from Supabase: ${err.message}`);
    }
  }

  if (loadSupabaseBtn) loadSupabaseBtn.addEventListener("click", loadLeadsFromSupabase);
  if (modalLoadLeadsBtn) modalLoadLeadsBtn.addEventListener("click", loadLeadsFromSupabase);

  // Initialize Supabase status on page load (auto-queries environment table: 'leads' on Vercel, 'leads_local' locally)
  checkSupabaseStatus(false, null);
});
