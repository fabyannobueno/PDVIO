import React from "react";

/**
 * Renderiza marcações leves usadas pelo bot do suporte:
 *   **negrito**, *itálico*, `código`, links http(s), listas iniciadas
 *   por "- " ou "* ", quebras de linha e parágrafos.
 *
 * Não é um parser completo de Markdown — é o suficiente pras mensagens
 * vindas do PDV.IA não aparecerem com `**` literal na tela.
 */

const URL_RE = /(https?:\/\/[^\s)]+|\/[a-zA-Z0-9_\-/]+)/g;

/** Renderiza um trecho inline aplicando **bold**, *italic*, `code` e links. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Quebra primeiro por código `...`, depois por **bold**, depois *italic*.
  // Cada passada produz um array de nós (strings ou React elements).
  type Node = string | React.ReactElement;
  let nodes: Node[] = [text];

  const splitBy = (
    re: RegExp,
    wrap: (inner: string, key: string) => React.ReactElement,
  ) => {
    const next: Node[] = [];
    nodes.forEach((node, i) => {
      if (typeof node !== "string") {
        next.push(node);
        return;
      }
      const parts = node.split(re);
      parts.forEach((part, j) => {
        if (j % 2 === 1) {
          next.push(wrap(part, `${keyPrefix}-${i}-${j}`));
        } else if (part) {
          next.push(part);
        }
      });
    });
    nodes = next;
  };

  // `código`
  splitBy(/`([^`]+)`/g, (inner, key) => (
    <code
      key={key}
      className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.85em]"
    >
      {inner}
    </code>
  ));

  // **negrito**
  splitBy(/\*\*([^*]+)\*\*/g, (inner, key) => (
    <strong key={key} className="font-semibold">
      {inner}
    </strong>
  ));

  // *itálico*
  splitBy(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, (inner, key) => (
    <em key={key}>{inner}</em>
  ));

  // Links: aplica só nos pedaços que ainda são string.
  const finalNodes: Node[] = [];
  nodes.forEach((node, i) => {
    if (typeof node !== "string") {
      finalNodes.push(node);
      return;
    }
    const parts = node.split(URL_RE);
    parts.forEach((part, j) => {
      if (!part) return;
      if (j % 2 === 1) {
        const isExternal = part.startsWith("http");
        finalNodes.push(
          <a
            key={`${keyPrefix}-l-${i}-${j}`}
            href={part}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {part}
          </a>,
        );
      } else {
        finalNodes.push(part);
      }
    });
  });

  return finalNodes;
}

export function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  // Normaliza quebras de linha do Windows.
  const normalized = text.replace(/\r\n/g, "\n");

  // Agrupa linhas em blocos: parágrafos OU listas (- / *).
  type Block = { type: "p"; lines: string[] } | { type: "ul"; items: string[] };
  const blocks: Block[] = [];
  let cur: Block | null = null;

  const lines = normalized.split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      const item = bulletMatch[1];
      if (cur && cur.type === "ul") {
        cur.items.push(item);
      } else {
        cur = { type: "ul", items: [item] };
        blocks.push(cur);
      }
      continue;
    }
    if (line.trim() === "") {
      // Linha em branco encerra o bloco atual.
      cur = null;
      continue;
    }
    if (cur && cur.type === "p") {
      cur.lines.push(line);
    } else {
      cur = { type: "p", lines: [line] };
      blocks.push(cur);
    }
  }

  return (
    <div className={className}>
      {blocks.map((block, idx) => {
        if (block.type === "ul") {
          return (
            <ul key={`ul-${idx}`} className="my-1 list-disc space-y-0.5 pl-5">
              {block.items.map((item, i) => (
                <li key={`li-${idx}-${i}`}>{renderInline(item, `li-${idx}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p
            key={`p-${idx}`}
            className={idx === 0 ? "" : "mt-1.5"}
            style={{ whiteSpace: "pre-wrap" }}
          >
            {block.lines.map((ln, i) => (
              <React.Fragment key={`ln-${idx}-${i}`}>
                {i > 0 && <br />}
                {renderInline(ln, `p-${idx}-${i}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
