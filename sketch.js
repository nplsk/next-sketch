"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useScroll, useTransform, useMotionValueEvent } from "framer-motion";

const IMG_SRC =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1976&auto=format&fit=crop";
const BEND_MAX = 0.25;
const PROGRESS_MAX = 1.5;

function useFlags() {
  const [reduced, setReduced] = useState(false);
  const [isSmall, setSmall] = useState(false);
  useEffect(() => {
    const mqR = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqS = window.matchMedia("(max-width: 768px)");
    const setAll = () => {
      setReduced(mqR.matches);
      setSmall(mqS.matches);
    };
    setAll();
    mqR.addEventListener("change", setAll);
    mqS.addEventListener("change", setAll);
    return () => {
      mqR.removeEventListener("change", setAll);
      mqS.removeEventListener("change", setAll);
    };
  }, []);
  return { reduced, isSmall };
}

const vertex = `
  varying vec2 vUv;
  uniform float u_progress;
  uniform float u_bend;
  void main() {
    vUv = uv;
    vec3 pos = position;
    float edge = 1.0 - vUv.y;
    float p = clamp(u_progress, 0.0, ${PROGRESS_MAX.toFixed(1)});
    float curlZ = u_bend * p * edge * edge;
    pos.z += curlZ;
    pos.x += 0.15 * p * edge * (uv.x - 0.5);
    pos.y += 0.03 * p * edge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragment = `
  varying vec2 vUv;
  uniform sampler2D u_tex;
  uniform float u_progress;
  void main() {
    float p = clamp(u_progress, 0.0, ${PROGRESS_MAX.toFixed(1)});
    vec2 uv = vUv;
    uv.y = mix(uv.y, pow(uv.y, 0.85), min(p, 1.0));
    vec4 c = texture2D(u_tex, uv);
    float edge = vUv.y;
    float reveal = smoothstep(0.0, 0.8, edge + p * 0.3);
    float rim = (1.0 - edge) * 0.3 * min(p, 1.0);
    c.rgb += rim;
    gl_FragColor = vec4(c.rgb, c.a * reveal);
  }
`;

function PeelMaterial({ texture, progress, bend }: { texture: THREE.Texture; progress: number; bend: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);
  useFrame(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.u_progress.value = progress;
    matRef.current.uniforms.u_bend.value = bend;
  });
  const uniforms = useMemo(
    () => ({
      u_tex: { value: texture },
      u_progress: { value: 0 },
      u_bend: { value: 0 },
    }),
    [texture]
  );
  return (
    <shaderMaterial ref={matRef} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent />
  );
}

function FitPlane({ tex, progress, bend }: { tex: THREE.Texture; progress: number; bend: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { viewport } = useThree();
  const img: any = tex.image;
  const w = img && (img.naturalWidth || img.width) ? (img.naturalWidth || img.width) : 3;
  const h = img && (img.naturalHeight || img.height) ? (img.naturalHeight || img.height) : 2;
  const ratio = w / h;
  const width = viewport.width * 0.7;
  const height = width / ratio;
  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[width, height, 64, 64]} />
      <PeelMaterial texture={tex} progress={progress} bend={bend} />
    </mesh>
  );
}

export default function PeelDemo({ src = IMG_SRC }: { src?: string }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const tex = useTexture(src);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace as any;
  const { reduced, isSmall } = useFlags();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end center"] });
  const progressMV = useTransform(scrollYProgress, [0, 1], [0, PROGRESS_MAX]);
  const [progVal, setProgVal] = useState(0);
  useMotionValueEvent(progressMV, "change", (v) => setProgVal(reduced ? (v as number) * 0.6 : (v as number)));
  const bend = isSmall ? 0 : BEND_MAX;
  return (
    <div className="min-h-[300vh] bg-neutral-950 text-neutral-200">
      <section className="h-[120vh] grid place-items-center">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight">WebGL Peel Starter</h1>
          <p className="opacity-70 mt-3">Scroll down to peel. Swap the image, tune the bend, ship the vibe.</p>
        </div>
      </section>
      <section ref={sectionRef} className="relative h-[160vh]">
        <Canvas
          className="!fixed inset-0 h-screen w-screen"
          gl={{ antialias: true, alpha: true }}
          camera={{ position: [0, 0, 4.5], fov: 50 }}
        >
          <FitPlane tex={tex} progress={progVal} bend={bend} />
        </Canvas>
        <div className="absolute inset-0 pointer-events-none grid place-items-center">
          <div className="text-center max-w-xl">
            <p className="opacity-70">progress: {progVal.toFixed(2)} / {PROGRESS_MAX}</p>
            <p className="opacity-50 text-sm">bend: {bend}</p>
          </div>
        </div>
      </section>
      <section className="h-[140vh] grid place-items-center">
        <div className="text-center max-w-prose">
          <h2 className="text-2xl md:text-3xl font-medium">Make it yours</h2>
          <ul className="text-left list-disc list-inside opacity-80 mt-3 space-y-1">
            <li>Replace the image with your project shots or GLTF-baked renders.</li>
            <li>Drive <code>u_progress</code> with hover, click, or audio level instead of scroll.</li>
            <li>Add specular/rim in the fragment shader for a glossy paper look.</li>
            <li>Stack multiple planes for a magazine spread and offset their timings.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
