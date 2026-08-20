# The Copilot Exception

A student campaign site: our school blocked every AI tool except Microsoft Copilot,
and we'd like the decision made properly — in writing, by a person.

**Live site:** https://schappiplays.github.io/protest/

Static HTML/CSS/JS. No build step, no dependencies, no framework.

---

## Set it up (5 minutes)

Everything configurable lives at the top of [`assets/app.js`](assets/app.js):

```js
const CONFIG = {
  school:          "",           // 1. your school's name
  signupProvider:  "web3forms",  // 2. "web3forms" | "formspree" | ""
  signupKey:       "",           //    the access key or endpoint
  goatcounterCode: "",           // 3. optional cookieless analytics
  signaturesUrl:   "data/signatures.json",
};
```

### 1. School name — required

Set `school: "Whatever Academy"`. It fills every `SCHOOL NAME` blank on the page.
Leave it empty and the blanks stay visible, which is fine while you're still drafting.

### 2. Collecting signatures — pick one

GitHub Pages is static hosting: there's no server, so the page can't store a
signature by itself. Both options below are free, keep people on the site, and
are owned by neither Microsoft nor Google.

**a) Web3Forms (recommended — unlimited, free)**
1. Go to [web3forms.com](https://web3forms.com), enter your email, get an access key
   (no account to create)
2. `signupProvider: "web3forms"` and paste the key into `signupKey`
3. Signatures arrive in your inbox

**b) Formspree**
1. Sign up at [formspree.io](https://formspree.io), create a form
2. `signupProvider: "formspree"` and paste the full endpoint
   (`https://formspree.io/f/xxxxxxxx`) into `signupKey`
3. Free tier is 50 submissions/month

Set `signupProvider: ""` to switch signing off entirely.

### 2c. Analytics — optional

`goatcounterCode` loads [GoatCounter](https://www.goatcounter.com): free for
non-commercial use, open source, **no cookies and no personal data**, so the site
needs no consent banner. Sign up, then put your site code (the `yourcode` in
`yourcode.goatcounter.com`) in `CONFIG.goatcounterCode`. Leave it `""` and no
analytics script loads at all.

Deliberately not Google Analytics: it sets cookies, needs a consent banner, and
hands a privacy argument to the people you're arguing with.

### 3. Publishing signatures

Names on the page come from [`data/signatures.json`](data/signatures.json), so you
review before anyone appears publicly. Add one:

```bash
python3 scripts/sign.py "Marcus T" "Y12 · CS"
git add data/signatures.json && git commit -m "Add signature" && git push
```

`python3 scripts/sign.py --list` prints the current roster. Duplicate names are
skipped. GitHub Pages redeploys on push, usually within a minute.

---

## Deploying

Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)` → Save.

`.nojekyll` is already committed, which stops GitHub trying to run Jekyll over it.

If you move the repo or use a custom domain, update the four absolute URLs in
`index.html`'s `<head>` (`og:url`, `og:image`, `twitter:image`, `canonical`) —
social previews need absolute URLs and won't work with relative paths.

## Editing the site without touching HTML

```bash
python3 scripts/edit.py
```

Opens http://localhost:4000 with an editing toolbar along the bottom. Click any
text and type. The toolbar gives you **bold**, *italic*, underline, strike
through, the yellow highlighter, the handwritten margin-note style, and links —
with ⌘B / ⌘I / ⌘U / ⌘K / ⌘H as shortcuts.

- **BLOCKS** mode (the default) lets you rewrite existing text. Enter makes a
  line break, so you can't accidentally break the layout.
- **FREE EDIT** makes the whole page editable, so you can add and delete whole
  sections. More power, easier to make a mess.
- **SAVE** (⌘S) writes straight back to `index.html` and drops a timestamped
  copy of the previous version in `.backups/` first. Then commit and push.

### The AI TELLS panel

Click **AI TELLS** for a list of the habits that make writing read as
machine-generated: em dashes, "it isn't X, it's Y" flips, three-item lists,
"not just … but", words nobody says out loud, semicolons. Click a group to
highlight every instance in the page, click a line to jump to it.

It's a nagging tool, not a grader. A flag means "a person probably wouldn't
have written it that way" — you decide. Getting the count to zero doesn't make
the writing good, it just stops it sounding like it came out of a machine.

The editor is injected by `scripts/edit.py` and never ships to the live site.

## Local preview

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly with `file://`
won't work — the browser blocks the `fetch` that loads the signature list.

---

## Editing the content

| What | Where |
|---|---|
| Headline, block-notice card | `index.html` — hero `<section>` |
| The three demands | `index.html` — `<ol class="demands">` |
| Rebuttals ("they say / the problem with that") | `index.html` — `<div class="reb">` |
| Email template | `index.html` — `<pre class="email">` |
| Escalation ladder | `index.html` — `<ol class="ladder">` |
| Colours, type, spacing | `assets/style.css` — `:root` tokens at the top |
| Social preview image | `assets/og.png` (1200×630) |

Colours are CSS custom properties defined once and reused; changing `--denied`
or `--hl` in `:root` (and the two dark-theme blocks below it) restyles the whole
site.

---

## House rules

This campaign argues that a **policy** was made badly. It does not name, blame or
target any member of staff, and it doesn't tell anyone to bypass a network
control. Both of those turn a policy argument into a disciplinary matter, which
is the one reliable way to lose. Keep contributions on the same footing.
