'use client';

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getVideo, createConversation, type VideoResponse } from '@/lib/api';

const TAGLINES = [
  'Atlas is holding up your education.',
  'Mapping every moment of your video.',
  'Turning lectures into conversations.',
  'Building your personal knowledge base.',
  'Indexing so you never miss a detail.',
  'Your AI study partner is getting ready.',
  'Grounding every answer in your video.',
  'Knowledge, timestamped and searchable.',
  'Atlas never drops the world.',
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'QUEUED',
  indexing: 'INDEXING',
  ready: 'READY',
  failed: 'FAILED',
};

export default function VideoLoadingPage() {
  const router = useRouter();
  const params = useParams();
  const videoId = Number(params.id);

  const [video, setVideo] = useState<VideoResponse | null>(null);
  const [error, setError] = useState('');
  const [taglineIdx, setTaglineIdx] = useState(0);
  const [taglineFade, setTaglineFade] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setTaglineFade(false);
      setTimeout(() => {
        setTaglineIdx(i => (i + 1) % TAGLINES.length);
        setTaglineFade(true);
      }, 400);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const v = await getVideo(videoId);
        if (cancelled) return;
        setVideo(v);

        if (v.status === 'ready') {
          const conv = await createConversation(v.id);
          if (!cancelled) router.push(`/conversations/${conv.id}`);
          return;
        }

        if (v.status === 'failed') {
          setError(v.error ?? 'Indexing failed');
          return;
        }

        setTimeout(tick, 3000);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unexpected error');
      }
    }

    tick();
    return () => { cancelled = true; };
  }, [videoId, router]);

  const status = video?.status ?? 'pending';
  const label = STATUS_LABEL[status] ?? status.toUpperCase();

  return (
    <main className="relative min-h-screen bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-white/30" />
      <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-white/30" />
      <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-white/30" />
      <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-white/30" />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 border-b border-white/20 px-8 py-4 flex items-center justify-between">
        <div className="font-mono text-white text-xl font-bold tracking-widest italic -skew-x-12">
          ATLAS
        </div>
        <div className="font-mono text-white/40 text-[10px]">VIDEO.INGESTION</div>
      </div>

      {/* Center content */}
      <div className="flex flex-col items-center gap-8 px-8 text-center">

        {/* Thumbnail */}
        {video?.source_url && (() => {
          try {
            const url = new URL(video.source_url);
            const ytId = url.hostname === 'youtu.be'
              ? url.pathname.slice(1)
              : url.searchParams.get('v');
            if (!ytId) return null;
            return (
              <div className="relative w-64 aspect-video border border-white/10 overflow-hidden">
                <img
                  src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
            );
          } catch { return null; }
        })()}

        {/* Animated globe */}
        {!error && (
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 120 120" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Outer circle */}
              <circle cx="60" cy="60" r="54" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

              {/* Latitude lines */}
              {[-30, 0, 30].map((lat, i) => {
                const y = 60 + (lat / 90) * 54;
                const r = Math.sqrt(54 * 54 - (y - 60) * (y - 60));
                return <ellipse key={i} cx="60" cy={y} rx={r} ry={r * 0.28} stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />;
              })}

              {/* Longitude lines — these rotate */}
              <g style={{ transformOrigin: '60px 60px', animation: 'globe-spin 6s linear infinite' }}>
                <ellipse cx="60" cy="60" rx="54" ry="15" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
              </g>
              <g style={{ transformOrigin: '60px 60px', animation: 'globe-spin 6s linear infinite', animationDelay: '-2s' }}>
                <ellipse cx="60" cy="60" rx="54" ry="15" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
              </g>
              <g style={{ transformOrigin: '60px 60px', animation: 'globe-spin 6s linear infinite', animationDelay: '-4s' }}>
                <ellipse cx="60" cy="60" rx="54" ry="15" stroke="rgba(255,255,255,0.10)" strokeWidth="0.8" />
              </g>

              {/* Vertical axis */}
              <line x1="60" y1="6" x2="60" y2="114" stroke="rgba(255,255,255,0.10)" strokeWidth="0.8" />

              {/* Glowing dot orbiting */}
              <g style={{ transformOrigin: '60px 60px', animation: 'globe-spin 3s linear infinite' }}>
                <circle cx="114" cy="60" r="2.5" fill="white" fillOpacity="0.9" />
              </g>
            </svg>

            <style>{`
              @keyframes globe-spin {
                from { transform: rotateY(0deg); }
                to   { transform: rotateY(360deg); }
              }
            `}</style>
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-red-400 font-mono text-lg">⚠ INGESTION FAILED</div>
            <p className="text-white/50 font-mono text-xs max-w-sm">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 px-6 py-2 border border-white/40 text-white font-mono text-xs hover:border-white hover:bg-white hover:text-black transition-all duration-200"
            >
              ← TRY AGAIN
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 font-mono text-[10px] text-white/40">
                <span>STATUS</span>
                <div className="w-8 h-px bg-white/20" />
                <span className={status === 'ready' ? 'text-green-400' : 'text-white/70'}>{label}</span>
              </div>

              {video?.title && (
                <p className="text-white font-mono text-sm mt-2 max-w-md opacity-80 truncate">
                  {video.title}
                </p>
              )}
            </div>

            <div className="flex flex-col items-center gap-2">
              <p
                className="font-mono text-sm text-white/60 text-center transition-opacity duration-400"
                style={{ opacity: taglineFade ? 1 : 0 }}
              >
                {TAGLINES[taglineIdx]}
              </p>
              <p className="text-white/20 font-mono text-[10px]">
                This usually takes 1–3 minutes.
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-48 h-px bg-white/10 relative overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-white"
                style={{
                  width: '40%',
                  animation: 'progress-slide 1.6s ease-in-out infinite',
                }}
              />
              <style>{`
                @keyframes progress-slide {
                  0%   { transform: translateX(-100%); }
                  100% { transform: translateX(350%); }
                }
              `}</style>
            </div>
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-white/20 px-8 py-3 flex items-center justify-between">
        <span className="font-mono text-[9px] text-white/30">VIDEO.ID: {videoId}</span>
        <div className="flex gap-1">
          <div className="w-1 h-1 bg-white/60 rounded-full animate-pulse" />
          <div className="w-1 h-1 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          <div className="w-1 h-1 bg-white/20 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </main>
  );
}
