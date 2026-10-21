"use client";

import React from "react";
import { motion } from "framer-motion";
import { TabList, Tab, TabSelectionIndicator } from "@/components/ui/swipeable-tabs";
import { LogIn } from "lucide-react";
import { ChronoGraphIcon } from "@/components/ui/logo";

interface NavbarProps {
  onQuickRun?: () => void;
  onLogin?: () => void;
}

export function Navbar({ onQuickRun, onLogin }: NavbarProps) {
  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 sm:px-6 pointer-events-none"
    >
      {/* Floating liquid-glass capsule */}
      <div
        className="pointer-events-auto flex items-center justify-between w-full max-w-[1600px] rounded-full px-5 py-2.5 transition-all duration-300"
        style={{
          background: "rgba(20, 26, 21, 0.65)",
          backdropFilter: "blur(5px) saturate(140%)",
          WebkitBackdropFilter: "blur(15px) saturate(140%)",
          border: "1px solid #243026",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* ── Left: brand logo & name ── */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <ChronoGraphIcon className="h-4.5 w-4.5 text-[#75d555ff] shrink-0" />
          <span
            className="text-sm font-semibold tracking-tight text-[#E8ECE4] select-none font-[family-name:var(--font-brand)]"
          >
            Chrono<span className="text-[#75d555ff]">Graph</span>
          </span>
        </div>

        {/* ── Center: tab strip with neutral indicator ── */}
        <nav className="flex items-center">
          <div
            className="relative rounded-full p-1"
            style={{
              background: "rgba(20, 26, 21, 0.6)",
              border: "1px solid #243026",
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
                <span>Telemetry</span>
              </Tab>
              <Tab id="dlq">
                <span>DLQ</span>
                {/* alert dot in muted terracotta red #E5735C */}
                <span className="ml-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-[#E5735C] mb-1.5" />
              </Tab>
              <Tab id="architecture">
                <span className="hidden sm:inline">Architecture</span>
                <span className="sm:hidden">Arch</span>
              </Tab>
            </TabList>
            <TabSelectionIndicator />
          </div>
        </nav>

        {/* ── Right: Login button ── */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onLogin}
            type="button"
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-[#0C100D] bg-[#7FBF6A] hover:bg-[#92CF7D] active:scale-[0.98] transition-all cursor-pointer border border-[#7FBF6A]"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Login</span>
          </button>
        </div>
      </div>
    </motion.header>
  );
}
