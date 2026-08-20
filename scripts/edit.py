#!/usr/bin/env python3
"""Local editor for the campaign site.

    python3 scripts/edit.py

Opens a server at http://localhost:4000 that serves the site with an editing
toolbar attached. Click any text to change it. Save writes straight back to
index.html, keeping a timestamped backup in .backups/ first.

Nothing in here ships to the live site — the editor is injected by this
server only. The published page never loads it.
"""
import errno
import http.server
import json
import pathlib
import re
import shutil
import socketserver
import subprocess
import sys
import webbrowser
from datetime import datetime
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDITOR = ROOT / "scripts" / "editor"
INDEX = ROOT / "index.html"
BACKUPS = ROOT / ".backups"
PORT = 4000
LIVE_URL = "https://schappistudios.github.io/protest/"

INJECT = (
    '<link rel="stylesheet" href="/__editor/editor.css">\n'
    '<script src="/__editor/editor.js" defer></script>\n'
)


def git(*args, timeout=90):
    return subprocess.run(
        ["git", "-C", str(ROOT), *args], capture_output=True, text=True, timeout=timeout
    )


def publish():
    """Commit whatever changed and push it. Never raises — the caller reports."""
    try:
        name = git("config", "user.name").stdout.strip() or "SchappiStudios"
        email = git("config", "user.email").stdout.strip() or "marcus@chickcom.com"

        if git("add", "-A").returncode:
            return {"ok": False, "error": "git add failed"}

        if not git("status", "--porcelain").stdout.strip():
            # File written but identical to what is already committed.
            ahead = git("rev-list", "--count", "@{u}..HEAD").stdout.strip()
            if ahead and ahead != "0":
                pushed = git("push", "origin", "HEAD")
                if pushed.returncode:
                    return {"ok": False, "error": pushed.stderr.strip()[:300]}
                return {"ok": True, "url": LIVE_URL}
            return {"ok": True, "note": "no change to publish"}

        committed = git(
            "-c", f"user.name={name}", "-c", f"user.email={email}",
            "commit", "-m", "Update the campaign page",
        )
        if committed.returncode:
            return {"ok": False, "error": (committed.stderr or committed.stdout).strip()[:300]}

        pushed = git("push", "origin", "HEAD")
        if pushed.returncode:
            return {
                "ok": False,
                "committed": True,
                "error": (pushed.stderr or pushed.stdout).strip()[:300],
            }
        return {"ok": True, "url": LIVE_URL}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "git took too long — check your connection"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:300]}


META_FIELDS = {
    "ogTitle": [('property', 'og:title'), ('name', 'twitter:title'), ('property', 'og:site_name')],
    "ogDescription": [('property', 'og:description'), ('name', 'twitter:description')],
    "description": [('name', 'description')],
}


def apply_meta(html: str, meta: dict) -> str:
    """Rewrite the share-preview tags in <head>. Values are escaped for an attribute."""
    def esc(v):
        return (v.replace("&", "&amp;").replace('"', "&quot;")
                 .replace("<", "&lt;").replace(">", "&gt;"))

    if meta.get("title"):
        html = re.sub(r"<title>[^<]*</title>",
                      f"<title>{esc(meta['title'])}</title>", html, count=1)

    for key, targets in META_FIELDS.items():
        val = meta.get(key)
        if not val:
            continue
        for attr, name in targets:
            pat = re.compile(rf'(<meta {attr}="{re.escape(name)}" content=")[^"]*(")')
            html = pat.sub(lambda m: m.group(1) + esc(val) + m.group(2), html, count=1)
    return html


def splice_main(original: str, new_inner: str) -> str:
    """Replace the contents of <main>…</main>, leaving the rest of the file alone."""
    open_at = original.index("<main")
    body_at = original.index(">", open_at) + 1
    close_at = original.rindex("</main>")
    return original[:body_at] + "\n" + new_inner.strip() + "\n" + original[close_at:]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):  # quieter console
        first = str(args[0]) if args else ""
        if "__save" in first:
            sys.stderr.write("  saved index.html\n")

    def do_GET(self):
        path = urlparse(self.path).path

        if path.startswith("/__editor/"):
            name = path.split("/__editor/", 1)[1]
            target = EDITOR / name
            if not target.is_file() or EDITOR not in target.resolve().parents:
                self.send_error(404)
                return
            ctype = "text/css" if name.endswith(".css") else "application/javascript"
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", f"{ctype}; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return

        if path in ("/", "/index.html"):
            rev = str(INDEX.stat().st_mtime_ns)
            stamp = f'<meta name="ed-rev" content="{rev}">\n'
            html = INDEX.read_text(encoding="utf-8").replace("</body>", stamp + INJECT + "</body>")
            data = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return

        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/__save":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            inner = payload["main"]
            if not isinstance(inner, str) or len(inner) < 200:
                raise ValueError("refusing to save suspiciously small content")

            rev = str(payload.get("rev", ""))
            current = str(INDEX.stat().st_mtime_ns)
            if rev and rev != current:
                raise ValueError(
                    "index.html changed on disk since this tab loaded it. "
                    "Your text is still on screen — copy anything you need, "
                    "then reload to get the newer file."
                )

            BACKUPS.mkdir(exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            shutil.copy2(INDEX, BACKUPS / f"index-{stamp}.html")

            updated = splice_main(INDEX.read_text(encoding="utf-8"), inner)
            if isinstance(payload.get("meta"), dict):
                updated = apply_meta(updated, payload["meta"])
            INDEX.write_text(updated, encoding="utf-8")

            result = {
                "ok": True,
                "backup": f".backups/index-{stamp}.html",
                "rev": str(INDEX.stat().st_mtime_ns),
            }
            if payload.get("publish"):
                result["published"] = publish()
                # publishing commits the file, which does not alter it on disk,
                # but re-read the revision so the tab stays in sync either way
                result["rev"] = str(INDEX.stat().st_mtime_ns)
            body = json.dumps(result).encode()
            self.send_response(200)
        except Exception as exc:  # report the reason back into the toolbar
            body = json.dumps({"ok": False, "error": str(exc)}).encode()
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def start():
    """Bind the first free port from PORT upwards, so a stale copy never blocks you."""
    for port in range(PORT, PORT + 10):
        try:
            return Server(("127.0.0.1", port), Handler), port
        except OSError as exc:
            if exc.errno != errno.EADDRINUSE:
                raise
            if port == PORT:
                print(f"\n  Port {PORT} is already in use — something is still running.")
                print(f"  To reclaim it:  lsof -ti :{PORT} | xargs kill -9")
                print("  Trying the next port instead…")
    print(f"\n  Ports {PORT}-{PORT + 9} are all in use. Free one and try again.\n")
    raise SystemExit(1)


if __name__ == "__main__":
    httpd, port = start()
    url = f"http://localhost:{port}/"
    print(f"\n  Editing {INDEX.name}")
    print(f"  {url}")
    print("  Backups land in .backups/ — Ctrl+C to stop.\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        with httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.\n")
