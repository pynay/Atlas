'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface Props {
  src: string;
  /** Optional: seek to this timestamp (seconds) on demand */
  seekTo?: number;
  /** Optional: notified on every native timeupdate (~4Hz) with the current playback time in seconds */
  onTimeUpdate?: (current: number) => void;
}

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AtlasPlayer({ src, seekTo, onTimeUpdate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Attach HLS source
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setLoading(true);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => setLoading(false));
      return () => hls.destroy();
    }
  }, [src]);

  // Wire up native video events
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setCurrent(v.currentTime);
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1));
      }
      onTimeUpdateRef.current?.(v.currentTime);
    };
    const onMeta = () => setDuration(v.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('canplay', onCanPlay);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('canplay', onCanPlay);
    };
  }, []);

  // External seek (e.g. clicking a source-clip chip)
  useEffect(() => {
    if (typeof seekTo === 'number' && videoRef.current) {
      videoRef.current.currentTime = seekTo;
      videoRef.current.play().catch(() => {});
    }
  }, [seekTo]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * duration;
  }

  function toggleFullscreen() {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  function bumpControls() {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 2500);
    }
  }

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full bg-black group select-none cursor-default"
      onMouseMove={bumpControls}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        onClick={togglePlay}
        playsInline
      />

      {/* Loading shimmer */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border border-white/10 rounded-full">
            <div
              className="w-full h-full border-t border-white/60 rounded-full animate-spin"
              style={{ animationDuration: '0.9s' }}
            />
          </div>
        </div>
      )}

      {/* Big play overlay when paused */}
      {!playing && !loading && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
        >
          <div className="w-16 h-16 border border-white/40 flex items-center justify-center backdrop-blur-sm bg-black/30 hover:border-white transition-colors">
            <span className="text-white text-2xl ml-1">▶</span>
          </div>
        </button>
      )}

      {/* Controls — appear on hover or when paused */}
      <div
        className={`absolute left-0 right-0 bottom-0 px-3 py-2.5 transition-opacity duration-200 ${
          showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.4) 60%, transparent)',
        }}
      >
        {/* Scrubber */}
        <div
          className="relative w-full h-1 bg-white/15 cursor-pointer mb-2 group/bar"
          onClick={handleSeek}
        >
          <div className="absolute top-0 left-0 h-full bg-white/25" style={{ width: `${bufPct}%` }} />
          <div className="absolute top-0 left-0 h-full bg-white" style={{ width: `${pct}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white opacity-0 group-hover/bar:opacity-100 transition-opacity"
            style={{ left: `calc(${pct}% - 4px)` }}
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 font-mono text-[10px] text-white/80">
          <button
            onClick={togglePlay}
            className="hover:text-white transition-colors w-5 text-center"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            onClick={toggleMute}
            className="hover:text-white transition-colors w-5 text-center"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '✕' : '♪'}
          </button>
          <span className="tabular-nums tracking-wider">
            {fmt(current)} <span className="text-white/30">/</span> {fmt(duration)}
          </span>
          <div className="flex-1" />
          <button
            onClick={toggleFullscreen}
            className="hover:text-white transition-colors w-5 text-center"
            aria-label="Fullscreen"
          >
            ⤢
          </button>
        </div>
      </div>
    </div>
  );
}
