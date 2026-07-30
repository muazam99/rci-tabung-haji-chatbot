"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { PdfViewerHandle } from "@/components/viewer/pdf-viewer";
import { pageRangeToPdfPage, printedPageToPdfPage } from "@/lib/pdf-pages";
import paragraphsData from "@/data/paragraphs.json";

const paragraphs: Record<string, { page: string; headingPath: string }> = paragraphsData;

export interface PendingViewerTarget {
  page: number;
  paragraphId?: string;
}

interface ViewerContextValue {
  /** Attach this to the single <PdfViewer ref={viewerRef}> instance that
   *  lives in the workspace's left pane — every other component reaches
   *  the viewer through the actions below, never through this ref directly. */
  viewerRef: RefObject<PdfViewerHandle | null>;
  /** Jump the PDF pane to wherever a citation id (`"3.6.6"`) is printed,
   *  looked up via data/paragraphs.json (the same table the chat's
   *  citation validation uses). No-ops on an unknown id. */
  goToParagraph: (paragraphId: string) => void;
  /** Jump to a printed page label or range ("74", "3-11", "ix-x") — accepts
   *  both single citation labels and the range strings used by the table of
   *  contents and search results (lib/pdf-pages.ts). */
  goToPrintedPage: (label: string) => void;
  /** Set by goToPrintedPage/goToParagraph whenever `viewerRef.current` is
   *  null — on mobile, the PDF viewer is only mounted once the "Laporan"
   *  tab is actually selected, so a citation clicked from the "Pertanyaan"
   *  tab has nowhere to call `.goToPage()` on yet. The freshly-mounted
   *  PdfViewer reads this as its initial page/highlight instead. */
  pendingTarget: PendingViewerTarget | null;
  /** Called once a freshly-mounted PdfViewer has consumed `pendingTarget` as
   *  its initial page, so it isn't reapplied to a later, unrelated mount. */
  clearPendingTarget: () => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer must be used within <ViewerProvider>");
  return ctx;
}

interface ViewerProviderProps {
  children: ReactNode;
  /** Fired after a successful navigation — lets the mobile layout switch
   *  from the chat tab to the report tab when a citation is clicked. */
  onNavigate?: () => void;
}

export function ViewerProvider({ children, onNavigate }: ViewerProviderProps) {
  const viewerRef = useRef<PdfViewerHandle>(null);
  const onNavigateRef = useRef(onNavigate);
  const [pendingTarget, setPendingTarget] = useState<PendingViewerTarget | null>(null);
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  });

  const clearPendingTarget = useCallback(() => setPendingTarget(null), []);

  const goToPrintedPage = useCallback((label: string) => {
    const pdfPage = pageRangeToPdfPage(label);
    if (!pdfPage) return;
    if (viewerRef.current) viewerRef.current.goToPage(pdfPage);
    else setPendingTarget({ page: pdfPage });
    onNavigateRef.current?.();
  }, []);

  const goToParagraph = useCallback((paragraphId: string) => {
    const info = paragraphs[paragraphId];
    if (!info) return;
    const pdfPage = printedPageToPdfPage(info.page);
    if (!pdfPage) return;
    if (viewerRef.current) viewerRef.current.goToPage(pdfPage, paragraphId);
    else setPendingTarget({ page: pdfPage, paragraphId });
    onNavigateRef.current?.();
  }, []);

  return (
    <ViewerContext.Provider
      value={{ viewerRef, goToParagraph, goToPrintedPage, pendingTarget, clearPendingTarget }}
    >
      {children}
    </ViewerContext.Provider>
  );
}
