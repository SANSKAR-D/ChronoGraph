"use client";

/**
 * @author: @dorianbaffier
 * @description: Pull Cord (ChronoGraph Theme Edition)
 * @version: 1.1.0
 * @license: MIT
 * @website: https://kokonutui.com
 */

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// Virtual physics world resolution
const VIRTUAL_WIDTH = 288;
const VIRTUAL_HEIGHT = 360;

// Where the cord hangs from, under the lamp shade.
const ANCHOR = { x: VIRTUAL_WIDTH / 2 + 36, y: 116 };
const LINKS = 12;
const LINK = 8.5;
const STEP = 1 / 120;
const GRAVITY = 1400;
const DAMPING = 0.992;
const MAX_SPEED = 4;
const BEND_MIN = LINK * 1.9;
const BEND_STIFFNESS = 0.8;
const ITERATIONS = 14;
const CLICK_PULL = 22;
const MAX_STRETCH = 34;
const REST_EPSILON = 0.015;
const REST_STEPS = 24;

function damp(distance: number, max: number) {
  return max * (1 - Math.exp(-distance / max));
}

function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(8);
  }
}

function relax(
  chain: { xs: Float64Array; ys: Float64Array; held: number },
  a: number,
  b: number,
  length: number,
  bend: boolean
) {
  const { xs, ys, held } = chain;
  const aFixed = a === 0 || a === held;
  const bFixed = b === held;
  if (aFixed && bFixed) {
    return;
  }
  const dx = xs[b] - xs[a];
  const dy = ys[b] - ys[a];
  const dist = Math.hypot(dx, dy) || 0.0001;
  if (bend && dist >= length) {
    return;
  }
  const diff = ((dist - length) / dist) * (bend ? BEND_STIFFNESS : 1);
  let wa = 0.5;
  if (aFixed) {
    wa = 0;
  } else if (bFixed) {
    wa = 1;
  }
  xs[a] += dx * diff * wa;
  ys[a] += dy * diff * wa;
  xs[b] -= dx * diff * (1 - wa);
  ys[b] -= dy * diff * (1 - wa);
}

function cordPath(xs: Float64Array, ys: Float64Array) {
  let d = `M${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 1; i < xs.length - 1; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2;
    const my = (ys[i] + ys[i + 1]) / 2;
    d += ` Q${xs[i].toFixed(2)} ${ys[i].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const n = xs.length - 1;
  d += ` L${xs[n].toFixed(2)} ${ys[n].toFixed(2)}`;
  return d;
}

function restingChain() {
  const xs = new Float64Array(LINKS + 1);
  const ys = new Float64Array(LINKS + 1);
  for (let i = 0; i <= LINKS; i++) {
    xs[i] = ANCHOR.x;
    ys[i] = ANCHOR.y + i * LINK;
  }
  return { xs, ys };
}

const REST = restingChain();
const REST_PATH = cordPath(REST.xs, REST.ys);

export interface PullCordProps {
  /** Controlled state. */
  checked?: boolean;
  /** Initial state when uncontrolled. */
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Accessible name of the switch. */
  label?: string;
  className?: string;
  width?: number;
  height?: number;
}

export default function PullCord({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  label = "Theme",
  className,
  width = 160,
  height = 200,
}: PullCordProps) {
  const [internal, setInternal] = useState(defaultChecked);
  const checked = checkedProp ?? internal;
  const [focused, setFocused] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const cordRef = useRef<SVGPathElement>(null);
  const hitRef = useRef<SVGPathElement>(null);
  const beadRef = useRef<SVGGElement>(null);

  const sim = useRef({
    xs: Float64Array.from(REST.xs),
    ys: Float64Array.from(REST.ys),
    pxs: Float64Array.from(REST.xs),
    pys: Float64Array.from(REST.ys),
    raf: 0,
    last: 0,
    carry: 0,
    still: 0,
    held: -1,
    targetX: 0,
    targetY: 0,
    armed: true,
    reduceMotion: false,
  });

  const latest = useRef<{ checked: boolean; toggle: (next: boolean) => void }>({
    checked,
    toggle: () => undefined,
  });
  const toggle = useCallback(
    (next: boolean) => {
      if (checkedProp === undefined) {
        setInternal(next);
      }
      onCheckedChange?.(next);
    },
    [checkedProp, onCheckedChange]
  );
  latest.current = { checked, toggle };

  const draw = useCallback(() => {
    const { xs, ys } = sim.current;
    const d = cordPath(xs, ys);
    cordRef.current?.setAttribute("d", d);
    hitRef.current?.setAttribute("d", d);
    const n = LINKS;
    const angle =
      (Math.atan2(xs[n] - xs[n - 1], ys[n] - ys[n - 1]) * 180) / Math.PI;
    beadRef.current?.setAttribute(
      "transform",
      `translate(${xs[n].toFixed(2)} ${ys[n].toFixed(2)}) rotate(${(-angle).toFixed(2)})`
    );
  }, []);

  const integrate = useCallback(() => {
    const s = sim.current;
    const { xs, ys, pxs, pys } = s;
    let moved = 0;
    for (let i = 1; i <= LINKS; i++) {
      if (i === s.held) {
        continue;
      }
      let vx = (xs[i] - pxs[i]) * DAMPING;
      let vy = (ys[i] - pys[i]) * DAMPING;
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_SPEED) {
        vx *= MAX_SPEED / speed;
        vy *= MAX_SPEED / speed;
      }
      pxs[i] = xs[i];
      pys[i] = ys[i];
      xs[i] += vx;
      ys[i] += vy + GRAVITY * STEP * STEP;
      moved = Math.max(moved, Math.abs(vx) + Math.abs(vy));
    }
    if (s.held > 0) {
      const i = s.held;
      moved = Math.max(
        moved,
        Math.abs(s.targetX - xs[i]) + Math.abs(s.targetY - ys[i])
      );
      pxs[i] = xs[i];
      pys[i] = ys[i];
      xs[i] = s.targetX;
      ys[i] = s.targetY;
    }
    return moved;
  }, []);

  const constrain = useCallback(() => {
    const s = sim.current;
    for (let k = 0; k < ITERATIONS; k++) {
      for (let i = 0; i < LINKS; i++) {
        relax(s, i, i + 1, LINK, false);
      }
      for (let i = 0; i + 2 <= LINKS; i++) {
        relax(s, i, i + 2, BEND_MIN, true);
      }
    }
  }, []);

  const step = useCallback(() => {
    const moved = integrate();
    constrain();
    return moved;
  }, [integrate, constrain]);

  const tick = useCallback(
    (now: number) => {
      const s = sim.current;
      s.raf = 0;
      const elapsed = s.last ? Math.min((now - s.last) / 1000, 0.05) : STEP;
      s.last = now;
      s.carry += elapsed;
      let moved = 0;
      while (s.carry >= STEP) {
        moved = Math.max(moved, step());
        s.carry -= STEP;
      }
      draw();
      s.still = moved < REST_EPSILON ? s.still + 1 : 0;
      if (s.held > 0 || s.still < REST_STEPS) {
        s.raf = requestAnimationFrame(tick);
      } else {
        s.last = 0;
      }
    },
    [draw, step]
  );

  const wake = useCallback(() => {
    const s = sim.current;
    s.still = 0;
    if (!s.raf) {
      s.raf = requestAnimationFrame(tick);
    }
  }, [tick]);

  useEffect(() => {
    const s = sim.current;
    s.reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    return () => cancelAnimationFrame(s.raf);
  }, []);

  const localPoint = (event: PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIRTUAL_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * VIRTUAL_HEIGHT,
    };
  };

  const reach = (index: number, x: number, y: number) => {
    const dx = x - ANCHOR.x;
    const dy = y - ANCHOR.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const length = index * LINK;
    if (dist <= length) {
      return { x, y, pull: 0 };
    }
    const allowed = length + damp(dist - length, MAX_STRETCH);
    return {
      x: ANCHOR.x + (dx / dist) * allowed,
      y: ANCHOR.y + (dy / dist) * allowed,
      pull: dy > 0 ? (allowed - length) * (dy / dist) : 0,
    };
  };

  const handlePointerDown = (event: PointerEvent<SVGElement>) => {
    const s = sim.current;
    if (s.held > 0) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.preventDefault();
    const point = localPoint(event);
    let nearest = LINKS;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 1; i <= LINKS; i++) {
      const d = Math.hypot(s.xs[i] - point.x, s.ys[i] - point.y);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    svgRef.current?.setPointerCapture(event.pointerId);
    s.held = nearest;
    s.targetX = s.xs[nearest];
    s.targetY = s.ys[nearest];
    s.armed = true;
    setGrabbing(true);
    wake();
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const s = sim.current;
    if (s.held < 0) {
      return;
    }
    const point = localPoint(event);
    const target = reach(s.held, point.x, point.y);
    s.targetX = target.x;
    s.targetY = target.y;
    if (s.armed && target.pull > CLICK_PULL) {
      s.armed = false;
      haptic();
      latest.current.toggle(!latest.current.checked);
    } else if (!s.armed && target.pull < CLICK_PULL * 0.4) {
      s.armed = true;
    }
    wake();
  };

  const handlePointerUp = () => {
    const s = sim.current;
    if (s.held < 0) {
      return;
    }
    s.held = -1;
    setGrabbing(false);
    if (s.reduceMotion) {
      s.xs.set(REST.xs);
      s.ys.set(REST.ys);
      s.pxs.set(REST.xs);
      s.pys.set(REST.ys);
      draw();
      return;
    }
    wake();
  };

  const handleKeyToggle = () => {
    toggle(!checked);
    const s = sim.current;
    if (!s.reduceMotion) {
      s.pys[LINKS] = s.ys[LINKS] - 5;
      wake();
    }
  };

  return (
    <div
      className={cn(
        "relative select-none overflow-hidden rounded-xl border transition-all duration-300 ease-out backdrop-blur-xl",
        checked
          ? "border-[#E2E6E3] bg-[#FAFAF9]/95 text-[#111814] shadow-[0_10px_30px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,1)]"
          : "border-[#243026] bg-[#141A15]/95 text-[#E8ECE4] shadow-[0_12px_32px_rgba(0,0,0,0.7)]",
        className
      )}
      style={{ width, height }}
    >
      <svg
        aria-hidden="true"
        className={cn(
          "absolute inset-0 w-full h-full touch-none",
          grabbing ? "cursor-grabbing" : "cursor-default"
        )}
        onLostPointerCapture={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={svgRef}
        viewBox={`0 0 ${VIRTUAL_WIDTH} ${VIRTUAL_HEIGHT}`}
      >
        <defs>
          <filter id="emeraldBulbGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Ceiling wire */}
        <line
          className={cn(
            "transition-[stroke] duration-300 ease-out",
            checked ? "stroke-[#CCD2CB]" : "stroke-[#243026]"
          )}
          strokeWidth={1.5}
          x1={VIRTUAL_WIDTH / 2}
          x2={VIRTUAL_WIDTH / 2}
          y1={0}
          y2={62}
        />

        {/* Lamp shade */}
        <path
          className={cn(
            "transition-[fill,stroke] duration-300 ease-out",
            checked
              ? "fill-[#F0F2F0] stroke-[#D8DCD7]"
              : "fill-[#0C100D] stroke-[#243026]"
          )}
          strokeWidth={1.5}
          d={`M${VIRTUAL_WIDTH / 2 - 14} 62 h28 l38 50 q2 4 -3 4 h-98 q-5 0 -3 -4 Z`}
        />

        {/* The bulb with radiant emerald glow when active */}
        <path
          className={cn(
            "transition-[fill] duration-300 ease-out",
            checked ? "fill-[#7FBF6A]" : "fill-[#19231B]"
          )}
          strokeWidth={checked ? 0 : 1}
          filter={checked ? "url(#emeraldBulbGlow)" : undefined}
          d={`M${VIRTUAL_WIDTH / 2 - 15} 116 a15 13 0 0 0 30 0 Z`}
        />

        {/* The cord wire */}
        <path
          className="stroke-[#7FBF6A]"
          d={REST_PATH}
          fill="none"
          ref={cordRef}
          strokeLinecap="round"
          strokeWidth={1.75}
        />

        {/* Hit area */}
        <path
          className={cn(!grabbing && "cursor-grab")}
          d={REST_PATH}
          fill="none"
          onPointerDown={handlePointerDown}
          pointerEvents="stroke"
          ref={hitRef}
          stroke="transparent"
          strokeWidth={24}
        />

        {/* Pull handle bead with green accent */}
        <g
          className={cn(!grabbing && "cursor-grab")}
          onPointerDown={handlePointerDown}
          ref={beadRef}
          transform={`translate(${ANCHOR.x} ${ANCHOR.y + LINKS * LINK})`}
        >
          <circle fill="transparent" r={22} />
          {focused && (
            <rect
              className="fill-none stroke-[#7FBF6A]"
              height={30}
              rx={9}
              strokeWidth={2}
              width={20}
              x={-10}
              y={-4}
            />
          )}
          <rect
            className="fill-[#7FBF6A] stroke-[#92CF7D]"
            strokeWidth={1}
            height={20}
            rx={5}
            width={10}
            x={-5}
            y={1}
          />
        </g>
      </svg>

      {/* Compact footer label */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-1.5 pt-0.5 text-center">
        <p
          className="font-mono text-[8px] font-bold uppercase tracking-wider text-[#7FBF6A]"
        >
          {checked ? "Light Mode" : "Dark Mode"}
        </p>
        <p
          className={cn(
            "text-[7px] font-mono truncate",
            checked ? "text-[#667268]" : "text-[#8B968B]"
          )}
        >
          pull cord
        </p>
      </div>

      <button
        aria-checked={checked}
        aria-label={label}
        className="sr-only"
        onBlur={() => setFocused(false)}
        onClick={handleKeyToggle}
        onFocus={(event) =>
          setFocused(event.currentTarget.matches(":focus-visible"))
        }
        role="switch"
        type="button"
      />
    </div>
  );
}
export { PullCord };
