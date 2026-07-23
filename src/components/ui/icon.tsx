export type IconName =
  | "book"
  | "bookmark"
  | "chevron"
  | "library"
  | "note"
  | "plus"
  | "search"
  | "settings"
  | "spark";

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
};

const paths: Record<IconName, React.ReactNode> = {
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17a2 2 0 0 1 2-2h2.5a2.5 2.5 0 0 1 2.5 2.5z" />
    </>
  ),
  bookmark: <path d="M6 3.5h12v17l-6-4-6 4z" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  library: (
    <>
      <path d="M4 19.5V5a2 2 0 0 1 2-2h3v18H5.5A1.5 1.5 0 0 1 4 19.5Z" />
      <path d="M9 5h4v16H9zM13 6l4-1 3 14-4 1z" />
    </>
  ),
  note: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-1.6-1H2v-4h.1A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4v.1A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1.6Z" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3-1.1 3.4a6 6 0 0 1-3.8 3.8L4 11.3l3.1 1.1a6 6 0 0 1 3.8 3.8L12 20l1.1-3.8a6 6 0 0 1 3.8-3.8l3.1-1.1-3.1-1.1a6 6 0 0 1-3.8-3.8z" />
      <path d="m18.5 2-.3 1a2.3 2.3 0 0 1-1.5 1.5l-1 .3 1 .3a2.3 2.3 0 0 1 1.5 1.5l.3 1 .3-1a2.3 2.3 0 0 1 1.5-1.5l1-.3-1-.3A2.3 2.3 0 0 1 18.8 3z" />
    </>
  ),
};

export function Icon({ name, size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
