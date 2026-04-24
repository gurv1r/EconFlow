from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import webbrowser
import os
import re


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("UPLEARN_SITE_PORT", "8000"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()

        ctype = self.guess_type(path)
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        fs = os.fstat(f.fileno())
        file_len = fs.st_size
        range_header = self.headers.get("Range")

        if not range_header:
            self.send_response(200)
            self.send_header("Content-type", ctype)
            self.send_header("Content-Length", str(file_len))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            return f

        match = re.match(r"bytes=(\d*)-(\d*)", range_header)
        if not match:
            self.send_error(416, "Invalid byte range")
            f.close()
            return None

        start_text, end_text = match.groups()
        start = int(start_text) if start_text else 0
        end = int(end_text) if end_text else file_len - 1
        end = min(end, file_len - 1)

        if start >= file_len or start > end:
            self.send_error(416, "Requested range not satisfiable")
            self.send_header("Content-Range", f"bytes */{file_len}")
            self.end_headers()
            f.close()
            return None

        self.send_response(206)
        self.send_header("Content-type", ctype)
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_len}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        f.seek(start)
        self.range = (start, end)
        return f

    def copyfile(self, source, outputfile):
        range_info = getattr(self, "range", None)
        if not range_info:
            return super().copyfile(source, outputfile)

        start, end = range_info
        remaining = end - start + 1
        bufsize = 64 * 1024
        while remaining > 0:
            chunk = source.read(min(bufsize, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)
        self.range = None


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/site/"
    print(f"Serving {ROOT} at {url}")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    server.serve_forever()
