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
  school:          "",   // 1. your school's name
  formEndpoint:    "",   // 2. where the sign-up form posts
  externalFormUrl: "",   // 2b. or a Google/Microsoft Form link
  signaturesUrl:   "data/signatures.json",
};
```

### 1. School name — required

Set `school: "Whatever Academy"`. It fills every `SCHOOL NAME` blank on the page.
Leave it empty and the blanks stay visible, which is fine while you're still drafting.

### 2. Collecting signatures — pick one

GitHub Pages is static hosting: there's no server, so the page can't store a
signature by itself. Two options, both free:

**a) Formspree (stays in-page, nicest)**
1. Sign up at [formspree.io](https://formspree.io), create a form
2. Copy the endpoint (`https://formspree.io/f/xxxxxxxx`) into `formEndpoint`
3. Submissions land in your inbox / Formspree dashboard

Free tier is 50 submissions/month. Fine for a school; if it fills up, switch to (b).

**b) Google Forms or Microsoft Forms (unlimited)**
1. Make a form with two questions: Name, Year/class
2. Paste its public link into `externalFormUrl` and leave `formEndpoint` empty
3. The sign button now sends people to that form

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
