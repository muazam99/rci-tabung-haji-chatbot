/**
 * Builds the "Kandungan" tab's table-of-contents tree from data/index.json.
 * Entries in that file are flat, keyed by a "Bab 1 — X › 1.1 Y" heading
 * path, and are NOT in document order (e.g. "1.2 Objektif" appears near the
 * end of the array, long after "1.9 Kerahsiaan"). Sorting every level by its
 * resolved PDF page fixes that, and also orders roman-numeral front-matter
 * chapters ahead of the arabic-numbered body without any special-casing.
 */

import indexData from "@/data/index.json";
import { pageRangeToPdfPage } from "@/lib/pdf-pages";

const SEP = " › ";

interface TocEntry {
  headingPath: string;
  pages: string;
  summary: string;
}

export interface TocNode extends TocEntry {
  title: string;
  pdfPage: number | null;
  children: TocNode[];
}

export function buildTocTree(): TocNode[] {
  const entries = indexData as TocEntry[];

  const nodes: TocNode[] = entries.map((entry) => ({
    ...entry,
    title: entry.headingPath.split(SEP).pop() ?? entry.headingPath,
    pdfPage: pageRangeToPdfPage(entry.pages),
    children: [],
  }));
  const byPath = new Map(nodes.map((n) => [n.headingPath, n]));

  const roots: TocNode[] = [];
  for (const node of nodes) {
    const segments = node.headingPath.split(SEP);
    const parentPath = segments.length > 1 ? segments.slice(0, -1).join(SEP) : null;
    const parent = parentPath ? byPath.get(parentPath) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Primary sort key is the resolved PDF page — needed to fix scattered file
  // order and to place roman-numeral front matter ahead of the arabic body.
  // But sibling sections sharing a chapter's opening page (e.g. "3.1
  // Pendahuluan" and "3.2 ..." both starting on page 31) tie on that key, so
  // fall back to comparing the leading "N.M" section number numerically.
  const sectionNumber = (title: string): number[] =>
    (title.match(/^\d+(?:\.\d+)*/)?.[0] ?? "").split(".").map(Number).filter((n) => !Number.isNaN(n));

  const compare = (a: TocNode, b: TocNode) => {
    const pageDiff = (a.pdfPage ?? 0) - (b.pdfPage ?? 0);
    if (pageDiff !== 0) return pageDiff;
    const [an, bn] = [sectionNumber(a.title), sectionNumber(b.title)];
    for (let i = 0; i < Math.max(an.length, bn.length); i++) {
      const diff = (an[i] ?? 0) - (bn[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };

  roots.sort(compare);
  for (const node of nodes) node.children.sort(compare);
  return roots;
}
