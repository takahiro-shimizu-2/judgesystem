# coding: utf-8
"""
非同期HTTPクライアント — ホスト別レートリミット付き

Issue #189: 公告取得・PDF取得の並列化
- httpx.AsyncClient ベース
- ホストごとの asyncio.Semaphore で同時接続数を制限
- ホストごとのリクエスト間隔制御
- robots.txt 準拠チェック
- Last-Modified / ETag による差分チェック
"""

import asyncio
import json
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx


# --------------------------------------------------------------------------- #
# デフォルト設定
# --------------------------------------------------------------------------- #
DEFAULT_MAX_CONNECTIONS_PER_HOST = 2
DEFAULT_REQUEST_INTERVAL = 3.0  # 秒
DEFAULT_GLOBAL_MAX_CONNECTIONS = 20
DEFAULT_TIMEOUT = 30.0  # 秒

DEFAULT_HEADERS = {
    "User-Agent": (
        "JudgeSystemBot/1.0 "
        "(+https://github.com/takahiro-shimizu-2/judgesystem; "
        "bid eligibility crawler)"
    ),
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


# --------------------------------------------------------------------------- #
# レートリミット設定の読み込み
# --------------------------------------------------------------------------- #
def load_rate_limits(config_path: Optional[Path] = None) -> dict:
    """
    ホストごとのレートリミット設定を読み込む。

    設定ファイルの形式:
    {
      "defaults": {"max_connections": 2, "interval": 3.0},
      "hosts": {
        "www.mod.go.jp": {"max_connections": 1, "interval": 5.0},
        "www.chotatujoho.go.jp": {"max_connections": 2, "interval": 3.0}
      }
    }
    """
    if config_path is None:
        config_path = Path(__file__).parent.parent.parent.parent / "config" / "rate_limits.json"

    if config_path.exists():
        with open(config_path, encoding="utf-8") as f:
            return json.load(f)

    return {
        "defaults": {
            "max_connections": DEFAULT_MAX_CONNECTIONS_PER_HOST,
            "interval": DEFAULT_REQUEST_INTERVAL,
        },
        "hosts": {},
    }


# --------------------------------------------------------------------------- #
# HostRateLimiter — ホスト単位のレート制御
# --------------------------------------------------------------------------- #
class HostRateLimiter:
    """ホストごとの同時接続数 + リクエスト間隔を制御"""

    def __init__(self, config: Optional[dict] = None):
        self._config = config or load_rate_limits()
        self._defaults = self._config.get("defaults", {})
        self._host_configs = self._config.get("hosts", {})
        self._semaphores: dict[str, asyncio.Semaphore] = {}
        self._last_request: dict[str, float] = {}
        self._lock = asyncio.Lock()

    def _get_host_config(self, host: str) -> dict:
        return self._host_configs.get(host, self._defaults)

    async def _get_semaphore(self, host: str) -> asyncio.Semaphore:
        async with self._lock:
            if host not in self._semaphores:
                cfg = self._get_host_config(host)
                max_conn = cfg.get("max_connections", DEFAULT_MAX_CONNECTIONS_PER_HOST)
                self._semaphores[host] = asyncio.Semaphore(max_conn)
            return self._semaphores[host]

    async def acquire(self, host: str) -> None:
        sem = await self._get_semaphore(host)
        await sem.acquire()

        # リクエスト間隔の制御
        cfg = self._get_host_config(host)
        interval = cfg.get("interval", DEFAULT_REQUEST_INTERVAL)

        async with self._lock:
            last = self._last_request.get(host, 0.0)
            elapsed = time.monotonic() - last
            if elapsed < interval:
                await asyncio.sleep(interval - elapsed)
            self._last_request[host] = time.monotonic()

    def release(self, host: str) -> None:
        if host in self._semaphores:
            self._semaphores[host].release()


# --------------------------------------------------------------------------- #
# RobotsChecker — robots.txt 準拠チェック
# --------------------------------------------------------------------------- #
class RobotsChecker:
    """robots.txt をキャッシュして URL のクロール可否を判定"""

    def __init__(self, user_agent: str = "JudgeSystemBot"):
        self._user_agent = user_agent
        self._parsers: dict[str, Optional[RobotFileParser]] = {}
        self._lock = asyncio.Lock()

    async def is_allowed(self, url: str, client: httpx.AsyncClient) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"

        async with self._lock:
            if origin not in self._parsers:
                self._parsers[origin] = await self._fetch_robots(origin, client)

        parser = self._parsers[origin]
        if parser is None:
            return True  # robots.txt が取得できなければ許可
        return parser.can_fetch(self._user_agent, url)

    async def _fetch_robots(
        self, origin: str, client: httpx.AsyncClient
    ) -> Optional[RobotFileParser]:
        robots_url = f"{origin}/robots.txt"
        try:
            resp = await client.get(robots_url, timeout=10.0)
            if resp.status_code == 200:
                rp = RobotFileParser()
                rp.parse(resp.text.splitlines())
                return rp
        except (httpx.HTTPError, httpx.TimeoutException):
            pass
        return None


# --------------------------------------------------------------------------- #
# DiffChecker — HEAD リクエストで更新有無を判定
# --------------------------------------------------------------------------- #
class DiffChecker:
    """Last-Modified / ETag による差分チェック"""

    def __init__(self):
        self._cache: dict[str, dict[str, str]] = {}

    async def has_changed(self, url: str, client: httpx.AsyncClient) -> bool:
        """
        HEAD リクエストで更新有無を判定。
        初回は常に True を返す。
        """
        cached = self._cache.get(url)
        if cached is None:
            # 初回 — HEAD で情報取得して True を返す
            await self._update_cache(url, client)
            return True

        try:
            headers: dict[str, str] = {}
            if "etag" in cached:
                headers["If-None-Match"] = cached["etag"]
            if "last_modified" in cached:
                headers["If-Modified-Since"] = cached["last_modified"]

            resp = await client.head(url, headers=headers, timeout=10.0)

            if resp.status_code == 304:
                return False

            # 更新あり — キャッシュ更新
            self._update_from_response(url, resp)
            return True

        except (httpx.HTTPError, httpx.TimeoutException):
            return True  # エラー時は安全側で True

    async def _update_cache(self, url: str, client: httpx.AsyncClient) -> None:
        try:
            resp = await client.head(url, timeout=10.0)
            self._update_from_response(url, resp)
        except (httpx.HTTPError, httpx.TimeoutException):
            pass

    def _update_from_response(self, url: str, resp: httpx.Response) -> None:
        entry: dict[str, str] = {}
        if "etag" in resp.headers:
            entry["etag"] = resp.headers["etag"]
        if "last-modified" in resp.headers:
            entry["last_modified"] = resp.headers["last-modified"]
        if entry:
            self._cache[url] = entry


# --------------------------------------------------------------------------- #
# AsyncFetcher — 統合フェッチャー
# --------------------------------------------------------------------------- #
class AsyncFetcher:
    """
    ホスト別レートリミット + robots.txt + 差分チェック付きの非同期フェッチャー。

    使い方:
        async with AsyncFetcher() as fetcher:
            html = await fetcher.get_text(url)
            data = await fetcher.get_bytes(url)
    """

    def __init__(
        self,
        rate_config: Optional[dict] = None,
        check_robots: bool = True,
        check_diff: bool = False,
    ):
        self._rate_limiter = HostRateLimiter(rate_config)
        self._robots = RobotsChecker() if check_robots else None
        self._diff_checker = DiffChecker() if check_diff else None
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(
            headers=DEFAULT_HEADERS,
            timeout=httpx.Timeout(DEFAULT_TIMEOUT),
            follow_redirects=True,
            limits=httpx.Limits(
                max_connections=DEFAULT_GLOBAL_MAX_CONNECTIONS,
                max_keepalive_connections=10,
            ),
        )
        return self

    async def __aexit__(self, *exc):
        if self._client:
            await self._client.aclose()
        return False

    async def get_text(self, url: str, **kwargs) -> Optional[str]:
        """URLからテキストを取得。robots.txt/レートリミット適用。"""
        resp = await self._request("GET", url, **kwargs)
        return resp.text if resp else None

    async def get_bytes(self, url: str, **kwargs) -> Optional[bytes]:
        """URLからバイナリを取得。robots.txt/レートリミット適用。"""
        resp = await self._request("GET", url, **kwargs)
        return resp.content if resp else None

    async def head(self, url: str, **kwargs) -> Optional[httpx.Response]:
        """HEADリクエスト。"""
        return await self._request("HEAD", url, **kwargs)

    async def has_changed(self, url: str) -> bool:
        """差分チェック（DiffChecker有効時のみ）。"""
        if self._diff_checker and self._client:
            return await self._diff_checker.has_changed(url, self._client)
        return True

    async def _request(
        self, method: str, url: str, **kwargs
    ) -> Optional[httpx.Response]:
        if not self._client:
            raise RuntimeError("AsyncFetcher must be used as async context manager")

        host = urlparse(url).hostname or "unknown"

        # robots.txt チェック
        if self._robots:
            if not await self._robots.is_allowed(url, self._client):
                return None

        # レートリミット
        await self._rate_limiter.acquire(host)
        try:
            resp = await self._client.request(method, url, **kwargs)
            resp.raise_for_status()
            return resp
        except (httpx.HTTPStatusError, httpx.HTTPError, httpx.TimeoutException) as e:
            # 呼び出し元でエラーハンドリングするため None を返す
            return None
        finally:
            self._rate_limiter.release(host)
