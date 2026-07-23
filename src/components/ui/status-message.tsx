type StatusMessageProps = {
  children: React.ReactNode;
  tone?: "success" | "error" | "neutral";
};

const toneClasses = {
  success: "border-[#cbded1] bg-[var(--moss-soft)] text-[var(--moss-dark)]",
  error: "border-[#e7c8be] bg-[#f7e8e3] text-[#87432f]",
  neutral: "border-[var(--line)] bg-[var(--card)] text-[var(--muted)]",
};

export function StatusMessage({
  children,
  tone = "neutral",
}: StatusMessageProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-2xl border px-4 py-3 text-sm leading-5 ${toneClasses[tone]}`}
    >
      {children}
    </div>
  );
}
