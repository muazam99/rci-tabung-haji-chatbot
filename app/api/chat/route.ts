/**
 * POST /api/chat — retrieval + prompt assembly + DeepSeek call.
 *
 * Request body: { question: string }
 * Response: streamed plain text (text/plain), the model's answer. On a
 * cache hit, the full text comes back in one chunk instead of many — a
 * `fetch(...).body.getReader()` consumer doesn't need to tell the
 * difference, so the chat UI (app/page.tsx) handles both identically.
 *
 * Runs on the Node.js runtime (not edge) because it uses node:crypto for
 * the rate-limit cookie signature.
 *
 * Prompt assembly is split so the ENTIRE system message is byte-identical
 * on every request (STATIC_PREFIX is computed once at module load, not
 * per-request) — that's what makes it eligible for DeepSeek's automatic
 * prefix caching. Only the user message (retrieved chunks + the question)
 * varies. See the build plan for why this ordering is load-bearing.
 */

import { NextRequest } from "next/server";
import OpenAI from "openai";

import indexData from "@/data/index.json";
import glossaryData from "@/data/glossary.json";
import faqData from "@/data/faq.json";
import coreData from "@/data/core.json";
import paragraphsJson from "@/data/paragraphs.json";

import { retrieveChunks } from "@/lib/search/retrieve";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { checkRateLimit, getRateLimitCookieName } from "@/lib/rate-limit";
import { lookupCache, storeInRuntimeCache } from "@/lib/answer-cache";

export const runtime = "nodejs";

const TOP_K_CHUNKS = 12;
const MAX_QUESTION_LENGTH = 500;
const MAX_OUTPUT_TOKENS = 800;
const MODEL = "deepseek-v4-flash";

// --- Static, committed data loaded once at module scope (kept in memory
// for the life of the warm serverless instance — this is the "in-memory,
// no database" design the whole app is built around). Imported rather than
// read off disk so it's bundled at build time — the deployed target
// (Cloudflare Workers, via @opennextjs/cloudflare) has no filesystem to
// read from at runtime. ---
const CORE_MD = (coreData as { content: string }).content;
const paragraphsData = paragraphsJson as Record<string, { page: string; headingPath: string }>;

/** Everything that never changes between requests, assembled once. This is
 *  the object identity DeepSeek's cache keys off of — recomputing it per
 *  request (even with identical content) risks subtle formatting drift; a
 *  module-scope constant guarantees byte-for-byte stability. */
const STATIC_PREFIX: string = (() => {
  const glossaryText = Object.entries(glossaryData as Record<string, string>)
    .map(([abbrev, def]) => `${abbrev}: ${def}`)
    .join("\n");
  return [
    SYSTEM_PROMPT,
    "\n\n---\nPETA DOKUMEN (index.json):\n" + JSON.stringify(indexData),
    "\n\n---\nGLOSARI:\n" + glossaryText,
    "\n\n---\nTERAS LAPORAN (core.md):\n" + CORE_MD,
  ].join("\n");
})();

// Deliberately lenient: matches "¶N.M.K" wherever it appears, not just
// inside a well-formed "[¶N.M.K]" bracket. The system prompt instructs one
// citation per bracket, but model output isn't 100% guaranteed to follow
// that exactly (e.g. it may occasionally emit a combined range like
// "[¶3.13.1–¶3.13.2]") — this keeps validation/logging accurate regardless,
// since "¶" is a distinctive enough marker that it's never going to appear
// in this report's prose for any other reason.
function extractCitationIds(text: string): string[] {
  return [...text.matchAll(/¶([\d]+(?:\.[\d]+){1,2})/g)].map((m) => m[1]);
}

function jsonError(status: number, message: string, type?: string) {
  return new Response(JSON.stringify({ error: message, type }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: { question?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const question = (body.question ?? "").trim();
  if (!question) return jsonError(400, "Missing question.");
  if (question.length > MAX_QUESTION_LENGTH) {
    return jsonError(400, `Question too long (max ${MAX_QUESTION_LENGTH} characters).`);
  }

  // Rate limit — checked before any paid work happens.
  const incomingCookie = req.cookies.get(getRateLimitCookieName())?.value;
  const rateLimit = checkRateLimit(incomingCookie);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded — please try again later.",
        type: "rate_limited",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": rateLimit.setCookieHeader,
        },
      }
    );
  }

  // Answer cache — zero API cost, near-zero latency on a hit.
  const cacheHit = lookupCache(question, faqData as Record<string, string>);
  if (cacheHit) {
    return new Response(cacheHit.answer, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Cache": cacheHit.source,
        "Set-Cookie": rateLimit.setCookieHeader,
      },
    });
  }

  const retrieved = retrieveChunks(question, TOP_K_CHUNKS);
  const retrievedText = retrieved
    .map((c) => `[[${c.id} | ${c.headingPath} | m.s. ${c.pages}]]\n${c.content}`)
    .join("\n\n");
  const userMessage = `PETIKAN DIPEROLEH DARIPADA LAPORAN:\n${retrievedText}\n\n---\nSOALAN PENGGUNA:\n${question}`;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return jsonError(500, "Server misconfigured: DEEPSEEK_API_KEY is not set.");
  }
  const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });

  const createStream = () =>
    client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: STATIC_PREFIX },
        { role: "user", content: userMessage },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true as const,
      // DeepSeek-specific, not in the OpenAI SDK's types (hence the cast
      // below). v4-flash defaults to an internal reasoning phase — a
      // separate `reasoning_content` stream emitted BEFORE `content` — that
      // measured 5-9s in testing before the first visible answer token,
      // blowing well past the 1-2s target even with a fully cache-hit
      // prompt (prompt caching speeds up input processing, not output
      // reasoning generation). Disabling it brought first-token time to
      // ~1s. This task is retrieval-grounded extraction/summarization, not
      // something that benefits from chain-of-thought.
      thinking: { type: "disabled" },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming & {
      thinking: { type: "disabled" };
    });

  let modelStream: Awaited<ReturnType<typeof createStream>>;
  try {
    modelStream = await createStream();
  } catch (err) {
    console.error("DeepSeek API call failed:", err);
    return jsonError(502, "Failed to reach the language model.");
  }

  let fullText = "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of modelStream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            fullText += delta;
            controller.enqueue(encoder.encode(delta));
          }
        }
      } catch (err) {
        console.error("Streaming error:", err);
      } finally {
        controller.close();

        // Citation validation happens AFTER the stream closes, not before
        // sending the first byte — gating on full validation would mean
        // buffering the whole response, which defeats the 1-2s
        // time-to-first-token requirement. An invalid citation here is
        // logged as a hallucination/retrieval-gap signal for later review
        // (see the build plan's operational guardrails), not silently
        // edited out of a response the user already saw streaming in.
        const citedIds = extractCitationIds(fullText);
        const invalidCitationIds = citedIds.filter((id) => !(id in paragraphsData));
        console.log(
          JSON.stringify({
            type: "chat_completion",
            question,
            retrievedChunkIds: retrieved.map((c) => c.id),
            citedIds,
            invalidCitationIds,
            timestamp: new Date().toISOString(),
          })
        );

        if (fullText.trim() && invalidCitationIds.length === 0) {
          storeInRuntimeCache(question, fullText);
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Cache": "miss",
      "Set-Cookie": rateLimit.setCookieHeader,
    },
  });
}
