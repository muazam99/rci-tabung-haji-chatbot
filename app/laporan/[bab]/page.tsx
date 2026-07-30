import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, MessageSquareText } from "lucide-react";
import { parseChapter, chapterNumFromSlug, CHAPTER_SLUGS } from "@/lib/report-parser";
import { ScrollToHash } from "@/components/report/scroll-to-hash";

export function generateStaticParams() {
  return CHAPTER_SLUGS.map((bab) => ({ bab }));
}

interface PageProps {
  params: Promise<{ bab: string }>;
}

function loadReportMd(): string {
  return readFileSync(join(process.cwd(), "data", "report.md"), "utf-8");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { bab } = await params;
  const chapterNum = chapterNumFromSlug(bab);
  if (!chapterNum) return {};
  const blocks = parseChapter(loadReportMd(), chapterNum);
  const title = blocks.find((b) => b.type === "h1")?.text ?? `Bab ${chapterNum}`;
  return { title: `Bab ${chapterNum} — ${title} | Laporan RCI Tabung Haji` };
}

export default async function ChapterPage({ params }: PageProps) {
  const { bab } = await params;
  const chapterNum = chapterNumFromSlug(bab);
  if (!chapterNum) notFound();

  const blocks = parseChapter(loadReportMd(), chapterNum);
  if (blocks.length === 0) notFound();

  const prevNum = chapterNum > 1 ? chapterNum - 1 : null;
  const nextNum = chapterNum < 4 ? chapterNum + 1 : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <ScrollToHash />

      <nav className="mb-8 flex items-center justify-between text-sm text-muted-foreground">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground">
          <MessageSquareText className="size-4" />
          Kembali ke chatbot
        </Link>
        <div className="flex items-center gap-4">
          {prevNum && (
            <Link href={`/laporan/bab-${prevNum}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <ChevronLeft className="size-4" />
              Bab {prevNum}
            </Link>
          )}
          {nextNum && (
            <Link href={`/laporan/bab-${nextNum}`} className="inline-flex items-center gap-1 hover:text-foreground">
              Bab {nextNum}
              <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
      </nav>

      <article className="space-y-4 text-[15px] leading-relaxed">
        {blocks.map((block, i) => {
          if (block.type === "h1") {
            return (
              <h1 key={i} className="mb-6 text-2xl font-semibold tracking-tight">
                Bab {chapterNum} — {block.text}
              </h1>
            );
          }
          if (block.type === "h2") {
            return (
              <h2 key={i} className="pt-4 text-lg font-semibold tracking-tight">
                {block.text}
              </h2>
            );
          }
          return (
            <p
              key={i}
              id={block.anchorId}
              className="scroll-mt-20 rounded px-1 -mx-1 whitespace-pre-wrap"
            >
              {block.text}
            </p>
          );
        })}
      </article>

      <nav className="mt-10 flex items-center justify-between border-t pt-6 text-sm text-muted-foreground">
        {prevNum ? (
          <Link href={`/laporan/bab-${prevNum}`} className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-4" />
            Bab {prevNum}
          </Link>
        ) : (
          <span />
        )}
        {nextNum && (
          <Link href={`/laporan/bab-${nextNum}`} className="inline-flex items-center gap-1 hover:text-foreground">
            Bab {nextNum}
            <ChevronRight className="size-4" />
          </Link>
        )}
      </nav>
    </div>
  );
}
