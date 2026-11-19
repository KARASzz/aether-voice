#!/usr/bin/env python3
"""Local static server with a private environment configuration endpoint."""
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == '/local-config.js':
            key = os.environ.get('AETHER_API_KEY', '')
            env = ROOT / '.env'
            if not key and env.is_file():
                for line in env.read_text(encoding='utf-8').splitlines():
                    if line.startswith('AETHER_API_KEY='):
                        key = line.partition('=')[2].strip().strip('"\'')
                        break
            data = ('window.AETHER_API_KEY = ' + json.dumps(key) + ';\n').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if any(part.startswith('.') for part in path.split('/') if part):
            self.send_error  (404)
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path.split('?', 1)[0] == '/local-config.js' or any(part.startswith('.') for part in unquote(urlsplit(self.path).path).split('/') if part):
            self.send_error(404)
            return
        super().do_HEAD()

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), Handler).serve_forever()
