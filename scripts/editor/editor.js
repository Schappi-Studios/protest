/* Campaign site editor — injected by scripts/edit.py. Never published. */
(() => {
  const main = document.querySelector("main");
  if (!main) return;

  const EDITABLE = [
    "h1", "h2", "h3", "p", "li", "dd", "dt", "caption",
    "figcaption span", "pre.email", "td", "th", ".note",
  ].join(",");

  let dirty = false;
  let free = false;

  /* ---------------- editable regions ---------------- */
  const arm = () => {
    main.querySelectorAll(EDITABLE).forEach((el) => {
      if (el.closest("pre") && el.tagName !== "PRE") return;
      el.setAttribute("data-ed", "");
      el.contentEditable = free ? "inherit" : "true";
      el.spellcheck = true;
    });
    main.contentEditable = free ? "true" : "inherit";
    document.documentElement.classList.toggle("ed-free", free);
  };

  const markDirty = () => {
    if (dirty) return;
    dirty = true;
    status.textContent = "unsaved changes";
    status.className = "ed-note dirty";
    saveBtn.disabled = false;
  };

  main.addEventListener("input", markDirty);
  // In block mode keep Enter from splitting <p> into stray <div>s.
  main.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !free && !e.shiftKey && !e.target.closest("pre")) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
    }
  });

  /* ---------------- formatting ---------------- */
  const cmd = (name) => {
    document.execCommand(name, false, null);
    markDirty();
    sync();
  };

  // Wrap the selection in a span of the given class, or unwrap if already inside one.
  const wrapClass = (cls) => {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const existing =
      range.startContainer.parentElement?.closest(`span.${cls}`) ||
      range.commonAncestorContainer.parentElement?.closest(`span.${cls}`);

    if (existing) {
      const parent = existing.parentNode;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
      parent.normalize();
    } else {
      const span = document.createElement("span");
      span.className = cls;
      try {
        range.surroundContents(span);
      } catch {
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
    }
    markDirty();
    sync();
  };

  const link = () => {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return alert("Select some text first.");
    const inside = sel.getRangeAt(0).startContainer.parentElement?.closest("a");
    if (inside) return cmd("unlink");
    const url = prompt("Link to:", "https://");
    if (url) document.execCommand("createLink", false, url);
    markDirty();
    sync();
  };

  const clearFmt = () => {
    document.execCommand("removeFormat");
    const sel = getSelection();
    if (sel.rangeCount) {
      const el = sel.getRangeAt(0).commonAncestorContainer.parentElement;
      el?.closest("span.hl, span.note") && wrapClass(el.closest("span.hl") ? "hl" : "note");
    }
    markDirty();
    sync();
  };

  /* ---------------- save ---------------- */
  const clean = () => {
    const copy = main.cloneNode(true);
    copy.querySelectorAll("[data-ed]").forEach((el) => {
      el.removeAttribute("data-ed");
      el.removeAttribute("contenteditable");
      el.removeAttribute("spellcheck");
    });
    copy.querySelectorAll(".ed-flash").forEach((el) => el.classList.remove("ed-flash"));
    copy.querySelectorAll("[class='']").forEach((el) => el.removeAttribute("class"));
    // execCommand emits <b>/<i>; keep the source semantic.
    copy.querySelectorAll("b, i").forEach((el) => {
      const tag = el.tagName === "B" ? "strong" : "em";
      const repl = document.createElement(tag);
      repl.innerHTML = el.innerHTML;
      el.replaceWith(repl);
    });
    return copy.innerHTML;
  };

  const save = async () => {
    saveBtn.disabled = true;
    status.textContent = "saving…";
    status.className = "ed-note";
    try {
      const res = await fetch("/__save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ main: clean() }),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "save failed");
      dirty = false;
      status.textContent = `saved · backup in ${out.backup}`;
      status.className = "ed-note";
    } catch (err) {
      status.textContent = `not saved: ${err.message}`;
      status.className = "ed-note bad";
      saveBtn.disabled = false;
    }
  };

  addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault();
  });

  /* ---------------- AI tells ---------------- */
  const TELLS = [
    { id: "dash", label: "Em dashes", why: "The single loudest tell. Use a full stop, a comma, or brackets.",
      re: /—/g },
    { id: "flip", label: "Negation flips", why: "“It isn’t X. It’s Y.” Once is a point. Four times is a style.",
      re: /\b(isn['’]t|wasn['’]t|aren['’]t|doesn['’]t|don['’]t)\b[^.?!]{0,80}[.?!]\s+(It|That|This|They)\b[^.?!]{0,60}[.?!]/g },
    { id: "three", label: "Rule-of-three lists", why: "Three balanced items in a row reads as generated cadence.",
      re: /\b[\w’']+,\s+[\w’']+[^,.?!]{0,25},\s+and\s+[\w’']+/g },
    { id: "notjust", label: "“not just … but”", why: "Stock construction. Say the second half and drop the first.",
      re: /\bnot (just|only|merely)\b[^.?!]{0,70}?\bbut\b/g },
    { id: "words", label: "Tell-tale words", why: "Words nobody says out loud at school.",
      re: /\b(genuinely|actually|simply|merely|precisely|robust|seamless|leverage|delve|landscape|testament|crucial|vital|meaningful|nuanced|underscore|pivotal|myriad|plethora|foster|harness|elevate|moreover|furthermore|thus|hence)\b/gi },
    { id: "semi", label: "Semicolons", why: "Fine in an essay. Nobody writes them on a protest page.",
      re: /;/g },
  ];

  const walkText = () => {
    const nodes = [];
    const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.nodeValue.trim() && n.parentElement.offsetParent !== null
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    let n;
    while ((n = walk.nextNode())) nodes.push(n);
    return nodes;
  };

  const scan = () => {
    const nodes = walkText();
    const found = new Map(TELLS.map((t) => [t.id, []]));
    for (const node of nodes) {
      for (const tell of TELLS) {
        tell.re.lastIndex = 0;
        let m;
        while ((m = tell.re.exec(node.nodeValue))) {
          found.get(tell.id).push({ node, start: m.index, end: m.index + m[0].length, text: m[0] });
          if (!m[0].length) break;
        }
      }
    }
    return found;
  };

  const paintHighlights = (hits) => {
    if (!("highlights" in CSS)) return;
    CSS.highlights.delete("ed-tell");
    if (!hits.length) return;
    const ranges = hits.map((h) => {
      const r = new Range();
      r.setStart(h.node, h.start);
      r.setEnd(h.node, h.end);
      return r;
    });
    CSS.highlights.set("ed-tell", new Highlight(...ranges));
  };

  const renderPanel = () => {
    const found = scan();
    const total = [...found.values()].reduce((a, b) => a + b.length, 0);
    tellCount.textContent = total;
    tellBtn.classList.toggle("warn", total > 0);
    list.replaceChildren();

    if (!total) {
      const p = document.createElement("p");
      p.className = "ed-empty";
      p.textContent = "Nothing flagged. That doesn't make it good — it just means it no longer reads like it was generated.";
      list.append(p);
      paintHighlights([]);
      return;
    }

    for (const tell of TELLS) {
      const hits = found.get(tell.id);
      const grp = document.createElement("div");
      grp.className = "ed-grp";

      const head = document.createElement("div");
      head.className = "ed-grp-h";
      head.innerHTML =
        `<span class="n${hits.length ? "" : " zero"}">${hits.length}</span>` +
        `<span class="t">${tell.label}<span class="why">${tell.why}</span></span>`;
      head.addEventListener("click", () => {
        grp.classList.toggle("open");
        paintHighlights(grp.classList.contains("open") ? hits : []);
      });
      grp.append(head);

      const box = document.createElement("div");
      box.className = "ed-hits";
      hits.forEach((h) => {
        const ctx = h.node.nodeValue;
        const a = Math.max(0, h.start - 34);
        const b = Math.min(ctx.length, h.end + 34);
        const btn = document.createElement("button");
        btn.className = "ed-hit";
        btn.innerHTML =
          (a > 0 ? "…" : "") +
          esc(ctx.slice(a, h.start)) +
          "<mark>" + esc(h.text) + "</mark>" +
          esc(ctx.slice(h.end, b)) +
          (b < ctx.length ? "…" : "");
        btn.addEventListener("click", () => {
          const el = h.node.parentElement;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ed-flash");
          setTimeout(() => el.classList.remove("ed-flash"), 1200);
          paintHighlights([h]);
        });
        box.append(btn);
      });
      grp.append(box);
      list.append(grp);
    }
  };

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  /* ---------------- toolbar chrome ---------------- */
  const bar = document.createElement("div");
  bar.className = "ed-bar";
  bar.innerHTML = `
    <button class="ed-b" data-cmd="bold" title="Bold — ⌘B"><b>B</b></button>
    <button class="ed-b" data-cmd="italic" title="Italic — ⌘I"><i>I</i></button>
    <button class="ed-b" data-cmd="underline" title="Underline — ⌘U"><u>U</u></button>
    <button class="ed-b" data-cmd="strikeThrough" title="Strike through"><s>S</s></button>
    <span class="ed-sep"></span>
    <button class="ed-b" data-wrap="hl" title="Highlighter">HIGHLIGHT</button>
    <button class="ed-b" data-wrap="note" title="Handwritten margin note">NOTE</button>
    <button class="ed-b" data-link title="Link — ⌘K">LINK</button>
    <button class="ed-b" data-clear title="Strip formatting">CLEAR</button>
    <span class="ed-sep"></span>
    <button class="ed-b" data-free title="Free mode lets you add and delete whole blocks">BLOCKS</button>
    <button class="ed-b" data-tells>AI TELLS <span id="ed-count">0</span></button>
    <span class="sp"></span>
    <span class="ed-note" id="ed-status">click any text to edit</span>
    <button class="ed-b go" id="ed-save" disabled>SAVE</button>`;
  document.body.append(bar);

  const panel = document.createElement("aside");
  panel.className = "ed-panel";
  panel.innerHTML = `
    <h2>Does it sound like you? <span class="x" title="Close">✕</span></h2>
    <p class="ed-intro">Patterns that make writing read as machine-made. None of them are
      errors — they're habits. Click a group to highlight it in the page, click a line to jump to it.</p>
    <div class="ed-list" id="ed-list"></div>`;
  document.body.append(panel);

  const status = bar.querySelector("#ed-status");
  const saveBtn = bar.querySelector("#ed-save");
  const tellBtn = bar.querySelector("[data-tells]");
  const tellCount = bar.querySelector("#ed-count");
  const freeBtn = bar.querySelector("[data-free]");
  const list = panel.querySelector("#ed-list");

  bar.querySelectorAll("[data-cmd]").forEach((b) =>
    b.addEventListener("click", () => cmd(b.dataset.cmd)));
  bar.querySelectorAll("[data-wrap]").forEach((b) =>
    b.addEventListener("click", () => wrapClass(b.dataset.wrap)));
  bar.querySelector("[data-link]").addEventListener("click", link);
  bar.querySelector("[data-clear]").addEventListener("click", clearFmt);
  saveBtn.addEventListener("click", save);

  freeBtn.addEventListener("click", () => {
    free = !free;
    freeBtn.textContent = free ? "FREE EDIT" : "BLOCKS";
    freeBtn.classList.toggle("on", free);
    arm();
  });

  const togglePanel = (open) => {
    panel.classList.toggle("open", open);
    tellBtn.classList.toggle("on", open);
    if (open) renderPanel(); else paintHighlights([]);
  };
  tellBtn.addEventListener("click", () => togglePanel(!panel.classList.contains("open")));
  panel.querySelector(".x").addEventListener("click", () => togglePanel(false));

  // keep the tells panel current while typing
  let t;
  main.addEventListener("input", () => {
    if (!panel.classList.contains("open")) return;
    clearTimeout(t);
    t = setTimeout(renderPanel, 600);
  });

  /* active-state sync + shortcuts */
  const sync = () => {
    bar.querySelectorAll("[data-cmd]").forEach((b) => {
      let on = false;
      try { on = document.queryCommandState(b.dataset.cmd); } catch {}
      b.classList.toggle("on", on);
    });
    const sel = getSelection();
    const el = sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer.parentElement : null;
    bar.querySelectorAll("[data-wrap]").forEach((b) =>
      b.classList.toggle("on", !!el?.closest(`span.${b.dataset.wrap}`)));
  };
  document.addEventListener("selectionchange", sync);

  addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "s") { e.preventDefault(); if (!saveBtn.disabled) save(); }
    if (k === "k") { e.preventDefault(); link(); }
    if (k === "h") { e.preventDefault(); wrapClass("hl"); }
  });

  try { document.execCommand("styleWithCSS", false, false); } catch {}
  arm();
  renderPanel();
})();
