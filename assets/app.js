/* ============================================================
   The Copilot Exception — campaign site
   Everything you need to configure lives in CONFIG, right here.
   ============================================================ */

const CONFIG = {
  // 1. Your school's name. Fills every "SCHOOL NAME" blank on the page.
  //    Leave "" to keep the blanks showing while you're still drafting.
  school: "Catholic Schools Broken Bay",

  // 2. Signature collection. Both options are free, in-page (nobody leaves
  //    the site), and owned by neither Microsoft nor Google.
  //
  //    "web3forms" — unlimited submissions, free. Get an access key emailed
  //                  to you at web3forms.com (no account needed). Recommended.
  //    "formspree" — 50 submissions/month free. Put the full endpoint
  //                  ("https://formspree.io/f/xxxxxxxx") in `key`.
  //    ""          — signing switched off.
  signupProvider: "web3forms",
  signupKey: "",

  // 3. Analytics. GoatCounter: free for non-commercial use, open source,
  //    no cookies, no personal data, so no consent banner is required —
  //    which matters when your whole argument is about doing policy properly.
  //    Sign up at goatcounter.com, then put your site code here (the
  //    "yourcode" in yourcode.goatcounter.com). Leave "" to load nothing.
  goatcounterCode: "",

  // 4. Where the public roster is read from.
  signaturesUrl: "data/signatures.json",
};

/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

/* ---------- school name ---------- */
if (CONFIG.school) {
  for (const el of document.querySelectorAll("[data-school]")) {
    el.textContent = CONFIG.school;
    el.classList.add("filled");
  }
}

/* ---------- theme toggle ---------- */
(function theme() {
  const btn = $("themeBtn");
  if (!btn) return;
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") {
    document.documentElement.setAttribute("data-theme", saved);
  }
  const label = () => {
    const cur = document.documentElement.getAttribute("data-theme");
    btn.textContent = cur === "dark" ? "Light" : cur === "light" ? "Dark" : "Theme";
  };
  label();
  btn.addEventListener("click", () => {
    const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = document.documentElement.getAttribute("data-theme") || (systemDark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    label();
  });
})();

/* ---------- roster ---------- */
const roster = $("roster");
const emptyRow = $("emptyRow");
const countEl = $("count");

function renderRoster(signatures) {
  if (!roster) return;
  roster.replaceChildren();
  if (!signatures.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent =
      "No signatures yet. Someone has to be first — it may as well be the person who got told no.";
    roster.append(li);
    if (countEl) countEl.textContent = "0";
    return;
  }
  const frag = document.createDocumentFragment();
  for (const s of signatures) {
    const li = document.createElement("li");
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = s.name;
    const yr = document.createElement("span");
    yr.className = "yr";
    yr.textContent = s.group || "";
    li.append(nm, yr);
    frag.append(li);
  }
  roster.append(frag);
  if (countEl) countEl.textContent = String(signatures.length);
}

async function loadRoster() {
  if (!roster || !countEl) return;
  try {
    const res = await fetch(CONFIG.signaturesUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.signatures || [];
    renderRoster(list.filter((s) => s && s.name));
  } catch (err) {
    if (!emptyRow) return;
    emptyRow.textContent =
      "Signature list couldn’t load. Reload the page — if it keeps failing, the roster is still in data/signatures.json.";
  }
}
if (roster) loadRoster();

/* ---------- signing ---------- */
const form = $("signForm");
const btn = $("signBtn");
const statusEl = $("status");

function say(msg, kind) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.className = kind || "";
}

function endpoint() {
  if (!CONFIG.signupKey) return null;
  if (CONFIG.signupProvider === "web3forms") return "https://api.web3forms.com/submit";
  if (CONFIG.signupProvider === "formspree") return CONFIG.signupKey;
  return null;
}

function payload(name, group) {
  const base = { name, group, page: location.href };
  if (CONFIG.signupProvider === "web3forms") {
    return {
      access_key: CONFIG.signupKey,
      subject: `Petition signature: ${name}`,
      from_name: "The Copilot Exception",
      ...base,
    };
  }
  return base;
}

if (form && btn) form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const url = endpoint();
  if (!url) {
    say("Signing isn't switched on yet — check back shortly.", "err");
    return;
  }
  if ($("website")?.value) return; // honeypot: bots fill hidden fields

  const name = ($("nm")?.value || "").trim().replace(/\s+/g, " ");
  const group = ($("yr")?.value || "").trim().replace(/\s+/g, " ");
  if (!name) {
    say("Enter a name first.", "err");
    $("nm")?.focus();
    return;
  }

  btn.disabled = true;
  say("Sending…");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload(name, group)),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) throw new Error(body.message || res.status);

    const row = form.querySelector(".row2"); if (row) row.hidden = true;
    btn.hidden = true;
    say("Signed — thank you. Your name goes up at the next update.", "ok");
    if (window.goatcounter?.count) {
      window.goatcounter.count({ path: "signed", title: "Petition signature", event: true });
    }
  } catch (err) {
    btn.disabled = false;
    say("That didn't send. Check your connection and try again.", "err");
  }
});

/* ---------- utilities ---------- */
$("copyBtn")?.addEventListener("click", async function () {
  const text = $("emailTpl").textContent;
  try {
    await navigator.clipboard.writeText(text);
    this.textContent = "Copied";
    setTimeout(() => (this.textContent = "Copy the email"), 1800);
  } catch (err) {
    const r = document.createRange();
    r.selectNodeContents($("emailTpl"));
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    this.textContent = "Selected — press ⌘C";
    setTimeout(() => (this.textContent = "Copy the email"), 2600);
  }
});

$("printBtn")?.addEventListener("click", () => window.print());

/* ---------- analytics (opt-in, cookieless) ---------- */
if (CONFIG.goatcounterCode) {
  const gc = document.createElement("script");
  gc.async = true;
  gc.dataset.goatcounter = `https://${CONFIG.goatcounterCode}.goatcounter.com/count`;
  gc.src = "https://gc.zgo.at/count.js";
  document.head.append(gc);
}
