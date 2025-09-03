// src/ScoreOSMD.jsx

// import two named exports of hook functions: useEffect (side effects after render) and useRef (mutable object that persists across renders)
import { useEffect, useRef } from "react";
// import a named export of a class: OpenSheetMusicDisplay (loads and renders MusicXML/MXL as SVG in the browser)
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
// import a default export of an object: styles (all CSS classes defined as an object)
import styles from "./ScoreOSMD.module.css";

/**
 * props:
 *   file   -> path to the MusicXML/MXL in /public (default: "/sample.musicxml")
 *   step   -> how many *visible systems* to advance per tap (default: 1; use 2 to jump two lines)
 */
export default function ScoreOSMD({ file = "/gymnopedie-no-1-satie.mxl", step = 2 }) {
  // { current: HTMLDivElement|null } — container DOM node OSMD will render into
  const hostRef = useRef(null);
  // { current: OpenSheetMusicDisplay|null } — holds the OSMD instance
  const osmdRef = useRef(null);
  // { current: HTMLElement[] } — one anchor per visible “system/row” in the SVG
  const rowsRef = useRef([]); 
  // { current: number } — the current row index (for next/prev navigation)
  const idxRef  = useRef(0);
  // { current: ResizeObserver|null } — watches size changes to recalc row anchors
  const roRef   = useRef(null);

  // this whole effect: set up OSMD, capture row anchors, wire event handlers, and clean everything up on unmount or when deps change.
  useEffect(() => {
    // flag to avoid doing work after cleanup has begun
    let disposed = false;

    // prefer to scroll the closest styled container (score card). If none, fall back to the host itself.
    const card = hostRef.current?.closest?.(`.${styles.scoreContainer}`) ?? hostRef.current;
    // no DOM yet; bail (defensive)
    if (!card) return;

    /** -------- helpers -------- */

    // keep idxRef.current in sync with the current scrollTop so manual scrolling and tap/keys stay aligned.
    function syncIdxToScroll() {
      const rows = rowsRef.current;
      if (!rows.length) return;
      const cardBoxTop = card.getBoundingClientRect().top;
      // a tiny bias so exact-top counts as "in view"
      const target = card.scrollTop + 4;
      let best = 0;
      for (let i = 0; i < rows.length; i++) {
        const y = rows[i].getBoundingClientRect().top - cardBoxTop + card.scrollTop;
        if (y <= target) best = i; else break;
      }
      idxRef.current = best;
    }

    // smoothly scroll the container so that the row at index i sits at the top
    function scrollToIdx(i) {
      const rows = rowsRef.current;
      if (!rows.length) return;
      const clamped = Math.max(0, Math.min(i, rows.length - 1));
      idxRef.current = clamped;
      const el = rows[clamped];
      const targetTop = el.getBoundingClientRect().top - card.getBoundingClientRect().top + card.scrollTop;
      card.scrollTo({ top: targetTop, behavior: "smooth" });
    }

    // build rowsRef.current = [first staffline of each visual system]
    function captureRows() {
      // step 1: grab all staffline <g> groups in the SVG,
      rowsRef.current = [];
      const svg = hostRef.current?.querySelector("svg");
      if (!svg) return;

      // bucket by Y (collapse jitter),
      const EPS_SMALL = 2;
      // VexFlow groups
      const stafflines = Array.from(svg.querySelectorAll("g.staffline")); 
      const buckets = [];
      for (const g of stafflines) {
        const y = Math.round(g.getBoundingClientRect().top);
        let b = buckets.find(it => Math.abs(it.y - y) < EPS_SMALL);
        if (!b) { b = { y, el: g }; buckets.push(b); }
      }
      buckets.sort((a, b) => a.y - b.y);

      // step 2: compute typical vertical gap between adjacent stafflines, then scale up as a system-separation threshold
      const deltas = [];
      for (let i = 1; i < buckets.length; i++) deltas.push(buckets[i].y - buckets[i - 1].y);
      deltas.sort((a, b) => a - b);
      const median = deltas.length ? deltas[(deltas.length - 1) >> 1] : 0;
      // tweak factor if ever needed
      const GAP = Math.max(40, Math.round(median * 2.2)); 

      // step 3: pick first staffline after any big vertical jump marks a new visual system/row
      const rows = [];
      for (let i = 0; i < buckets.length; i++) {
        if (i === 0 || buckets[i].y - buckets[i - 1].y > GAP) rows.push(buckets[i].el);
      }

      rowsRef.current = rows;
      syncIdxToScroll();
    }

    // navigation helpers advance by `step` systems (positive or negative)
    const next = () => scrollToIdx(idxRef.current + step);
    const prev = () => scrollToIdx(idxRef.current - step);

    // pointer navigation: left half = prev, right half = next; only responds to left click / primary tap
    function onPointerDown(e) {
      if (e.button !== 0) return;
      const rect = card.getBoundingClientRect();
      // simple split navigation: right half next, left half prev
      if (e.clientX - rect.left >= rect.width / 2) next();
      else prev();
    }

    // keyboard navigation: Down/PageDown/Space → next, Up/PageUp → prev; prevent default so the container, not page, scrolls
    function onKeyDown(e) {
      if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); next(); }
      else if (["ArrowUp", "PageUp"].includes(e.key))     { e.preventDefault(); prev(); }
    }

    // keep the index aligned when the user scrolls manually
    function onScroll() { syncIdxToScroll(); }

    /** -------- OSMD boot -------- */

    // create the OSMD renderer in our host container
    const osmd = new OpenSheetMusicDisplay(hostRef.current, {
      // have OSMD react to container size changes
      autoResize: true,
      // tighter layout
      drawingParameters: "compact",
      // skip the score title area
      drawTitle: false
    });
    osmdRef.current = osmd;

    osmd
      // async: fetch/parse MusicXML/MXL from /public path
      .load(file)
      // wait 1 frame so layout boxes stabilize before rendering
      .then(() => new Promise(requestAnimationFrame))
      // draw SVG into our host
      .then(() => osmd.render())
      .then(() => {
        if (disposed) return;

        // after first render, compute row anchors and snap to the top
        captureRows();
        if (rowsRef.current[0]) scrollToIdx(0);

        // hook up interactions & syncing
        card.addEventListener("pointerdown", onPointerDown, { passive: true });
        card.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("keydown", onKeyDown);

        // on size changes, recapture anchors and keep the current index in view
        if ("ResizeObserver" in window) {
          roRef.current = new ResizeObserver(() => { captureRows(); scrollToIdx(idxRef.current); });
          roRef.current.observe(hostRef.current);
        } else {
          window.addEventListener("resize", captureRows);
        }
      })
      // if load/render fails, log it (you could surface a user message here if desired)
      .catch(console.error);

    /** -------- cleanup -------- */

    return () => {
      // mark disposed so in-flight promises won’t run post-cleanup work
      disposed = true;
      // remove observers/listeners added above
      if (roRef.current) roRef.current.disconnect(); else window.removeEventListener("resize", captureRows);
      card.removeEventListener("pointerdown", onPointerDown);
      card.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKeyDown);
      // clear OSMD drawings/state (guard in case OSMD is mid-teardown)
      try { osmd.clear(); } catch {}
    };
    // re-run effect whenever file or step changes
  }, [file, step]);

  return (
    // outer div: styled scroll container
    // inner div: the OSMD “canvas” we attach a ref to (OSMD will inject SVG here)
    <div className={styles.scoreContainer}>
      <div id="osmd" className={styles.osmdRoot} ref={hostRef} />
    </div>
  );
}
