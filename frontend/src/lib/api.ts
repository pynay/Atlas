const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface VideoResponse {
  id: number;
  source_url: string;
  title: string | null;
  duration: number | null;
  status: 'pending' | 'indexing' | 'ready' | 'failed';
  error: string | null;
  hls_url: string | null;
  created_at: string;
}

export interface ConversationResponse {
  id: number;
  video_id: number;
  created_at: string;
}

export interface SourceRef {
  start: number;
  end: number;
  rank: number;
  thumbnail_url: string | null;
}

export interface MessageResponse {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  svg: string | null;
  source_refs: SourceRef[] | null;
  created_at: string;
}

export interface ConversationDetailResponse {
  id: number;
  video_id: number;
  created_at: string;
  messages: MessageResponse[];
}

export async function createVideo(url: string): Promise<VideoResponse> {
  const res = await fetch(`${API_BASE}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getVideo(id: number): Promise<VideoResponse> {
  const res = await fetch(`${API_BASE}/videos/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createConversation(videoId: number): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: videoId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getConversation(id: number): Promise<ConversationDetailResponse> {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type SSEEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'svg'; svg: string }
  | { type: 'sources'; refs: SourceRef[] }
  | { type: 'done'; message_id: number };

export async function* streamMessage(
  conversationId: number,
  content: string,
): AsyncGenerator<SSEEvent> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let eventName = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        try {
          const payload = JSON.parse(raw);
          if (eventName === 'text_delta') yield { type: 'text_delta', delta: payload.delta };
          else if (eventName === 'svg') yield { type: 'svg', svg: payload.svg };
          else if (eventName === 'sources') yield { type: 'sources', refs: payload.refs };
          else if (eventName === 'done') yield { type: 'done', message_id: payload.message_id };
        } catch {
          // malformed line — skip
        }
        eventName = '';
      }
    }
  }
}

export function toYouTubeEmbedUrl(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    let videoId: string | null = null;
    if (url.hostname === 'youtu.be') {
      videoId = url.pathname.slice(1);
    } else if (url.hostname.includes('youtube.com')) {
      videoId = url.searchParams.get('v');
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=0` : null;
  } catch {
    return null;
  }
}
