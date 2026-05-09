'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface Props {
  text: string;
}

export default function MessageContent({ text }: Props) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="text-white">{children}</strong>,
          em: ({ children }) => <em className="text-white/90">{children}</em>,
          code: ({ children, ...props }) => {
            const inline = !(props as { node?: { position?: { start: { line: number }, end: { line: number } } } }).node ||
              (props as unknown as { node: { position?: { start: { line: number }, end: { line: number } } } }).node.position?.start.line ===
              (props as unknown as { node: { position?: { start: { line: number }, end: { line: number } } } }).node.position?.end.line;
            return inline ? (
              <code className="px-1 py-0.5 bg-white/10 text-white/90 rounded-sm">{children}</code>
            ) : (
              <code className="block px-3 py-2 bg-white/5 border border-white/10 my-2 overflow-x-auto whitespace-pre">{children}</code>
            );
          },
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-white/70">{children}</li>,
          h1: ({ children }) => <h3 className="text-sm font-bold text-white mt-3 mb-1">{children}</h3>,
          h2: ({ children }) => <h3 className="text-sm font-bold text-white mt-3 mb-1">{children}</h3>,
          h3: ({ children }) => <h3 className="text-sm font-bold text-white mt-3 mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/20 pl-3 my-2 text-white/60 italic">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline text-white hover:text-white/70">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
