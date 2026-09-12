#!/usr/bin/env python3
"""climbing-proto 用の静的サーバ。

python3 -m http.server は Cache-Control を付けないため、ブラウザが古い JS/glTF を
掴んで「直したのに変わらない」という事故が起きる。ここでは no-store を必ず返す。

    python3 tools/serve.py [port]
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.gltf': 'model/gltf+json',
        '.glb': 'model/gltf-binary',
        '.bvh': 'text/plain',
        '.svg': 'image/svg+xml',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '404' in (args[1] if len(args) > 1 else ''):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'serving {ROOT} at http://localhost:{port}/  (no-store)')
        httpd.serve_forever()
