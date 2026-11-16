import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Emotion = "idle" | "thinking" | "encourage" | "happy" | "sad" | "sleep";

type PageContext = { id: string | null; title: string; tip: string; questions: string[] };

type AgentState = {
  emotion: Emotion;
  /** Show an expression; reverts to idle after `ms` (0 = keep). */
  express: (e: Emotion, ms?: number) => void;
  page: PageContext;
  setPage: (p: Partial<PageContext>) => void;
  chatOpen: boolean;
  openChat: (question?: string) => void;
  closeChat: () => void;
  pendingQuestion: string | null;
  consumeQuestion: () => string | null;
  hidden: boolean;
  setHidden: (v: boolean) => void;
};

type SourceState = { open: (doc: string, bid?: string | null) => void; close: () => void; current: { doc: string; bid?: string | null } | null };

const AgentCtx = createContext<AgentState | null>(null);
const SourceCtx = createContext<SourceState | null>(null);

const SLEEP_AFTER = 75_000;

export function Providers({ children }: { children: ReactNode }) {
  const [emotion, setEmotion] = useState<Emotion>("idle");
  const [page, setPageState] = useState<PageContext>({ id: null, title: "", tip: "", questions: [] });
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingQuestion, setPending] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [source, setSource] = useState<{ doc: string; bid?: string | null } | null>(null);
  const revert = useRef<number>();
  const sleepTimer = useRef<number>();
  const emotionRef = useRef(emotion);
  emotionRef.current = emotion;

  const express = useCallback((e: Emotion, ms = 4500) => {
    window.clearTimeout(revert.current);
    setEmotion(e);
    if (ms > 0) revert.current = window.setTimeout(() => setEmotion("idle"), ms);
  }, []);

  useEffect(() => {
    const wake = () => {
      if (emotionRef.current === "sleep") setEmotion("idle");
      window.clearTimeout(sleepTimer.current);
      sleepTimer.current = window.setTimeout(() => {
        if (emotionRef.current === "idle") setEmotion("sleep");
      }, SLEEP_AFTER);
    };
    const evs = ["pointermove", "keydown", "scroll", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    wake();
    return () => evs.forEach((e) => window.removeEventListener(e, wake));
  }, []);

  const setPage = useCallback((p: Partial<PageContext>) => setPageState((old) => ({ ...old, ...p })), []);
  const openChat = useCallback((q?: string) => {
    if (q) setPending(q);
    setChatOpen(true);
  }, []);
  const consumeQuestion = useCallback(() => {
    const q = pendingQuestion;
    setPending(null);
    return q;
  }, [pendingQuestion]);

  const agent = useMemo<AgentState>(() => ({
    emotion, express, page, setPage, chatOpen, openChat, closeChat: () => setChatOpen(false),
    pendingQuestion, consumeQuestion, hidden, setHidden,
  }), [emotion, express, page, setPage, chatOpen, openChat, pendingQuestion, consumeQuestion, hidden]);

  const src = useMemo<SourceState>(() => ({
    open: (doc, bid) => setSource({ doc, bid }), close: () => setSource(null), current: source,
  }), [source]);

  return (
    <AgentCtx.Provider value={agent}>
      <SourceCtx.Provider value={src}>{children}</SourceCtx.Provider>
    </AgentCtx.Provider>
  );
}

export const useAgent = () => useContext(AgentCtx)!;
export const useSource = () => useContext(SourceCtx)!;

/** Register the current page with 小傅 (tip + suggested questions + RAG context). */
export function usePageAgent(p: Partial<PageContext>, deps: unknown[] = []) {
  const { setPage } = useAgent();
  useEffect(() => {
    setPage({ id: null, title: "", tip: "", questions: [], ...p });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
