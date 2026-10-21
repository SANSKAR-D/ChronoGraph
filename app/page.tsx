"use client";

import React, { useState } from "react";
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

export default function ChronoGraphApp() {
  const [selectedTab, setSelectedTab] = useState<string>("home");

  const handleLogin = () => {
    // Auth hook point
  };

  return (
    <div className="flex h-screen flex-col bg-[#0C100D] text-[#E8ECE4] overflow-hidden relative">
      {/* Luminous fluid cursor trail on mouse movement */}
      <FluidCursorTrail />

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
              <StudioView />
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
