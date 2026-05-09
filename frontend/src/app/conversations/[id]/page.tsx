'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getConversation,
  getVideoFlashcards,
  getVideoNotes,
  streamMessage,
  type ConversationDetailResponse,
  type FlashcardItem,
  type MessageResponse,
  type SourceRef,
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

function MessageBubble({ msg, onClipClick }: { msg: LiveMessage; onClipClick?: (s: number) => void }) {
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
            <MessageContent text={msg.content} />
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

function FlashcardDeck({ cards }: { cards: FlashcardItem[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

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
    </div>
  );
}

export default function ConversationPage() {
  const router = useRouter();
  const params = useParams();
  const convId = Number(params.id);

  const [conv, setConv] = useState<ConversationDetailResponse | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [splitPct, setSplitPct] = useState(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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

  const [studyView, setStudyView] = useState<'none' | 'notes' | 'cards'>('none');
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyError, setStudyError] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<FlashcardItem[] | null>(null);
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

  // Fetch HLS stream URL for the native player
  useEffect(() => {
    if (!conv) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/videos/${conv.video_id}`)
      .then(r => r.json())
      .then((v: { hls_url: string | null }) => {
        if (v.hls_url) setHlsUrl(v.hls_url);
      })
      .catch(() => {/* degrade gracefully */});
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

    // Optimistically add user message
    const userMsg: LiveMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    try {
      let accText = '';
      let accSvg: string | null = null;
      let accRefs: SourceRef[] | null = null;

      for await (const event of streamMessage(convId, text)) {
        if (event.type === 'text_delta') {
          accText += event.delta;
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: accText, streaming: true };
            }
            return next;
          });
        } else if (event.type === 'svg') {
          accSvg = event.svg;
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, svg: accSvg, streaming: true };
            }
            return next;
          });
        } else if (event.type === 'sources') {
          accRefs = event.refs;
        } else if (event.type === 'done') {
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                id: event.message_id,
                content: accText,
                svg: accSvg,
                source_refs: accRefs,
                streaming: false,
              };
            }
            return next;
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setMessages(prev => prev.slice(0, -1)); // remove failed assistant placeholder
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, convId, messages.length]);

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

  const closeStudy = useCallback(() => setStudyView('none'), []);


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
            {hlsUrl ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-full" style={{ aspectRatio: '16/9' }}>
                  <AtlasPlayer src={hlsUrl} seekTo={seekTo} />
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
            <span className="font-mono text-[9px] text-white/20">{messages.length} MSG</span>
          </div>

          {/* Study panel (notes / flashcards) — overlays messages when active */}
          {studyView !== 'none' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-white/40 tracking-wider">
                  {studyView === 'notes' ? 'STUDY.NOTES' : 'FLASHCARDS'}
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
              <MessageBubble key={msg.id ?? `live-${i}`} msg={msg} onClipClick={onClipClick} />
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
