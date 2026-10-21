"use client";

import React, {
  createContext,
  CSSProperties,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import {
  Tabs as RACTabs,
  TabList as RACTabList,
  Tab as RACTab,
  TabPanel as RACTabPanel,
  SelectionIndicator,
  TabListStateContext,
  TabsProps,
  TabListProps,
  TabProps,
  TabPanelProps,
  composeRenderProps,
} from "react-aria-components";

// Root Tabs component that establishes the CSS timeline scope for scroll-driven animations
export function Tabs(props: TabsProps) {
  return (
    <RACTabs
      {...props}
      style={{ timelineScope: "--scroll", ...(props.style as object) } as CSSProperties}
      className={composeRenderProps(props.className, (className) =>
        `flex flex-col w-full h-full ${className || ""}`
      )}
    />
  );
}

// Tab list container
export function TabList<T extends object>(props: TabListProps<T>) {
  return (
    <RACTabList
      {...props}
      className={composeRenderProps(props.className, (className) =>
        `relative flex items-center gap-1 ${className || ""}`
      )}
    />
  );
}

// Individual Tab component with CSS anchor name and fallback selection indicator
export function Tab(props: TabProps) {
  return (
    <RACTab
      {...props}
      style={{ anchorName: `--tab-${props.id}`, ...(props.style as object) } as CSSProperties}
      className={composeRenderProps(props.className, (className, renderProps) =>
        `relative flex items-center gap-1.5 cursor-pointer select-none rounded-full px-4 py-1.5 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#7FBF6A] tab ${
          renderProps.isSelected
            ? "text-[#0C100D] font-semibold"
            : "text-[#8B968B] hover:text-[#E8ECE4]"
        } ${renderProps.isDisabled ? "opacity-40 cursor-not-allowed" : ""} ${className || ""}`
      )}
    >
      {composeRenderProps(props.children, (children) => (
        <>
          <span className="relative z-20 flex items-center gap-1.5">{children}</span>
          {/* Liquid glass fallback indicator */}
          <SelectionIndicator className="absolute inset-0 z-10 rounded-full bg-[#E8ECE4] shadow-[0_2px_10px_rgba(0,0,0,0.1)] supports-[animation-timeline]:hidden" />
        </>
      ))}
    </RACTab>
  );
}

// Dynamic Keyframe-based indicator animated via CSS anchor positioning & scroll-timeline
export function TabSelectionIndicator() {
  const state = useContext(TabListStateContext);
  const rawId = useId();
  const animationId = "tab-anim-" + rawId.replace(/[^a-zA-Z0-9_-]/g, "");

  if (!state || state.collection.size === 0) return null;

  const items = [...state.collection];
  const count = items.length;

  // Generate keyframes mapping each tab anchor to its position on the scroll timeline
  const keyframes: string[] = [];
  items.forEach((item, index) => {
    const pct = count > 1 ? Math.round((index / (count - 1)) * 100) : 0;
    keyframes.push(`${pct}% {
      top: anchor(--tab-${item.key} start);
      left: anchor(--tab-${item.key} start);
      bottom: anchor(--tab-${item.key} end);
      right: anchor(--tab-${item.key} end);
    }`);
  });

  return (
    <>
      <style>
        {`@keyframes ${animationId} {
          ${keyframes.join("\n")}
        }`}
      </style>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute z-10 rounded-full bg-[#E8ECE4] shadow-[0_2px_12px_rgba(0,0,0,0.15)] contain-strict transition-[inset] supports-[animation-timeline]:block hidden"
        style={
          {
            animationName: animationId,
            animationTimingFunction: "linear",
            animationTimeline: "--scroll",
            animationFillMode: "both",
          } as CSSProperties
        }
      />
    </>
  );
}

// Carousel wrapper with CSS scroll snapping and scroll-timeline
export function TabPanelCarousel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const state = useContext(TabListStateContext);
  const ref = useRef<HTMLDivElement | null>(null);

  // Update selected tab state when scroll snapping concludes
  const onScrollEnd = useCallback(() => {
    const el = ref.current;
    if (!el || !state || el.offsetWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.offsetWidth);
    const items = [...state.collection];
    if (items[index] && state.selectedKey !== items[index].key) {
      state.setSelectedKey(items[index].key);
    }
  }, [state]);

  // Safari / legacy fallback for scrollend event
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const onScroll = () => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onScrollEnd();
      }, 150);
    };

    const el = ref.current;
    if (typeof window !== "undefined" && !("onscrollend" in window) && el) {
      el.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        el.removeEventListener("scroll", onScroll);
        clearTimeout(timeoutRef.current);
      };
    }
  }, [onScrollEnd]);

  // Scroll active panel into view smoothly when clicking a tab
  const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    if (!state?.selectedItem || !ref.current) return;
    const panel = ref.current.children[state.selectedItem.index] as HTMLElement | undefined;
    if (panel) {
      ref.current.scrollTo({
        left: panel.offsetLeft,
        behavior: "smooth",
      });
    }
  }, [state?.selectedKey]);

  return (
    <div
      ref={ref}
      onScrollEnd={onScrollEnd}
      style={
        {
          scrollTimeline: "--scroll x",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as CSSProperties
      }
      className={`relative flex w-full flex-1 overflow-x-auto snap-x snap-mandatory no-scrollbar ${
        className || ""
      }`}
    >
      {children}
    </div>
  );
}

// Individual Tab Panel item
export function TabPanel(props: TabPanelProps) {
  return (
    <RACTabPanel
      {...props}
      className={composeRenderProps(props.className, (className) =>
        `shrink-0 w-full snap-start snap-always box-border outline-none overflow-y-auto ${
          className || ""
        }`
      )}
    />
  );
}
