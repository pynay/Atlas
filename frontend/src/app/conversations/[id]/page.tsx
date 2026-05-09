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
            : 'border border-white/10 text-white/70 bg-transparent font-sans'
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
  const [studyView, setStudyView] = useState<'none' | 'notes' | 'cards'>('none');
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyError, setStudyError] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<FlashcardItem[] | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
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
    setRevealed(new Set());
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

  const toggleCard = useCallback((idx: number) => {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

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
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Video player */}
        <div className="w-1/2 flex flex-col border-r border-white/20 bg-black overflow-hidden">
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

        {/* Right: Chat panel */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="flex-none px-4 py-2 border-b border-white/10 flex items-center gap-2">
            <span className="font-mono text-[9px] text-white/30 tracking-wider">CHAT.INTERFACE</span>
            <div className="flex-1 h-px bg-white/10" />
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
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 scrollbar-thin">
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
                <div className="text-xs leading-relaxed text-white/70 border border-white/10 p-3 bg-white/[0.02]">
                  <MessageContent text={notes} />
                </div>
              )}

              {studyView === 'cards' && flashcards && (
                <div className="flex flex-col gap-2">
                  {flashcards.length === 0 && (
                    <p className="font-mono text-[10px] text-white/40">No cards produced.</p>
                  )}
                  {flashcards.map((card, i) => {
                    const open = revealed.has(i);
                    return (
                      <button
                        key={i}
                        onClick={() => toggleCard(i)}
                        className="text-left border border-white/10 hover:border-white/30 p-3 bg-white/[0.02] transition-colors"
                      >
                        <div className="font-mono text-[9px] text-white/30 tracking-wider mb-1">
                          {String(i + 1).padStart(2, '0')}
                        </div>
                        <div className="text-xs text-white/85 mb-2">{card.question}</div>
                        {open ? (
                          <div className="text-xs text-white/60 border-t border-white/10 pt-2 mt-1">
                            {card.answer}
                          </div>
                        ) : (
                          <div className="font-mono text-[9px] text-white/30">click to reveal</div>
                        )}
                      </button>
                    );
                  })}
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
                <div className="font-mono text-white/20 text-xs">
                  Ask anything about the video.
                </div>
                <div className="font-mono text-white/10 text-[10px]">
                  Cliff will search the indexed clips and answer with timestamps.
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
          <div className="flex-none border-t border-white/20 p-3">
            <div className="flex items-center gap-2 border border-white/20 focus-within:border-white/50 transition-colors">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the video…"
                disabled={sending}
                className="flex-1 bg-transparent px-3 py-2.5 font-mono text-xs text-white placeholder:text-white/20 focus:outline-none disabled:opacity-40"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                className="px-4 py-2.5 font-mono text-xs text-black bg-white hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
