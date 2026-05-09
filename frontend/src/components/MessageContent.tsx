'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import React, { useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

interface VideoContext {
  text: string;
  start: number;
  end: number;
}

interface WikiDef {
  text: string;
  url: string | null;
}

interface CachedDef {
  videoContext: VideoContext | null;
  wiki: WikiDef | null;
}

interface DefinitionPopover extends CachedDef {
  word: string;
  x: number;
  y: number;
}

type WordState = 'found' | 'not-found';

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node))
    return extractText((node.props as { children?: React.ReactNode }).children);
  return '';
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

async function fetchVideoContext(
  videoId: number,
  term: string,
): Promise<VideoContext | null> {
  try {
    const res = await fetch(
      `${API_BASE}/videos/${videoId}/define?term=${encodeURIComponent(term)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.context) return null;
    return { text: data.context as string, start: data.start as number, end: data.end as number };
  } catch {
    return null;
  }
}

async function fetchWikiDef(term: string): Promise<WikiDef | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const extract: string = data.extract ?? '';
    if (!extract || data.type === 'disambiguation') return null;
    const truncated =
      extract.length > 280 ? extract.slice(0, 280).replace(/\s\S+$/, '') + '…' : extract;
    return { text: truncated, url: (data.content_urls?.desktop?.page as string) ?? null };
  } catch {
    return null;
  }
}

export default function MessageContent({
  text,
  streaming = false,
  videoId,
  onSeek,
}: {
  text: string;
  streaming?: boolean;
  videoId?: number;
  onSeek?: (seconds: number) => void;
}) {
  const [def, setDef] = useState<DefinitionPopover | null>(null);
  const [wordStates, setWordStates] = useState<Map<string, WordState>>(new Map());
  const cacheRef = useRef<Map<string, CachedDef>>(new Map());
  const checkedRef = useRef<Set<string>>(new Set());
  const popoverRef = useRef<HTMLDivElement>(null);

  // Pre-check all bold words once the message finishes streaming
  useEffect(() => {
    if (streaming) return;

    const boldTerms = new Set<string>();
    for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
      const term = m[1].trim();
      if (term && !checkedRef.current.has(term)) boldTerms.add(term);
    }
    if (boldTerms.size === 0) return;

    for (const t of boldTerms) checkedRef.current.add(t);

    Promise.all(
      [...boldTerms].map(async term => {
        const [videoContext, wiki] = await Promise.all([
          videoId ? fetchVideoContext(videoId, term) : Promise.resolve(null),
          fetchWikiDef(term),
        ]);

        if (!videoContext && !wiki) return { term, state: 'not-found' as WordState };

        cacheRef.current.set(term, { videoContext, wiki });
        return { term, state: 'found' as WordState };
      }),
    ).then(results => {
      setWordStates(prev => {
        const next = new Map(prev);
        for (const { term, state } of results) next.set(term, state);
        return next;
      });
    });
  }, [text, streaming, videoId]);

  // Dismiss popover on outside click
  useEffect(() => {
    if (!def) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setDef(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [def]);

  const handleWordClick = (e: React.MouseEvent, word: string) => {
    const cached = cacheRef.current.get(word);
    if (!cached) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDef({ word, ...cached, x: rect.left, y: rect.bottom + 8 });
  };

  return (
    <div className="markdown-body font-mono">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => {
            const word = extractText(children);
            const isClickable = wordStates.get(word) === 'found';
            return (
              <strong
                className={[
                  'text-white',
                  isClickable
                    ? 'cursor-pointer underline decoration-dotted decoration-white/30 hover:decoration-white/70 transition-colors'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={isClickable ? 'Click for definition' : undefined}
                onClick={isClickable ? e => handleWordClick(e, word) : undefined}
              >
                {children}
              </strong>
            );
          },
          em: ({ children }) => <em className="text-white/90">{children}</em>,
          code: ({ children, ...props }) => {
            const inline =
              !(
                props as {
                  node?: { position?: { start: { line: number }; end: { line: number } } };
                }
              ).node ||
              (
                props as unknown as {
                  node: { position?: { start: { line: number }; end: { line: number } } };
                }
              ).node.position?.start.line ===
                (
                  props as unknown as {
                    node: { position?: { start: { line: number }; end: { line: number } } };
                  }
                ).node.position?.end.line;
            return inline ? (
              <code className="px-1 py-0.5 bg-white/10 text-white/90 rounded-sm">{children}</code>
            ) : (
              <code className="block px-3 py-2 bg-white/5 border border-white/10 my-2 overflow-x-auto whitespace-pre">
                {children}
              </code>
            );
          },
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="text-white/70">{children}</li>,
          h1: ({ children }) => (
            <h3 className="text-sm font-bold text-white mt-3 mb-1">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-sm font-bold text-white mt-3 mb-1">{children}</h3>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold text-white mt-3 mb-1">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/20 pl-3 my-2 text-white/60 italic">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline text-white hover:text-white/70"
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>

      {def && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            left: `min(${def.x}px, calc(100vw - 300px))`,
            top: def.y,
            zIndex: 9999,
          }}
          className="w-72 bg-black border border-white/30 p-4 flex flex-col gap-3 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-white/40 tracking-widest uppercase">
              {def.word}
            </span>
            <button
              onClick={() => setDef(null)}
              className="font-mono text-[9px] text-white/30 hover:text-white transition-colors leading-none"
            >
              ✕
            </button>
          </div>

          {/* Video context */}
          {def.videoContext && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[8px] text-white/30 tracking-widest">
                  IN THIS VIDEO
                </span>
                {onSeek && (
                  <button
                    onClick={() => { onSeek(def.videoContext!.start); setDef(null); }}
                    className="font-mono text-[8px] text-white/35 hover:text-white/70 transition-colors flex items-center gap-1"
                  >
                    <span>▶</span>
                    <span>{formatTime(def.videoContext.start)}</span>
                  </button>
                )}
              </div>
              <p className="font-mono text-[11px] text-white/70 leading-relaxed italic">
                &ldquo;{def.videoContext.text}&rdquo;
              </p>
            </div>
          )}

          {/* Divider between sections */}
          {def.videoContext && def.wiki && <div className="h-px bg-white/10" />}

          {/* Wikipedia */}
          {def.wiki && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[8px] text-white/30 tracking-widest">WIKIPEDIA</span>
              <p className="font-mono text-[11px] text-white/75 leading-relaxed">{def.wiki.text}</p>
              {def.wiki.url && (
                <a
                  href={def.wiki.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[9px] text-white/35 hover:text-white/70 underline transition-colors self-start"
                >
                  Wikipedia →
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
