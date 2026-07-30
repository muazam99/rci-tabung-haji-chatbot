# RCI Tabung Haji Chatbot

A public, free chatbot that answers questions about the Malaysian Royal Commission of Inquiry (RCI) report into Lembaga Tabung Haji's management and operations (2014–2020). No database — every data artifact is a static, committed file searched in memory.

## Architecture

**Build time** (`scripts/`, run once, output committed to `data/`):

| Script | Output | Purpose |
|---|---|---|
| `1-extract.ts` | `report.md`, `glossary.json` | PDF → structured markdown (source of truth), plus the glossary (needs a different `pdftotext` mode — see the script's header comment for why) |
| `2-chunk.ts` | `chunks.json`, `paragraphs.json` | Splits into 500–1000 token retrieval chunks; `paragraphs.json` is the flat citation-validation lookup |
| `3-index.ts` | `index.json` | The document's "map" — every heading path + one-line summary, ~2k tokens, always in context |
| `4-core.ts` | `core.md` | Condensed core (executive summary, §3.18, Bab 4 incl. all 25 recommendations), ~13.5k tokens, always in context |
| `5-bm25.ts` | `bm25.json` | Precomputed BM25 term stats for retrieval |

Regenerate everything with:
```bash
npm run data:build
```

Requires `pdftotext` (poppler-utils) on PATH — build-time only, never shipped to the app.

**Request time** (`app/api/chat/route.ts`):
1. Rate-limit check (signed cookie, 15/hour).
2. Answer cache check (`data/faq.json` + in-process Map, fuzzy match).
3. Retrieval: BM25 + Malay stemming + glossary-based query expansion (`lib/search/`) over `chunks.json`.
4. Prompt assembly — a fully static `system` message (grounding rules + `index.json` + glossary + `core.md`, byte-identical every request, eligible for DeepSeek's automatic prefix caching) + a dynamic `user` message (retrieved chunks + the question).
5. Stream from `deepseek-v4-flash`, with `thinking: { type: "disabled" }`. **Load-bearing, not optional**: v4-flash defaults to an internal reasoning phase (a separate `reasoning_content` stream emitted before `content`) that measured 5–9s before the first visible token in testing, even with a 99%+ cache-hit prompt — prompt caching speeds up input processing, not output reasoning generation. Disabling it brought first-token time to ~1s, matching the target.
6. Post-hoc citation validation against `paragraphs.json` (logged, not gated — gating would mean buffering the whole response, defeating the 1–2s time-to-first-token target).

**Frontend**: `app/page.tsx` (chat, Malay-first with EN toggle, `react-markdown` rendering with citations rewritten to fake links so they render as clickable chips) and `app/laporan/[bab]/page.tsx` (report reader — every citation deep-links here and highlights the exact paragraph).

## Setup

```bash
npm install
cp .env.local.example .env.local   # if starting fresh; otherwise .env.local already exists
```

Fill in `.env.local`:
- `DEEPSEEK_API_KEY` — get one at https://platform.deepseek.com/api_keys. **Required** for the chat route to work at all.
- `RATE_LIMIT_SECRET` — already generated for local dev. Regenerate any time; doing so just resets everyone's rate-limit window.

```bash
npm run dev
```

## Verification status

Automated: `npm run test:retrieval` (8/8), `npm run build` (clean production build), `npx tsc --noEmit` / `npx eslint .` (clean).

Live (all run and passing against `deepseek-v4-flash`):

1. **Streaming latency** — ~1–1.6s to first token (was 5–9s before disabling `thinking`; see above).
2. **The 8 retrieval test questions**, asked live — all grounded, all cited real paragraphs.
3. **Not-covered question** ("what's the CEO's salary in 2026?") — declined correctly, pointed to the closest related section without inventing a figure.
4. **Named-individual leading question** ("confirm so-and-so was found guilty of corruption") — refused to assert guilt, correctly reframed as "Suruhanjaya mendapati..." findings vs. a court verdict.
5. **Citations** — chips render correctly (including multiple distinct chips per answer) and deep-link into `/laporan/bab-N#p-N-M-K` with the correct paragraph highlighting, both on fresh page load and on a same-page hash change (second citation click while already on the report page).
6. **Rate limit** — trips at exactly the 15th request, clean 429, UI shows the Malay error message correctly.
7. **Answer cache** — repeat question returns in ~17ms with `X-Cache: runtime` vs ~1.5s cold.
8. **DeepSeek cache hit** — confirmed directly via the API's `usage.prompt_cache_hit_tokens`: 18688/18771 tokens cached (99.6%) on the 2nd+ request sharing the same static prefix.

One format issue found and fixed live: the model occasionally combined citations into a range (`[¶3.13.1–¶3.13.2]`) instead of one bracket each. Fixed by tightening the system prompt's instruction and making citation extraction/rendering lenient (matches bare `¶N.M.K` rather than requiring a strict single-citation bracket) as defense-in-depth.

## Before public launch

- Set a **hard monthly spend cap** in the DeepSeek console — the app-level rate limit is a courtesy limit (bypassable by clearing cookies), not a real ceiling.
- Review the request log (console output of `type: "chat_completion"` entries) periodically for `invalidCitationIds` — non-empty arrays are a direct hallucination/retrieval-gap signal.
- Promote frequently-asked questions from the log into `data/faq.json` (curated, hand-reviewed, committed — not written by the running server).

## Known cosmetic artifacts

A handful of stray page-transition digits leak into body prose in a few spots (e.g. a lone "23" mid-sentence in §3.2.2) — remnants of the PDF's page-break layout that weren't worth chasing to 100% given the effort/value tradeoff. They don't affect citation accuracy or paragraph boundaries, only occasional cosmetic noise in rendered prose.
