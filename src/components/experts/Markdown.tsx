"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Compact markdown renderer for chat replies. react-markdown doesn't render raw
// HTML unless rehype-raw is added, so model output is safe by default. We style
// the common elements inline (no typography plugin) and keep spacing tight so a
// streamed answer reads like a chat bubble, not a document.
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed text-stone-700 [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-stone-900">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 underline underline-offset-2"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <h3 className="mt-3 mb-1 text-sm font-semibold text-stone-900">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-3 mb-1 text-sm font-semibold text-stone-900">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 mb-1 text-sm font-semibold text-stone-900">{children}</h4>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-stone-300 pl-3 text-stone-600">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) =>
            className?.includes("language-") ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.85em] text-stone-800">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-stone-900 p-3 font-mono text-xs leading-relaxed text-stone-100">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-stone-200 bg-stone-50 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-stone-200 px-2 py-1 align-top">{children}</td>
          ),
          hr: () => <hr className="my-3 border-stone-200" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
