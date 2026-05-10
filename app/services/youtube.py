import asyncio
import os
import tempfile
from pathlib import Path

import yt_dlp

from app.config import get_settings


class YouTubeDownloadError(RuntimeError):
    pass


def _download_blocking(url: str, out_dir: str) -> str:
    opts: dict = {
        "outtmpl": str(Path(out_dir) / "%(id)s.%(ext)s"),
        "format": "mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        # Treat URLs like `?v=X&list=Y` as the single video X, not the playlist.
        "noplaylist": True,
    }
    cookies_browser = get_settings().youtube_cookies_browser.strip().lower()
    if cookies_browser:
        # yt-dlp expects a tuple: (browser, profile|None, keyring|None, container|None).
        # Pass just the browser name; yt-dlp picks the default profile.
        opts["cookiesfrombrowser"] = (cookies_browser,)
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        # Some playlist-only URLs (no `v=` param) come back as a playlist info
        # dict with no downloadable entry and prepare_filename produces a `.NA`
        # path that doesn't exist on disk. Surface a clear error instead.
        if info is None or info.get("_type") == "playlist":
            raise YouTubeDownloadError(
                "URL points at a playlist, not a single video. "
                "Paste a link that includes the `?v=...` video id."
            )
        path = ydl.prepare_filename(info)
    if not os.path.isfile(path):
        raise YouTubeDownloadError(
            f"yt-dlp produced no file at {path!r} (is this a playable single video?)"
        )
    return path


async def download_to_tmp(url: str) -> str:
    """Download `url` with yt-dlp into a fresh tempdir; return the local file path."""
    out_dir = tempfile.mkdtemp(prefix="cliff_dl_")
    return await asyncio.to_thread(_download_blocking, url, out_dir)
