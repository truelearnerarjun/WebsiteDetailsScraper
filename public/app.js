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

  // State
  let currentLeads = [];
  let currentQuery = "";
  let selectedMode = "places";
  let selectedCount = 30;

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
  viewTableBtn.addEventListener("click", () => {
    viewTableBtn.classList.add("active");
    viewCardsBtn.classList.remove("active");
    tableWrapper.classList.remove("hidden");
    cardsContainer.classList.add("hidden");
  });

  viewCardsBtn.addEventListener("click", () => {
    viewCardsBtn.classList.add("active");
    viewTableBtn.classList.remove("active");
    cardsContainer.classList.remove("hidden");
    tableWrapper.classList.add("hidden");
  });

  // Default to cards view on mobile screens
  if (window.innerWidth <= 640) {
    viewCardsBtn.classList.add("active");
    viewTableBtn.classList.remove("active");
    cardsContainer.classList.remove("hidden");
    tableWrapper.classList.add("hidden");
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
      const getUrl = `/api/scrape?q=${encodeURIComponent(query)}&n=${selectedCount}&mode=${selectedMode}&min_rating=${minRating}&max_rating=${maxRating}`;
      let response;
      try {
        response = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, count: selectedCount, mode: selectedMode, min_rating: minRating, max_rating: maxRating }),
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
      showToast(`Extracted ${currentLeads.length} places in exact rank order`);
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

  // Render metrics and tables
  function renderResults(leads) {
    if (!leads || leads.length === 0) {
      resultsPanel.classList.add("hidden");
      emptyState.classList.remove("hidden");
      return;
    }

    resultsPanel.classList.remove("hidden");
    emptyState.classList.add("hidden");

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

    renderLeadView();
  }

  function getDisplayedLeads() {
    const term = filterResultsInput.value.toLowerCase().trim();
    const quality = leadQualityFilter.value;
    const sortBy = leadSortSelect.value;
    const filtered = currentLeads.filter((lead) => {
      const matchesText = !term || [
        lead.business_name, lead.category, lead.address, lead.phone, lead.email,
        lead.owner_name_candidates, lead.review_snippet, lead.hours_status,
        lead.data_sources, lead.data_confidence,
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
    if (!text || text.trim() === "") {
      return '<span style="color: var(--text-muted);">—</span>';
    }

    const clean = text.trim();
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
      tableBody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching listings found.</td></tr>`;
      return;
    }

    leads.forEach((lead) => {
      const tr = document.createElement("tr");

      const rankStr = lead.search_rank || "";
      const rankNum = rankStr.replace("#", "").padStart(2, "0");

      // Hours tag style
      const hoursLower = (lead.hours_status || "").toLowerCase();
      let hoursClass = "";
      if (hoursLower.includes("open") && !hoursLower.includes("opens")) hoursClass = "open";
      else if (hoursLower.includes("closed") || hoursLower.includes("closes")) hoursClass = "closed";

      // Status badge style
      const statusLower = (lead.status || "").toLowerCase();
      let statusClass = "places";
      let statusLabel = lead.status || "places_only";
      if (statusLower.includes("success")) {
        statusClass = "success";
        statusLabel = lead.pages_checked ? `Success (${lead.pages_checked} pgs)` : "Success";
      } else if (statusLower.includes("error") || statusLower.includes("failed")) {
        statusClass = "error";
      } else if (statusLower.includes("places")) {
        statusLabel = "Places only";
      }

      // Candidate pages chips (Contact, About, Team)
      let pagesHtml = "";
      if (lead.contact_page) {
        pagesHtml += `<a href="${escapeHtml(lead.contact_page)}" target="_blank" rel="noopener" class="page-chip" title="Contact Page">Contact ↗</a>`;
      }
      if (lead.about_page) {
        pagesHtml += `<a href="${escapeHtml(lead.about_page)}" target="_blank" rel="noopener" class="page-chip" title="About Page">About ↗</a>`;
      }
      if (lead.team_page) {
        pagesHtml += `<a href="${escapeHtml(lead.team_page)}" target="_blank" rel="noopener" class="page-chip" title="Team/Doctors Page">Team ↗</a>`;
      }
      if (!pagesHtml) {
        pagesHtml = '<span style="color: var(--text-muted); font-size: 0.72rem;">—</span>';
      }

      tr.innerHTML = `
        <!-- Rank -->
        <td class="rank-cell">#${escapeHtml(rankNum)}</td>

        <!-- Contactability score -->
        <td><span class="lead-score-badge">${escapeHtml(String(lead.lead_score ?? 0))}</span></td>

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

        <!-- Address -->
        <td>
          ${createExpandableHtml(lead.address, 45, "")}
        </td>

        <!-- Hours -->
        <td>
          ${lead.hours_status ? `<span class="hours-tag ${hoursClass}">${escapeHtml(lead.hours_status)}</span>` : '<span style="color: var(--text-muted);">—</span>'}
        </td>

        <!-- Email -->
        <td>
          ${createExpandableHtml(lead.email, 25, "email-tag", true)}
        </td>

        <!-- Doctor / Owner -->
        <td>
          ${createExpandableHtml(lead.owner_name_candidates, 35, "owner-tag")}
        </td>

        <!-- Review Snippet -->
        <td>
          ${createExpandableHtml(lead.review_snippet, 35, "snippet-tag")}
        </td>

        <!-- Pages Found -->
        <td>
          <div class="page-chips-group">${pagesHtml}</div>
        </td>

        <!-- Links -->
        <td style="text-align: right; white-space: nowrap;">
          ${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="cell-link" title="Visit Official Website">Website ↗</a><br>` : ""}
          ${lead.google_maps_directions ? `<a href="${escapeHtml(lead.google_maps_directions)}" target="_blank" rel="noopener" class="cell-link" title="Open Google Maps Directions" style="color: var(--text-muted);">Maps ↗</a>` : ""}
        </td>

        <!-- Confidence and sources -->
        <td>
          <div class="confidence-tag ${escapeHtml((lead.data_confidence || "low").toLowerCase())}">${escapeHtml(lead.data_confidence || "Low")} confidence</div>
          <div class="source-list">${escapeHtml(lead.data_sources || "Search result")}</div>
          ${Number(lead.duplicate_count || 1) > 1 ? `<div class="duplicate-note">Merged ${escapeHtml(String(lead.duplicate_count))} duplicates</div>` : ""}
        </td>

        <!-- Status -->
        <td style="text-align: center;">
          <span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
        </td>
      `;

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

  // Render Cards View
  function renderCards(leads) {
    cardsContainer.innerHTML = "";

    leads.forEach((lead) => {
      const card = document.createElement("div");
      card.className = "card-item";

      const rankStr = lead.search_rank || "";
      const rankNum = rankStr.replace("#", "").padStart(2, "0");

      card.innerHTML = `
        <div class="card-item-top">
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="font-family: var(--font-mono); font-size: 0.78rem; font-weight: 700; color: var(--accent-primary);">#${escapeHtml(rankNum)}</span>
            ${lead.category ? `<span class="category-tag">${escapeHtml(lead.category)}</span>` : ""}
            <span class="lead-score-badge">${escapeHtml(String(lead.lead_score ?? 0))}</span>
          </div>
          <div style="text-align: right;">
            ${lead.review_rating ? `<span class="rating-tag">★ ${escapeHtml(lead.review_rating)}</span>` : ""}
            ${lead.review_count ? `<span class="review-count-tag" style="margin-left: 0.25rem;">(${escapeHtml(lead.review_count)})</span>` : ""}
          </div>
        </div>
        <div class="card-item-title">${escapeHtml(lead.business_name || "Unknown")}</div>
        <div class="card-details">
          <div class="card-row">
            <span class="card-row-label">Quality</span>
            <div><span class="confidence-tag ${escapeHtml((lead.data_confidence || "low").toLowerCase())}">${escapeHtml(lead.data_confidence || "Low")}</span><span class="source-list">${escapeHtml(lead.data_sources || "Search result")}</span></div>
          </div>
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
          ${lead.owner_name_candidates ? `
            <div class="card-row">
              <span class="card-row-label">Doctor</span>
              <div style="flex: 1;">${createExpandableHtml(lead.owner_name_candidates, 40, "owner-tag")}</div>
            </div>` : ""
          }
          ${lead.address ? `
            <div class="card-row">
              <span class="card-row-label">Address</span>
              <div style="flex: 1;">${createExpandableHtml(lead.address, 50, "")}</div>
            </div>` : ""
          }
          ${lead.hours_status ? `
            <div class="card-row">
              <span class="card-row-label">Hours</span>
              <span style="font-size: 0.74rem; color: var(--text-secondary);">${escapeHtml(lead.hours_status)}</span>
            </div>` : ""
          }
          ${lead.review_snippet ? `
            <div class="card-row">
              <span class="card-row-label">Review</span>
              <div style="flex: 1;">${createExpandableHtml(lead.review_snippet, 40, "snippet-tag")}</div>
            </div>` : ""
          }
        </div>
        <div class="card-footer-links">
          <div>
            ${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="cell-link">Website ↗</a>` : ""}
            ${lead.google_maps_directions ? `<a href="${escapeHtml(lead.google_maps_directions)}" target="_blank" rel="noopener" class="cell-link" style="color: var(--text-muted);">Maps ↗</a>` : ""}
          </div>
          <span class="status-badge ${lead.status && lead.status.includes('success') ? 'success' : 'places'}">${escapeHtml(lead.status || 'places_only')}</span>
        </div>
      `;

      // Expand toggle in card
      card.querySelectorAll(".expand-toggle-btn").forEach((btn) => {
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

  // Download CSV - Exactly matching best_doctor_in_ghansoli_navi_mumbai.csv format
  downloadCsvBtn.addEventListener("click", () => {
    if (currentLeads.length === 0) {
      showToast("No leads available to export.");
      return;
    }

    // Exact 19 columns from best_doctor_in_ghansoli_navi_mumbai.csv
    const fields = [
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
      "lead_score",
      "data_confidence",
      "data_sources",
      "duplicate_count",
      "merged_ranks",
    ];

    const rows = [fields.join(",")];
    currentLeads.forEach((lead) => {
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
    a.download = `${cleanQuery || "leads"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`CSV exported with ${currentLeads.length} listings`);
  });

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
