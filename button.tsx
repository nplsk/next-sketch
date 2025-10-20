// components/MagneticButton.tsx
"use client";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { usePointer } from "@/app/providers/RuntimeProvider";
import { useRef, useState } from "react";

export default function MagneticButton({
  children,
  selectable = false,
  onSelect,
}: { children: React.ReactNode; selectable?: boolean; onSelect?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const pointer = usePointer();
  const [hover, setHover] = useState(false);
  const [selected, setSelected] = useState(false);

  // local motion values
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const scale = useTransform(hover ? 1.03 : 1, v => v); // subtle pop

  // update magnetic offset on hover
  function handleMouseMove() {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const x = pointer.px.x - (r.left + r.width / 2);
    const y = pointer.px.y - (r.top + r.height / 2);
    mx.set(x * 0.2); // magnet strength
    my.set(y * 0.2);
  }

  function toggle() {
    if (!selectable) return;
    const s = !selected; setSelected(s);
    onSelect?.();
  }

  return (
    <motion.button
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); mx.set(0); my.set(0); }}
      onMouseMove={handleMouseMove}
      onClick={toggle}
      style={{ translateX: mx, translateY: my, scale }}
      className="relative inline-flex items-center justify-center px-6 py-3 rounded-2xl overflow-hidden"
    >
      {/* SVG border + fill mask */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
        <defs>
          <clipPath id="btn-clip"><rect x="0" y="0" width="100" height="40" rx="14" /></clipPath>
          <mask id="btn-fill">
            <rect x="0" y="0" width="100" height="40" fill="white" />
            {/* The sliding white rect "erases" to reveal black fill below */}
            <motion.rect
              x={0} y={0} width={100} height={40}
              initial={{ y: 40 }} animate={{ y: hover ? 0 : 40 }} transition={{ type: "spring", stiffness: 220, damping: 24 }}
              fill="black"
            />
          </mask>
        </defs>
        <rect x="1" y="1" width="98" height="38" rx="13" fill="none" stroke="currentColor" strokeWidth="2" />
        {/* base fill revealed by mask */}
        <rect x="0" y="0" width="100" height="40" clipPath="url(#btn-clip)" fill="currentColor" mask="url(#btn-fill)" />
      </svg>

      {/* content layers: original + clone for slide/replace */}
      <div className="relative z-10 font-medium">
        <div className="overflow-hidden">
          <motion.div initial={false} animate={{ y: hover ? "-120%" : "0%" }} transition={{ type: "spring", stiffness: 300, damping: 26 }}>
            {children}
          </motion.div>
          <motion.div className="absolute inset-0" initial={{ y: "120%" }} animate={{ y: hover ? "0%" : "120%" }} transition={{ type: "spring", stiffness: 300, damping: 26 }}>
            {selectable ? (selected ? "Selected" : "Select") : children}
          </motion.div>
        </div>
      </div>
    </motion.button>
  );
}
