from unittest.mock import MagicMock, patch

import pytest

from app.services.youtube import download_to_tmp


@pytest.mark.asyncio
async def test_download_to_tmp_returns_local_path():
    fake_ydl = MagicMock()
    fake_ydl.__enter__.return_value = fake_ydl
    fake_ydl.__exit__.return_value = None
    fake_ydl.extract_info.return_value = {"id": "abc", "ext": "mp4"}
    fake_ydl.prepare_filename.return_value = "/tmp/cliff_dl_xyz/abc.mp4"

    with patch("app.services.youtube.yt_dlp.YoutubeDL", return_value=fake_ydl):
        path = await download_to_tmp("https://youtu.be/abc")

    assert path == "/tmp/cliff_dl_xyz/abc.mp4"
    fake_ydl.extract_info.assert_called_once_with("https://youtu.be/abc", download=True)
