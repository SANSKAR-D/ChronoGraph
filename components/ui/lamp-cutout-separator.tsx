"use client";

import React from "react";

interface LampCutoutSeparatorProps {
  theme?: "dark" | "light";
}

export function LampCutoutSeparator({ theme = "dark" }: LampCutoutSeparatorProps) {
  const isLight = theme === "light";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-20 right-0 z-20 hidden lg:block w-[240px] h-[270px] select-none"
    >
      <svg
        width="240"
        height="270"
        viewBox="0 0 240 270"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Perfectly balanced inverted-radius cutout notch (20px uniform clearance on left & bottom) */}
        <path
          d="M 0 0 H 12 C 25.25 0, 36 10.75, 36 24 V 212 C 36 229.66, 50.34 244, 68 244 H 240"
          stroke={isLight ? "#D1D9D0" : "#243026"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
