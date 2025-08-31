// src/ScoreOSMD.jsx
import { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import styles from "./ScoreOSMD.module.css";

/**
 * Props:
 *   file   -> path to the MusicXML/MXL in /public (default: "/sample.musicxml")
 *   step   -> how many *visible systems* to advance per tap (default: 1; use 2 to jump two lines)
 */
export default function ScoreOSMD({ file = "/gymnopedie-no-1-satie.mxl", step = 2 }) {
  const hostRef = useRef(null);          // outer container we render into
  const osmdRef = useRef(null);          // OSMD instance
  const rowsRef = useRef([]);            // Array<HTMLElement> (one anchor per system/row)
  const idxRef  = useRef(0);             // current row index
  const roRef   = useRef(null);          // ResizeObserver

  useEffect(() => {
    let disposed = false;

    const card = hostRef.current?.closest?.(`.${styles.scoreContainer}`) ?? hostRef.current;
    if (!card) return;

    /** -------- helpers -------- */

    // Find current index from scrollTop (keeps tap index aligned with manual scroll)
    function syncIdxToScroll() {
      const rows = rowsRef.current;
      if (!rows.length) return;
      const cardBoxTop = card.getBoundingClientRect().top;
      const target = card.scrollTop + 4; // a tiny bias so exact-top counts as "in view"
      let best = 0;
      for (let i = 0; i < rows.length; i++) {
        const y = rows[i].getBoundingClientRect().top - cardBoxTop + card.scrollTop;
        if (y <= target) best = i; else break;
      }
      idxRef.current = best;
    }

    // Smooth-scroll card so that row[idx] is at top
    function scrollToIdx(i) {
      const rows = rowsRef.current;
      if (!rows.length) return;
      const clamped = Math.max(0, Math.min(i, rows.length - 1));
      idxRef.current = clamped;
      const el = rows[clamped];
      const targetTop = el.getBoundingClientRect().top - card.getBoundingClientRect().top + card.scrollTop;
      card.scrollTo({ top: targetTop, behavior: "smooth" });
    }

    // Capture one anchor per *visual system* by clustering stafflines by Y and
    // breaking groups where the vertical gap jumps significantly.
    function captureRows() {
      rowsRef.current = [];
      const svg = hostRef.current?.querySelector("svg");
      if (!svg) return;

      // 1) bucket stafflines by Y (collapse tiny jitter)
      const EPS_SMALL = 2;
      const stafflines = Array.from(svg.querySelectorAll("g.staffline")); // VexFlow groups
      const buckets = [];
      for (const g of stafflines) {
        const y = Math.round(g.getBoundingClientRect().top);
        let b = buckets.find(it => Math.abs(it.y - y) < EPS_SMALL);
        if (!b) { b = { y, el: g }; buckets.push(b); }
      }
      buckets.sort((a, b) => a.y - b.y);

      // 2) derive a gap threshold that separates systems
      const deltas = [];
      for (let i = 1; i < buckets.length; i++) deltas.push(buckets[i].y - buckets[i - 1].y);
      deltas.sort((a, b) => a - b);
      const median = deltas.length ? deltas[(deltas.length - 1) >> 1] : 0;
      const GAP = Math.max(40, Math.round(median * 2.2)); // tweak factor if ever needed

      // 3) pick the first staffline after each big gap as the “row” anchor
      const rows = [];
      for (let i = 0; i < buckets.length; i++) {
        if (i === 0 || buckets[i].y - buckets[i - 1].y > GAP) rows.push(buckets[i].el);
      }

      rowsRef.current = rows;
      syncIdxToScroll();
    }

    const next = () => scrollToIdx(idxRef.current + step);
    const prev = () => scrollToIdx(idxRef.current - step);

    function onPointerDown(e) {
      // left-click / primary tap only
      if (e.button !== 0) return;
      const rect = card.getBoundingClientRect();
      // simple split navigation: right half next, left half prev
      if (e.clientX - rect.left >= rect.width / 2) next();
      else prev();
    }

    function onKeyDown(e) {
      if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); next(); }
      else if (["ArrowUp", "PageUp"].includes(e.key))     { e.preventDefault(); prev(); }
    }

    function onScroll() { syncIdxToScroll(); }

    /** -------- OSMD boot -------- */
    const osmd = new OpenSheetMusicDisplay(hostRef.current, {
      autoResize: true,
      drawingParameters: "compact",
      drawTitle: false
    });
    osmdRef.current = osmd;

    osmd
      .load(file)
      // render on the next animation frame to ensure layout is ready
      .then(() => new Promise(requestAnimationFrame))
      .then(() => osmd.render())
      .then(() => {
        if (disposed) return;
        captureRows();
        if (rowsRef.current[0]) scrollToIdx(0);

        // listeners after first render
        card.addEventListener("pointerdown", onPointerDown, { passive: true });
        card.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("keydown", onKeyDown);

        // re-capture on resize / relayout
        if ("ResizeObserver" in window) {
          roRef.current = new ResizeObserver(() => { captureRows(); scrollToIdx(idxRef.current); });
          roRef.current.observe(hostRef.current);
        } else {
          window.addEventListener("resize", captureRows);
        }
      })
      .catch(console.error);

    /** -------- cleanup -------- */
    return () => {
      disposed = true;
      if (roRef.current) roRef.current.disconnect(); else window.removeEventListener("resize", captureRows);
      card.removeEventListener("pointerdown", onPointerDown);
      card.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKeyDown);
      try { osmd.clear(); } catch {}
    };
  }, [file, step]);

  return (
    <div className={styles.scoreContainer}>
      <div id="osmd" className={styles.osmdRoot} ref={hostRef} />
    </div>
  );
}
