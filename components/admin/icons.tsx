import React from "react";

// Ícones de traço do painel (24x24, herdam a cor do texto)
type IconProps = { className?: string };

const icon =
  (paths: React.ReactNode): React.FC<IconProps> =>
  ({ className }) => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );

export const IconDashboard = icon(
  <>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>,
);
export const IconBox = icon(
  <>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </>,
);
export const IconTag = icon(
  <>
    <path d="m20.6 13.4-7.2 7.2a2 2 0 0 1-2.8 0L3 13V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8Z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  </>,
);
export const IconImage = icon(
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m4 17 4.5-4.5 3 3L15 12l5 5" />
  </>,
);
export const IconChart = icon(<path d="M4 20V10m6 10V4m6 16v-7M3 20h18" />);
export const IconTrend = icon(
  <>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </>,
);
export const IconWallet = icon(
  <>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
    <path d="M21 11h-5a2 2 0 0 0 0 4h5v-4Z" />
  </>,
);
export const IconReceipt = icon(
  <>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z" />
    <path d="M9 8h6M9 12h6" />
  </>,
);
export const IconUsers = icon(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
  </>,
);
export const IconUserPlus = icon(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" />
  </>,
);
export const IconCart = icon(
  <>
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="18" cy="20" r="1.4" />
    <path d="M2.5 3h2.6l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
  </>,
);
export const IconClock = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </>,
);
export const IconCheck = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconCheckCircle = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 3 3 5-6" />
  </>,
);
export const IconAlert = icon(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);
export const IconTruck = icon(
  <>
    <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" />
    <circle cx="7" cy="18" r="1.8" />
    <circle cx="17.5" cy="18" r="1.8" />
  </>,
);
export const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);
export const IconEdit = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </>,
);
export const IconTrash = icon(
  <>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    <path d="M10 11v6M14 11v6" />
  </>,
);
export const IconX = icon(<path d="M6 6l12 12M18 6 6 18" />);
export const IconMenu = icon(<path d="M4 6h16M4 12h16M4 18h16" />);
export const IconChevronLeft = icon(<path d="m15 18-6-6 6-6" />);
export const IconChevronRight = icon(<path d="m9 18 6-6-6-6" />);
export const IconChevronDown = icon(<path d="m6 9 6 6 6-6" />);
export const IconSidebar = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>,
);
export const IconLogout = icon(
  <path d="M15 16l4-4m0 0-4-4m4 4H8m5 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />,
);
export const IconStore = icon(
  <>
    <path d="M3 9.5 4.5 4h15L21 9.5M3 9.5h18M3 9.5a3 3 0 0 0 6 0m0 0a3 3 0 0 0 6 0m0 0a3 3 0 0 0 6 0M5 12v8h14v-8" />
    <path d="M10 20v-5h4v5" />
  </>,
);
export const IconShield = icon(
  <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />,
);
export const IconRefresh = icon(
  <>
    <path d="M20 11a8 8 0 0 0-14.8-4M4 13a8 8 0 0 0 14.8 4" />
    <path d="M4 4v4h4M20 20v-4h-4" />
  </>,
);
export const IconDownload = icon(
  <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />,
);
export const IconFilter = icon(<path d="M4 5h16l-6 8v5l-4 2v-7L4 5Z" />);
export const IconSparkles = icon(
  <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />,
);
export const IconArrowUp = icon(<path d="M12 19V5m0 0-6 6m6-6 6 6" />);
export const IconArrowDown = icon(<path d="M12 5v14m0 0-6-6m6 6 6-6" />);
export const IconArrowRight = icon(<path d="M5 12h14m0 0-6-6m6 6-6 6" />);
export const IconExternal = icon(
  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
);
export const IconFile = icon(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
    <path d="M14 3v6h6M9 13h6M9 17h6" />
  </>,
);
export const IconMove = icon(
  <path d="M7 4v16M7 4 4 7m3-3 3 3M17 20V4m0 16-3-3m3 3 3-3" />,
);
export const IconDots = icon(
  <>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </>,
);
export const IconCash = icon(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 9.5v.01M18 14.5v.01" />
  </>,
);
export const IconCalendar = icon(
  <>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M3 9.5h18M8 3v3M16 3v3" />
  </>,
);
