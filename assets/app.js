/* ============================================================
   The Copilot Exception — campaign site
   Everything you need to configure lives in CONFIG, right here.
   ============================================================ */

const CONFIG = {
  // 1. Your school's name. Fills every "SCHOOL NAME" blank on the page.
  //    Leave as "" to keep the blanks showing (useful before you go public).
  school: "",

  // 2. Where the sign-up form posts. Pick ONE:
  //    a) Formspree  — free, 2 min: formspree.io → new form → paste the
  //       endpoint here, e.g. "https://formspree.io/f/xxxxxxxx"
  //    b) Leave "" and set externalFormUrl below to use Google/Microsoft Forms.
  formEndpoint: "",

  // 2b. A Google Form / Microsoft Form URL. If set (and formEndpoint is empty),
  //     the sign button sends people there instead of posting in-page.
  externalFormUrl: "",

  // 3. Where the public roster is read from. Add approved names to this file
  //    and commit — see scripts/sign.py, or just edit it by hand.
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
  roster.replaceChildren();
  if (!signatures.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent =
      "No signatures yet. Someone has to be first — it may as well be the person who got told no.";
    roster.append(li);
    countEl.textContent = "0";
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
  countEl.textContent = String(signatures.length);
}

async function loadRoster() {
  try {
    const res = await fetch(CONFIG.signaturesUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.signatures || [];
    renderRoster(list.filter((s) => s && s.name));
  } catch (err) {
    emptyRow.textContent =
      "Signature list couldn’t load. Reload the page — if it keeps failing, the roster is still in data/signatures.json.";
  }
}
loadRoster();

/* ---------- signing ---------- */
const form = $("signForm");
const btn = $("signBtn");
const statusEl = $("status");

function say(msg, kind) {
  statusEl.textContent = msg || "";
  statusEl.className = kind || "";
}

if (!CONFIG.formEndpoint && CONFIG.externalFormUrl) {
  btn.type = "button";
  btn.textContent = "Sign the petition →";
  btn.addEventListener("click", () => window.open(CONFIG.externalFormUrl, "_blank", "noopener"));
  for (const f of form.querySelectorAll(".row2, .hp")) f.hidden = true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!CONFIG.formEndpoint) {
    say("Signing isn’t switched on yet — check back shortly.", "err");
    return;
  }
  if ($("website").value) return; // honeypot: bots fill hidden fields

  const name = $("nm").value.trim().replace(/\s+/g, " ");
  const group = $("yr").value.trim().replace(/\s+/g, " ");
  if (!name) {
    say("Enter a name first.", "err");
    $("nm").focus();
    return;
  }

  btn.disabled = true;
  say("Sending…");
  try {
    const res = await fetch(CONFIG.formEndpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ name, group, page: location.href }),
    });
    if (!res.ok) throw new Error(res.status);
    form.querySelector(".row2").hidden = true;
    btn.hidden = true;
    say("Signed — thank you. Your name goes up at the next update.", "ok");
  } catch (err) {
    btn.disabled = false;
    say("That didn’t send. Check your connection and try again.", "err");
  }
});

/* ---------- utilities ---------- */
$("copyBtn").addEventListener("click", async function () {
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

$("printBtn").addEventListener("click", () => window.print());
