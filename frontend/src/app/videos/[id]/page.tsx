'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getVideo, createConversation, type VideoResponse } from '@/lib/api';

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
        {/* Animated spinner */}
        {!error && (
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 border border-white/10 rounded-full" />
            <div className="absolute inset-0 border-t border-white/60 rounded-full animate-spin" style={{ animationDuration: '1.2s' }} />
            <div className="absolute inset-3 border border-white/10 rounded-full" />
            <div className="absolute inset-3 border-b border-white/30 rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </div>
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

            <div className="flex flex-col items-center gap-1">
              <p className="text-white/30 font-mono text-[10px]">
                Cliff is indexing your video with multimodal AI.
              </p>
              <p className="text-white/20 font-mono text-[10px]">
                This usually takes 1–3 minutes.
              </p>
            </div>

            {/* Progress dots */}
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 h-1 bg-white/40 rounded-full animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
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
