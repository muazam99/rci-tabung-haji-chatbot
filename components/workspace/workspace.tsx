"use client";

import { useEffect, useRef, useState } from "react";
import { Coffee, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PdfProvider } from "@/components/viewer/pdf-provider";
import { PdfViewer } from "@/components/viewer/pdf-viewer";
import { ViewerProvider, useViewer } from "@/components/workspace/viewer-context";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { getUiStrings, type UiLanguage } from "@/lib/ui-strings";

const LANG_STORAGE_KEY = "rci-chat-lang";
const SPLIT_STORAGE_KEY = "rci-workspace-split";
const DISCLAIMER_DISMISSED_KEY = "rci-disclaimer-dismissed";
const DESKTOP_QUERY = "(min-width: 1024px)";
const MIN_SPLIT = 30;
const MAX_SPLIT = 75;
const DEFAULT_SPLIT = 55;
const BUY_ME_COFFEE_URL = "https://hashtech.bcl.my/embed/form/buy-me-a-coffee";

/** The single PDF viewer instance for the whole app — must live inside
 *  <ViewerProvider> so it can attach to the ref every citation click drives.
 *  Rendered from exactly one place at a time (see the isDesktop branch
 *  below), never both the desktop pane and a mobile tab simultaneously —
 *  two mounted instances would fight over the same ref and double-load the
 *  3.9MB PDF. */
function ViewerPane({ lang }: { lang: UiLanguage }) {
  const { viewerRef } = useViewer();
  return (
    <PdfProvider>
      <PdfViewer ref={viewerRef} lang={lang} />
    </PdfProvider>
  );
}

/** This entire component only ever runs client-side (see app/page.tsx,
 *  which loads it via next/dynamic with ssr:false) — the canvas-based PDF
 *  viewer and the desktop/mobile layout split both need real viewport and
 *  DOM measurements that don't exist during a server render pass anyway. */
export function Workspace() {
  const [lang, setLang] = useState<UiLanguage>("ms");
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT);
  const [mobileTab, setMobileTab] = useState<"report" | "chat">("chat");
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const strings = getUiStrings(lang);

  useEffect(() => {
    // Restoring persisted UI state after mount is deliberate — a lazy
    // useState initializer would read localStorage during the server
    // render pass too (where it doesn't exist), causing a hydration
    // mismatch (same rule this codebase already follows elsewhere).
    const storedLang = window.localStorage.getItem(LANG_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storedLang === "ms" || storedLang === "en") setLang(storedLang);

    const storedSplit = Number(window.localStorage.getItem(SPLIT_STORAGE_KEY));
    if (storedSplit >= MIN_SPLIT && storedSplit <= MAX_SPLIT) setSplitPercent(storedSplit);

    if (window.localStorage.getItem(DISCLAIMER_DISMISSED_KEY) === "1") setDisclaimerDismissed(true);

    const mq = window.matchMedia(DESKTOP_QUERY);
    // Both a matchMedia "change" listener AND a plain window "resize"
    // fallback: some environments (browser automation/CDP-driven viewport
    // resizing in particular) update window.innerWidth without reliably
    // dispatching a MediaQueryList change event, so the resize listener
    // re-checks matches() directly as a backstop.
    const recompute = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", recompute);
    window.addEventListener("resize", recompute);
    return () => {
      mq.removeEventListener("change", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  useEffect(() => {
    if (!isDragging) return;
    function onMove(e: PointerEvent) {
      const el = splitContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, pct)));
    }
    function onUp() {
      setIsDragging(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isDragging]);

  useEffect(() => {
    window.localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPercent));
  }, [splitPercent]);

  function dismissDisclaimer() {
    setDisclaimerDismissed(true);
    window.localStorage.setItem(DISCLAIMER_DISMISSED_KEY, "1");
  }

  return (
    <ViewerProvider onNavigate={() => setMobileTab("report")}>
      <div className="flex h-dvh flex-col">
        <header className="flex items-center justify-between border-b px-4 py-2">
          <div>
            <h1 className="text-base font-semibold">{strings.title}</h1>
            <p className="text-xs text-muted-foreground">{strings.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={BUY_ME_COFFEE_URL} target="_blank" rel="noopener noreferrer" />}
              aria-label={strings.buyMeCoffee}
            >
              <Coffee className="size-4" />
              {strings.buyMeCoffee}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLang((l) => (l === "ms" ? "en" : "ms"))}
              aria-label="Toggle language"
            >
              <Languages className="size-4" />
              {strings.languageToggleLabel}
            </Button>
          </div>
        </header>

        {!disclaimerDismissed && (
          <div className="flex items-center justify-between gap-2 border-b bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <span>{strings.disclaimerText}</span>
            <button
              type="button"
              onClick={dismissDisclaimer}
              className="shrink-0 underline underline-offset-2"
            >
              {strings.dismissDisclaimer}
            </button>
          </div>
        )}

        {isDesktop ? (
          <div ref={splitContainerRef} className="flex min-h-0 flex-1">
            <div style={{ width: `${splitPercent}%` }} className="min-w-[320px]">
              <ViewerPane lang={lang} />
            </div>
            <div
              onPointerDown={() => setIsDragging(true)}
              role="separator"
              aria-orientation="vertical"
              className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50"
            />
            <div className="min-w-0 flex-1">
              <ChatWorkspace lang={lang} />
            </div>
          </div>
        ) : (
          <Tabs
            value={mobileTab}
            onValueChange={(v) => setMobileTab(v as "report" | "chat")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-auto mt-2">
              <TabsTrigger value="report">{strings.tabReport}</TabsTrigger>
              <TabsTrigger value="chat">{strings.tabChat}</TabsTrigger>
            </TabsList>
            <TabsContent value="report" className="min-h-0 flex-1">
              <ViewerPane lang={lang} />
            </TabsContent>
            <TabsContent value="chat" className="min-h-0 flex-1">
              <ChatWorkspace lang={lang} hideSidebar />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ViewerProvider>
  );
}
