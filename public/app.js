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

  // Limit pill buttons
  document.querySelectorAll("#count-group .pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#count-group .pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedCount = parseInt(btn.dataset.count, 10);
    });
  });

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

  // Handle Form Submission
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = queryInput.value.trim();
    if (!query) return;

    currentQuery = query;

    // Update UI for loading state
    submitBtn.disabled = true;
    btnSpinner.style.display = "inline-block";
    btnText.textContent = "Scanning...";

    statusBar.classList.remove("hidden");
    statusMessage.textContent = `Searching ${selectedMode === 'places' ? 'Google Places' : 'live web'} for "${query}"...`;
    statusCount.textContent = `Targeting ${selectedCount}`;

    emptyState.classList.add("hidden");

    try {
      let response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query,
          count: selectedCount,
          mode: selectedMode,
        }),
      });

      // Fallback in case of routing variations
      if (response.status === 404) {
        response = await fetch(`/api/scrape?q=${encodeURIComponent(query)}&n=${selectedCount}&mode=${selectedMode}`);
      }
      if (response.status === 404) {
        response = await fetch(`/api?q=${encodeURIComponent(query)}&n=${selectedCount}&mode=${selectedMode}`);
      }

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("API not found (404). If testing locally, run: python server.py");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      currentLeads = data.leads || [];

      renderResults(currentLeads);
      showToast(`Extracted ${currentLeads.length} listings in rank order`);
    } catch (err) {
      console.error(err);
      showToast(`Error: ${err.message}`);
      if (currentLeads.length === 0) {
        emptyState.classList.remove("hidden");
      }
    } finally {
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

    renderTable(leads);
    renderCards(leads);
  }

  // Render Table View
  function renderTable(leads) {
    tableBody.innerHTML = "";

    if (leads.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching listings found.</td></tr>`;
      return;
    }

    leads.forEach((lead) => {
      const tr = document.createElement("tr");

      const rankStr = lead.search_rank || "";
      const rankNum = rankStr.replace("#", "").padStart(2, "0");

      tr.innerHTML = `
        <td class="rank-cell">#${escapeHtml(rankNum)}</td>
        <td>
          <div class="business-name">${escapeHtml(lead.business_name || "Unknown")}</div>
        </td>
        <td>
          ${lead.review_rating ? `<span class="rating-tag">★ ${escapeHtml(lead.review_rating)}</span>` : '<span style="color: var(--text-muted);">—</span>'}
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.78rem;">
          ${escapeHtml(lead.phone || "—")}
        </td>
        <td>
          ${lead.email ? `<span class="email-tag" title="Click to copy">${escapeHtml(lead.email)}</span>` : '<span style="color: var(--text-muted);">—</span>'}
        </td>
        <td>
          ${lead.owner_name_candidates ? `<span class="owner-tag">${escapeHtml(lead.owner_name_candidates)}</span>` : '<span style="color: var(--text-muted);">—</span>'}
        </td>
        <td>
          <div class="address-cell" title="${escapeHtml(lead.address || '')}">${escapeHtml(lead.address || "—")}</div>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          ${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="cell-link" title="Visit Website">Web ↗</a>` : ""}
          ${lead.google_maps_directions ? `<a href="${escapeHtml(lead.google_maps_directions)}" target="_blank" rel="noopener" class="cell-link" title="Google Maps" style="color: var(--text-muted);">Maps ↗</a>` : ""}
        </td>
      `;

      // Click on email in row to copy
      const emailEl = tr.querySelector(".email-tag");
      if (emailEl) {
        emailEl.addEventListener("click", () => {
          navigator.clipboard.writeText(lead.email).then(() => {
            showToast(`Copied ${lead.email}`);
          });
        });
      }

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
          <span style="font-family: var(--font-mono); font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">#${escapeHtml(rankNum)}</span>
          ${lead.review_rating ? `<span class="rating-tag">★ ${escapeHtml(lead.review_rating)}</span>` : ""}
        </div>
        <div class="card-item-title">${escapeHtml(lead.business_name || "Unknown")}</div>
        <div class="card-details">
          ${lead.phone ? `
            <div class="card-row">
              <span class="card-row-label">Phone</span>
              <span style="font-family: var(--font-mono);">${escapeHtml(lead.phone)}</span>
            </div>` : ""
          }
          ${lead.email ? `
            <div class="card-row">
              <span class="card-row-label">Email</span>
              <span class="email-tag">${escapeHtml(lead.email)}</span>
            </div>` : ""
          }
          ${lead.owner_name_candidates ? `
            <div class="card-row">
              <span class="card-row-label">Doctor</span>
              <span class="owner-tag">${escapeHtml(lead.owner_name_candidates)}</span>
            </div>` : ""
          }
          ${lead.address ? `
            <div class="card-row">
              <span class="card-row-label">Address</span>
              <span style="color: var(--text-muted); font-size: 0.76rem;">${escapeHtml(lead.address)}</span>
            </div>` : ""
          }
        </div>
        <div class="card-footer-links">
          ${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="cell-link">Website ↗</a>` : "<span></span>"}
          ${lead.google_maps_directions ? `<a href="${escapeHtml(lead.google_maps_directions)}" target="_blank" rel="noopener" class="cell-link" style="color: var(--text-muted);">Maps ↗</a>` : ""}
        </div>
      `;

      cardsContainer.appendChild(card);
    });
  }

  // Filter in table
  filterResultsInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
      renderTable(currentLeads);
      renderCards(currentLeads);
      return;
    }

    const filtered = currentLeads.filter((l) => {
      return (
        (l.business_name || "").toLowerCase().includes(term) ||
        (l.address || "").toLowerCase().includes(term) ||
        (l.phone || "").toLowerCase().includes(term) ||
        (l.email || "").toLowerCase().includes(term) ||
        (l.owner_name_candidates || "").toLowerCase().includes(term)
      );
    });

    renderTable(filtered);
    renderCards(filtered);
  });

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
      showToast("No emails to copy.");
      return;
    }

    navigator.clipboard.writeText(emails.join(", ")).then(() => {
      showToast(`Copied ${emails.length} emails to clipboard`);
    }).catch(() => {
      showToast("Failed to access clipboard");
    });
  });

  // Download CSV
  downloadCsvBtn.addEventListener("click", () => {
    if (currentLeads.length === 0) {
      showToast("No leads available to export.");
      return;
    }

    const fields = [
      "search_rank",
      "business_name",
      "category",
      "review_rating",
      "review_count",
      "phone",
      "address",
      "website",
      "email",
      "owner_name_candidates",
      "google_maps_directions",
    ];

    const rows = [fields.join(",")];
    currentLeads.forEach((lead) => {
      const row = fields.map((h) => {
        const val = (lead[h] || "").toString().replace(/"/g, '""');
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
    showToast("CSV exported successfully");
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
