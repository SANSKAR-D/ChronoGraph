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

export default function ChronoGraphApp() {
  const [selectedTab, setSelectedTab] = useState<string>("home");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

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

      {/* ── Kokonut UI Pull-Cord Component: Slide from right below navbar (Hidden on Home tab) ── */}
      <AnimatePresence>
        {selectedTab !== "home" && (
          <motion.div
            key="pull-cord-lamp"
            initial={{ x: 120, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
            className="fixed top-24 right-6 z-40 pointer-events-auto"
          >
            <PullCord
              checked={theme === "light"}
              onCheckedChange={(isLight) => setTheme(isLight ? "light" : "dark")}
              label="Theme Switch"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as string)}
        className="flex flex-col flex-1 h-full overflow-hidden relative"
      >
        {/* Floating Glassmorphism Navbar with Swipeable Tabs */}
        <Navbar onLogin={handleLogin} onQuickRun={() => setSelectedTab("studio")} />

        <main className="flex flex-1 overflow-hidden relative w-full h-full">
          <TabPanelCarousel className="h-full w-full">
            <TabPanel id="home" shouldForceMount className="h-full overflow-hidden">
              <HomeView
                onSelectTab={(tab) => setSelectedTab(tab)}
                onLogin={handleLogin}
              />
            </TabPanel>
            <TabPanel id="studio" shouldForceMount className="h-full overflow-hidden relative">
              <StudioView theme={isLightMode ? "light" : "dark"} />
            </TabPanel>
            <TabPanel id="telemetry" shouldForceMount className="h-full overflow-y-auto">
              <TelemetryView />
            </TabPanel>
            <TabPanel id="dlq" shouldForceMount className="h-full overflow-y-auto">
              <DLQView />
            </TabPanel>
            <TabPanel id="architecture" shouldForceMount className="h-full overflow-y-auto">
              <ArchitectureView />
            </TabPanel>
          </TabPanelCarousel>
        </main>
      </Tabs>
    </div>
  );
}
