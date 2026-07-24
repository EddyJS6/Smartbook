"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NoteDocument,
  NoteTextRun,
  NoteTextSize,
} from "@/domain/models";
import {
  noteDocumentToPlainText,
  parseNoteDocument,
} from "@/domain/note-document";

type RichNoteEditorProps = {
  value: NoteDocument;
  onChange: (value: NoteDocument) => void;
  labelledBy: string;
  describedBy?: string;
};

type ActiveFormatting = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  size: NoteTextSize;
};

const defaultFormatting: ActiveFormatting = {
  bold: false,
  italic: false,
  underline: false,
  size: "normal",
};

const blockTags = new Set(["DIV", "P", "LI", "BLOCKQUOTE"]);

function sizeFromElement(
  element: HTMLElement,
  inherited: NoteTextSize,
): NoteTextSize {
  if (element.tagName === "FONT") {
    const size = Number(element.getAttribute("size"));
    if (size <= 2) return "small";
    if (size >= 5) return "large";
    return "normal";
  }

  const declaredSize = Number.parseFloat(element.style.fontSize);
  if (Number.isFinite(declaredSize)) {
    if (declaredSize <= 0.9) return "small";
    if (declaredSize >= 1.2) return "large";
    return "normal";
  }
  return inherited;
}

function documentFromEditor(root: HTMLElement): NoteDocument {
  const runs: NoteTextRun[] = [];

  const append = (text: string, formatting: ActiveFormatting) => {
    if (!text) return;
    runs.push({ text, ...formatting });
  };

  const plainText = () => runs.map((run) => run.text).join("");

  const visit = (node: Node, inherited: ActiveFormatting) => {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent ?? "", inherited);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      append("\n", inherited);
      return;
    }

    const isBlock = blockTags.has(node.tagName);
    if (isBlock && plainText() && !plainText().endsWith("\n")) {
      append("\n", inherited);
    }

    const style = node.style;
    const formatting: ActiveFormatting = {
      bold:
        inherited.bold ||
        node.tagName === "B" ||
        node.tagName === "STRONG" ||
        style.fontWeight === "bold" ||
        Number.parseInt(style.fontWeight, 10) >= 600,
      italic:
        inherited.italic ||
        node.tagName === "I" ||
        node.tagName === "EM" ||
        style.fontStyle === "italic",
      underline:
        inherited.underline ||
        node.tagName === "U" ||
        style.textDecoration.includes("underline"),
      size: sizeFromElement(node, inherited.size),
    };

    node.childNodes.forEach((child) => visit(child, formatting));
  };

  root.childNodes.forEach((child) => visit(child, defaultFormatting));
  return parseNoteDocument(runs) ?? [];
}

function renderDocument(root: HTMLElement, value: NoteDocument) {
  const fragment = document.createDocumentFragment();
  for (const run of value) {
    const span = document.createElement("span");
    span.textContent = run.text;
    span.style.fontWeight = run.bold ? "700" : "400";
    span.style.fontStyle = run.italic ? "italic" : "normal";
    span.style.textDecoration = run.underline ? "underline" : "none";
    span.style.fontSize =
      run.size === "small" ? "0.875rem" : run.size === "large" ? "1.25rem" : "1rem";
    fragment.append(span);
  }
  root.replaceChildren(fragment);
}

export function RichNoteEditor({
  value,
  onChange,
  labelledBy,
  describedBy,
}: RichNoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedValue = useRef<string | null>(null);
  const savedSelection = useRef<Range | null>(null);
  const serializedValue = JSON.stringify(value);
  const [isEmpty, setIsEmpty] = useState(
    !noteDocumentToPlainText(value).trim(),
  );
  const [active, setActive] =
    useState<ActiveFormatting>(defaultFormatting);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || lastEmittedValue.current === serializedValue) return;
    renderDocument(editor, value);
    savedSelection.current = null;
    setIsEmpty(!noteDocumentToPlainText(value).trim());
  }, [serializedValue, value]);

  useEffect(() => {
    const saveSelection = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedSelection.current = range.cloneRange();
      }
    };
    document.addEventListener("selectionchange", saveSelection);
    return () => document.removeEventListener("selectionchange", saveSelection);
  }, []);

  const updateActiveFormatting = useCallback(() => {
    if (typeof document.queryCommandState !== "function") return;
    const fontSize = Number(document.queryCommandValue("fontSize"));
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      size: fontSize <= 2 ? "small" : fontSize >= 5 ? "large" : "normal",
    });
  }, []);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = documentFromEditor(editor);
    const serialized = JSON.stringify(nextValue);
    lastEmittedValue.current = serialized;
    setIsEmpty(!noteDocumentToPlainText(nextValue).trim());
    onChange(nextValue);
    updateActiveFormatting();
  }, [onChange, updateActiveFormatting]);

  const runCommand = (command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    if (savedSelection.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedSelection.current);
    }
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    emitChange();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_2px_12px_rgb(48_39_30_/_0.035)]">
      <div
        role="toolbar"
        aria-label="Mise en forme de la note"
        className="flex min-h-13 items-center gap-1 border-b border-[var(--line)] px-2 py-1.5"
      >
        <FormatButton
          label="Gras"
          pressed={active.bold}
          onClick={() => runCommand("bold")}
        >
          <strong>G</strong>
        </FormatButton>
        <FormatButton
          label="Italique"
          pressed={active.italic}
          onClick={() => runCommand("italic")}
        >
          <em>I</em>
        </FormatButton>
        <FormatButton
          label="Souligné"
          pressed={active.underline}
          onClick={() => runCommand("underline")}
        >
          <span className="underline">S</span>
        </FormatButton>
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-[var(--line)]" />
        <FormatButton
          label="Petite taille"
          pressed={active.size === "small"}
          onClick={() => runCommand("fontSize", "2")}
        >
          <span className="text-xs">A</span>
        </FormatButton>
        <FormatButton
          label="Taille normale"
          pressed={active.size === "normal"}
          onClick={() => runCommand("fontSize", "3")}
        >
          <span className="text-base">A</span>
        </FormatButton>
        <FormatButton
          label="Grande taille"
          pressed={active.size === "large"}
          onClick={() => runCommand("fontSize", "5")}
        >
          <span className="text-xl">A</span>
        </FormatButton>
      </div>

      <div className="relative">
        {isEmpty ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-4 left-4 text-base text-[#969187]"
          >
            Écrivez votre note ici…
          </span>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          onInput={emitChange}
          onPaste={handlePaste}
          onKeyUp={updateActiveFormatting}
          onMouseUp={updateActiveFormatting}
          onFocus={updateActiveFormatting}
          className="min-h-56 w-full px-4 py-4 text-base leading-7 whitespace-pre-wrap text-[var(--ink)] outline-none"
        />
      </div>
    </div>
  );
}

function FormatButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
        pressed
          ? "bg-[var(--moss-soft)] text-[var(--moss)]"
          : "text-[var(--muted)]"
      }`}
    >
      {children}
    </button>
  );
}
