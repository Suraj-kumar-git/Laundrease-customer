// lib/json-ld.ts
// Safely serialize an object for embedding inside a
// <script type="application/ld+json"> tag via dangerouslySetInnerHTML.
// JSON.stringify() alone does not escape '<', so a value containing the
// literal substring "</script>" (e.g. an admin-editable support email or
// FAQ answer, sourced from platform_config / CMS content blocks) would
// close the script tag early and let arbitrary markup/script that follows
// it execute — a stored XSS reachable through any admin/CMS-editable field
// that ends up in structured data. Escaping to \uXXXX sequences round-trips
// through JSON.parse unchanged but can no longer break out of the tag.
//
// U+2028/U+2029 (line/paragraph separator) are built via String.fromCharCode
// rather than typed as literal characters in this source file — they're
// invisible in an editor, so a literal copy risks silently corrupting into
// the wrong character (or a plain space) with no visual way to catch it.
const LINE_SEPARATOR      = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LINE_SEPARATOR).join('\\u2028')
    .split(PARAGRAPH_SEPARATOR).join('\\u2029')
}
