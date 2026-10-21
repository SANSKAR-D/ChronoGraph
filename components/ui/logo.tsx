import React from "react";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number | string;
}

/**
 * ChronoGraph topological graph icon: central hub node with 3 fan-out arrows
 */
export function ChronoGraphIcon({ className = "h-5 w-5", ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Central Hub Node */}
      <circle cx="62" cy="50" r="13" />

      {/* Outer Satellite Nodes */}
      <circle cx="24" cy="50" r="8.5" />
      <circle cx="94" cy="20" r="8.5" />
      <circle cx="94" cy="80" r="8.5" />

      {/* Left Fan-Out Arrow */}
      <line x1="49" y1="50" x2="38" y2="50" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <polygon points="38,46 33,50 38,54" fill="currentColor" />

      {/* Top-Right Fan-Out Arrow */}
      <line x1="71" y1="41" x2="81" y2="31" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <polygon points="77.5,27 85.5,26.5 85,34.5" fill="currentColor" />

      {/* Bottom-Right Fan-Out Arrow */}
      <line x1="71" y1="59" x2="81" y2="69" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <polygon points="85,65.5 85.5,73.5 77.5,73" fill="currentColor" />
    </svg>
  );
}

/**
 * Full ChronoGraph Logo (Icon + Wordmark)
 */
export function ChronoGraphLogo({
  className = "",
  iconClassName = "h-8 w-8",
  textClassName = "text-sm",
  showWordmark = true,
}: {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <ChronoGraphIcon className={iconClassName} />
      {showWordmark && (
        <span
          className={`font-black tracking-wider text-white uppercase font-sans ${textClassName}`}
          style={{ letterSpacing: "0.08em" }}
        >
          CHRONOGRAPH
        </span>
      )}
    </div>
  );
}
