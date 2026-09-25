import { useId } from "react";

/** The Zoa mark: a gradient tile with a bin lid, body and a leaf of recycling. */
export function BrandMark({ size = 38 }: { size?: number }) {
  // useId output carries ":" or "«»", which break url(#…) references in some browsers.
  const id = `zm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-bg`}
          x1="0"
          y1="0"
          x2="40"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#5fe196" />
          <stop offset="1" stopColor="#0c6955" />
        </linearGradient>
        <linearGradient
          id={`${id}-sheen`}
          x1="0"
          y1="0"
          x2="0"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#${id}-bg)`} />
      <rect width="40" height="40" rx="12" fill={`url(#${id}-sheen)`} />
      {/* lid and handle */}
      <rect x="10" y="12" width="20" height="3.2" rx="1.6" fill="#fff" />
      <rect x="17" y="9" width="6" height="2.4" rx="1.2" fill="#fff" fillOpacity=".8" />
      {/* body */}
      <path
        d="M12.4 17.4h15.2l-1.5 10.5a2 2 0 0 1-2 1.7h-8.2a2 2 0 0 1-2-1.7l-1.5-10.5Z"
        fill="#fff"
        fillOpacity=".92"
      />
      {/* leaf */}
      <path
        d="M20 26.2c-2.6 0-3.7-2.1-3.3-4.6 2.4-.3 4.9.3 5.4 2.6.1.5 0 1-.1 1.5M20 26.2c.3-1.3 1-2.4 2-3.2"
        fill="none"
        stroke="#0c6955"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
