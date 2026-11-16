import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

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
  const nav = useNavigate();
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
          <span className="logo-seal">藏</span>
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
          <button className="nav-search" onClick={() => nav("/search")} title="检索全站" aria-label="检索">⌕</button>
        </div>
        <button className="nav-burger" onClick={() => setOpen((v) => !v)} aria-label="菜单">{open ? "×" : "☰"}</button>
      </div>
    </nav>
  );
}
