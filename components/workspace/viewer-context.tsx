"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { PdfViewerHandle } from "@/components/viewer/pdf-viewer";
import { printedPageToPdfPage } from "@/lib/pdf-pages";
import paragraphsData from "@/data/paragraphs.json";

const paragraphs: Record<string, { page: string; headingPath: string }> = paragraphsData;

interface ViewerContextValue {
  /** Attach this to the single <PdfViewer ref={viewerRef}> instance that
   *  lives in the workspace's left pane — every other component reaches
   *  the viewer through the actions below, never through this ref directly. */
  viewerRef: RefObject<PdfViewerHandle | null>;
  /** Jump the PDF pane to wherever a citation id (`"3.6.6"`) is printed,
   *  looked up via data/paragraphs.json (the same table the chat's
   *  citation validation uses). No-ops on an unknown id. */
  goToParagraph: (paragraphId: string) => void;
  /** Jump to a printed page label ("74"), same conversion the report
   *  reader's citations use (lib/pdf-pages.ts). */
  goToPrintedPage: (label: string) => void;
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
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  });

  const goToPrintedPage = useCallback((label: string) => {
    const pdfPage = printedPageToPdfPage(label);
    if (!pdfPage) return;
    viewerRef.current?.goToPage(pdfPage);
    onNavigateRef.current?.();
  }, []);

  const goToParagraph = useCallback((paragraphId: string) => {
    const info = paragraphs[paragraphId];
    if (!info) return;
    const pdfPage = printedPageToPdfPage(info.page);
    if (!pdfPage) return;
    viewerRef.current?.goToPage(pdfPage, paragraphId);
    onNavigateRef.current?.();
  }, []);

  return (
    <ViewerContext.Provider value={{ viewerRef, goToParagraph, goToPrintedPage }}>
      {children}
    </ViewerContext.Provider>
  );
}
