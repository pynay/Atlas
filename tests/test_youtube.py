from unittest.mock import MagicMock, patch

import pytest

from app.services.youtube import YouTubeDownloadError, download_to_tmp


def _make_fake_ydl(extract_info_return, prepare_filename_return):
    ydl = MagicMock()
    ydl.__enter__.return_value = ydl
    ydl.__exit__.return_value = None
    ydl.extract_info.return_value = extract_info_return
    ydl.prepare_filename.return_value = prepare_filename_return
    return ydl


@pytest.mark.asyncio
async def test_download_to_tmp_returns_local_path(tmp_path):
    real_file = tmp_path / "abc.mp4"
    real_file.write_bytes(b"fake mp4")

    fake_ydl = _make_fake_ydl(
        extract_info_return={"id": "abc", "ext": "mp4"},
        prepare_filename_return=str(real_file),
    )

    with patch("app.services.youtube.yt_dlp.YoutubeDL", return_value=fake_ydl):
        path = await download_to_tmp("https://youtu.be/abc")

    assert path == str(real_file)
    fake_ydl.extract_info.assert_called_once_with("https://youtu.be/abc", download=True)


@pytest.mark.asyncio
async def test_download_rejects_playlist_only_url():
    fake_ydl = _make_fake_ydl(
        extract_info_return={"_type": "playlist", "entries": []},
        prepare_filename_return="/should/not/be/used.NA",
    )
    with patch("app.services.youtube.yt_dlp.YoutubeDL", return_value=fake_ydl):
        with pytest.raises(YouTubeDownloadError, match="playlist"):
            await download_to_tmp("https://youtube.com/playlist?list=PLxyz")


@pytest.mark.asyncio
async def test_download_passes_noplaylist_option():
    fake_ydl_class = MagicMock()
    instance = _make_fake_ydl(
        extract_info_return={"id": "abc", "ext": "mp4"},
        prepare_filename_return="",  # we won't reach the file check; will raise
    )
    fake_ydl_class.return_value = instance

    with patch("app.services.youtube.yt_dlp.YoutubeDL", fake_ydl_class):
        with pytest.raises(YouTubeDownloadError):
            await download_to_tmp("https://youtu.be/abc")

    opts = fake_ydl_class.call_args.args[0]
    assert opts.get("noplaylist") is True


@pytest.mark.asyncio
async def test_download_raises_when_yt_dlp_returns_missing_file():
    fake_ydl = _make_fake_ydl(
        extract_info_return={"id": "abc", "ext": "mp4"},
        prepare_filename_return="/definitely/does/not/exist.mp4",
    )
    with patch("app.services.youtube.yt_dlp.YoutubeDL", return_value=fake_ydl):
        with pytest.raises(YouTubeDownloadError, match="produced no file"):
            await download_to_tmp("https://youtu.be/abc")
