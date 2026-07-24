import type { NoteDocument } from "@/domain/models";

export function FormattedNoteContent({
  document,
  className = "",
}: {
  document: NoteDocument;
  className?: string;
}) {
  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {document.map((run, index) => (
        <span
          key={`${index}-${run.text.length}`}
          className={[
            run.bold ? "font-bold" : "",
            run.italic ? "italic" : "",
            run.underline ? "underline" : "",
            run.size === "small"
              ? "text-sm"
              : run.size === "large"
                ? "text-xl"
                : "text-base",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {run.text}
        </span>
      ))}
    </div>
  );
}
