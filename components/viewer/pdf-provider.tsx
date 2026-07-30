"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const PDF_URL = "/laporan-rci-tabung-haji.pdf";

interface PdfContextValue {
  pdfDoc: PDFDocumentProxy | null;
  numPages: number;
  loading: boolean;
  error: string | null;
}

const PdfContext = createContext<PdfContextValue>({
  pdfDoc: null,
  numPages: 0,
  loading: true,
  error: null,
});

export function usePdfDocument() {
  return useContext(PdfContext);
}

export function PdfProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PdfContextValue>({
    pdfDoc: null,
    numPages: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof import("pdfjs-dist").getDocument> | null = null;

    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        loadingTask = pdfjs.getDocument({ url: PDF_URL });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setState({ pdfDoc: doc, numPages: doc.numPages, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load PDF:", err);
        setState({ pdfDoc: null, numPages: 0, loading: false, error: "load_failed" });
      }
    }

    void load();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, []);

  return <PdfContext.Provider value={state}>{children}</PdfContext.Provider>;
}
