#!/usr/bin/env python3
"""Local editor for the campaign site.

    python3 scripts/edit.py

Opens a server at http://localhost:4000 that serves the site with an editing
toolbar attached. Click any text to change it. Save writes straight back to
index.html, keeping a timestamped backup in .backups/ first.

Nothing in here ships to the live site — the editor is injected by this
server only. The published page never loads it.
"""
import http.server
import json
import pathlib
import shutil
import socketserver
import sys
import webbrowser
from datetime import datetime
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDITOR = ROOT / "scripts" / "editor"
INDEX = ROOT / "index.html"
BACKUPS = ROOT / ".backups"
PORT = 4000

INJECT = (
    '<link rel="stylesheet" href="/__editor/editor.css">\n'
    '<script src="/__editor/editor.js" defer></script>\n'
)


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
            html = INDEX.read_text(encoding="utf-8").replace("</body>", INJECT + "</body>")
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

            BACKUPS.mkdir(exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            shutil.copy2(INDEX, BACKUPS / f"index-{stamp}.html")

            INDEX.write_text(splice_main(INDEX.read_text(encoding="utf-8"), inner), encoding="utf-8")

            body = json.dumps({"ok": True, "backup": f".backups/index-{stamp}.html"}).encode()
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


if __name__ == "__main__":
    url = f"http://localhost:{PORT}/"
    print(f"\n  Editing {INDEX.name}")
    print(f"  {url}")
    print("  Backups land in .backups/ — Ctrl+C to stop.\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        with Server(("127.0.0.1", PORT), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.\n")
