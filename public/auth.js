// public/auth.js - Password gate for the API.
// Wraps window.fetch so every same-origin /api/* call sends `X-App-Token`.
// If the server answers 401, a lock screen asks for the password and the
// original request is retried automatically. Load this BEFORE app.js.

(() => {
  const STORAGE_KEY = "wds_app_token";
  const nativeFetch = window.fetch.bind(window);

  const getToken = () => localStorage.getItem(STORAGE_KEY) || "";
  const setToken = (t) => localStorage.setItem(STORAGE_KEY, t);
  const clearToken = () => localStorage.removeItem(STORAGE_KEY);

  const isApiRequest = (input) => {
    try {
      const raw = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);
      return url.origin === window.location.origin && url.pathname.startsWith("/api");
    } catch {
      return false;
    }
  };

  const withToken = (init = {}) => {
    const headers = new Headers(init.headers || {});
    const token = getToken();
    if (token) headers.set("X-App-Token", token);
    return { ...init, headers };
  };

  // ---------- Lock screen ----------
  let pendingUnlock = null; // shared promise so parallel 401s show one prompt

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "auth-overlay";
    overlay.className = "auth-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "auth-title");
    overlay.innerHTML = `
      <form class="auth-card" id="auth-form" autocomplete="on">
        <div class="auth-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2 id="auth-title" class="auth-title">Workspace locked</h2>
        <p class="auth-sub">Enter the app password to access your leads database.</p>
        <input type="text" name="username" value="workspace" autocomplete="username" hidden />
        <input id="auth-password-input" class="auth-input" type="password" name="password"
               placeholder="Password" autocomplete="current-password" required />
        <p id="auth-error" class="auth-error" aria-live="polite"></p>
        <button id="auth-submit-btn" class="auth-btn" type="submit">Unlock</button>
      </form>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function promptForPassword(message = "") {
    if (pendingUnlock) return pendingUnlock;

    pendingUnlock = new Promise((resolve) => {
      const show = () => {
        const overlay = document.getElementById("auth-overlay") || buildOverlay();
        const form = overlay.querySelector("#auth-form");
        const input = overlay.querySelector("#auth-password-input");
        const errorEl = overlay.querySelector("#auth-error");
        const btn = overlay.querySelector("#auth-submit-btn");

        errorEl.textContent = message;
        overlay.classList.add("visible");
        setTimeout(() => input.focus(), 50);

        form.onsubmit = async (e) => {
          e.preventDefault();
          const candidate = input.value.trim();
          if (!candidate) return;
          btn.disabled = true;
          btn.textContent = "Checking…";
          errorEl.textContent = "";
          try {
            const res = await nativeFetch("/api/auth/check", {
              headers: { "X-App-Token": candidate },
            });
            if (res.ok) {
              setToken(candidate);
              input.value = "";
              overlay.classList.remove("visible");
              pendingUnlock = null;
              resolve(true);
            } else {
              errorEl.textContent = res.status === 401 ? "Incorrect password." : `Server error (${res.status}).`;
              form.classList.remove("shake");
              void form.offsetWidth;
              form.classList.add("shake");
              input.select();
            }
          } catch {
            errorEl.textContent = "Network error. Try again.";
          } finally {
            btn.disabled = false;
            btn.textContent = "Unlock";
          }
        };
      };

      if (document.body) show();
      else document.addEventListener("DOMContentLoaded", show, { once: true });
    });
    return pendingUnlock;
  }

  // ---------- fetch wrapper ----------
  window.fetch = async (input, init) => {
    if (!isApiRequest(input)) return nativeFetch(input, init);

    let res = await nativeFetch(input, withToken(init));
    if (res.status !== 401) return res;

    // Token missing or wrong: ask, then retry once with the new token.
    const hadToken = Boolean(getToken());
    clearToken();
    await promptForPassword(hadToken ? "Session expired. Please re-enter the password." : "");
    res = await nativeFetch(input, withToken(init));
    return res;
  };

  window.appLogout = () => {
    clearToken();
    window.location.reload();
  };

  // Check up-front so the lock screen appears before the user starts working.
  nativeFetch("/api/auth/check", withToken())
    .then(async (res) => {
      if (res.status === 401) {
        clearToken();
        promptForPassword();
      } else if (res.status === 503) {
        clearToken();
        const data = await res.json().catch(() => ({}));
        promptForPassword(data.error || "APP_PASSWORD not set in Vercel settings.");
      }
    })
    .catch(() => {});
})();
