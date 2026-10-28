"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TabList, Tab, TabSelectionIndicator } from "@/components/ui/swipeable-tabs";
import { LogIn } from "lucide-react";
import { ChronoGraphIcon } from "@/components/ui/logo";

interface NavbarProps {
  onQuickRun?: () => void;
  onLogin?: () => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  hasDlqAlert?: boolean;
}

export function Navbar({
  onQuickRun,
  onLogin,
  theme = "dark",
  onToggleTheme,
  hasDlqAlert: propHasDlqAlert,
}: NavbarProps) {
  const isLight = theme === "light";
  const [hasDlqAlert, setHasDlqAlert] = useState<boolean>(Boolean(propHasDlqAlert));

  useEffect(() => {
    if (propHasDlqAlert !== undefined) {
      setHasDlqAlert(propHasDlqAlert);
    }
  }, [propHasDlqAlert]);

  useEffect(() => {
    let mounted = true;
    const checkDlq = async () => {
      try {
        const res = await fetch("/api/v1/dlq");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.success) {
          const count =
            typeof data.unresolvedCount === "number"
              ? data.unresolvedCount
              : Array.isArray(data.jobs)
              ? data.jobs.filter((j: any) => j.status === "pending").length
              : 0;
          setHasDlqAlert(count > 0);
        }
      } catch {
        // ignore network error
      }
    };

    checkDlq();
    const interval = setInterval(checkDlq, 4000);
    const onDlqChange = () => checkDlq();
    window.addEventListener("chronograph:dlq-change", onDlqChange);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("chronograph:dlq-change", onDlqChange);
    };
  }, []);

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-2 sm:top-4 inset-x-0 z-50 flex justify-center px-2 sm:px-6 pointer-events-none"
    >
      {/* Floating liquid-glass capsule */}
      <div
        className="pointer-events-auto flex items-center justify-between w-full max-w-[1600px] rounded-full px-3 sm:px-5 py-2 sm:py-2.5 transition-all duration-300 gap-1 sm:gap-3"
        style={{
          background: isLight ? "rgba(250, 251, 249, 0.88)" : "rgba(20, 26, 21, 0.65)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          border: isLight ? "1px solid #D1D9D0" : "1px solid #243026",
          boxShadow: isLight
            ? "0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(250, 251, 249, 0.9)"
            : "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* ── Left: brand logo & name ── */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <ChronoGraphIcon className="h-4.5 w-4.5 text-[#75d555ff] shrink-0" />
          <span
            className={`text-sm font-semibold tracking-tight select-none font-[family-name:var(--font-brand)] hidden md:inline ${
              isLight ? "text-[#141A15]" : "text-[#E8ECE4]"
            }`}
          >
            Chrono<span className="text-[#75d555ff]">Graph</span>
          </span>
        </div>

        {/* ── Center: tab strip with neutral indicator ── */}
        <nav className="flex items-center min-w-0">
          <div
            className="relative rounded-full p-0.5 sm:p-1"
            style={{
              background: isLight ? "rgba(240, 243, 239, 0.8)" : "rgba(20, 26, 21, 0.6)",
              border: isLight ? "1px solid #D1D9D0" : "1px solid #243026",
            }}
          >
            <TabList aria-label="Main Navigation">
              <Tab id="home">
                <span>Home</span>
              </Tab>
              <Tab id="studio">
                <span>Studio</span>
              </Tab>
              <Tab id="telemetry">
                <span className="hidden sm:inline">Telemetry</span>
                <span className="sm:hidden">Telem</span>
              </Tab>
              <Tab id="dlq">
                <span>DLQ</span>
                {/* alert dot in muted terracotta red #E5735C - visible only when DLQ is not empty */}
                {hasDlqAlert && (
                  <span className="ml-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-[#E5735C] mb-1.5 animate-pulse" />
                )}
              </Tab>
              <Tab id="architecture">
                <span className="hidden sm:inline">Architecture</span>
                <span className="sm:hidden">Arch</span>
              </Tab>
            </TabList>
            <TabSelectionIndicator />
          </div>
        </nav>

        {/* ── Right: Theme toggle (mobile/tablet) + Login button ── */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              type="button"
              className={`lg:hidden flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border transition-colors cursor-pointer ${
                isLight
                  ? "border-[#D1D9D0] bg-[#FAFBF9] text-[#5E695E] hover:text-[#141A15]"
                  : "border-[#243026] bg-[#141A15] text-[#8B968B] hover:text-[#E8ECE4]"
              }`}
              title="Toggle theme"
            >
              <span className="text-xs">{isLight ? "🌙" : "☀️"}</span>
            </button>
          )}

          <button
            onClick={onLogin}
            type="button"
            className="flex items-center gap-1.5 rounded-full px-2.5 sm:px-4 py-1 sm:py-1.5 text-xs font-semibold text-[#0C100D] bg-[#7FBF6A] hover:bg-[#92CF7D] active:scale-[0.98] transition-all cursor-pointer border border-[#7FBF6A]"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Login</span>
          </button>
        </div>
      </div>
    </motion.header>
  );
}
