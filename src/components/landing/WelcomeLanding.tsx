"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./welcome.css";

const GITHUB_URL = "https://github.com/crawfordind/plot";
// "Get started" points at the app's own entry. Swap for a hosted-app or
// waitlist URL when one exists.
const APP_URL = "/register";

type Theme = "light" | "dark" | null;

function Check() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function GithubGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.85 9.73.5.1.68-.22.68-.49v-1.7c-2.79.62-3.38-1.22-3.38-1.22-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.72 0 0 .85-.28 2.78 1.05a9.5 9.5 0 0 1 5.06 0c1.93-1.33 2.78-1.05 2.78-1.05.55 1.42.2 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export default function WelcomeLanding() {
  const [theme, setTheme] = useState<Theme>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  function toggleTheme() {
    setTheme((prev) => {
      const isDark = prev
        ? prev === "dark"
        : typeof window !== "undefined" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;
      return isDark ? "light" : "dark";
    });
  }

  useEffect(() => {
    const root = rootRef.current;
    const nav = navRef.current;
    if (!root) return;

    // Sticky-nav hairline appears once the page has scrolled.
    const onScroll = () => {
      if (nav) nav.classList.toggle("scrolled", root.scrollTop > 8);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Scroll-triggered reveals. Content is visible by default; we only arm the
    // animation (via the `.anim` class) when motion is allowed and IO exists.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let observer: IntersectionObserver | undefined;

    if (!reduce && "IntersectionObserver" in window) {
      const els = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
      root.classList.add("anim");
      // Pre-reveal anything already in view so there's no flash-of-hidden.
      const vh = window.innerHeight;
      els.forEach((el) => {
        if (el.getBoundingClientRect().top < vh) el.classList.add("in");
      });

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement;
              const delay = Number(el.dataset.delay ?? 0);
              window.setTimeout(() => el.classList.add("in"), delay);
              observer?.unobserve(el);
            }
          });
        },
        { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
      );
      els.forEach((el) => {
        if (el.classList.contains("in")) return; // already shown
        const parent = el.parentElement;
        if (parent) {
          const siblings = Array.from(parent.querySelectorAll<HTMLElement>(":scope > .reveal"));
          const idx = siblings.indexOf(el);
          if (idx > 0) el.dataset.delay = String(Math.min(idx * 70, 210));
        }
        observer?.observe(el);
      });
    }

    return () => {
      root.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className="pl-root" ref={rootRef} data-theme={theme ?? undefined}>
      <header className="nav" ref={navRef}>
        <div className="wrap nav-inner">
          <a href="#top" className="brand" aria-label="Plot home">
            <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="1.5" y="1.5" width="29" height="29" rx="7" stroke="var(--emerald)" strokeWidth="2" />
              <path
                d="M7 20 L13 9 L20 16 L25 11"
                stroke="var(--emerald-deep)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="25" cy="11" r="2.6" fill="var(--emerald)" />
            </svg>
            Plot
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#logging">How it works</a>
            <a href="#compare">Compare</a>
            <a href="#open">Open source</a>
          </nav>
          <div className="nav-cta">
            <button className="toggle" type="button" onClick={toggleTheme} aria-label="Toggle color theme">
              <svg
                className="sun"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
              </svg>
              <svg
                className="moon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8Z" />
              </svg>
            </button>
            <Link className="btn btn-primary btn-sm" href={APP_URL}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="hero">
          <svg className="hero-contours" viewBox="0 0 760 720" fill="none" aria-hidden="true">
            <g stroke="var(--hairline-strong)" strokeWidth="1.4" fill="none" opacity="0.9">
              <path d="M120 60 C 260 20 470 40 620 120 C 740 190 720 320 600 360 C 460 405 300 360 220 420 C 150 470 80 420 120 300 C 150 200 90 130 120 60 Z" />
              <path d="M180 130 C 300 100 460 120 570 180 C 660 230 650 320 560 350 C 450 385 330 350 270 395 C 220 430 160 395 190 300 C 215 225 165 180 180 130 Z" />
              <path d="M240 200 C 330 180 450 195 520 235 C 585 270 580 325 515 348 C 440 372 360 348 320 380 C 285 405 245 380 265 315 C 282 262 235 235 240 200 Z" />
              <path d="M300 260 C 360 250 435 262 478 288 C 520 312 516 342 475 356 C 428 372 380 356 355 375 C 335 390 310 375 322 335 C 333 300 300 285 300 260 Z" />
            </g>
          </svg>
          <div className="wrap hero-grid">
            <div className="reveal in">
              <span className="eyebrow">Open-source farm &amp; homestead manager</span>
              <h1>
                Draw your land.
                <br />
                <span className="accent">Log it in plain English.</span>
              </h1>
              <p className="hero-lead">
                Plot is a map-first manager for farms and homesteads. Sketch your fields, beds, and paddocks on a
                satellite map — then just type what happened, and Plot files it as a structured record in a database on
                your own machine.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href={APP_URL}>
                  Get started — it&apos;s free
                </Link>
                <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <GithubGlyph />
                  View source
                </a>
              </div>
              <div className="hero-trust">
                <span className="chip">
                  <span className="dot" />
                  Local-first
                </span>
                <span className="chip">
                  <span className="dot" />
                  Self-hostable
                </span>
                <span className="chip">
                  <span className="dot" />
                  AGPL-3.0
                </span>
                <span className="chip">
                  <span className="dot" />
                  No subscription
                </span>
              </div>
            </div>

            {/* Map card */}
            <div className="mapcard reveal">
              <div className="mapcard-grid" />
              <svg className="plots" viewBox="0 0 420 370" fill="none" preserveAspectRatio="none" aria-hidden="true">
                <polygon
                  className="draw-poly"
                  points="40,60 190,40 210,150 60,175"
                  fill="rgba(16,185,129,0.14)"
                  stroke="var(--emerald)"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />
                <polygon
                  className="draw-poly"
                  points="230,120 360,95 385,235 250,270"
                  fill="rgba(180,120,60,0.12)"
                  stroke="var(--amber)"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  strokeDasharray="6 6"
                />
                <polygon
                  className="draw-poly"
                  points="70,210 205,195 225,315 90,330"
                  fill="rgba(16,185,129,0.10)"
                  stroke="var(--emerald-deep)"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <g fill="var(--surface)" stroke="var(--emerald)" strokeWidth="2">
                  <circle cx="40" cy="60" r="4" />
                  <circle cx="190" cy="40" r="4" />
                  <circle cx="210" cy="150" r="4" />
                  <circle cx="60" cy="175" r="4" />
                </g>
              </svg>
              <svg
                width="30"
                height="38"
                viewBox="0 0 30 38"
                style={{ position: "absolute", left: "63%", top: "40%" }}
                aria-hidden="true"
              >
                <ellipse cx="15" cy="35" rx="8" ry="2.6" fill="rgba(6,50,38,0.22)" />
                <path d="M15 2 C7 2 2 8 2 14 C2 22 15 32 15 32 C15 32 28 22 28 14 C28 8 23 2 15 2 Z" fill="var(--emerald-deep)" />
                <circle cx="15" cy="14" r="5" fill="var(--surface)" />
              </svg>
              <span className="acreage">▦ North Field · 2.4 ac</span>
              <span className="coord tl">N 41.94°</span>
              <span className="coord br">W 78.21°</span>
            </div>
          </div>
        </section>

        {/* PILLARS */}
        <section className="pillars wrap">
          <div className="pillar-grid">
            <div className="pillar reveal">
              <span className="legtick">— The map is the record</span>
              <div className="picon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
                  <path d="M9 4v14M15 6v14" />
                </svg>
              </div>
              <h3>Map-first, not form-first</h3>
              <p>
                Draw fields, beds, zones, and paddocks on a real interactive map, drop pins, and tap-to-place from any
                form — every record is tied to a spot on your land.
              </p>
            </div>
            <div className="pillar reveal">
              <span className="legtick">— Type it the way you&apos;d say it</span>
              <div className="picon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16M4 12h10M4 18h7" />
                  <path d="M17 15l2 2 4-4" />
                </svg>
              </div>
              <h3>Log in plain English</h3>
              <p>
                Type what you did in your own words. An LLM parses it into structured, auto-linked events — splitting
                multi-part notes and letting you edit every field before it saves.
              </p>
            </div>
            <div className="pillar reveal">
              <span className="legtick">— Grazing that does the math</span>
              <div className="picon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="8" height="8" rx="1.5" />
                  <rect x="13" y="3" width="8" height="8" rx="1.5" />
                  <rect x="3" y="13" width="8" height="8" rx="1.5" />
                  <path d="M17 13v8M13 17h8" />
                </svg>
              </div>
              <h3>Rotational grazing, planned</h3>
              <p>
                Build an NRCS-style grazing plan, balance forage to animals, subdivide a field into paddocks, and get
                deterministic next-move, rest, and overgraze guidance.
              </p>
            </div>
          </div>
        </section>

        {/* NL MOMENT */}
        <section className="nlmoment" id="logging">
          <div className="wrap">
            <div className="sec-head center reveal">
              <span className="eyebrow">The plain-English moment</span>
              <h2>Just say what you did.</h2>
              <p>
                No dropdowns to hunt through, no forms to fill. Write it like a note to yourself — Plot resolves the
                crop, the amount, and the place, and links it to the right planting.
              </p>
            </div>
            <div className="nl-demo reveal">
              <div className="nl-input">
                <svg
                  className="sprout"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22V12" />
                  <path d="M12 12C12 8 9 6 4 6c0 4 3 6 8 6Z" />
                  <path d="M12 10c0-3 3-5 8-5 0 3-3 5-8 5Z" />
                </svg>
                <span className="typed">harvested 12 lb of tomatoes from Row 1</span>
                <span className="caret" aria-hidden="true" />
              </div>
              <div className="nl-connector" aria-hidden="true">
                <div className="pip" />
              </div>
              <div
                className="nl-parsed"
                role="figure"
                aria-label="Parsed result: a harvest event for 12 pounds of tomatoes from Row 1, dated today"
              >
                <div className="ph">
                  parsed event
                  <span className="ok">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    ready to save
                  </span>
                </div>
                <div className="kv-grid">
                  <div className="kv">
                    <div className="k">Action</div>
                    <div className="v">Harvest</div>
                  </div>
                  <div className="kv">
                    <div className="k">Crop</div>
                    <div className="v">Tomatoes</div>
                  </div>
                  <div className="kv">
                    <div className="k">Quantity</div>
                    <div className="v">
                      <span className="hl">12 lb</span>
                    </div>
                  </div>
                  <div className="kv">
                    <div className="k">Location</div>
                    <div className="v">Row 1</div>
                  </div>
                  <div className="kv">
                    <div className="k">Linked planting</div>
                    <div className="v">Roma · Bed A</div>
                  </div>
                  <div className="kv">
                    <div className="k">Date</div>
                    <div className="v">Today</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="features wrap" id="features">
          {/* Map */}
          <div className="frow reveal">
            <div className="fcopy">
              <span className="eyebrow">Map your land</span>
              <h3>Sketch your land the way you&apos;d draw it on paper.</h3>
              <p>
                Plot opens on an interactive MapLibre map. Trace field boundaries, block out raised beds, mark zones, and
                carve paddocks — then drop a pin from any form to place exactly where something happened.
              </p>
              <ul className="flist">
                <li>
                  <Check />
                  Draw fields, beds, zones &amp; paddocks as real polygons
                </li>
                <li>
                  <Check />
                  Tap-to-place picking wired into every form
                </li>
                <li>
                  <Check />
                  Attach photos with EXIF/GPS — HEIC supported
                </li>
              </ul>
            </div>
            <div className="fpanel">
              <div className="mapcard" style={{ boxShadow: "none", aspectRatio: "5 / 3.6" }}>
                <div className="mapcard-grid" />
                <svg className="plots" viewBox="0 0 420 300" fill="none" preserveAspectRatio="none" aria-hidden="true">
                  <polygon points="40,50 200,35 220,150 55,170" fill="rgba(16,185,129,0.13)" stroke="var(--emerald)" strokeWidth="2.4" strokeLinejoin="round" />
                  <polyline points="250,60 250,240" stroke="var(--emerald-deep)" strokeWidth="2.4" strokeDasharray="7 7" strokeLinecap="round" />
                  <polygon points="270,70 380,60 380,150 275,160" fill="rgba(180,120,60,0.12)" stroke="var(--amber)" strokeWidth="2.2" strokeLinejoin="round" />
                  <g fill="var(--surface)" stroke="var(--emerald)" strokeWidth="2">
                    <circle cx="40" cy="50" r="4.5" />
                    <circle cx="200" cy="35" r="4.5" />
                    <circle cx="220" cy="150" r="4.5" />
                    <circle cx="55" cy="170" r="4.5" />
                  </g>
                </svg>
                <span className="coord tl">draw mode · vertex snap</span>
              </div>
            </div>
          </div>

          {/* Plantings */}
          <div className="frow flip reveal">
            <div className="fcopy">
              <span className="eyebrow">Plantings &amp; records</span>
              <h3>Every planting, from seed to sale.</h3>
              <p>
                Create plantings and track their lifecycle — active, harvested, archived. Log harvests, sales, costs, and
                notes against the exact location, and browse everything back in a filterable record.
              </p>
              <ul className="flist">
                <li>
                  <Check />
                  Lifecycle status: active → harvested → archived
                </li>
                <li>
                  <Check />
                  Harvest, sale, cost &amp; note events, auto-linked
                </li>
                <li>
                  <Check />
                  A Coach that nudges streaks &amp; completeness
                </li>
              </ul>
            </div>
            <div className="fpanel">
              <div className="plist">
                <div className="prow">
                  <span className="swatch" style={{ background: "var(--emerald)" }} />
                  <div>
                    <div className="pname">Roma Tomatoes</div>
                    <div className="ploc">Bed A · Row 1</div>
                  </div>
                  <span className="status active">Active</span>
                </div>
                <div className="prow">
                  <span className="swatch" style={{ background: "var(--amber)" }} />
                  <div>
                    <div className="pname">Sugar Snap Peas</div>
                    <div className="ploc">Bed C · Trellis</div>
                  </div>
                  <span className="status harvest">Harvested</span>
                </div>
                <div className="prow">
                  <span className="swatch" style={{ background: "var(--emerald-deep)" }} />
                  <div>
                    <div className="pname">Kennebec Potatoes</div>
                    <div className="ploc">North Field</div>
                  </div>
                  <span className="status active">Active</span>
                </div>
                <div className="prow">
                  <span className="swatch" style={{ background: "var(--text-3)" }} />
                  <div>
                    <div className="pname">Spring Garlic</div>
                    <div className="ploc">Bed B</div>
                  </div>
                  <span className="status arch">Archived</span>
                </div>
              </div>
            </div>
          </div>

          {/* Grazing */}
          <div className="frow reveal">
            <div className="fcopy">
              <span className="eyebrow">Rotational grazing · NRCS</span>
              <h3>Move the herd by the numbers, not by guesswork.</h3>
              <p>
                Balance forage against your animal units, subdivide a field into the right number of paddocks, and move
                herds by drag or by sentence. Plot&apos;s deterministic advisor calls the next move, rest days, and
                overgraze risk — then exports a printable NRCS-528 record.
              </p>
              <ul className="flist">
                <li>
                  <Check />
                  Forage/animal balance → auto paddock count
                </li>
                <li>
                  <Check />
                  Next-move, rest, overstay &amp; overgraze advice
                </li>
                <li>
                  <Check />
                  CSV export &amp; printable NRCS-528 worksheet
                </li>
              </ul>
            </div>
            <div className="fpanel">
              <div className="paddocks">
                <div className="pad rest"><span className="lbl">P1</span></div>
                <div className="pad active">
                  <span className="lbl">P2</span>
                  <span className="herd">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
                <div className="pad rest"><span className="lbl">P3</span></div>
                <div className="pad"><span className="lbl">P4</span></div>
                <div className="pad rest"><span className="lbl">P5</span></div>
                <div className="pad rest"><span className="lbl">P6</span></div>
                <div className="pad"><span className="lbl">P7</span></div>
                <div className="pad rest"><span className="lbl">P8</span></div>
              </div>
              <div className="advice">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
                <span>
                  Next move: <b>P2 → P7</b> in 2 days · P1 rested 21 days
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* COMPARE */}
        <section className="compare" id="compare">
          <div className="wrap">
            <div className="sec-head reveal">
              <span className="eyebrow">How it stacks up</span>
              <h2>One tool where three usually meet.</h2>
              <p>
                Farm record-keeping, garden planning, and rotational grazing normally live in three separate apps. Plot
                does the overlap — map-first, plain-English, and yours to keep.
              </p>
            </div>
            <div className="table-scroll reveal">
              <table className="cmp">
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th className="plot col-plot">Plot</th>
                    <th>Farmbrite</th>
                    <th>LiteFarm / farmOS</th>
                    <th>Seedtime / GrowVeg</th>
                    <th>Legacy grazing apps</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Map-first drawing</th>
                    <td className="col-plot yes">Core</td>
                    <td className="partial">Partial</td>
                    <td className="partial">GIS (farmOS)</td>
                    <td className="no">Bed grids only</td>
                    <td className="partial">Map-centric</td>
                  </tr>
                  <tr>
                    <th scope="row">Plain-English logging</th>
                    <td className="col-plot yes">Yes</td>
                    <td className="no">Forms</td>
                    <td className="no">Forms</td>
                    <td className="no">Forms</td>
                    <td className="no">Forms</td>
                  </tr>
                  <tr>
                    <th scope="row">Rotational grazing (NRCS-528)</th>
                    <td className="col-plot yes">Yes</td>
                    <td className="partial">Basic</td>
                    <td className="partial">Via modules</td>
                    <td className="no">—</td>
                    <td className="partial">Specialty</td>
                  </tr>
                  <tr>
                    <th scope="row">Local-first / data ownership</th>
                    <td className="col-plot yes">SQLite file</td>
                    <td className="no">Cloud SaaS</td>
                    <td className="partial">Self-host (farmOS)</td>
                    <td className="no">Cloud SaaS</td>
                    <td className="no">Cloud SaaS</td>
                  </tr>
                  <tr>
                    <th scope="row">Open source · no subscription</th>
                    <td className="col-plot yes">AGPL-3.0</td>
                    <td className="no">Paid tiers</td>
                    <td className="yes">Open source</td>
                    <td className="no">Paid tiers</td>
                    <td className="no">Enterprise</td>
                  </tr>
                  <tr>
                    <th scope="row">Scope</th>
                    <td className="col-plot partial">Focused</td>
                    <td className="partial">Very broad</td>
                    <td className="partial">Broad</td>
                    <td className="partial">Garden-only</td>
                    <td className="partial">Grazing-only</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="cmp-legend" aria-hidden="true">
              <span>
                <b className="yes">Core / Yes</b> — a first-class, verified capability
              </span>
              <span>
                <b className="partial">Partial</b> — present but limited or add-on
              </span>
              <span>
                <b className="no">—</b> — not a focus
              </span>
            </div>
            <p className="cmp-note">
              Plot&apos;s column reflects verified, shipping features. Competitor details are drawn from public
              positioning and may change — verify current pricing and feature sets before relying on them. Comparison
              offered in good faith, not as a benchmark.
            </p>
          </div>
        </section>

        {/* AUDIENCE */}
        <section className="audience">
          <div className="wrap">
            <div className="sec-head center reveal" style={{ marginBottom: 0 }}>
              <span className="eyebrow">Who it&apos;s for</span>
              <h2>Built for people who work the land.</h2>
            </div>
            <div className="aud-grid">
              <div className="aud reveal">
                <svg className="aicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2C9 7 9 11 12 13c3-2 3-6 0-11Z" />
                  <path d="M5 13c3 0 5 2 5 5-3 0-5-2-5-5Z" />
                  <path d="M19 13c-3 0-5 2-5 5 3 0 5-2 5-5Z" />
                  <path d="M12 13v9" />
                </svg>
                <h3>Market gardeners &amp; small farms</h3>
                <p>
                  One honest place for beds, plantings, harvests, sales, and costs — tied to a map instead of buried in
                  spreadsheets.
                </p>
              </div>
              <div className="aud reveal">
                <svg className="aicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 20h18" />
                  <path d="M5 20v-6M19 20v-6" />
                  <path d="M4 14c2-5 14-5 16 0" />
                  <circle cx="12" cy="7" r="2.5" />
                </svg>
                <h3>Graziers &amp; livestock keepers</h3>
                <p>
                  Managed grazing without enterprise software — paddock math, move planning, and NRCS-528 records that
                  print.
                </p>
              </div>
              <div className="aud reveal">
                <svg className="aicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 17l6-6 4 4 6-6" />
                  <path d="M14 5h6v6" />
                  <rect x="2" y="3" width="20" height="18" rx="3" />
                </svg>
                <h3>Self-reliant tinkerers</h3>
                <p>
                  People who refuse SaaS lock-in and want their farm data as a local file they own, on a stack they can
                  read and change.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FIELD / OPEN SOURCE */}
        <section className="field" id="open">
          <svg className="field-contours" viewBox="0 0 1200 500" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <g stroke="var(--field-line)" strokeWidth="1.4" fill="none">
              <path d="M-50 120 C 250 60 500 100 750 60 C 950 30 1100 90 1260 60" />
              <path d="M-50 200 C 250 150 520 185 780 150 C 980 122 1120 175 1260 150" />
              <path d="M-50 290 C 250 245 500 280 760 245 C 980 215 1130 270 1260 245" />
              <path d="M-50 380 C 250 335 520 370 780 335 C 980 307 1120 360 1260 335" />
            </g>
          </svg>
          <div className="wrap">
            <span className="eyebrow">Local-first · open source</span>
            <h2>Your land. Your data. Your machine.</h2>
            <p className="field-lead">
              Plot keeps everything in a plain SQLite file on your computer — no account required to run it, nothing held
              hostage in someone else&apos;s cloud. When you&apos;re ready to go multi-device, point it at Turso. Your
              call.
            </p>
            <div className="pillars3">
              <div className="tpill reveal">
                <h3>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="8" rx="2" />
                    <rect x="3" y="14" width="18" height="6" rx="2" />
                    <path d="M7 8h.01M7 17h.01" />
                  </svg>
                  You own the file
                </h3>
                <p>
                  Data lives in a standard SQLite database you can back up, move, or open with any tool. No export
                  ritual — it was always yours.
                </p>
              </div>
              <div className="tpill reveal">
                <h3>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l8 4v5c0 4.5-3 8-8 9-5-1-8-4.5-8-9V7l8-4Z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                  Auditable &amp; free
                </h3>
                <p>
                  Released under AGPL-3.0. Read the source, run it, modify it — no subscription, no per-seat pricing, no
                  lock-in.
                </p>
              </div>
              <div className="tpill reveal">
                <h3>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M8 8h8M8 12h8M8 16h5" />
                  </svg>
                  Self-hostable
                </h3>
                <p>
                  Runs on your own hardware. The natural-language and photo features call an LLM via OpenRouter — bring
                  your own key, and that&apos;s the only thing that leaves home.
                </p>
              </div>
            </div>
            <div className="codeline">
              <span className="prompt">$</span>
              <span>git clone &amp;&amp; npm run db:setup &amp;&amp; npm run dev</span>
              <span className="cp" aria-hidden="true">
                ↩
              </span>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="finalcta" id="get-started">
          <div className="wrap">
            <div className="reveal">
              <h2>Map your land. Log it in plain English. Own your data.</h2>
              <p>
                Plot is free and open source. Clone it, draw your first field, and log your first harvest in an
                afternoon.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href={APP_URL}>
                  Get started — it&apos;s free
                </Link>
                <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <GithubGlyph />
                  Star on GitHub
                </a>
              </div>
              <p className="fineprint">No account required to self-host · AGPL-3.0</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="ft">
        <div className="wrap">
          <div className="ft-top">
            <div>
              <a href="#top" className="brand" aria-label="Plot home">
                <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <rect x="1.5" y="1.5" width="29" height="29" rx="7" stroke="var(--field-text-2)" strokeWidth="2" />
                  <path d="M7 20 L13 9 L20 16 L25 11" stroke="var(--field-text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="25" cy="11" r="2.6" fill="var(--field-text-2)" />
                </svg>
                Plot
              </a>
              <p className="ft-mission">
                A map-first farm &amp; homestead manager. Draw your land, log it in plain language, keep your data.
              </p>
            </div>
            <div className="ft-cols">
              <div className="ft-col">
                <h4>Product</h4>
                <a href="#features">Features</a>
                <a href="#logging">How it works</a>
                <a href="#compare">Compare</a>
              </div>
              <div className="ft-col">
                <h4>Open source</h4>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  GitHub
                </a>
                <a href={`${GITHUB_URL}/blob/master/LICENSE`} target="_blank" rel="noreferrer">
                  License (AGPL-3.0)
                </a>
                <a href={`${GITHUB_URL}#getting-started`} target="_blank" rel="noreferrer">
                  Self-host guide
                </a>
              </div>
              <div className="ft-col">
                <h4>Community</h4>
                <a href={`${GITHUB_URL}/blob/master/CONTRIBUTING.md`} target="_blank" rel="noreferrer">
                  Contributing
                </a>
                <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer">
                  Report an issue
                </a>
                <a href={`${GITHUB_URL}/discussions`} target="_blank" rel="noreferrer">
                  Discussions
                </a>
              </div>
            </div>
          </div>
          <div className="ft-sig">
            <span>Made for people who work the land · AGPL-3.0</span>
            <span>N 41.94° · W 78.21°</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
