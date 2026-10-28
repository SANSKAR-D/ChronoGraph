"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tabs,
  TabPanelCarousel,
  TabPanel,
} from "@/components/ui/swipeable-tabs";
import { Navbar } from "@/components/layout/Navbar";
import { HomeView } from "@/components/views/HomeView";
import { StudioView } from "@/components/views/StudioView";
import { TelemetryView } from "@/components/views/TelemetryView";
import { DLQView } from "@/components/views/DLQView";
import { ArchitectureView } from "@/components/views/ArchitectureView";
import { FluidCursorTrail } from "@/components/ui/fluid-cursor-trail";
import { PullCord } from "@/components/kokonutui/pull-cord";
import { LampCutoutSeparator } from "@/components/ui/lamp-cutout-separator";

const VALID_TABS = ["home", "studio", "telemetry", "dlq", "architecture"];

export default function ChronoGraphApp() {
  const [selectedTab, setSelectedTab] = useState<string>("home");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Restore active tab and theme on initial page load / refresh
  React.useEffect(() => {
    try {
      const hash = window.location.hash.replace("#", "").toLowerCase();
      if (VALID_TABS.includes(hash)) {
        setSelectedTab(hash);
      } else {
        const savedTab = localStorage.getItem("chronograph_active_tab");
        if (savedTab && VALID_TABS.includes(savedTab)) {
          setSelectedTab(savedTab);
        }
      }

      const savedTheme = localStorage.getItem("chronograph_theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
      }
    } catch {}
  }, []);

  const handleTabChange = (key: string) => {
    if (VALID_TABS.includes(key)) {
      setSelectedTab(key);
      try {
        localStorage.setItem("chronograph_active_tab", key);
        window.history.replaceState(null, "", key === "home" ? window.location.pathname : `#${key}`);
      } catch {}
    }
  };

  const handleThemeChange = (newTheme: "dark" | "light") => {
    setTheme(newTheme);
    try {
      localStorage.setItem("chronograph_theme", newTheme);
    } catch {}
  };

  const handleLogin = () => {
    // Auth hook point
  };

  // Home page is strictly ALWAYS in dark mode per requirement
  const isLightMode = selectedTab !== "home" && theme === "light";

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden relative transition-colors duration-300 ${
        isLightMode
          ? "light-theme bg-[#F3F6F2] text-[#141A15]"
          : "bg-[#0C100D] text-[#E8ECE4]"
      }`}
    >
      {/* Luminous fluid cursor trail on mouse movement */}
      <FluidCursorTrail />

      {/* ── Kokonut UI Pull-Cord Component: Slide from right below navbar (Hidden on Home tab & mobile/tablet) ── */}
      <AnimatePresence>
        {selectedTab !== "home" && (
          <motion.div
            key="pull-cord-lamp"
            initial={{ x: 120, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
            className="hidden lg:block fixed top-26 right-6 z-30 pointer-events-auto scale-100 origin-top-right"
          >
            <PullCord
              checked={theme === "light"}
              onCheckedChange={(isLight) => handleThemeChange(isLight ? "light" : "dark")}
              label="Theme Switch"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Balanced Curved Cutout Notch (ONLY on Telemetry, DLQ, Architecture — NOT on Home or Studio) ── */}
      <AnimatePresence>
        {selectedTab !== "home" && selectedTab !== "studio" && (
          <motion.div
            key="lamp-cutout-separator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <LampCutoutSeparator theme={isLightMode ? "light" : "dark"} />
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => handleTabChange(key as string)}
        className="flex flex-col flex-1 h-full overflow-hidden relative"
      >
        {/* Floating Glassmorphism Navbar with Swipeable Tabs */}
        <Navbar
          onLogin={handleLogin}
          onQuickRun={() => handleTabChange("studio")}
          theme={theme}
          onToggleTheme={() => handleThemeChange(theme === "light" ? "dark" : "light")}
        />

        <main className="flex flex-1 overflow-hidden relative w-full h-full">
          <TabPanelCarousel className="h-full w-full">
            <TabPanel id="home" shouldForceMount className="h-full overflow-hidden">
              <HomeView
                onSelectTab={(tab) => handleTabChange(tab)}
                onLogin={handleLogin}
              />
            </TabPanel>
            <TabPanel id="studio" shouldForceMount className="h-full overflow-hidden relative">
              <StudioView theme={isLightMode ? "light" : "dark"} />
            </TabPanel>
            <TabPanel id="telemetry" shouldForceMount className="h-full overflow-y-auto no-scrollbar">
              <TelemetryView theme={isLightMode ? "light" : "dark"} />
            </TabPanel>
            <TabPanel id="dlq" shouldForceMount className="h-full overflow-y-auto no-scrollbar">
              <DLQView theme={isLightMode ? "light" : "dark"} />
            </TabPanel>
            <TabPanel id="architecture" shouldForceMount className="h-full overflow-y-auto no-scrollbar">
              <ArchitectureView theme={isLightMode ? "light" : "dark"} />
            </TabPanel>
          </TabPanelCarousel>
        </main>
      </Tabs>
    </div>
  );
}
