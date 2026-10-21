"use client";

import React, { useEffect, useRef, useState } from "react";

// ChronoGraph Emerald Palette tailored for Codrops Gooey effect
const GOOEY_COLORS = [
  "#75d555", // ChronoGraph core green
  "#7FBF6A", // Soft moss green
  "#92CF7D", // Light emerald
  "#5ebd45", // Deep forest green
  "#a3e635", // Vibrant lime accent
];

export function FluidCursorTrail() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const container = containerRef.current;
    const inner = innerRef.current;
    const orb = orbRef.current;
    if (!container || !inner || !orb) return;

    let columns = 30;
    let cellSize = 0;
    let rows = 0;
    let cellsTotal = 0;
    let cells: HTMLDivElement[] = [];
    let cachedCell: HTMLDivElement | null = null;
    let lastPos = { x: -100, y: -100 };
    const timeouts = new Map<HTMLDivElement, NodeJS.Timeout>();

    const layout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Slightly refined responsive column count (subtle width decrease)
      columns = width < 640 ? 16 : width < 1024 ? 26 : 35;
      cellSize = width / columns;
      rows = Math.ceil(height / cellSize);
      cellsTotal = rows * columns;

      // Clear existing cells and timeouts
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
      inner.innerHTML = "";

      inner.style.gridTemplateColumns = `repeat(${columns}, ${cellSize}px)`;

      const fragment = document.createDocumentFragment();
      cells = [];

      for (let i = 0; i < cellsTotal; i++) {
        const box = document.createElement("div");
        box.className = "cursor__inner-box";

        // Slightly tighter randomized scale and ChronoGraph green shade
        const color = GOOEY_COLORS[i % GOOEY_COLORS.length];
        const idleScale = 0.55 + Math.random() * 0.35;
        const activeScale = 1.0 + Math.random() * 0.25;

        box.dataset.idleScale = idleScale.toFixed(2);
        box.dataset.activeScale = activeScale.toFixed(2);

        Object.assign(box.style, {
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          backgroundColor: color,
          borderRadius: "50%",
          opacity: "0",
          transform: `scale(${idleScale})`,
          transition: "opacity 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.28s ease-out",
          pointerEvents: "none",
        });

        fragment.appendChild(box);
        cells.push(box);
      }

      inner.appendChild(fragment);

      // Slightly reduced follower orb sizing
      const orbSize = cellSize * 1.15;
      Object.assign(orb.style, {
        width: `${orbSize}px`,
        height: `${orbSize}px`,
      });
    };

    layout();

    let resizeTimer: NodeJS.Timeout | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 150);
    };
    window.addEventListener("resize", handleResize);

    // Original duration: rich fluid gooey persistence (280ms)
    const activateCell = (cell: HTMLDivElement, durationMs = 280) => {
      cell.style.opacity = "1";
      cell.style.transform = `scale(${cell.dataset.activeScale})`;

      const existingTimeout = timeouts.get(cell);
      if (existingTimeout) clearTimeout(existingTimeout);

      const timeout = setTimeout(() => {
        cell.style.opacity = "0";
        cell.style.transform = `scale(${cell.dataset.idleScale})`;
        timeouts.delete(cell);
      }, durationMs);

      timeouts.set(cell, timeout);
    };

    const getCellAt = (x: number, y: number): HTMLDivElement | null => {
      if (cellSize <= 0) return null;
      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);
      if (col < 0 || col >= columns || row < 0 || row >= rows) return null;
      const index = row * columns + col;
      return cells[index] || null;
    };

    const handlePointerMove = (e: MouseEvent | PointerEvent) => {
      const curX = e.clientX;
      const curY = e.clientY;

      // Update liquid cursor follower orb
      orb.style.opacity = "1";
      orb.style.transform = `translate3d(${curX}px, ${curY}px, 0) translate(-50%, -50%)`;

      // Interpolate points between previous and current coordinates to prevent gaps on rapid sweeps
      if (lastPos.x > 0 && lastPos.y > 0) {
        const dx = curX - lastPos.x;
        const dy = curY - lastPos.y;
        const dist = Math.hypot(dx, dy);
        const stepSize = Math.max(16, cellSize * 0.45);
        const steps = Math.min(12, Math.max(1, Math.ceil(dist / stepSize)));

        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const ix = lastPos.x + dx * t;
          const iy = lastPos.y + dy * t;
          const cell = getCellAt(ix, iy);
          if (cell && cell !== cachedCell) {
            cachedCell = cell;
            activateCell(cell);
          }
        }
      } else {
        const cell = getCellAt(curX, curY);
        if (cell) {
          cachedCell = cell;
          activateCell(cell);
        }
      }

      lastPos.x = curX;
      lastPos.y = curY;
    };

    const handlePointerLeave = () => {
      lastPos = { x: -100, y: -100 };
      cachedCell = null;
      orb.style.opacity = "0";
    };

    // Movement-only listeners (click event listener omitted)
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    document.addEventListener("mouseleave", handlePointerLeave);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("mousemove", handlePointerMove);
      document.removeEventListener("mouseleave", handlePointerLeave);
      if (resizeTimer) clearTimeout(resizeTimer);
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  return (
    <>
      {/* Original Codrops SVG Filter for Gooey / Liquid Metaball Fusion */}
      <svg
        className="pointer-events-none fixed top-0 left-0 w-0 h-0 select-none -z-50"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        version="1.1"
      >
        <defs>
          <filter id="gooey">
            <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="13" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -7"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* Shared Gooey Filter Container with CSS Screen Blend Mode */}
      <div
        ref={containerRef}
        className="pointer-events-none fixed inset-0 z-50 overflow-hidden select-none"
        style={{
          mixBlendMode: "screen",
          opacity: isClient ? 0.95 : 0,
          filter: "url(#gooey)",
        }}
        aria-hidden="true"
      >
        <div
          ref={innerRef}
          className="cursor__inner w-full h-full absolute inset-0"
          style={{
            display: "grid",
          }}
        />

        {/* Original follower orb that merges directly with cells in the shared filter context */}
        <div
          ref={orbRef}
          className="cursor__orb absolute top-0 left-0 rounded-full pointer-events-none opacity-0"
          style={{
            background: "radial-gradient(circle, #f0fdf4 20%, #75d555 65%, #5ebd45 100%)",
            willChange: "transform, opacity",
            transition: "opacity 0.25s ease-out",
          }}
        />
      </div>
    </>
  );
}
