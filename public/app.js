// public/app.js

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const searchForm = document.getElementById("search-form");
  const queryInput = document.getElementById("search-query-input");
  const clearBtn = document.getElementById("clear-search-btn");
  const submitBtn = document.getElementById("submit-btn");
  const btnSpinner = document.getElementById("btn-spinner");
  const btnText = document.getElementById("btn-text");

  const progressSection = document.getElementById("progress-section");
  const progressStatusText = document.getElementById("progress-status-text");
  const progressPercent = document.getElementById("progress-percent");
  const progressBarFill = document.getElementById("progress-bar-fill");

  const resultsSection = document.getElementById("results-section");
  const resultsTitle = document.getElementById("results-title");
  const resultsQueryLabel = document.getElementById("results-query-label");
  const filterResultsInput = document.getElementById("filter-results-input");
  const cardsContainer = document.getElementById("cards-container");
  const tableContainer = document.getElementById("table-container");
  const tableBody = document.getElementById("table-body");

  const statTotalLeads = document.getElementById("stat-total-leads");
  const statTotalEmails = document.getElementById("stat-total-emails");
  const statTotalPhones = document.getElementById("stat-total-phones");
  const statAvgRating = document.getElementById("stat-avg-rating");

  const copyEmailsBtn = document.getElementById("copy-emails-btn");
  const downloadCsvBtn = document.getElementById("download-csv-btn");
  const viewCardsBtn = document.getElementById("view-cards-btn");
  const viewTableBtn = document.getElementById("view-table-btn");
  const toast = document.getElementById("toast");

  // State
  let currentLeads = [];
  let currentQuery = "";
  let selectedMode = "places";
  let selectedCount = 30;
  let progressInterval = null;

  // Clear button
  clearBtn.addEventListener("click", () => {
    queryInput.value = "";
    queryInput.focus();
  });

  // Preset chips
  document.querySelectorAll(".preset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      queryInput.value = chip.dataset.query;
      queryInput.focus();
    });
  });

  // Mode buttons
  document.querySelectorAll("#mode-segmented-control .segment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mode-segmented-control .segment-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedMode = btn.dataset.mode;
    });
  });

  // Count buttons
  document.querySelectorAll("#count-segmented-control .segment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#count-segmented-control .segment-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedCount = parseInt(btn.dataset.count, 10);
    });
  });

  // View toggle
  viewCardsBtn.addEventListener("click", () => {
    viewCardsBtn.classList.add("active");
    viewTableBtn.classList.remove("active");
    cardsContainer.classList.remove("hidden");
    tableContainer.classList.add("hidden");
  });

  viewTableBtn.addEventListener("click", () => {
    viewTableBtn.classList.add("active");
    viewCardsBtn.classList.remove("active");
    tableContainer.classList.remove("hidden");
    cardsContainer.classList.add("hidden");
  });

  // Toast helper
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 3200);
  }

  // Simulated progress stages
  function startProgress() {
    progressSection.classList.remove("hidden");
    let progress = 10;
    progressPercent.textContent = `${progress}%`;
    progressBarFill.style.width = `${progress}%`;
    progressStatusText.textContent = `Connecting to ${selectedMode === 'places' ? 'Google Places API' : 'Web Engine'}...`;

    const stages = [
      { at: 25, text: "Scanning business listings & official ratings..." },
      { at: 45, text: "Extracting addresses, phone numbers, and maps..." },
      { at: 70, text: "Deep crawling websites in parallel for emails & owners..." },
      { at: 90, text: "Sorting leads strictly by Google rank #1 to #30..." },
    ];

    let stageIdx = 0;
    progressInterval = setInterval(() => {
      if (progress < 92) {
        progress += Math.floor(Math.random() * 4) + 2;
        if (progress > 92) progress = 92;
        progressPercent.textContent = `${progress}%`;
        progressBarFill.style.width = `${progress}%`;

        if (stageIdx < stages.length && progress >= stages[stageIdx].at) {
          progressStatusText.textContent = stages[stageIdx].text;
          stageIdx++;
        }
      }
    }, 450);
  }

  function finishProgress() {
    clearInterval(progressInterval);
    progressPercent.textContent = "100%";
    progressBarFill.style.width = "100%";
    progressStatusText.textContent = "Completed! Results sorted by rank.";
    setTimeout(() => {
      progressSection.classList.add("hidden");
    }, 800);
  }

  // Submit search
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = queryInput.value.trim();
    if (!query) return;

    currentQuery = query;
    submitBtn.disabled = true;
    btnSpinner.style.display = "inline-block";
    btnText.textContent = "Extracting Leads...";

    startProgress();

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query,
          count: selectedCount,
          mode: selectedMode,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      currentLeads = data.leads || [];
      renderResults(currentLeads);
      showToast(`Successfully extracted ${currentLeads.length} leads!`);
    } catch (err) {
      console.error(err);
      showToast(`Search error: ${err.message}`);
    } finally {
      finishProgress();
      submitBtn.disabled = false;
      btnSpinner.style.display = "none";
      btnText.textContent = "Launch Lead Extraction";
    }
  });

  // Render results
  function renderResults(leads) {
    resultsSection.classList.remove("hidden");
    resultsQueryLabel.textContent = `for "${currentQuery}" (${leads.length} places)`;

    // Calculate metrics
    let emailCount = 0;
    let phoneCount = 0;
    let ratingSum = 0;
    let ratingNum = 0;

    leads.forEach((l) => {
      if (l.email) emailCount++;
      if (l.phone) phoneCount++;
      const r = parseFloat(l.review_rating);
      if (!isNaN(r) && r > 0) {
        ratingSum += r;
        ratingNum++;
      }
    });

    statTotalLeads.textContent = leads.length;
    statTotalEmails.textContent = emailCount;
    statTotalPhones.textContent = phoneCount;
    statAvgRating.textContent = ratingNum > 0 ? (ratingSum / ratingNum).toFixed(1) : "N/A";

    renderCards(leads);
    renderTable(leads);
  }

  // Render cards
  function renderCards(leads) {
    cardsContainer.innerHTML = "";
    if (leads.length === 0) {
      cardsContainer.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">No leads match your filter.</p>`;
      return;
    }

    leads.forEach((lead) => {
      const rankMatch = (lead.search_rank || "").match(/\d+/);
      const rankNum = rankMatch ? parseInt(rankMatch[0], 10) : 99;
      let rankClass = "rank-other";
      if (rankNum === 1) rankClass = "rank-1";
      else if (rankNum === 2) rankClass = "rank-2";
      else if (rankNum === 3) rankClass = "rank-3";

      const card = document.createElement("div");
      card.className = "lead-card";
      card.innerHTML = `
        <div class="card-header-row">
          <span class="rank-badge ${rankClass}">${lead.search_rank || "#"}</span>
          ${lead.review_rating ? `<span class="rating-badge">★ ${lead.review_rating} (${lead.review_count || "0"})</span>` : ""}
        </div>
        <h3 class="card-title">${escapeHtml(lead.business_name || "Unknown Business")}</h3>
        
        <div class="card-info-list">
          ${lead.phone ? `
            <div class="card-info-item">
              <strong>📞</strong>
              <span>${escapeHtml(lead.phone)}</span>
            </div>` : ""
          }
          ${lead.email ? `
            <div class="card-info-item">
              <strong>✉️</strong>
              <span style="color: #38bdf8;">${escapeHtml(lead.email)}</span>
            </div>` : ""
          }
          ${lead.owner_name_candidates ? `
            <div class="card-info-item">
              <strong>👨‍⚕️</strong>
              <span style="color: #a78bfa;">${escapeHtml(lead.owner_name_candidates)}</span>
            </div>` : ""
          }
          ${lead.address ? `
            <div class="card-info-item">
              <strong>📍</strong>
              <span>${escapeHtml(lead.address)}</span>
            </div>` : ""
          }
        </div>

        <div class="card-footer">
          ${lead.website ? `
            <a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="card-link">
              Visit Website ↗
            </a>` : `<span class="meta-chip">Places Only</span>`
          }
          ${lead.google_maps_directions ? `
            <a href="${escapeHtml(lead.google_maps_directions)}" target="_blank" rel="noopener" class="card-link" style="color: #94a3b8;">
              Google Maps ↗
            </a>` : ""
          }
        </div>
      `;
      cardsContainer.appendChild(card);
    });
  }

  // Render table
  function renderTable(leads) {
    tableBody.innerHTML = "";
    leads.forEach((lead) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong style="color: #fff;">${escapeHtml(lead.search_rank || "#")}</strong></td>
        <td><strong>${escapeHtml(lead.business_name || "")}</strong></td>
        <td>${lead.review_rating ? `★ ${lead.review_rating}` : "N/A"}</td>
        <td>${escapeHtml(lead.phone || "—")}</td>
        <td><span style="color: #38bdf8;">${escapeHtml(lead.email || "—")}</span></td>
        <td><span style="color: #a78bfa;">${escapeHtml(lead.owner_name_candidates || "—")}</span></td>
        <td>${escapeHtml(lead.address || "—")}</td>
        <td>
          ${lead.website ? `<a href="${escapeHtml(lead.website)}" target="_blank" rel="noopener" class="card-link">Link ↗</a>` : "—"}
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // In-table search filter
  filterResultsInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
      renderCards(currentLeads);
      renderTable(currentLeads);
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
    renderCards(filtered);
    renderTable(filtered);
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
      showToast(`Copied ${emails.length} emails to clipboard!`);
    }).catch(() => {
      showToast("Clipboard access denied.");
    });
  });

  // Download CSV
  downloadCsvBtn.addEventListener("click", () => {
    if (currentLeads.length === 0) {
      showToast("No leads available to export.");
      return;
    }

    const headers = [
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

    const rows = [headers.join(",")];
    currentLeads.forEach((lead) => {
      const row = headers.map((h) => {
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
    showToast("Downloaded CSV file successfully!");
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
