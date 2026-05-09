import asyncio
import tempfile
from pathlib import Path

import yt_dlp


def _download_blocking(url: str, out_dir: str) -> str:
    opts = {
        "outtmpl": str(Path(out_dir) / "%(id)s.%(ext)s"),
        "format": "mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        path = ydl.prepare_filename(info)
    return path


async def download_to_tmp(url: str) -> str:
    """Download `url` with yt-dlp into a fresh tempdir; return the local file path."""
    out_dir = tempfile.mkdtemp(prefix="cliff_dl_")
    return await asyncio.to_thread(_download_blocking, url, out_dir)
