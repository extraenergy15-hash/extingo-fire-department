/**
 * Extingo Fire Department — access gate
 *
 * DEMO-ONLY AUTH. This is not real security: the correct hash ships in this
 * file, so anyone with dev tools can read it. It just keeps casual visitors
 * off the dashboard behind a shared department passcode.
 *
 * Demo passcode: EXTINGO2026
 */

// SHA-256("EXTINGO2026")
const PASSCODE_HASH =
  "76f1db92bdc6eaec52c0ea5d65ed946cfd4d0e59f5077ff204def7cc4fead427";

const SESSION_KEY = "extingo_dept_auth";

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function initGate() {
  const form = document.getElementById("gate-form");
  const input = document.getElementById("passcode");
  const submitBtn = document.getElementById("submit-btn");
  const errorEl = document.getElementById("gate-error");

  if (!form) return;

  // Already unlocked this session — skip straight to the dashboard.
  if (sessionStorage.getItem(SESSION_KEY) === "true") {
    window.location.replace("dashboard.html");
    return;
  }

  function setError(message) {
    errorEl.textContent = message;
    errorEl.classList.toggle("is-visible", Boolean(message));
    form.classList.toggle("has-error", Boolean(message));
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");

    const value = input.value.trim();
    if (!value) {
      setError("Enter the department passcode.");
      input.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add("is-checking");

    try {
      const hash = await sha256Hex(value);

      if (hash === PASSCODE_HASH) {
        sessionStorage.setItem(SESSION_KEY, "true");
        window.location.href = "dashboard.html";
        return; // leave button disabled during navigation
      }

      setError("Incorrect passcode. Check the roster and try again.");
      input.value = "";
      input.focus();
    } catch (err) {
      setError("Couldn't verify passcode on this browser. Try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-checking");
    }
  });
}

document.addEventListener("DOMContentLoaded", initGate);
