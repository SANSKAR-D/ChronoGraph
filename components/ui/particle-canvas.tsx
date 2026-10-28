"use client";

import React, { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
  baseAlpha: number;
  pulseSpeed: number;
  t: number;
  color: string;
}

const PALETTE = [
  "127, 191, 106", // #7FBF6A - softer leaf green
  "146, 207, 125", // #92CF7D - accent hover green
  "110, 231, 183", // emerald-300
  "232, 236, 228", // #E8ECE4 warm off-white glow
  "255, 255, 255", // white glow
];

// Spawns particles closer towards center (0–44% and 56–100%)
function getPeripheralX(w: number): number {
  return Math.random() < 0.5
    ? Math.random() * (w * 0.44)
    : w * 0.56 + Math.random() * (w * 0.44);
}

export function ParticleCanvas({ count = 80 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let logicalW = window.innerWidth;
    let logicalH = window.innerHeight;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      logicalW = window.innerWidth;
      logicalH = window.innerHeight;
      canvas.width = logicalW * dpr;
      canvas.height = logicalH * dpr;
      canvas.style.width = `${logicalW}px`;
      canvas.style.height = `${logicalH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // Initialize small, delicate particles drifting gracefully towards center
    const particles: Particle[] = Array.from({ length: count }, () => {
      const baseAlpha = 0.35 + Math.random() * 0.45;
      return {
        x: getPeripheralX(logicalW),
        y: Math.random() * logicalH,
        r: 0.75 + Math.random() * 1.1, // Fine size: 0.75px to 1.85px
        vx: (Math.random() - 0.5) * 0.2,
        vy: -(0.2 + Math.random() * 0.45),
        alpha: baseAlpha,
        baseAlpha,
        pulseSpeed: 1.0 + Math.random() * 1.6,
        t: Math.random() * Math.PI * 2,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      };
    });

    const render = () => {
      ctx.clearRect(0, 0, logicalW, logicalH);

      const centerX = logicalW * 0.5;
      const centerY = logicalH * 0.5;
      // Tighter center exclusion zone so particles float closer towards the center
      const deadZoneRadiusX = logicalW * 0.16;
      const deadZoneRadiusY = logicalH * 0.20;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.t += 0.02 * p.pulseSpeed;

        // Upward drift + horizontal sine sway
        p.x += p.vx + Math.sin(p.t) * 0.2;
        p.y += p.vy;

        // Check center exclusion
        const cdx = (p.x - centerX) / deadZoneRadiusX;
        const cdy = (p.y - centerY) / deadZoneRadiusY;
        const centerDistSq = cdx * cdx + cdy * cdy;

        // Gentle outward drift only if inside direct core
        if (centerDistSq < 1.0) {
          p.x += p.x >= centerX ? 1.0 : -1.0;
          continue;
        }

        // Wrap around viewport boundaries - respawn on peripheral margins
        if (p.y < -10) {
          p.y = logicalH + 10;
          p.x = getPeripheralX(logicalW);
        }
        if (p.y > logicalH + 10) {
          p.y = -10;
          p.x = getPeripheralX(logicalW);
        }
        if (p.x < -10) p.x = logicalW + 10;
        if (p.x > logicalW + 10) p.x = -10;

        // Luminous breathing alpha
        const effectiveAlpha = Math.max(0.15, Math.min(0.9, p.baseAlpha + Math.sin(p.t) * 0.2));

        // Draw lightweight glowing halo without per-frame gradient allocations (Zero GC)
        const haloRadius = p.r * 2.0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${(effectiveAlpha * 0.28).toFixed(2)})`;
        ctx.fill();

        // Pinpoint bright core
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.6, p.r * 0.55), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, effectiveAlpha + 0.2).toFixed(2)})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}
