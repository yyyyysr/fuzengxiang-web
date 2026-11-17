import { AnimatePresence, motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InkBlot, Mist, ridge } from "../components/Ink";
import { Loader } from "../components/Loader";
import { PointerMist } from "../components/PointerMist";
import { TiltLink } from "../components/Tilt";
import { CloudDivider, CountUp, Reveal, SplitText, Stamp } from "../components/ui";
import { Avatar } from "../components/XiaoFu";
import { api, kbAsset, type ImageItem } from "../lib/api";
import { artUrl, LIFE_CHAPTERS } from "../lib/scenes";
import { useAgent, usePageAgent } from "../lib/store";

const POEM = ["篇篇题跋妙钩玄", "过目都留副本存", "手校宋元八千卷", "书魂永不散藏园"];

type Scene = { year: string; place: string; title: string; text: string; img: string; to: string; cta: string; tone?: "sad" };
const SCENES: Scene[] = [
  { year: "1872", place: "四川江安", title: "生于蜀中", text: "傅增湘字沅叔，祖父傅诚留下一部元兴文署本《资治通鉴音注》——这是日后“双鉴”的第一鉴。", img: "img-0009", to: "/life", cta: "认识傅增湘" },
  { year: "1911", place: "上海 · 苏州", title: "放意搜求", text: "南北议和留沪数月，访书苏州，购得四库进呈宋刊《古文集成》，从此“放意搜求”旧本精椠。", img: "img-0062", to: "/wiki/1911-购得宋刊古文集成", cta: "看这件事" },
  { year: "1916", place: "天津", title: "双鉴名楼", text: "收得端方旧藏宋本《资治通鉴》，与祖遗元刊相配，名藏书处为“双鉴楼”。", img: "img-0037", to: "/wiki/双鉴楼", cta: "双鉴楼的三种说法" },
  { year: "1918", place: "北京 · 石老娘胡同", title: "卜宅藏园", text: "取东坡“万人如海一身藏”诗意，名宅为藏园。此后每日校书三十页，平生手校一万六千余卷。", img: "img-0069", to: "/stories/校一页通典", cta: "和小傅校一页书" },
  { year: "1930", place: "北平", title: "书林斡旋", text: "海源阁宋本《扬子法言》被赵万里、邢之襄各得其半，傅增湘居间斡旋，终成完璧。", img: "img-0040", to: "/stories/扬子法言合璧", cta: "拼合半部书" },
  { year: "1941", place: "琉璃厂 · 文友堂", title: "一夜之火", text: "送修的北宋本《乐府诗集》因装工拖延一日未送回书肆——当夜文友堂失火。", img: "img-0068", to: "/stories/乐府诗集避火", cta: "书当夜在哪里？", tone: "sad" },
  { year: "1949", place: "北京图书馆", title: "藏书归公", text: "手校书、“双鉴”与外库书分批进入公藏。“私家之守，不敌公库之藏矣。”", img: "img-0011", to: "/stories/藏园群书入公藏", cta: "沿清册追踪" },
];

const POSTERS = ["story-yuefu-3", "story-yangzi-2", "story-flood-2"];
const SPINES = ["#2e4855", "#7a2b22", "#3b4d3f", "#6b4a2b", "#4a3f5c", "#2f3e4e", "#5b3a2e"];

export function Home() {
  const [ready, setReady] = useState(() => sessionStorage.getItem("fzx-loaded") === "1");
  const onDone = useCallback(() => { sessionStorage.setItem("fzx-loaded", "1"); setReady(true); }, []);
  usePageAgent({
    tip: "欢迎来到藏园！往下滚动展开长卷，点亮画中的线索；也可以直接从一个故事开始。",
    questions: ["傅增湘是谁？用三句话介绍一下", "“双鉴楼”这个名字是怎么来的？"],
  });
  return (
    <>
      {!ready && <Loader onDone={onDone} />}
      <Hero ready={ready} />
      <Scroll />
      <Entrances />
      <Columns />
      <GalleryStrip />
      <Footer />
    </>
  );
}

function Hero({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 220]);
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 110]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const mx = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 18 });
  const tilt = useTransform(sx, [-1, 1], [14, -14]);
  return (
    <section className="hero" ref={ref} onPointerMove={(e) => mx.set((e.clientX / window.innerWidth) * 2 - 1)}>
      <motion.div className="hero-art" style={{ x: tilt, y: bgY }}>
        <motion.div className="hero-art-frame" initial={{ scale: 1.1, opacity: 0 }} animate={ready ? { scale: 1, opacity: 1 } : {}} transition={{ duration: 3.2, ease: [0.22, 1, 0.36, 1] }}>
          <img src={artUrl("hero-cangyuan")} alt="" decoding="async" />
          <span className="hero-lamp" />
          <span className="hero-lamp hero-lamp-water" />
        </motion.div>
      </motion.div>
      <div className="hero-veil" />
      <Mist />
      <PointerMist />
      <motion.div className="hero-content" style={{ opacity: fade, y }}>
        <div className="hero-poem">
          {ready && POEM.map((line, i) => (
            <div key={i} className="poem-col brush">
              {line.split("").map((ch, j) => (
                <motion.span key={j} initial={{ opacity: 0, filter: "blur(10px)", y: -10 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                  transition={{ delay: 0.4 + (POEM.length - 1 - i) * 0.55 + j * 0.07, duration: 0.8 }}>{ch}</motion.span>
              ))}
            </div>
          ))}
          {ready && <motion.div className="hero-poem-cite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3 }}>伦明《辛亥以来藏书纪事诗》</motion.div>}
        </div>
        <motion.div className="hero-title" initial={{ opacity: 0, x: 30 }} animate={ready ? { opacity: 1, x: 0 } : {}} transition={{ delay: 1.2, duration: 1.2 }}>
          <Stamp text="傅增湘" size={78} />
          <h1><SplitText text="藏园" play={ready} delay={1.5} stagger={0.22} /><span className="hero-h1-sub">书魂</span></h1>
          <p>傅增湘（1872—1949）<br />访书 · 辨书 · 校书 · 护书 · 传书</p>
          <div className="hero-actions">
            <button className="btn solid" onClick={() => document.getElementById("scroll")?.scrollIntoView({ behavior: "smooth" })}>展开长卷</button>
            <button className="btn hero-skip" onClick={() => document.getElementById("entrances")?.scrollIntoView({ behavior: "smooth" })}>跳过引入 →</button>
          </div>
        </motion.div>
      </motion.div>
      <motion.div className="hero-hint scroll-hint" style={{ opacity: fade }}><span>向下滚动</span><span className="line" /></motion.div>
    </section>
  );
}

function Scroll() {
  const ref = useRef<HTMLElement>(null);
  const { express } = useAgent();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 24, mass: 0.4 });
  const trackW = SCENES.length * 520 + 900;
  const [vw, setVw] = useState(1200);
  useEffect(() => { const on = () => setVw(window.innerWidth); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  const x = useTransform(smooth, [0, 1], [0, -(trackW - vw)]);
  const farX = useTransform(smooth, [0, 1], [0, -(trackW - vw) * 0.35]);
  const pct = useTransform(smooth, (v) => `${Math.round(v * 100)}%`);
  const headOpacity = useTransform(smooth, [0, 0.06, 0.12], [1, 1, 0]);
  const headY = useTransform(smooth, [0, 0.12], [0, -30]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<Scene | null>(null);

  useEffect(() => smooth.on("change", (v) => {
    const i = Math.min(SCENES.length - 1, Math.max(0, Math.floor(v * SCENES.length * 1.02)));
    setActive((old) => {
      if (old !== i) express(SCENES[i].tone === "sad" ? "sad" : "idle", 2500);
      return i;
    });
  }), [smooth, express]);

  return (
    <section id="scroll" className="scroll-section" ref={ref} style={{ height: `${SCENES.length * 70 + 100}vh` }}>
      <div className="scroll-sticky">
        <div className="scroll-progress">
          <div className="scroll-progress-track"><motion.span style={{ scaleX: smooth }} /></div>
          <div className="scroll-progress-labels">
            {SCENES.map((s, i) => <span key={s.year} className={i === active ? "on" : ""}>{s.year}</span>)}
          </div>
          <motion.span className="scroll-pct">{pct}</motion.span>
        </div>
        <motion.div className="scroll-heading" style={{ opacity: headOpacity, y: headY }}>
          <span className="eyebrow">藏园长卷</span>
          <h2 className="brush"><SplitText text="一卷书林，七十八年" inView /></h2>
        </motion.div>
        <motion.svg className="scroll-far" style={{ x: farX }} viewBox={`0 0 ${trackW} 500`} preserveAspectRatio="none" aria-hidden>
          <path d={ridge(trackW, 500, 330, 230, 5, 14)} fill="#7d7366" opacity="0.18" />
          <path d={ridge(trackW, 500, 400, 180, 17, 18)} fill="#4a443b" opacity="0.2" />
        </motion.svg>
        <motion.div className="scroll-track" style={{ x, width: trackW }}>
          <svg className="scroll-ground" viewBox={`0 0 ${trackW} 300`} preserveAspectRatio="none" aria-hidden>
            <path d={ridge(trackW, 300, 230, 110, 29, 22)} fill="#2c2823" opacity="0.35" />
            <path d={`M0 270 C ${trackW * 0.25} 250, ${trackW * 0.5} 290, ${trackW} 262`} stroke="#a8322a" strokeWidth="1.5" fill="none" strokeDasharray="6 10" opacity="0.55" />
          </svg>
          <div className="scroll-intro">
            <p className="brush">展卷</p>
            <p className="muted">滚动鼠标，沿着傅增湘的一生向右行进；点击发光的线索，打开画中的故事。</p>
          </div>
          {SCENES.map((s, i) => (
            <div key={s.year} className={`scene ${i % 2 ? "low" : "high"} ${i === active ? "active" : ""}`} style={{ left: 720 + i * 520 }}>
              <button className="scene-art" onClick={() => setOpen(s)} aria-label={`打开：${s.title}`}>
                <img src={kbAsset(`images/thumbs/${s.img}.jpg`)} alt={s.title} loading="lazy" />
                <span className="hotspot"><i /></span>
              </button>
              <div className="scene-text">
                <span className="scene-year">{s.year}</span>
                <span className="scene-place">{s.place}</span>
                <h3 className="brush">{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </div>
          ))}
          <div className="scroll-end" style={{ left: 720 + SCENES.length * 520 }}>
            <p className="brush">卷终</p>
            <Link className="btn zhu" to="/life">打开完整年谱 →</Link>
          </div>
        </motion.div>
      </div>
      <AnimatePresence>
        {open && <SceneModal scene={open} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </section>
  );
}

function SceneModal({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const nav = useNavigate();
  const { express } = useAgent();
  useEffect(() => { express(scene.tone === "sad" ? "sad" : "happy", 3000); }, [scene, express]);
  return (
    <motion.div className="modal-mask" data-scroll-trap initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="scene-modal" initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }} onClick={(e) => e.stopPropagation()}>
        <img src={kbAsset(`images/${scene.img}.${scene.img === "img-0069" ? "jpg" : "png"}`)} onError={(e) => ((e.target as HTMLImageElement).src = kbAsset(`images/thumbs/${scene.img}.jpg`))} alt={scene.title} />
        <div>
          <span className="seal">{scene.year} · {scene.place}</span>
          <h3 className="brush">{scene.title}</h3>
          <p>{scene.text}</p>
          <div className="row">
            <button className="btn solid" onClick={() => nav(scene.to)}>{scene.cta}</button>
            <button className="btn" onClick={onClose}>继续展卷</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Entrances() {
  const { openChat } = useAgent();
  return (
    <section id="entrances" className="section entrances">
      <InkBlot size={520} className="blot-l" />
      <div className="container">
        <Reveal className="center">
          <span className="eyebrow">从这里开始</span>
          <h2 className="section-title brush"><SplitText text="翻开一条线索" inView /></h2>
          <CloudDivider />
        </Reveal>
        <div className="entr-grid">
          <Reveal delay={0.1}>
            <TiltLink to="/stories/乐府诗集避火" className="entr-card story" max={6}>
              <span className="entr-tag">藏园故事 · 约一分钟</span>
              <h3 className="brush">从一个藏书故事开始</h3>
              <p>民国三十年孟春，琉璃厂文友堂一夜大火。傅增湘珍藏二十年的北宋本《乐府诗集》，那天晚上在哪里？</p>
              <span className="entr-go">开始探索 →</span>
            </TiltLink>
          </Reveal>
          <Reveal delay={0.2} className="entr-guide">
            <Avatar emotion="encourage" size={180} className="float" />
            <button className="btn small zhu" onClick={() => openChat("我该从哪里开始了解傅增湘？")}>问小傅：从哪里开始？</button>
          </Reveal>
          <Reveal delay={0.3}>
            <TiltLink to="/cases/鹤林玉露信札系年" className="entr-card case" max={6}>
              <span className="entr-tag">史料侦探 · 推理</span>
              <h3 className="brush">查一则史料疑案</h3>
              <p>一封谈《鹤林玉露》的信，题跋落款是 1938 年，可信里的一句“刚主兄将回”却指向另一个年份……</p>
              <span className="entr-go">开始推理 →</span>
            </TiltLink>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Stat({ n, unit }: { n?: number; unit: string }) {
  return n ? <span className="b-stat"><CountUp to={n} /> {unit}</span> : null;
}

function Columns() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [people, setPeople] = useState<string[]>([]);
  const [imgs, setImgs] = useState<ImageItem[]>([]);
  useEffect(() => {
    api<{ counts: Record<string, number> }>("/overview").then((d) => setCounts(d.counts)).catch(() => {});
    api<{ id: string; title: string }[]>("/people").then((d) => setPeople(d.filter((p) => p.id !== "傅增湘").map((p) => p.title))).catch(() => {});
    api<ImageItem[]>("/images").then((d) => setImgs(["seal", "calligraphy", "letter"].map((k) => d.find((x) => x.kind === k)).filter(Boolean) as ImageItem[])).catch(() => {});
  }, []);
  const ring = people.filter((n) => !n.startsWith("傅")).slice(0, 9);
  return (
    <section className="section columns">
      <div className="container">
        <Reveal className="center">
          <span className="eyebrow">六个栏目</span>
          <h2 className="section-title brush"><SplitText text="认识人，追一卷书，查一条证据" inView stagger={0.04} /></h2>
          <p className="muted center-text">每一个可展示的事实和人物连线，都能打开出处，回到原文的那一段。</p>
        </Reveal>
        <div className="bento">
          <Reveal className="b-cell b-life">
            <TiltLink to="/life" className="bento-tile dark" max={4}>
              <img className="b-bg" src={artUrl("chapter-1")} alt="" loading="lazy" />
              <div className="b-body">
                <span className="col-seal">人</span>
                <span className="b-eyebrow">认识傅增湘</span>
                <h3 className="brush b-big">七十八年 · 六个篇章</h3>
                <p>光柱下翻开《傅增湘年谱》，滚轮一下翻一个时刻；跨入新篇章时，一阵烟雾掠过画面。</p>
                <div className="b-chapters">{LIFE_CHAPTERS.map((c) => <span key={c.no}>{c.name}</span>)}</div>
                <div className="b-foot"><Stat n={counts.events} unit="个年谱节点" /><span className="b-go">开卷 →</span></div>
              </div>
            </TiltLink>
          </Reveal>
          <Reveal className="b-cell b-stories" delay={0.08}>
            <TiltLink to="/stories" className="bento-tile zhu" max={5}>
              <div className="b-body">
                <span className="col-seal light">事</span>
                <h3>藏园故事</h3>
                <p>十个有材料支撑的故事：逐幕放映，再把情节排出先后。</p>
                <div className="b-foot"><Stat n={counts.stories} unit="个重点故事" /></div>
              </div>
              <div className="b-posters" aria-hidden>
                {POSTERS.map((p, i) => <img key={p} src={artUrl(p, true)} alt="" loading="lazy" style={{ "--i": i } as CSSProperties} />)}
              </div>
            </TiltLink>
          </Reveal>
          <Reveal className="b-cell b-cases" delay={0.16}>
            <TiltLink to="/cases" className="bento-tile qing" max={6}>
              <div className="b-dossier" aria-hidden><i /><i /><i><b>卷宗</b><em>待查</em></i></div>
              <div className="b-body">
                <span className="col-seal light">证</span>
                <h3>史料侦探</h3>
                <p>先下判断，再翻证据卡。</p>
                <div className="b-foot"><Stat n={counts.cases} unit="份卷宗" /></div>
              </div>
            </TiltLink>
          </Reveal>
          <Reveal className="b-cell b-shelf" delay={0.24}>
            <TiltLink to="/shelf" className="bento-tile paper" max={6}>
              <div className="b-spines" aria-hidden>
                {SPINES.map((c, i) => <i key={c} style={{ background: c, height: `${62 + ((i * 37) % 30)}%` }} />)}
              </div>
              <div className="b-body">
                <span className="col-seal">书</span>
                <h3>双鉴书架</h3>
                <p>旧藏还是经眼？每种关系都带出处。</p>
                <div className="b-foot"><Stat n={counts.books} unit="部具体版本" /></div>
              </div>
            </TiltLink>
          </Reveal>
          <Reveal className="b-cell b-network" delay={0.08}>
            <TiltLink to="/network" className="bento-tile paper" max={5}>
              <div className="b-body">
                <span className="col-seal">往</span>
                <h3>书林往来</h3>
                <p>以傅增湘为中心的人物关系图，没有出处的线一条不画。</p>
                <div className="b-foot"><Stat n={counts.people} unit="位书林人物" /></div>
              </div>
              <svg className="b-net" viewBox="0 0 300 220" aria-hidden>
                {ring.map((name, i) => {
                  const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
                  const x = 150 + Math.cos(a) * 112, y = 110 + Math.sin(a) * 82;
                  return (
                    <g key={name}>
                      <motion.line x1={150} y1={110} x2={x} y2={y} initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
                        transition={{ duration: 0.9, delay: 0.3 + i * 0.08 }} />
                      <g transform={`translate(${x} ${y})`}>
                        <g className="b-node" style={{ "--d": `${i * -0.7}s` } as CSSProperties}><circle r={15} /><text dy="0.36em">{name[0]}</text></g>
                      </g>
                    </g>
                  );
                })}
                <g className="b-node core" transform="translate(150 110)"><circle r={24} /><text dy="0.36em">傅</text></g>
              </svg>
            </TiltLink>
          </Reveal>
          <Reveal className="b-cell b-gallery" delay={0.16}>
            <TiltLink to="/gallery" className="bento-tile ink" max={5}>
              <div className="b-body">
                <span className="col-seal light">图</span>
                <h3>藏园图像</h3>
                <p>印鉴、书法、信札与书影，资料库里的真实图像。</p>
                <div className="b-foot"><Stat n={counts.images} unit="幅图像" /></div>
              </div>
              <div className="b-frames" aria-hidden>
                {imgs.map((im, i) => <figure key={im.id} style={{ "--i": i } as CSSProperties}><img src={kbAsset(im.thumb)} alt="" loading="lazy" /></figure>)}
              </div>
            </TiltLink>
          </Reveal>
        </div>
        {counts.documents ? (
          <Reveal className="data-strip">
            <div><b><CountUp to={counts.documents} /></b><span>篇文献整理入库</span></div>
            <div><b><CountUp to={counts.canonical} /></b><span>篇去重后的主本</span></div>
            <div><b><CountUp to={counts.events} /></b><span>个可定年的事件</span></div>
            <div><b><CountUp to={counts.images} /></b><span>幅印鉴书画图像</span></div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

function GalleryStrip() {
  const [imgs, setImgs] = useState<ImageItem[]>([]);
  useEffect(() => { api<ImageItem[]>("/images").then((d) => setImgs(d.filter((x) => ["seal", "calligraphy", "letter", "colophon"].includes(x.kind)).slice(0, 18))).catch(() => {}); }, []);
  if (!imgs.length) return null;
  return (
    <section className="section gallery-strip">
      <div className="container"><Reveal><span className="eyebrow">藏园图像</span><h2 className="section-title brush"><SplitText text="印与墨" inView stagger={0.12} /></h2></Reveal></div>
      <div className="marquee">
        <div className="marquee-track">
          {[...imgs, ...imgs].map((im, i) => (
            <Link key={i} to="/gallery" className={`marquee-item k-${im.kind}`}>
              <img src={kbAsset(im.thumb)} alt={im.title} loading="lazy" />
              <span>{im.seal_text || im.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <div className="logo"><img className="logo-mark" src="/logo.webp" alt="" width={38} height={38} loading="lazy" /><span>书魂永不散藏园</span></div>
          <p className="muted small">傅增湘藏书家智能体 · 内容依据整理入库的论文、图书摘录、档案与图像，史实以原文为准。小傅是当代导览角色，不代表傅增湘本人发言。</p>
        </div>
        <div className="footer-links">
          <Link to="/wiki/网站导览">网站导览</Link><Link to="/search">全站检索</Link><Link to="/wiki/overview">知识库综述</Link><Link to="/wiki/证据层级">证据层级说明</Link><Link to="/gallery">图像长廊</Link>
        </div>
      </div>
    </footer>
  );
}
