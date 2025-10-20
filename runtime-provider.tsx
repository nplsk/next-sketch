// app/providers/RuntimeProvider.tsx
"use client";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type RafCB = (t: number) => void;
type Entry = { index: number; cb: RafCB };

type PointerSpaces = {
  px: { x: number; y: number };        // pixels
  screen: { x: number; y: number };    // [0..1]
  ndc: { x: number; y: number };       // [-1..1]
  gl: { x: number; y: number };        // centered pixels
  v: { x: number; y: number };         // velocity estimate
}

type Runtime = {
  w: number; h: number; dpr: number;
  pointer: PointerSpaces;
  onRaf: (cb: RafCB, index?: number) => () => void; // returns unsubscribe
  reducedMotion: boolean;
};

const RuntimeCtx = createContext<Runtime | null>(null);
export const useRuntime = () => useContext(RuntimeCtx)!;

export default function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
  const reducedMotion = useMemo(() =>
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  // RAF priority queue
  const subs = useRef<Entry[]>([]);
  const onRaf = (cb: RafCB, index = 2) => {
    const e: Entry = { index, cb };
    subs.current.push(e);
    subs.current.sort((a,b) => a.index - b.index);
    return () => { subs.current = subs.current.filter(x => x !== e); };
  };

  // pointer spaces
  const pointer = useRef<PointerSpaces>({
    px: { x: 0, y: 0 },
    screen: { x: 0, y: 0 },
    ndc: { x: -1, y: -1 },
    gl: { x: 0, y: 0 },
    v: { x: 0, y: 0 },
  });

  useEffect(() => {
    const updateSize = () => setSize({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 });
    updateSize();
    window.addEventListener("resize", updateSize, { passive: true });

    let last = { x: 0, y: 0, t: performance.now() };
    const onMove = (e: MouseEvent | TouchEvent) => {
      const c = "touches" in e ? e.touches[0] : (e as MouseEvent);
      const x = c.clientX, y = c.clientY;
      const { w, h } = { w: window.innerWidth, h: window.innerHeight };
      const now = performance.now(); const dt = Math.max(1, now - last.t);
      pointer.current.px = { x, y };
      pointer.current.screen = { x: x / w, y: y / h };
      pointer.current.ndc = { x: (x / w) * 2 - 1, y: -((y / h) * 2 - 1) };
      pointer.current.gl = { x: x - w / 2, y: -(y - h / 2) };
      pointer.current.v = { x: (x - last.x) / dt, y: (y - last.y) / dt };
      last = { x, y, t: now };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });

    // drive RAF
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      for (const e of subs.current) e.cb(t);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
    };
  }, []);

  const value = useMemo<Runtime>(() => ({
    w: size.w, h: size.h, dpr: size.dpr,
    pointer: pointer.current,
    onRaf,
    reducedMotion,
  }), [size, reducedMotion]);

  return <RuntimeCtx.Provider value={value}>{children}</RuntimeCtx.Provider>;
}

// convenience hooks
export function useRaf(index = 2, cb?: RafCB) {
  const { onRaf } = useRuntime();
  const ref = useRef<RafCB | null>(cb ?? null);
  useEffect(() => {
    if (!ref.current) return;
    return onRaf((t) => ref.current && ref.current(t), index);
  }, [index, onRaf]);
  return (fn: RafCB) => { ref.current = fn; };
}
export function usePointer() { return useRuntime().pointer; }
