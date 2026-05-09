'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import AnimationPage from '@/components/ui/hero-ascii-one';
import { createVideo } from '@/lib/api';

export default function LandingPage() {
  const router = useRouter();

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string }, formData: FormData) => {
      const url = (formData.get('url') as string | null)?.trim() ?? '';
      if (!url) return { error: 'Please enter a URL' };
      try {
        const video = await createVideo(url);
        router.push(`/videos/${video.id}`);
        return { error: '' };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Something went wrong' };
      }
    },
    { error: '' },
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      {/* Background animation */}
      <AnimationPage />

      {/* Mobile stars */}
      <div className="absolute inset-0 w-full h-full lg:hidden stars-bg" />

      {/* Top header */}
      <div className="absolute top-0 left-0 right-0 z-20 border-b border-white/20">
        <div className="container mx-auto px-4 lg:px-8 py-3 lg:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-4">
            <div className="font-mono text-white text-xl lg:text-2xl font-bold tracking-widest italic transform -skew-x-12">
              ATLAS
            </div>
            <div className="h-3 lg:h-4 w-px bg-white/40" />
            <span className="text-white/60 text-[8px] lg:text-[10px] font-mono">EST. 2025</span>
          </div>
          <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono text-white/60">
            <span>VIDEO INTELLIGENCE</span>
            <div className="w-1 h-1 bg-white/40 rounded-full" />
            <span>AI-POWERED</span>
          </div>
        </div>
      </div>

      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-8 h-8 lg:w-12 lg:h-12 border-t-2 border-l-2 border-white/30 z-20" />
      <div className="absolute top-0 right-0 w-8 h-8 lg:w-12 lg:h-12 border-t-2 border-r-2 border-white/30 z-20" />
      <div className="absolute left-0 w-8 h-8 lg:w-12 lg:h-12 border-b-2 border-l-2 border-white/30 z-20" style={{ bottom: '5vh' }} />
      <div className="absolute right-0 w-8 h-8 lg:w-12 lg:h-12 border-b-2 border-r-2 border-white/30 z-20" style={{ bottom: '5vh' }} />

      {/* CTA content */}
      <div className="relative z-10 flex min-h-screen items-center justify-end pt-16 lg:pt-0" style={{ marginTop: '5vh' }}>
        <div className="w-full lg:w-1/2 px-6 lg:px-16 lg:pr-[10%]">
          <div className="max-w-lg relative lg:ml-auto">
            <div className="flex items-center gap-2 mb-3 opacity-60">
              <div className="w-8 h-px bg-white" />
              <span className="text-white text-[10px] font-mono tracking-wider">∞</span>
              <div className="flex-1 h-px bg-white" />
            </div>

            <div className="relative">
              <div className="hidden lg:block absolute -right-3 top-0 bottom-0 w-1 dither-pattern opacity-40" />
              <h1
                className="text-2xl lg:text-5xl font-bold text-white mb-3 lg:mb-4 leading-tight font-mono tracking-wider whitespace-nowrap lg:-ml-[5%]"
                style={{ letterSpacing: '0.1em' }}
              >
                ASK YOUR VIDEO
              </h1>
            </div>

            <div className="hidden lg:flex gap-1 mb-3 opacity-40">
              {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="w-0.5 h-0.5 bg-white rounded-full" />
              ))}
            </div>

            <div className="relative mb-6">
              <p className="text-xs lg:text-base text-gray-300 leading-relaxed font-mono opacity-80">
                Paste any YouTube URL. Atlas indexes it with multimodal AI, then lets you have a
                conversation — grounded in the exact moments of the video.
              </p>
              <div
                className="hidden lg:block absolute -left-4 top-1/2 w-3 h-3 border border-white opacity-30"
                style={{ transform: 'translateY(-50%)' }}
              >
                <div
                  className="absolute top-1/2 left-1/2 w-1 h-1 bg-white"
                  style={{ transform: 'translate(-50%, -50%)' }}
                />
              </div>
            </div>

            {/* URL form */}
            <form action={formAction} className="flex flex-col gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-mono text-xs select-none">
                  ▶
                </span>
                <input
                  type="url"
                  name="url"
                  placeholder="https://youtube.com/watch?v=..."
                  required
                  className="w-full bg-transparent border border-white/40 text-white font-mono text-xs lg:text-sm pl-8 pr-4 py-2.5 placeholder:text-white/25 focus:outline-none focus:border-white transition-colors"
                />
              </div>

              {state.error && <p className="text-red-400 font-mono text-[10px]">⚠ {state.error}</p>}

              <button
                type="submit"
                disabled={isPending}
                className="relative px-5 lg:px-6 py-2 lg:py-2.5 bg-white text-black font-mono text-xs lg:text-sm hover:bg-transparent hover:text-white border border-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <span className="hidden lg:block absolute -top-1 -left-1 w-2 h-2 border-t border-l border-white opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="hidden lg:block absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-white opacity-0 group-hover:opacity-100 transition-opacity" />
                {isPending ? 'UPLOADING...' : 'BEGIN ANALYSIS'}
              </button>
            </form>

            <div className="hidden lg:flex items-center gap-2 mt-6 opacity-40">
              <span className="text-white text-[9px] font-mono">∞</span>
              <div className="flex-1 h-px bg-white" />
              <span className="text-white text-[9px] font-mono">ATLAS.PROTOCOL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom footer */}
      <div
        className="absolute left-0 right-0 z-20 border-t border-white/20 bg-black/40 backdrop-blur-sm"
        style={{ bottom: '5vh' }}
      >
        <div className="container mx-auto px-4 lg:px-8 py-2 lg:py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 lg:gap-6 text-[8px] lg:text-[9px] font-mono text-white/50">
            <span className="hidden lg:inline">SYSTEM.ACTIVE</span>
            <span className="lg:hidden">SYS.ACT</span>
            <div className="hidden lg:flex gap-1">
              {[12, 6, 10, 4, 14, 8, 5, 11].map((h, i) => (
                <div key={i} className="w-1 bg-white/30" style={{ height: `${h}px` }} />
              ))}
            </div>
            <span>V1.0.0</span>
          </div>
          <div className="flex items-center gap-2 lg:gap-4 text-[8px] lg:text-[9px] font-mono text-white/50">
            <span className="hidden lg:inline">◐ RENDERING</span>
            <div className="flex gap-1">
              <div className="w-1 h-1 bg-white/60 rounded-full animate-pulse" />
              <div
                className="w-1 h-1 bg-white/40 rounded-full animate-pulse"
                style={{ animationDelay: '0.2s' }}
              />
              <div
                className="w-1 h-1 bg-white/20 rounded-full animate-pulse"
                style={{ animationDelay: '0.4s' }}
              />
            </div>
            <span className="hidden lg:inline">FRAME: ∞</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .dither-pattern {
          background-image: repeating-linear-gradient(
              0deg,
              transparent 0px,
              transparent 1px,
              white 1px,
              white 2px
            ),
            repeating-linear-gradient(
              90deg,
              transparent 0px,
              transparent 1px,
              white 1px,
              white 2px
            );
          background-size: 3px 3px;
        }
        .stars-bg {
          background-image: radial-gradient(1px 1px at 20% 30%, white, transparent),
            radial-gradient(1px 1px at 60% 70%, white, transparent),
            radial-gradient(1px 1px at 50% 50%, white, transparent),
            radial-gradient(1px 1px at 80% 10%, white, transparent),
            radial-gradient(1px 1px at 90% 60%, white, transparent),
            radial-gradient(1px 1px at 33% 80%, white, transparent),
            radial-gradient(1px 1px at 15% 60%, white, transparent),
            radial-gradient(1px 1px at 70% 40%, white, transparent);
          background-size: 200% 200%, 180% 180%, 250% 250%, 220% 220%, 190% 190%, 240% 240%,
            210% 210%, 230% 230%;
          opacity: 0.3;
        }
      `}</style>
    </main>
  );
}
