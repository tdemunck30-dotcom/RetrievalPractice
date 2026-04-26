from __future__ import annotations

import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import uvicorn
import webview

def runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


PROJECT_ROOT = runtime_root()
os.environ.setdefault("TOETSING_BASE_DIR", str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

from app import app as toetsing_app


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_server(url: str, timeout_seconds: float = 20.0) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2.0) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            time.sleep(0.2)
    raise RuntimeError(f"Toetsing startte niet op tijd op {url}.")


def start_server(port: int) -> tuple[uvicorn.Server, threading.Thread]:
    config = uvicorn.Config(
        toetsing_app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server.install_signal_handlers = lambda: None  # type: ignore[method-assign]
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    return server, thread


def stop_server(server: uvicorn.Server, thread: threading.Thread) -> None:
    server.should_exit = True
    thread.join(timeout=5.0)


def main() -> int:
    port = find_free_port()
    url = f"http://127.0.0.1:{port}/"
    server, thread = start_server(port)

    try:
        wait_for_server(url)
    except Exception as exc:
        stop_server(server, thread)
        raise exc

    if "--smoke-test" in sys.argv:
        print(f"SMOKE_OK {url}")
        stop_server(server, thread)
        return 0

    try:
        webview.create_window(
            title="Toetsing",
            url=url,
            width=1400,
            height=920,
            min_size=(1100, 720),
        )
        webview.start()
    finally:
        stop_server(server, thread)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
