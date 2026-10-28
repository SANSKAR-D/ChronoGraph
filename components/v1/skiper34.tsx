"use client";

import React, { useEffect, useRef } from "react";
import { motion, useMotionValue } from "framer-motion";

export interface StickyCardProps {
  imgUrl?: string;
  badge?: string;
  title?: string;
  description?: string;
  metrics?: { label: string; value: string }[];
  tags?: string[];
  icon?: React.ReactNode;
  illustration?: React.ReactNode;
  accentColor?: string;
  index?: number;
  containerRef?: React.RefObject<HTMLElement | null>;
  children?: React.ReactNode;
}

const StickyCard_003 = ({
  imgUrl,
  badge,
  title,
  description,
  metrics,
  tags,
  icon,
  illustration,
  accentColor = "#7FBF6A",
  index = 0,
  containerRef,
  children,
}: StickyCardProps) => {
  const vertMargin = 18;
  const cardRef = useRef<HTMLDivElement>(null);
  const scale = useMotionValue(1);
  const rotate = useMotionValue(0);

  useEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl) return;

    const getScrollContainer = () =>
      containerRef?.current ||
      (cardEl.closest(".overflow-y-auto") as HTMLElement | null) ||
      (cardEl.ownerDocument.querySelector(".overflow-y-auto") as HTMLElement | null) ||
      (typeof window !== "undefined" ? window : null);

    const scrollContainer = getScrollContainer();
    if (!scrollContainer) return;

    const handleScroll = () => {
      const sectionEl = cardEl.closest("section");
      if (!sectionEl) return;

      const viewportHeight = window.innerHeight;
      const targetTop = viewportHeight * (vertMargin / 100);
      const sectionTop = sectionEl.getBoundingClientRect().top;

      // Measure un-stuck layout position of header before cards
      const headerEl = sectionEl.querySelector("div.max-w-4xl") as HTMLElement | null;
      const headerOffset = headerEl
        ? headerEl.offsetTop + headerEl.offsetHeight + viewportHeight * 0.10
        : viewportHeight * 0.45;

      // Each card has pitch distance of 84vh (74vh card + 10vh gap)
      const cardPitch = viewportHeight * 0.84;
      const naturalCardTop = sectionTop + headerOffset + index * cardPitch;
      const delta = targetTop - naturalCardTop;

      if (delta <= 0) {
        // Topmost card or approaching card: straight
        scale.set(1);
        rotate.set(0);
      } else {
        // Alternating fan tilt matching Skiper UI:
        // Even indices tilt clockwise (+8.5deg to +11.5deg) -> top-left corner sticks up
        // Odd indices tilt counter-clockwise (-8.5deg to -11.5deg) -> top-right corner sticks up
        const isMobile = window.innerWidth < 640;
        const sign = index % 2 === 0 ? 1 : -1;
        const progress = Math.min(1, delta / cardPitch);
        const extra = Math.min(1, Math.max(0, (delta - cardPitch) / cardPitch));
        const angle = sign * (isMobile ? Math.min(2.5, progress * 2.5) : (progress * 8.5 + extra * 3));
        rotate.set(angle);
        scale.set(1);
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    handleScroll();
    const raf = requestAnimationFrame(handleScroll);

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      cancelAnimationFrame(raf);
    };
  }, [containerRef, index, scale, rotate, vertMargin]);

  return (
    <motion.div
      ref={cardRef}
      className="rounded-3xl sm:rounded-4xl sticky w-full max-w-4xl overflow-hidden"
      style={{
        scale,
        rotate,
        height: `${100 - vertMargin - 8}vh`,
        top: `${vertMargin}vh`,
        zIndex: 10 + index,
        background: "rgba(20, 26, 21, 0.96)",
        backdropFilter: "blur(24px) saturate(140%)",
        WebkitBackdropFilter: "blur(24px) saturate(140%)",
        border: "1.5px solid #243026",
        boxShadow:
          "0 25px 60px -15px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={imgUrl}
          className="h-full w-full object-cover"
          sizes="90vw"
        />
      ) : children ? (
        <div className="h-full w-full flex flex-col overflow-hidden">
          {children}
        </div>
      ) : (
        <div className="h-full w-full flex flex-col justify-between p-3.5 sm:p-7 md:p-10 relative overflow-y-auto no-scrollbar">
          {/* Subtle background ambient overlay */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#7FBF6A]/10 rounded-full blur-[100px]" />
            <div className="grid-overlay absolute inset-0 opacity-15" />
          </div>

          {/* Top Bar: Badge & Tags */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-1.5 sm:gap-3 border-b border-[#243026] pb-2 sm:pb-4">
            <div className="flex items-center gap-2 sm:gap-2.5">
              {icon && (
                <div className="flex h-6 w-6 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-[#243026] bg-[#0C100D] text-[#7FBF6A]">
                  {icon}
                </div>
              )}
              {badge && (
                <span className="font-mono text-[9px] sm:text-xs font-semibold tracking-wider uppercase text-[#7FBF6A]">
                  {badge}
                </span>
              )}
            </div>

            {tags && tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                {tags.map((tag, tIdx) => (
                  <span
                    key={tIdx}
                    className="rounded-full border border-[#243026] bg-[#0C100D]/80 px-1.5 sm:px-3 py-0.5 sm:py-1 text-[9px] sm:text-[11px] font-mono text-[#8B968B]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Middle Content: Title, Description & Technical Illustration */}
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-2 sm:gap-5 md:gap-8 items-center my-auto py-1 sm:py-2">
            <div className="md:col-span-7 space-y-2 sm:space-y-4">
              <h3 className="text-base sm:text-2xl md:text-4xl font-bold tracking-tight text-[#E8ECE4] leading-snug sm:leading-tight">
                {title}
              </h3>
              <p className="text-[11px] sm:text-sm md:text-base text-[#8B968B] leading-relaxed">
                {description}
              </p>
            </div>

            {illustration && (
              <div className="md:col-span-5 flex items-center justify-center max-h-[140px] sm:max-h-none overflow-hidden scale-90 sm:scale-100 origin-center">
                {illustration}
              </div>
            )}
          </div>

          {/* Bottom Metrics Strip */}
          {metrics && metrics.length > 0 && (
            <div className="relative z-10 grid grid-cols-3 gap-1.5 sm:gap-3 pt-2 sm:pt-4 border-t border-[#243026]">
              {metrics.map((m, mIdx) => (
                <div
                  key={mIdx}
                  className="rounded-lg sm:rounded-xl border border-[#243026] bg-[#0C100D]/80 p-1.5 sm:p-3 font-mono"
                >
                  <span className="block text-[8px] sm:text-[10px] text-[#8B968B] tracking-wider uppercase truncate">
                    {m.label}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-[#7FBF6A] truncate block">
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

const Skiper34 = ({
  cards = [],
  containerRef,
}: {
  cards?: StickyCardProps[];
  containerRef?: React.RefObject<HTMLElement | null>;
}) => {
  return (
    <section className="relative flex w-full flex-col items-center gap-[10vh] px-4 pt-[50vh] pb-[50vh]">
      <div className="absolute left-1/2 top-24 grid -translate-x-1/2 content-start justify-items-center gap-6 text-center">
        <span className="after:from-[#243026] after:to-[#7FBF6A] relative max-w-[14ch] text-xs font-mono uppercase tracking-widest text-[#7FBF6A] opacity-75 after:absolute after:left-1/2 after:top-full after:mt-3 after:h-16 after:w-px after:bg-gradient-to-b after:content-['']">
          scroll down to see effect
        </span>
      </div>
      {cards.map((card, idx) => (
        <StickyCard_003
          key={idx}
          {...card}
          index={idx}
          containerRef={containerRef}
        />
      ))}
    </section>
  );
};

export { Skiper34, StickyCard_003 };
