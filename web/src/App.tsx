import { AnimatePresence, motion } from "framer-motion";
import Lenis from "lenis";
import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { InkCursor } from "./components/InkCursor";
import { Nav } from "./components/Nav";
import { Palette } from "./components/Palette";
import { SourceDrawer } from "./components/SourceDrawer";
import { XiaoFu } from "./components/XiaoFu";
import { CaseDetail, Cases } from "./pages/Cases";
import { DocReader } from "./pages/DocReader";
import { Gallery } from "./pages/Gallery";
import { Home } from "./pages/Home";
import { Life } from "./pages/Life";
import { Network } from "./pages/Network";
import { Search } from "./pages/Search";
import { Shelf } from "./pages/Shelf";
import { Stories, StoryDetail } from "./pages/Stories";
import { WikiView } from "./pages/WikiView";

function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.main>
  );
}

export default function App() {
  const loc = useLocation();

  useEffect(() => {
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    (window as any).__lenis = lenis;
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);

  useEffect(() => {
    if (!loc.hash) (window as any).__lenis?.scrollTo(0, { immediate: true }) ?? window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <>
      <Nav />
      <AnimatePresence mode="wait">
        <Routes location={loc} key={loc.pathname}>
          <Route path="/" element={<Page><Home /></Page>} />
          <Route path="/life" element={<Page><Life /></Page>} />
          <Route path="/stories" element={<Page><Stories /></Page>} />
          <Route path="/stories/:id" element={<Page><StoryDetail /></Page>} />
          <Route path="/cases" element={<Page><Cases /></Page>} />
          <Route path="/cases/:id" element={<Page><CaseDetail /></Page>} />
          <Route path="/shelf" element={<Page><Shelf /></Page>} />
          <Route path="/network" element={<Page><Network /></Page>} />
          <Route path="/gallery" element={<Page><Gallery /></Page>} />
          <Route path="/wiki/:id" element={<Page><WikiView /></Page>} />
          <Route path="/doc/:id" element={<Page><DocReader /></Page>} />
          <Route path="/search" element={<Page><Search /></Page>} />
          <Route path="*" element={<Page><div className="page container empty">页面不存在。<a className="link-zhu" href="/">回到首页</a></div></Page>} />
        </Routes>
      </AnimatePresence>
      <SourceDrawer />
      <Palette />
      <XiaoFu />
      <InkCursor />
    </>
  );
}
