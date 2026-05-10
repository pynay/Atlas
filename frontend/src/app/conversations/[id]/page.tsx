'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getConversation,
  getConversationList,
  getVideo,
  getVideoFlashcards,
  getVideoInsights,
  getVideoNotes,
  getVideoProblems,
  streamMessage,
  type ConversationDetailResponse,
  type ConversationSummaryItem,
  type FlashcardItem,
  type InsightItem,
  type MessageResponse,
  type ProblemItem,
  type SourceRef,
  type VideoResponse,
} from '@/lib/api';
import AtlasPlayer from '@/components/AtlasPlayer';
import MessageContent from '@/components/MessageContent';

interface LiveMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  svg?: string | null;
  source_refs?: SourceRef[] | null;
  streaming?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SourceChip({ clip, onClick }: { clip: SourceRef; onClick?: (s: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(clip.start)}
      className="inline-flex items-center gap-1 px-2 py-0.5 border border-white/20 font-mono text-[9px] text-white/50 whitespace-nowrap hover:border-white/60 hover:text-white transition-colors cursor-pointer"
    >
      <span className="text-white/30">▶</span>
      {formatTime(clip.start)}–{formatTime(clip.end)}
    </button>
  );
}

function MessageBubble({
  msg,
  onClipClick,
  videoId,
}: {
  msg: LiveMessage;
  onClipClick?: (s: number) => void;
  videoId?: number;
}) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-2 font-mono text-[9px] ${isUser ? 'flex-row-reverse' : ''}`}>
        <span className="text-white/30">{isUser ? 'YOU' : 'ATLAS'}</span>
        {msg.streaming && (
          <div className="flex gap-0.5">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1 h-1 bg-white/40 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className={`max-w-[85%] px-4 py-3 text-xs leading-relaxed ${
          isUser
            ? 'border border-white/30 text-white/80 bg-white/5 font-mono'
            : 'border border-white/10 text-white/70 bg-transparent font-mono'
        }`}
      >
        {msg.content ? (
          isUser ? (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          ) : (
            <MessageContent
            text={msg.content}
            streaming={msg.streaming}
            videoId={videoId}
            onSeek={onClipClick}
          />
          )
        ) : msg.streaming ? (
          <span className="opacity-40">…</span>
        ) : null}

        {msg.svg && (
          <div
            className="mt-3 border border-white/10 p-2 bg-white/5"
            dangerouslySetInnerHTML={{ __html: msg.svg }}
          />
        )}
      </div>

      {msg.source_refs && msg.source_refs.length > 0 && (
        <div className="flex flex-wrap gap-1 max-w-[85%]">
          {msg.source_refs.map((r, i) => (
            <SourceChip key={i} clip={r} onClick={onClipClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function exportToQuizlet(cards: FlashcardItem[]) {
  const content = cards.map(c => `${c.question}\t${c.answer}`).join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'atlas-flashcards.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function FlashcardDeck({ cards }: { cards: FlashcardItem[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showTip, setShowTip] = useState(false);

  if (cards.length === 0) {
    return <p className="font-mono text-[10px] text-white/40">No cards produced.</p>;
  }

  const card = cards[index];

  function go(dir: 1 | -1) {
    setIndex(i => (i + dir + cards.length) % cards.length);
    setFlipped(false);
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 px-6 py-4">
      <div className="font-mono text-[9px] text-white/30 tracking-widest">
        {String(index + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}
        <span className="ml-3 text-white/20">{flipped ? '— ANSWER' : '— QUESTION'}</span>
      </div>

      {/* 3D flip card */}
      <div
        className="w-full flex-1 cursor-pointer"
        style={{ perspective: '1200px', maxHeight: '420px' }}
        onClick={() => setFlipped(f => !f)}
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: flipped ? 'rotateX(180deg)' : 'rotateX(0deg)',
            position: 'relative',
            height: '100%',
            minHeight: '220px',
          }}
        >
          {/* Front — question */}
          <div
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            className="absolute inset-0 border border-white/20 bg-white/[0.02] p-8 flex flex-col items-center justify-center gap-4"
          >
            <div className="font-mono text-[9px] text-white/25 tracking-widest">QUESTION</div>
            <div className="font-mono text-sm text-white/90 text-center leading-relaxed">{card.question}</div>
            <div className="font-mono text-[9px] text-white/20 mt-2">click to flip</div>
          </div>

          {/* Back — answer */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateX(180deg)',
            }}
            className="absolute inset-0 border border-white/30 bg-white/[0.04] p-8 flex flex-col items-center justify-center gap-4"
          >
            <div className="font-mono text-[9px] text-white/40 tracking-widest">ANSWER</div>
            <div className="font-mono text-xs text-white/75 text-center leading-relaxed">{card.answer}</div>
            <div className="font-mono text-[9px] text-white/20 mt-2">click to flip back</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => go(-1)}
          className="px-4 py-1.5 border border-white/20 font-mono text-[10px] text-white/50 hover:border-white/60 hover:text-white transition-colors"
        >
          ← PREV
        </button>
        <div className="flex gap-1">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => { setIndex(i); setFlipped(false); }}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/20 hover:bg-white/40'}`}
            />
          ))}
        </div>
        <button
          onClick={() => go(1)}
          className="px-4 py-1.5 border border-white/20 font-mono text-[10px] text-white/50 hover:border-white/60 hover:text-white transition-colors"
        >
          NEXT →
        </button>
      </div>

      {/* Export */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => { exportToQuizlet(cards); setShowTip(true); }}
          className="px-4 py-1.5 border border-white/20 font-mono text-[10px] text-white/50 hover:border-white/60 hover:text-white transition-colors"
        >
          EXPORT → QUIZLET
        </button>
        {showTip && (
          <p className="font-mono text-[9px] text-white/30 text-center max-w-xs leading-relaxed">
            quizlet.com → Create → Import → paste file.{' '}
            <span className="text-white/50">Tab</span> between term/def,{' '}
            <span className="text-white/50">New line</span> between cards.
          </p>
        )}
      </div>
    </div>
  );
}

function downloadProblemsPdf(problems: ProblemItem[]) {
  function mdToHtml(raw: string): string {
    return raw
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const problemsHtml = problems.map((p, i) => `
    <div class="problem">
      <div class="prob-row">
        <span class="prob-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="prob-q">${mdToHtml(p.question)}</div>
      </div>
      <div class="work-space">${Array.from({ length: 5 }, () => '<div class="work-line"></div>').join('')}</div>
    </div>`).join('');
  const solutionsHtml = problems.map((p, i) => `
    <div class="solution">
      <div class="sol-label">Problem ${String(i + 1).padStart(2, '0')}</div>
      <div class="sol-text">${mdToHtml(p.answer)}</div>
    </div>`).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Practice Problems — Atlas</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]})"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Times,serif;font-size:12pt;color:#111;background:#fff;padding:48px 64px;max-width:820px;margin:0 auto}
header{border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:36px}
header h1{font-size:18pt;font-family:monospace;letter-spacing:.16em;text-transform:uppercase}
header p{font-size:9pt;font-family:monospace;color:#666;margin-top:5px}
.section-label{font-size:8pt;font-family:monospace;letter-spacing:.14em;color:#999;text-transform:uppercase;margin-bottom:20px;padding-bottom:6px;border-bottom:1px solid #ddd}
.problem{margin-bottom:40px;page-break-inside:avoid}
.prob-row{display:flex;gap:14px;align-items:flex-start;margin-bottom:12px}
.prob-num{font-family:monospace;font-size:9pt;color:#999;min-width:26px;padding-top:2px}
.prob-q{font-size:12pt;line-height:1.7;flex:1}
.work-space{margin-left:40px}
.work-line{border-bottom:1px solid #e8e8e8;height:30px}
.page-break{page-break-before:always;padding-top:48px;margin-bottom:36px}
.solution{margin-bottom:28px;page-break-inside:avoid}
.sol-label{font-family:monospace;font-size:8pt;color:#999;letter-spacing:.1em;margin-bottom:8px}
.sol-text{font-size:11pt;line-height:1.7;padding-left:16px;border-left:3px solid #ccc;color:#222}
@media print{body{padding:20px 36px}}
</style></head><body>
<header><h1>Practice Problems</h1><p>Atlas &nbsp;·&nbsp; ${date} &nbsp;·&nbsp; ${problems.length} Questions</p></header>
<section><div class="section-label">Problems</div>${problemsHtml}</section>
<div class="page-break"><div class="section-label">Solutions</div>${solutionsHtml}</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),900))</script>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function ProblemList({ problems }: { problems: ProblemItem[] }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  if (problems.length === 0) {
    return <p className="font-mono text-[10px] text-white/40">No problems produced.</p>;
  }

  function toggle(i: number) {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Doc header */}
      <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-white/15">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] text-white/60 tracking-widest">PRACTICE PROBLEMS</span>
          <span className="font-mono text-[8px] text-white/25">
            {problems.length} QUESTIONS — CLICK A PROBLEM TO REVEAL SOLUTION
          </span>
        </div>
        <button
          onClick={() => downloadProblemsPdf(problems)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-white/20 font-mono text-[9px] text-white/50 hover:border-white/60 hover:text-white transition-colors"
        >
          <span>↓</span>
          <span>DOWNLOAD PDF</span>
        </button>
      </div>

      {/* Problems */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {problems.map((p, i) => {
          const open = revealed.has(i);
          return (
            <div key={i} className="border-b border-white/10 last:border-b-0">
              {/* Clickable question row */}
              <div
                onClick={() => toggle(i)}
                className="flex gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-mono text-[10px] text-white/30 pt-0.5 w-5 flex-none">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <div className="text-xs leading-relaxed text-white/85">
                    <MessageContent text={p.question} />
                  </div>
                  <span className="font-mono text-[8px] text-white/25 tracking-wider select-none">
                    {open ? '▲ HIDE SOLUTION' : '▼ REVEAL SOLUTION'}
                  </span>
                </div>
              </div>

              {/* Solution — revealed inline */}
              {open && (
                <div className="px-5 pb-5" style={{ paddingLeft: '56px' }}>
                  <div className="border-l-2 border-white/15 pl-4">
                    <div className="font-mono text-[8px] text-white/30 tracking-widest mb-2">SOLUTION</div>
                    <div className="text-xs leading-relaxed text-white/65">
                      <MessageContent text={p.answer} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InsightTimeline({
  insights,
  currentTime,
  onSeek,
}: {
  insights: InsightItem[];
  currentTime: number;
  onSeek: (s: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Active = the chapter whose [start, end) contains currentTime,
  // else the last chapter starting before currentTime, else none.
  let activeIndex = -1;
  for (let i = 0; i < insights.length; i++) {
    if (currentTime >= insights[i].start && currentTime < insights[i].end) {
      activeIndex = i;
      break;
    }
  }
  if (activeIndex === -1) {
    for (let i = insights.length - 1; i >= 0; i--) {
      if (currentTime >= insights[i].start) {
        activeIndex = i;
        break;
      }
    }
  }

  // Auto-scroll active chapter into view as playback advances
  useEffect(() => {
    if (activeIndex < 0 || !activeRef.current || !containerRef.current) return;
    activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeIndex]);

  if (insights.length === 0) {
    return <p className="font-mono text-[10px] text-white/40">No insights produced.</p>;
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-1 py-2 flex flex-col gap-2 scrollbar-thin"
    >
      {insights.map((it, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={i}
            ref={isActive ? activeRef : null}
            onClick={() => onSeek(it.start)}
            className={`cursor-pointer p-3 transition-colors border ${
              isActive
                ? 'border-white bg-white/[0.06]'
                : 'border-white/15 bg-white/[0.02] hover:border-white/40 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className={`font-mono text-[9px] tracking-widest ${
                  isActive ? 'text-white' : 'text-white/40'
                }`}
              >
                {formatTime(it.start)}–{formatTime(it.end)}
              </span>
              {isActive && (
                <span className="font-mono text-[9px] text-green-400/80 tracking-wider">
                  ● PLAYING
                </span>
              )}
            </div>
            <div
              className={`text-xs font-semibold mb-1 ${
                isActive ? 'text-white' : 'text-white/80'
              }`}
            >
              {it.title}
            </div>
            <div className={`text-xs leading-relaxed ${isActive ? 'text-white/85' : 'text-white/60'}`}>
              <MessageContent text={it.body} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({
  items,
  currentId,
}: {
  items: ConversationSummaryItem[];
  currentId: number;
}) {
  const router = useRouter();

  function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const sec = Math.max(0, Math.floor((now - then) / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  if (items.length === 0) {
    return (
      <p className="font-mono text-[10px] text-white/40 px-3 py-4">No conversations yet.</p>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-1 py-2 flex flex-col gap-2 scrollbar-thin">
      {items.map(item => {
        const isCurrent = item.id === currentId;
        return (
          <button
            key={item.id}
            disabled={isCurrent}
            onClick={() => router.push(`/conversations/${item.id}`)}
            className={`text-left p-3 transition-colors border ${
              isCurrent
                ? 'border-white bg-white/[0.06] cursor-default'
                : 'border-white/15 bg-white/[0.02] hover:border-white/40 hover:bg-white/[0.04] cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[9px] text-white/40 tracking-widest">
                CONV.{String(item.id).padStart(3, '0')}
              </span>
              {isCurrent && (
                <span className="font-mono text-[9px] text-green-400/80 tracking-wider">
                  ● CURRENT
                </span>
              )}
              <div className="flex-1 h-px bg-white/10" />
              <span className="font-mono text-[9px] text-white/30">
                {relativeTime(item.last_message_at ?? item.created_at)}
              </span>
            </div>
            <div className="text-xs text-white/85 truncate mb-1">
              {item.video_title ?? item.source_url}
            </div>
            <div className="text-xs text-white/55 line-clamp-2 mb-1">
              {item.preview ?? <span className="italic text-white/30">No messages yet.</span>}
            </div>
            <div className="font-mono text-[9px] text-white/30">
              {item.message_count} {item.message_count === 1 ? 'message' : 'messages'}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function ConversationPage() {
  const router = useRouter();
  const params = useParams();
  const convId = Number(params.id);

  const [conv, setConv] = useState<ConversationDetailResponse | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [video, setVideo] = useState<VideoResponse | null>(null);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [splitPct, setSplitPct] = useState(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Typewriter effect: buffer incoming SSE chars, drain at a fixed rate
  const typewriterQueueRef = useRef('');
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typewriterFinalizeRef = useRef<{
    messageId?: number;
    svg: string | null;
    refs: SourceRef[] | null;
  } | null>(null);

  const startTypewriter = useCallback(() => {
    if (typewriterIntervalRef.current !== null) return;
    typewriterIntervalRef.current = setInterval(() => {
      if (typewriterQueueRef.current.length > 0) {
        const charsPerTick = typewriterQueueRef.current.length > 60 ? 8 : 3;
        const chunk = typewriterQueueRef.current.slice(0, charsPerTick);
        typewriterQueueRef.current = typewriterQueueRef.current.slice(charsPerTick);
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + chunk };
          }
          return next;
        });
      } else if (typewriterFinalizeRef.current !== null) {
        const fin = typewriterFinalizeRef.current;
        typewriterFinalizeRef.current = null;
        clearInterval(typewriterIntervalRef.current!);
        typewriterIntervalRef.current = null;
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = {
              ...last,
              id: fin.messageId,
              svg: fin.svg,
              source_refs: fin.refs,
              streaming: false,
            };
          }
          return next;
        });
        setSending(false);
        inputRef.current?.focus();
      }
    }, 16);
  }, []);

  const onDividerMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(80, Math.max(20, pct)));
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const [studyView, setStudyView] = useState<
    'none' | 'notes' | 'cards' | 'problems' | 'insights' | 'history'
  >('none');
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyError, setStudyError] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<FlashcardItem[] | null>(null);
  const [problems, setProblems] = useState<ProblemItem[] | null>(null);
  const [insights, setInsights] = useState<InsightItem[] | null>(null);
  const [history, setHistory] = useState<ConversationSummaryItem[] | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onClipClick = useCallback((seconds: number) => {
    // Bump seekTo with a fresh value each time so the player effect retriggers
    // even when clicking the same chip twice
    setSeekTo(seconds + Math.random() * 0.0001);
  }, []);

  // Load existing conversation
  useEffect(() => {
    getConversation(convId)
      .then(c => {
        setConv(c);
        const msgs: LiveMessage[] = c.messages.map((m: MessageResponse) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          svg: m.svg,
          source_refs: m.source_refs,
        }));
        setMessages(msgs);

        // Build embed URL from the video source_url (stored on the backend)
        // We'll fetch it via the conversation detail — no direct video endpoint needed here
        // The source_url is not in ConversationDetailResponse, so we handle it below
      })
      .catch(() => setError('Could not load conversation'));
  }, [convId]);

  // Poll the video until indexing finishes. Only when status flips to "ready"
  // (which means both Marengo and Pegasus have completed) do we let the
  // dashboard render — until then study endpoints would 409 and the player
  // has no HLS URL anyway.
  useEffect(() => {
    if (!conv) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const v = await getVideo(conv!.video_id);
        if (cancelled) return;
        setVideo(v);
        if (v.status !== 'ready' && v.status !== 'failed') {
          timeout = setTimeout(tick, 3000);
        }
      } catch {
        if (!cancelled) timeout = setTimeout(tick, 5000);
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [conv]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setError('');
    setSending(true);

    const userMsg: LiveMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    // Reset typewriter state
    typewriterQueueRef.current = '';
    typewriterFinalizeRef.current = null;

    let accSvg: string | null = null;
    let accRefs: SourceRef[] | null = null;

    try {
      for await (const event of streamMessage(convId, text)) {
        if (event.type === 'text_delta') {
          typewriterQueueRef.current += event.delta;
          startTypewriter();
        } else if (event.type === 'svg') {
          accSvg = event.svg;
        } else if (event.type === 'sources') {
          accRefs = event.refs;
        } else if (event.type === 'done') {
          // Signal the interval to finalize once the queue drains
          typewriterFinalizeRef.current = {
            messageId: event.message_id,
            svg: accSvg,
            refs: accRefs,
          };
          return; // setSending(false) handled by typewriter interval
        }
      }
    } catch (err) {
      // Stop typewriter and clean up on error
      if (typewriterIntervalRef.current !== null) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
      typewriterFinalizeRef.current = null;
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setMessages(prev => prev.slice(0, -1));
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, convId, startTypewriter]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const openNotes = useCallback(async () => {
    if (!conv) return;
    setStudyView('notes');
    setStudyError('');
    if (notes !== null) return;
    setStudyLoading(true);
    try {
      const r = await getVideoNotes(conv.video_id);
      setNotes(r.notes);
    } catch (err) {
      setStudyError(err instanceof Error ? err.message : 'Failed to generate notes');
    } finally {
      setStudyLoading(false);
    }
  }, [conv, notes]);

  const openFlashcards = useCallback(async () => {
    if (!conv) return;
    setStudyView('cards');
    setStudyError('');
    if (flashcards !== null) return;
    setStudyLoading(true);
    try {
      const r = await getVideoFlashcards(conv.video_id);
      setFlashcards(r.cards);
    } catch (err) {
      setStudyError(err instanceof Error ? err.message : 'Failed to generate flashcards');
    } finally {
      setStudyLoading(false);
    }
  }, [conv, flashcards]);

  const openProblems = useCallback(async () => {
    if (!conv) return;
    setStudyView('problems');
    setStudyError('');
    if (problems !== null) return;
    setStudyLoading(true);
    try {
      const r = await getVideoProblems(conv.video_id);
      setProblems(r.problems);
    } catch (err) {
      setStudyError(err instanceof Error ? err.message : 'Failed to generate problems');
    } finally {
      setStudyLoading(false);
    }
  }, [conv, problems]);

  const openInsights = useCallback(async () => {
    if (!conv) return;
    setStudyView('insights');
    setStudyError('');
    if (insights !== null) return;
    setStudyLoading(true);
    try {
      const r = await getVideoInsights(conv.video_id);
      setInsights(r.insights);
    } catch (err) {
      setStudyError(err instanceof Error ? err.message : 'Failed to generate insights');
    } finally {
      setStudyLoading(false);
    }
  }, [conv, insights]);

  const openHistory = useCallback(async () => {
    setStudyView('history');
    setStudyError('');
    // Always refetch — the user may have just sent a message that should now show up
    setStudyLoading(true);
    try {
      const list = await getConversationList();
      setHistory(list);
    } catch (err) {
      setStudyError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setStudyLoading(false);
    }
  }, []);

  const closeStudy = useCallback(() => setStudyView('none'), []);

  // Gate the dashboard: don't render the player + chat + study features
  // until TwelveLabs indexing (Marengo + Pegasus) is fully done.
  if (!video || (video.status !== 'ready' && video.status !== 'failed')) {
    return (
      <main className="h-screen bg-black flex flex-col items-center justify-center gap-6 px-6">
        <div className="font-mono text-white text-xl font-bold tracking-widest italic -skew-x-12">
          ATLAS
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] text-white/40">
          <div className="w-1.5 h-1.5 bg-green-400/60 rounded-full animate-pulse" />
          <span>{video ? `STATUS — ${video.status.toUpperCase()}` : 'LOADING'}</span>
        </div>
        <p className="font-mono text-xs text-white/50 max-w-md text-center">
          Pegasus is still indexing this video. The dashboard will load as soon as it&apos;s
          ready — usually 1–3 minutes.
        </p>
        {video?.title && (
          <p className="font-mono text-[10px] text-white/30 max-w-md text-center truncate">
            {video.title}
          </p>
        )}
        <div className="w-48 h-px bg-white/10 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-white"
            style={{ width: '40%', animation: 'progress-slide 1.6s ease-in-out infinite' }}
          />
          <style>{`
            @keyframes progress-slide {
              0%   { transform: translateX(-100%); }
              100% { transform: translateX(350%); }
            }
          `}</style>
        </div>
        <div className="font-mono text-[9px] text-white/20">CONV.ID: {convId}</div>
      </main>
    );
  }

  if (video.status === 'failed') {
    return (
      <main className="h-screen bg-black flex flex-col items-center justify-center gap-4 px-6">
        <div className="font-mono text-white text-xl font-bold tracking-widest italic -skew-x-12">
          ATLAS
        </div>
        <div className="text-red-400 font-mono text-lg">⚠ INGESTION FAILED</div>
        <p className="text-white/50 font-mono text-xs max-w-sm text-center">
          {video.error ?? 'Indexing failed for this video.'}
        </p>
        <button
          onClick={() => router.push('/')}
          className="mt-2 px-6 py-2 border border-white/40 text-white font-mono text-xs hover:border-white hover:bg-white hover:text-black transition-all"
        >
          ← BACK
        </button>
      </main>
    );
  }

  return (
    <main className="h-screen bg-black flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex-none border-b border-white/20 px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="font-mono text-white text-lg font-bold tracking-widest italic -skew-x-12 hover:opacity-70 transition-opacity"
        >
          ATLAS
        </button>
        <div className="flex items-center gap-4 font-mono text-[10px] text-white/40">
          {conv?.video_id && <span>VIDEO.ID: {conv.video_id}</span>}
          <div className="w-px h-3 bg-white/20" />
          <span>CONV.ID: {convId}</span>
        </div>
      </header>

      {/* Main split layout */}
      <div ref={splitContainerRef} className="flex-1 flex overflow-hidden">
        {/* Left: Video player */}
        <div className="flex flex-col bg-black overflow-hidden" style={{ width: `${splitPct}%` }}>
          <div className="flex-none px-4 py-2 border-b border-white/10 flex items-center gap-2">
            <span className="font-mono text-[9px] text-white/30 tracking-wider">VIDEO.STREAM</span>
            <div className="flex-1 h-px bg-white/10" />
            <div className="w-1.5 h-1.5 bg-green-400/60 rounded-full animate-pulse" />
          </div>

          <div className="flex-1 flex items-center justify-center bg-black">
            {video.hls_url ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-full" style={{ aspectRatio: '16/9' }}>
                  <AtlasPlayer
                    src={video.hls_url}
                    seekTo={seekTo}
                    onTimeUpdate={setCurrentTime}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-white/20 font-mono text-xs">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border border-white/10 rounded-full" />
                  <div
                    className="absolute inset-0 border-t border-white/40 rounded-full animate-spin"
                    style={{ animationDuration: '1.2s' }}
                  />
                </div>
                <span>LOADING.STREAM</span>
              </div>
            )}
          </div>
        </div>

        {/* Drag divider */}
        <div
          onMouseDown={onDividerMouseDown}
          className="w-1 bg-white/10 hover:bg-white/40 active:bg-white/60 cursor-col-resize flex-none transition-colors"
          title="Drag to resize"
        />

        {/* Right: Chat panel */}
        <div className="flex flex-col overflow-hidden flex-1 bg-white/[0.02]">
          <div className="flex-none px-4 py-2 border-b border-white/20 flex items-center gap-2 bg-white/[0.02]">
            <span className="font-mono text-[9px] text-white/50 tracking-wider">CHAT.INTERFACE</span>
            <div className="flex-1 h-px bg-white/15" />
            <button
              onClick={openNotes}
              className={`font-mono text-[9px] tracking-wider px-2 py-0.5 border transition-colors ${
                studyView === 'notes'
                  ? 'border-white/60 text-white'
                  : 'border-white/20 text-white/40 hover:border-white/40 hover:text-white/70'
              }`}
            >
              NOTES
            </button>
            <button
              onClick={openFlashcards}
              className={`font-mono text-[9px] tracking-wider px-2 py-0.5 border transition-colors ${
                studyView === 'cards'
                  ? 'border-white/60 text-white'
                  : 'border-white/20 text-white/40 hover:border-white/40 hover:text-white/70'
              }`}
            >
              CARDS
            </button>
            <button
              onClick={openProblems}
              className={`font-mono text-[9px] tracking-wider px-2 py-0.5 border transition-colors ${
                studyView === 'problems'
                  ? 'border-white/60 text-white'
                  : 'border-white/20 text-white/40 hover:border-white/40 hover:text-white/70'
              }`}
            >
              PROBLEMS
            </button>
            <button
              onClick={openInsights}
              className={`font-mono text-[9px] tracking-wider px-2 py-0.5 border transition-colors ${
                studyView === 'insights'
                  ? 'border-white/60 text-white'
                  : 'border-white/20 text-white/40 hover:border-white/40 hover:text-white/70'
              }`}
            >
              INSIGHTS
            </button>
            <button
              onClick={openHistory}
              className={`font-mono text-[9px] tracking-wider px-2 py-0.5 border transition-colors ${
                studyView === 'history'
                  ? 'border-white/60 text-white'
                  : 'border-white/20 text-white/40 hover:border-white/40 hover:text-white/70'
              }`}
            >
              HISTORY
            </button>
            <span className="font-mono text-[9px] text-white/20">{messages.length} MSG</span>
          </div>

          {/* Study panel (notes / flashcards) — overlays messages when active */}
          {studyView !== 'none' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-white/40 tracking-wider">
                  {studyView === 'notes'
                    ? 'STUDY.NOTES'
                    : studyView === 'cards'
                    ? 'FLASHCARDS'
                    : studyView === 'problems'
                    ? 'PRACTICE.PROBLEMS'
                    : studyView === 'insights'
                    ? 'INSIGHTS'
                    : 'CONVERSATION.HISTORY'}
                </span>
                <div className="flex-1 h-px bg-white/10" />
                <button
                  onClick={closeStudy}
                  className="font-mono text-[9px] text-white/40 hover:text-white border border-white/20 px-2 py-0.5"
                >
                  CLOSE
                </button>
              </div>

              {studyLoading && (
                <div className="font-mono text-[10px] text-white/40">
                  Generating… (Pegasus can take 30–60s)
                </div>
              )}

              {studyError && (
                <p className="font-mono text-[10px] text-red-400">⚠ {studyError}</p>
              )}

              {studyView === 'notes' && notes && (
                <div className="flex-1 overflow-y-auto text-xs leading-relaxed text-white/70 border border-white/10 p-4 bg-white/[0.02] scrollbar-thin">
                  <MessageContent text={notes} />
                </div>
              )}

              {studyView === 'cards' && flashcards && (
                <div className="flex-1 overflow-hidden">
                  <FlashcardDeck cards={flashcards} />
                </div>
              )}

              {studyView === 'problems' && problems && (
                <ProblemList problems={problems} />
              )}

              {studyView === 'insights' && insights && (
                <InsightTimeline
                  insights={insights}
                  currentTime={currentTime}
                  onSeek={onClipClick}
                />
              )}

              {studyView === 'history' && history && (
                <HistoryList items={history} currentId={convId} />
              )}
            </div>
          )}

          {/* Messages */}
          <div
            className={`flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 scrollbar-thin${
              studyView !== 'none' ? ' hidden' : ''
            }`}
          >
            {messages.length === 0 && !sending && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="font-mono text-white/50 text-xs">
                  Ask anything about the video.
                </div>
                <div className="font-mono text-white/30 text-[10px]">
                  Atlas will search the indexed clips and answer with timestamps.
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id ?? `live-${i}`}
                msg={msg}
                onClipClick={onClipClick}
                videoId={conv?.video_id}
              />
            ))}

            {error && (
              <p className="font-mono text-[10px] text-red-400 text-center">⚠ {error}</p>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="flex-none border-t border-white/30 p-3 bg-white/[0.03]">
            <div className="flex items-center gap-2 border border-white/40 focus-within:border-white transition-colors bg-white/[0.04]">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the video…"
                disabled={sending}
                className="flex-1 bg-transparent px-3 py-2.5 font-mono text-xs text-white placeholder:text-white/40 focus:outline-none disabled:opacity-40"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                className="px-4 py-2.5 font-mono text-xs text-black bg-white hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? '…' : '▶'}
              </button>
            </div>
            <p className="mt-1.5 font-mono text-[9px] text-white/15 text-right">
              Enter to send
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
