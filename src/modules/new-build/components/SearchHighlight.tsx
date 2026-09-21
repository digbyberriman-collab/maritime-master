import React from 'react';

/**
 * Renders a ts_headline fragment safely.
 *
 * The search functions mark matches with [[hl]] … [[/hl]] rather than <b>
 * tags, because ts_headline does not escape the text it highlights: emitting
 * HTML and rendering it with dangerouslySetInnerHTML turned any document
 * title into a stored-XSS vector. Splitting on the sentinels keeps the
 * highlight and renders everything else as text.
 */
const START = '[[hl]]';
const END = '[[/hl]]';

export function highlightParts(headline: string): Array<{ text: string; match: boolean }> {
  const parts: Array<{ text: string; match: boolean }> = [];
  let rest = headline;

  while (rest.length > 0) {
    const open = rest.indexOf(START);
    if (open < 0) {
      parts.push({ text: rest, match: false });
      break;
    }
    if (open > 0) parts.push({ text: rest.slice(0, open), match: false });

    const afterOpen = rest.slice(open + START.length);
    const close = afterOpen.indexOf(END);
    if (close < 0) {
      // Unterminated marker: treat the remainder as plain text.
      parts.push({ text: afterOpen, match: false });
      break;
    }
    parts.push({ text: afterOpen.slice(0, close), match: true });
    rest = afterOpen.slice(close + END.length);
  }

  return parts.filter((p) => p.text.length > 0);
}

const SearchHighlight: React.FC<{ headline: string; className?: string }> = ({ headline, className }) => (
  <p className={className}>
    {highlightParts(headline).map((part, i) =>
      part.match ? (
        <mark key={i} className="bg-warning/30 text-foreground rounded-sm px-0.5">
          {part.text}
        </mark>
      ) : (
        <React.Fragment key={i}>{part.text}</React.Fragment>
      ),
    )}
  </p>
);

export default SearchHighlight;
