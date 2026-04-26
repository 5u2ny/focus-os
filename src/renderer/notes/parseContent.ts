// Safely parse stored TipTap JSON. An empty/invalid string MUST become an
// empty string (TipTap accepts that) — never `{}`, which is not a valid
// ProseMirror doc and throws "Invalid content for node doc" on first render.
//
// Extracted from Editor.tsx so it can be unit-tested without pulling the
// entire @tiptap/react module graph into the test runner.
export const parseContent = (raw: string): any => {
  if (!raw || raw === '{}') return ''
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || parsed.type !== 'doc') return ''
    return parsed
  } catch {
    return ''
  }
}
