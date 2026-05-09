const TAG_WORD_SEPARATOR = /[-_/]+|[↔|]+/g;
const BRACKET_NOISE = /^[\[\]"'`#*]+|[\[\]"'`#*]+$/g;
const NON_WORD_UNICODE = /[^\p{L}\p{N}' ]+/gu;
const WHITESPACE_COLLAPSE = /\s+/g;

export function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function cleanTag(raw: string): string {
  return raw
    .trim()
    .replace(BRACKET_NOISE, "")
    .replace(TAG_WORD_SEPARATOR, " ")
    .replace(NON_WORD_UNICODE, " ")
    .replace(WHITESPACE_COLLAPSE, " ")
    .trim();
}
