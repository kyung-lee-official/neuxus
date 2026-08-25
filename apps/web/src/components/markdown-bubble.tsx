import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownBubbleProps = {
  source: string;
  className?: string;
};

const components: Components = {
  h1: ({ children, ...props }) => (
    <h1
      className="m-0 mt-3 mb-1.5 font-bold font-display text-ink text-lg"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="m-0 mt-3 mb-1.5 font-bold font-display text-base text-ink"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="m-0 mt-2.5 mb-1 font-bold font-display text-ink text-sm"
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4
      className="m-0 mt-2 mb-1 font-bold font-display text-ink text-sm"
      {...props}
    >
      {children}
    </h4>
  ),
  p: ({ children, ...props }) => (
    <p
      className="m-0 my-1.5 font-display text-base text-ink leading-snug"
      {...props}
    >
      {children}
    </p>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-accent underline"
      rel="noopener noreferrer"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  ),
  ul: ({ children, ...props }) => (
    <ul className="m-0 my-1.5 ml-5 list-outside list-disc" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="m-0 my-1.5 ml-5 list-outside list-decimal" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="my-0.5" {...props}>
      {children}
    </li>
  ),
  hr: (props) => <hr className="my-3 border-line" {...props} />,
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="m-0 my-1.5 border-line border-l-4 pl-3 text-muted italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  pre: ({ children, ...props }) => (
    <pre
      className="m-0 my-1.5 overflow-auto rounded border border-line bg-canvas p-2.5 font-mono text-xs leading-snug"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ children, className, ...props }) => {
    const isBlock = typeof className === "string" && className.length > 0;
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded border border-line bg-canvas px-1 py-0.5 font-mono text-xs"
        {...props}
      >
        {children}
      </code>
    );
  },
  table: ({ children, ...props }) => (
    <table className="my-1.5 border-collapse text-sm" {...props}>
      {children}
    </table>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-canvas" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
  tr: ({ children, ...props }) => (
    <tr className="border-line border-t" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th
      className="border border-line px-2 py-1 text-left font-bold font-display"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-line px-2 py-1 align-top" {...props}>
      {children}
    </td>
  ),
};

export function MarkdownBubble({ source, className }: MarkdownBubbleProps) {
  return (
    <div
      className={["font-display text-base text-ink leading-snug", className]
        .filter(Boolean)
        .join(" ")}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
