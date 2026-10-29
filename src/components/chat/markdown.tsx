"use client";

import ReactMarkdown, { type Components } from "react-markdown";

// Raw HTML is never rendered (skipHtml) and react-markdown's default
// urlTransform strips javascript:/data: URLs. Links open in a new tab
// without leaking the opener or referrer.
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  img: ({ alt }) => <span>{alt ? `[image: ${alt}]` : null}</span>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md break-words">
      <ReactMarkdown skipHtml components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
