import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { openPalette } from "../lib/store";
import { SearchGlyph } from "./SearchGlyph";

export const NAV = [
  { to: "/", label: "首页" },
  { to: "/life", label: "认识傅增湘" },
  { to: "/stories", label: "藏园故事" },
  { to: "/cases", label: "史料侦探" },
  { to: "/shelf", label: "双鉴书架" },
  { to: "/network", label: "书林往来" },
  { to: "/gallery", label: "藏园图像" },
];

export function Nav() {
  const loc = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const overHero = loc.pathname === "/" && !scrolled;

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [loc.pathname]);
  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <nav className={`nav ${overHero ? "dark" : "solid"}`}>
      <div className="nav-inner">
        <Link to="/" className="logo" aria-label="返回首页">
          <img className="logo-mark" src="/logo.webp" alt="" width={38} height={38} />
          <span className="logo-text">书魂永不散<span className="logo-sub">藏园</span></span>
        </Link>
        <div className={`nav-links ${open ? "open" : ""}`}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              {({ isActive }) => (
                <>
                  {n.label}
                  {isActive && <motion.span layoutId="nav-bar" className="bar" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                </>
              )}
            </NavLink>
          ))}
          <button className="nav-search" onClick={openPalette} title="快速跳转与检索（Ctrl K）" aria-label="检索">
            <SearchGlyph size={17} />
            <span className="nav-search-t">检索</span>
            <kbd className="nav-kbd">Ctrl K</kbd>
          </button>
        </div>
        <button className="nav-burger" onClick={() => setOpen((v) => !v)} aria-label="菜单">{open ? "×" : "☰"}</button>
      </div>
    </nav>
  );
}
