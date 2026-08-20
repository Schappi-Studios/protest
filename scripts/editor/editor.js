/* Campaign site editor — injected by scripts/edit.py. Never published. */
(() => {
  const main = document.querySelector("main");
  if (!main) return;

  const EDITABLE = [
    "h1", "h2", "h3", "p", "li", "dd", "dt", "caption",
    "figcaption span", "pre.email", "td", "th", ".note",
  ].join(",");

  const FONTS = [
    ["", "Font"],
    ["f-serif", "Serif (body)"],
    ["f-sans", "Sans (headings)"],
    ["f-mono", "Mono (labels)"],
    ["f-hand", "Handwritten"],
  ];
  const STEPS = 11; // .s1 … .s11

  let dirty = false;
  let free = false;
  let rev = document.querySelector('meta[name="ed-rev"]')?.content || "";
  let autoPublish = localStorage.getItem("ed-publish") !== "off";
  const loadedSize = () => main.textContent.replace(/\s+/g, " ").trim().length;
  let baselineSize = 0;

  /* ---------------- editable regions ---------------- */
  const arm = () => {
    main.querySelectorAll(EDITABLE).forEach((el) => {
      if (el.closest("pre") && el.tagName !== "PRE") return;
      el.setAttribute("data-ed", "");
      el.contentEditable = free ? "inherit" : "true";
      el.spellcheck = true;
    });
    main.querySelectorAll(BLOCK_SEL).forEach((el) => el.setAttribute("data-ed-block", ""));
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
    copy.querySelectorAll(".ed-flash, .ed-active").forEach((el) =>
      el.classList.remove("ed-flash", "ed-active"));
    copy.querySelectorAll("[data-ed-block]").forEach((el) => el.removeAttribute("data-ed-block"));
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
    // Publishing is instant and public, so a big cut gets one question first.
    if (autoPublish && baselineSize) {
      const now = loadedSize();
      const lost = Math.round(((baselineSize - now) / baselineSize) * 100);
      if (lost >= 35 && !confirm(
        `This removes about ${lost}% of the page's text and publishes it to the ` +
        `live site straight away.\n\nPublish anyway?`
      )) return;
    }
    saveBtn.disabled = true;
    status.textContent = autoPublish ? "saving and publishing…" : "saving…";
    status.className = "ed-note";
    try {
      const res = await fetch("/__save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ main: clean(), rev, publish: autoPublish, meta }),
      });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "save failed");
      dirty = false;
      rev = out.rev || rev;
      baselineSize = loadedSize();
      status.className = "ed-note";

      const pub = out.published;
      if (!pub) {
        status.textContent = "saved on this computer only";
      } else if (pub.ok && pub.note) {
        status.textContent = "saved · nothing new to publish";
      } else if (pub.ok) {
        status.textContent = "published · live in about a minute";
        liveLink.hidden = false;
      } else {
        status.textContent = pub.committed
          ? `saved and committed, but the push failed: ${pub.error}`
          : `saved on this computer, but publishing failed: ${pub.error}`;
        status.className = "ed-note bad";
      }
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
    <select class="ed-sel" data-font title="Typeface for the selected block"></select>
    <button class="ed-b" data-size="-1" title="Smaller">A&minus;</button>
    <button class="ed-b" data-size="1" title="Bigger">A+</button>
    <span class="ed-sep"></span>
    <button class="ed-b" data-free title="Free mode lets you add and delete whole blocks">BLOCKS</button>
    <button class="ed-b" data-add-open>+ ADD BLOCK</button>
    <button class="ed-b" id="ed-undo" disabled>UNDO BLOCK</button>
    <button class="ed-b" data-tells>AI TELLS <span id="ed-count">0</span></button>
    <button class="ed-b" id="ed-share">LINK PREVIEW</button>
    <span class="sp"></span>
    <span class="ed-note" id="ed-status">click any text to edit</span>
    <a class="ed-b" id="ed-live" href="https://schappistudios.github.io/protest/" target="_blank" rel="noopener" hidden>VIEW LIVE</a>
    <button class="ed-b" id="ed-pub" title="When on, saving also commits and pushes to the live site">PUBLISH: ON</button>
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
  const say = (msg) => { status.textContent = msg; status.className = "ed-note"; };
  const saveBtn = bar.querySelector("#ed-save");
  const tellBtn = bar.querySelector("[data-tells]");
  const tellCount = bar.querySelector("#ed-count");
  const freeBtn = bar.querySelector("[data-free]");
  const addBtn = bar.querySelector("[data-add-open]");
  const undoBtn = bar.querySelector("#ed-undo");
  const pubBtn = bar.querySelector("#ed-pub");
  const shareBtn = bar.querySelector("#ed-share");
  const liveLink = bar.querySelector("#ed-live");

  const paintPub = () => {
    pubBtn.textContent = autoPublish ? "PUBLISH: ON" : "PUBLISH: OFF";
    pubBtn.classList.toggle("on", autoPublish);
    saveBtn.textContent = autoPublish ? "SAVE & PUBLISH" : "SAVE";
  };
  pubBtn.addEventListener("click", () => {
    autoPublish = !autoPublish;
    localStorage.setItem("ed-publish", autoPublish ? "on" : "off");
    paintPub();
    say(autoPublish
      ? "saving will now push straight to the live site"
      : "saving now only writes to this computer");
  });
  paintPub();
  const list = panel.querySelector("#ed-list");

  bar.querySelectorAll("[data-cmd]").forEach((b) =>
    b.addEventListener("click", () => cmd(b.dataset.cmd)));
  bar.querySelectorAll("[data-wrap]").forEach((b) =>
    b.addEventListener("click", () => wrapClass(b.dataset.wrap)));
  bar.querySelector("[data-link]").addEventListener("click", link);
  const fontSel = bar.querySelector("[data-font]");
  fontSel.innerHTML = FONTS.map(([v, n]) => `<option value="${v}">${n}</option>`).join("");
  fontSel.addEventListener("change", () => { setFont(fontSel.value); fontSel.value = ""; });
  bar.querySelectorAll("[data-size]").forEach((b) =>
    b.addEventListener("click", () => stepSize(Number(b.dataset.size))));
  bar.querySelector("[data-clear]").addEventListener("click", clearFmt);
  saveBtn.addEventListener("click", save);

  freeBtn.addEventListener("click", () => {
    free = !free;
    freeBtn.textContent = free ? "FREE EDIT" : "BLOCKS";
    freeBtn.classList.toggle("on", free);
    arm();
  });

  const togglePanel = (open) => {
    if (open) share?.classList.remove("open"), shareBtn?.classList.remove("on");
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


  /* ================= structural blocks ================= */

  const BLOCKS = [
    { id: "section", name: "Section", desc: "A whole new numbered chunk of the page, with its own heading.",
      sel: "section", parent: "main", where: "append",
      html: `<section>
      <div class="sec-hd">
        <p class="eyebrow">08 &mdash; New section</p>
        <h2>Give this section a heading</h2>
      </div>
      <div class="stack" style="gap:20px">
        <p>Write the point here.</p>
      </div>
    </section>` },

    { id: "card", name: "Box", desc: "The bordered white box, for anything that needs setting apart.",
      sel: ".card", parent: "section .stack, section",
      html: `<div class="card">
        <h3 style="margin-bottom:12px">Heading for the box</h3>
        <p style="font-size:16.5px">What goes in it.</p>
      </div>` },

    { id: "reb", name: "Objection + answer", desc: "A “they say / the problem with that” pair.",
      sel: ".reb-row", parent: ".reb",
      html: `<div class="reb-row">
        <div class="reb-say"><span class="reb-lbl">They say</span>&ldquo;The thing they will say.&rdquo;</div>
        <div class="reb-fact"><span class="reb-lbl">The problem with that</span>Why it does not hold up.</div>
      </div>` },

    { id: "demand", name: "Demand", desc: "A numbered item in the list of asks. Renumbers itself.",
      sel: "ol.demands > li", parent: "ol.demands",
      html: `<li>
        <h3>The thing you want.</h3>
        <p>Why it is reasonable, in two or three sentences.</p>
      </li>` },

    { id: "rung", name: "Escalation step", desc: "Another rung on the who-to-talk-to ladder.",
      sel: "ol.ladder > li", parent: "ol.ladder",
      html: `<li>
        <h3>Who to go to</h3>
        <p>What to say when you get there.</p>
      </li>` },

    { id: "scope", name: "Checklist line", desc: "A “we are not asking for…” line.",
      sel: "ul.plain > li", parent: "ul.plain",
      html: `<li><span class="x" aria-hidden="true">[&nbsp;]</span><span>Something you are not asking for.</span></li>` },

    { id: "para", name: "Paragraph", desc: "Plain text.",
      sel: "section > .stack > p, .card > p", parent: "section .stack, .card",
      html: `<p>New paragraph.</p>` },

    { id: "note", name: "Handwritten note", desc: "The red margin scrawl. Use sparingly or it stops landing.",
      sel: ".note", parent: "section .stack, .card",
      html: `<span class="note" style="transform:rotate(-1deg)">your note here</span>` },

    { id: "btnrow", name: "Button row", desc: "A row to put buttons in.",
      sel: ".btn-row", parent: "section .stack, .card",
      html: `<div class="btn-row"><a class="btn" href="#sign">Button text</a></div>` },

    { id: "btn", name: "Button — solid", desc: "Dark filled button. Goes in a button row.",
      sel: "a.btn:not(.ghost)", parent: ".btn-row",
      html: `<a class="btn" href="#sign">Button text</a>` },

    { id: "btnghost", name: "Button — outline", desc: "Quieter bordered button, for the secondary action.",
      sel: "a.btn.ghost", parent: ".btn-row",
      html: `<a class="btn ghost" href="#demands">Button text</a>` },
  ];

  const BLOCK_SEL =
    BLOCKS.map((b) => b.sel).join(",") +
    ",figure.evidence,.petition,main p,.note,a.btn,.btn-row,h2,h3," +
    "ol.demands > li,ol.ladder > li,ul.plain > li,.card,.reb-row,section,figcaption";

  const nameFor = (el) => {
    if (el.matches("figure.evidence")) return "Evidence";
    if (el.matches(".petition")) return "Petition";
    if (el.matches(".note")) return "Note";
    if (el.matches("a.btn")) return "Button";
    if (el.matches(".btn-row")) return "Button row";
    if (el.matches("h2")) return "Heading";
    if (el.matches("h3")) return "Sub-heading";
    if (el.matches("p.eyebrow")) return "Eyebrow";
    for (const b of BLOCKS) if (el.matches(b.sel)) return b.name;
    if (el.matches("p")) return "Paragraph";
    if (el.matches("li")) return "List item";
    return "Block";
  };

  /* ---- structural undo ---- */
  const undoStack = [];
  const snapshot = () => {
    undoStack.push(main.innerHTML);
    if (undoStack.length > 30) undoStack.shift();
    undoBtn.disabled = false;
  };
  const undo = () => {
    if (!undoStack.length) return;
    main.innerHTML = undoStack.pop();
    undoBtn.disabled = !undoStack.length;
    setActive(null);
    arm();
    markDirty();
    if (panel.classList.contains("open")) renderPanel();
  };

  /* ---- selection + floating controls ---- */
  let active = null;

  const tools = document.createElement("div");
  tools.className = "ed-bt";
  tools.innerHTML = `
    <span class="lbl" id="ed-bt-lbl">Block</span>
    <button data-op="parent" title="Select the block around this one">&#8598;</button>
    <button data-op="up" title="Move up">&#8593;</button>
    <button data-op="down" title="Move down">&#8595;</button>
    <button data-op="dupe" title="Duplicate">&#10697;</button>
    <button data-op="text" title="Add a paragraph below this">&#182;+</button>
    <button data-op="below" class="del" title="Delete everything below this">&#8615;&#10005;</button>
    <button data-op="link" title="Change where this links to">&#128279;</button>
    <button data-op="del" class="del" title="Delete">&#10005;</button>`;
  document.body.append(tools);

  const place = () => {
    if (!active || !active.isConnected) return setActive(null);
    const r = active.getBoundingClientRect();
    const tw = tools.offsetWidth || 200;
    const th = tools.offsetHeight || 30;
    let top, left;

    if (r.height < 52) {
      // Short or inline block: sit beside it so the controls never cover it.
      top = r.top + r.height / 2 - th / 2;
      left = r.right + 8;
      if (left + tw > innerWidth - 6) left = r.left - tw - 8;
    } else {
      top = r.top - th - 6;
      left = r.right - tw;
    }
    if (top < 6) top = Math.min(r.bottom + 6, innerHeight - th - 6);
    tools.style.top = `${Math.max(6, Math.min(top, innerHeight - th - 6))}px`;
    tools.style.left = `${Math.max(6, Math.min(left, innerWidth - tw - 6))}px`;
  };

  const setActive = (el) => {
    active?.classList.remove("ed-active");
    active = el;
    if (!el) return tools.classList.remove("show");
    el.classList.add("ed-active");
    tools.querySelector("#ed-bt-lbl").textContent = nameFor(el);
    tools.querySelector('[data-op="link"]').style.display = el.matches("a") ? "" : "none";
    tools.classList.toggle("pinned", locked);
    tools.classList.add("show");
    place();
  };

  let hoverTimer = null;
  let locked = false;

  main.addEventListener("mouseover", (e) => {
    if (locked) return;
    const b = e.target.closest(BLOCK_SEL);
    if (!b || !main.contains(b) || b === active) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => setActive(b), 110);
  });
  // Moving the pointer onto the controls must never change what they act on.
  tools.addEventListener("mouseenter", () => clearTimeout(hoverTimer));

  // Click a block to pin it: nothing steals the selection until you unpin.
  main.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const b = e.target.closest(BLOCK_SEL);
    if (!b || !main.contains(b)) return;
    clearTimeout(hoverTimer);
    locked = true;
    setActive(b);
  });
  addEventListener("scroll", place, { passive: true });
  addEventListener("resize", place);

  tools.addEventListener("click", (e) => {
    const op = e.target.closest("[data-op]")?.dataset.op;
    if (!op || !active) return;

    if (op === "parent") {
      const up = active.parentElement?.closest(BLOCK_SEL);
      if (up && main.contains(up)) setActive(up);
      return;
    }
    if (op === "link") {
      const url = prompt("This button links to:", active.getAttribute("href") || "#");
      if (url !== null) { snapshot(); active.setAttribute("href", url); markDirty(); }
      return;
    }

    if (op === "up" || op === "down") {
      const sib = op === "up" ? active.previousElementSibling : active.nextElementSibling;
      if (!sib) return;
      snapshot();
      op === "up" ? sib.before(active) : sib.after(active);
      markDirty(); place();
      return;
    }

    if (op === "dupe") {
      snapshot();
      const copy = active.cloneNode(true);
      copy.querySelectorAll("[data-ed], [data-ed-block]").forEach((el) => {
        el.removeAttribute("data-ed"); el.removeAttribute("contenteditable");
        el.removeAttribute("data-ed-block"); el.classList.remove("ed-active");
      });
      copy.removeAttribute("data-ed"); copy.removeAttribute("contenteditable");
      copy.removeAttribute("data-ed-block"); copy.classList.remove("ed-active");
      active.after(copy);
      arm(); markDirty(); setActive(copy);
      return;
    }

    if (op === "text") return addTextAfter(active);
    if (op === "below") return truncateAfter(active);
    if (op === "del") removeActive();
  });

  function removeActive() {
    if (!active || !main.contains(active)) return;
    const big = active.matches("section, .petition, figure.evidence, .card, .reb-row");
    if (big && !confirm(`Delete this ${nameFor(active).toLowerCase()}? UNDO BLOCK brings it back.`)) return;
    snapshot();
    const gone = active;
    // Land on the neighbour so repeated deletes need no re-aiming.
    const next =
      gone.nextElementSibling?.closest(BLOCK_SEL) ||
      gone.previousElementSibling?.closest(BLOCK_SEL) ||
      gone.parentElement?.closest(BLOCK_SEL);
    gone.remove();
    markDirty();
    setActive(next && main.contains(next) ? next : null);
    if (panel.classList.contains("open")) renderPanel();
  }

  /* ---- typography ---- */
  // What the type controls act on: the pinned block, else whatever holds the caret.
  const target = () => {
    if (active && main.contains(active)) return active;
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el?.closest(BLOCK_SEL) || null;
  };

  const setFont = (cls) => {
    const el = target();
    if (!el) return say("Click the text you want to change first.");
    snapshot();
    FONTS.forEach(([c]) => c && el.classList.remove(c));
    if (cls) el.classList.add(cls);
    markDirty();
  };

  const currentStep = (el) => {
    for (let i = STEPS; i >= 1; i--) if (el.classList.contains(`s${i}`)) return i;
    // No explicit step yet: find the rung closest to how it already renders.
    const px = parseFloat(getComputedStyle(el).fontSize) || 18;
    const scale = [12, 13.5, 15, 16.5, 18, 20, 24, 30, 38, 48, 62];
    let best = 0;
    scale.forEach((v, i) => {
      if (Math.abs(v - px) < Math.abs(scale[best] - px)) best = i;
    });
    return best + 1;
  };

  const stepSize = (dir) => {
    const el = target();
    if (!el) return say("Click the text you want to resize first.");
    const next = Math.min(STEPS, Math.max(1, currentStep(el) + dir));
    snapshot();
    for (let i = 1; i <= STEPS; i++) el.classList.remove(`s${i}`);
    el.classList.add(`s${next}`);
    el.style.removeProperty("font-size"); // beat any inline size left in the markup
    markDirty();
    place();
    say(`size ${next} of ${STEPS}`);
  };

  /* ---- add a paragraph after a block ---- */
  const addTextAfter = (el) => {
    if (!el) return;
    snapshot();
    const para = document.createElement("p");
    para.textContent = "New text.";
    el.after(para);
    arm();
    markDirty();
    setActive(para);
    para.focus();
    const r = document.createRange();
    r.selectNodeContents(para);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    para.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /* ---- delete everything after a block ---- */
  const countAfter = (el) => {
    const all = [...main.querySelectorAll("*")];
    const i = all.indexOf(el);
    if (i < 0) return 0;
    return all.slice(i + 1).filter((n) => !el.contains(n)).length;
  };

  const truncateAfter = (el) => {
    if (!el || !main.contains(el)) return;
    const n = countAfter(el);
    if (!n) return say("Nothing below this to remove.");
    if (!confirm(
      `Delete everything below this ${nameFor(el).toLowerCase()}?\n\n` +
      `That removes ${n} element${n === 1 ? "" : "s"}, including the rest of this section ` +
      `and every section after it. UNDO BLOCK will bring it all back.`
    )) return;
    snapshot();
    let node = el;
    while (node && node !== main) {
      while (node.nextSibling) node.nextSibling.remove();
      node = node.parentElement;
    }
    markDirty();
    setActive(el);
    if (panel.classList.contains("open")) renderPanel();
    say(`removed ${n} elements below`);
  };

  /* ---- share preview (what Discord, Slack and iMessage show) ---- */
  const metaEl = (sel) => document.head.querySelector(sel);
  const metaVal = (sel) => metaEl(sel)?.getAttribute("content") || "";

  const meta = {
    title: document.title,
    description: metaVal('meta[name="description"]'),
    ogTitle: metaVal('meta[property="og:title"]'),
    ogDescription: metaVal('meta[property="og:description"]'),
  };
  const metaStart = JSON.stringify(meta);

  const share = document.createElement("aside");
  share.className = "ed-panel ed-share";
  share.innerHTML = `
    <h2>Link preview <span class="x" title="Close">&#10005;</span></h2>
    <p class="ed-intro">What people see when this link is pasted into Discord, Slack,
      Messages or a tweet. It comes from the page head, so editing the page itself
      never changes it.</p>
    <div class="ed-list">
      <div class="ed-mock">
        <img src="${metaVal('meta[property="og:image"]')}" alt="">
        <div class="ed-mock-t"></div>
        <div class="ed-mock-d"></div>
      </div>
      <label class="ed-f"><span>Preview headline</span>
        <input id="m-ogt" maxlength="90"></label>
      <label class="ed-f"><span>Preview text</span>
        <textarea id="m-ogd" rows="3" maxlength="200"></textarea></label>
      <label class="ed-f"><span>Browser tab title</span>
        <input id="m-title" maxlength="70"></label>
      <label class="ed-f"><span>Search-engine description</span>
        <textarea id="m-desc" rows="3" maxlength="300"></textarea></label>
      <p class="ed-intro" style="border:0">Discord remembers a preview for a while.
        To force it to look again, paste the link with <code>?v=2</code> on the end.</p>
    </div>`;
  document.body.append(share);

  const mOgt = share.querySelector("#m-ogt");
  const mOgd = share.querySelector("#m-ogd");
  const mTitle = share.querySelector("#m-title");
  const mDesc = share.querySelector("#m-desc");
  const mockT = share.querySelector(".ed-mock-t");
  const mockD = share.querySelector(".ed-mock-d");

  const paintMock = () => {
    mockT.textContent = meta.ogTitle || "(no headline)";
    mockD.textContent = meta.ogDescription || "(no text)";
  };

  const bindMeta = (el, key) => {
    el.value = meta[key];
    el.addEventListener("input", () => {
      meta[key] = el.value;
      paintMock();
      if (JSON.stringify(meta) !== metaStart) markDirty();
    });
  };
  bindMeta(mOgt, "ogTitle");
  bindMeta(mOgd, "ogDescription");
  bindMeta(mTitle, "title");
  bindMeta(mDesc, "description");
  paintMock();

  const toggleShare = (open) => {
    share.classList.toggle("open", open);
    shareBtn.classList.toggle("on", open);
    if (open) togglePanel(false);
  };
  share.querySelector(".x").addEventListener("click", () => toggleShare(false));

  /* ---- insert palette ---- */
  const palette = document.createElement("div");
  palette.className = "ed-add";
  palette.innerHTML =
    `<h3>Add a block</h3>` +
    BLOCKS.map((b) => `<button data-add="${b.id}"><span class="n">${b.name}</span><span class="d">${b.desc}</span></button>`).join("");
  document.body.append(palette);

  palette.addEventListener("click", (e) => {
    const id = e.target.closest("[data-add]")?.dataset.add;
    if (!id) return;
    const spec = BLOCKS.find((b) => b.id === id);
    const tpl = document.createElement("template");
    tpl.innerHTML = spec.html.trim();
    const node = tpl.content.firstElementChild;

    let placed = false;
    if (active && active.matches(spec.sel)) {          // same kind: drop it in after
      active.after(node); placed = true;
    } else {
      const host = active?.closest(spec.parent) || main.querySelector(spec.parent);
      if (host) { host.append(node); placed = true; }
    }
    if (!placed) {
      alert(`Nowhere to put a ${spec.name.toLowerCase()} yet. Hover the block you want it next to, then try again.`);
      return;
    }
    snapshot();
    arm(); markDirty(); togglePalette(false);
    setActive(node);
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("ed-flash");
    setTimeout(() => node.classList.remove("ed-flash"), 1200);
  });

  const togglePalette = (open) => {
    palette.classList.toggle("open", open);
    addBtn.classList.toggle("on", open);
  };

  addBtn.addEventListener("click", () => togglePalette(!palette.classList.contains("open")));
  shareBtn.addEventListener("click", () => toggleShare(!share.classList.contains("open")));
  undoBtn.addEventListener("click", undo);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { togglePalette(false); locked = false; setActive(null); }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      addTextAfter(target());
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      removeActive();
    }
  });

  try { document.execCommand("styleWithCSS", false, false); } catch {}
  baselineSize = loadedSize();
  arm();
  renderPanel();
})();
