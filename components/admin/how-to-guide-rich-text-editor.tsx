"use client";

import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import {
  howToGuideTextPlainText,
  type HowToGuideRichText,
  type HowToGuideRichTextRun,
  type HowToGuideText,
  type HowToGuideTextAlignment,
} from "@/lib/how-to-guide-content";

type Props = {
  value: HowToGuideText;
  onChange: (value: HowToGuideText) => void;
  maxLength: number;
  ariaLabel: string;
};

type Marks = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

function sameMarks(
  left: HowToGuideRichTextRun,
  right: HowToGuideRichTextRun,
) {
  return (
    Boolean(left.bold) === Boolean(right.bold) &&
    Boolean(left.italic) === Boolean(right.italic) &&
    Boolean(left.underline) === Boolean(right.underline)
  );
}

function collectRuns(
  node: Node,
  inherited: Marks,
  runs: HowToGuideRichTextRun[],
) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (!text) return;

    const next: HowToGuideRichTextRun = { text };

    if (inherited.bold) next.bold = true;
    if (inherited.italic) next.italic = true;
    if (inherited.underline) next.underline = true;

    const previous = runs[runs.length - 1];

    if (previous && sameMarks(previous, next)) {
      previous.text += text;
    } else {
      runs.push(next);
    }

    return;
  }

  if (!(node instanceof HTMLElement)) return;

  const tag = node.tagName.toLowerCase();

  const marks: Marks = {
    bold:
      inherited.bold ||
      tag === "b" ||
      tag === "strong" ||
      node.style.fontWeight === "bold",
    italic:
      inherited.italic ||
      tag === "i" ||
      tag === "em" ||
      node.style.fontStyle === "italic",
    underline:
      inherited.underline ||
      tag === "u" ||
      node.style.textDecoration.includes("underline"),
  };

  node.childNodes.forEach((child) =>
    collectRuns(child, marks, runs),
  );
}

function readEditor(
  editor: HTMLDivElement,
): HowToGuideRichText {
  const runs: HowToGuideRichTextRun[] = [];

  editor.childNodes.forEach((child) =>
    collectRuns(
      child,
      { bold: false, italic: false, underline: false },
      runs,
    ),
  );

  return {
    align:
      editor.dataset.align === "center" ||
      editor.dataset.align === "right"
        ? editor.dataset.align
        : "left",
    runs,
  };
}

function appendRun(
  editor: HTMLDivElement,
  run: HowToGuideRichTextRun,
) {
  let node: Node = document.createTextNode(run.text);

  if (run.underline) {
    const element = document.createElement("u");
    element.appendChild(node);
    node = element;
  }

  if (run.italic) {
    const element = document.createElement("em");
    element.appendChild(node);
    node = element;
  }

  if (run.bold) {
    const element = document.createElement("strong");
    element.appendChild(node);
    node = element;
  }

  editor.appendChild(node);
}

function writeEditor(
  editor: HTMLDivElement,
  value: HowToGuideText,
) {
  editor.replaceChildren();

  if (typeof value === "string") {
    editor.appendChild(document.createTextNode(value));
    editor.dataset.align = "left";
    editor.style.textAlign = "left";
    return;
  }

  editor.dataset.align = value.align;
  editor.style.textAlign = value.align;

  value.runs.forEach((run) => appendRun(editor, run));
}

export function HowToGuideRichTextEditor({
  value,
  onChange,
  maxLength,
  ariaLabel,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef<HowToGuideText | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || lastValueRef.current === value) return;

    writeEditor(editor, value);
    lastValueRef.current = value;
  }, [value]);

  const emitValue = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const next = readEditor(editor);
    const text = next.runs.map((run) => run.text).join("");

    if (text.length > maxLength) {
      if (lastValueRef.current) {
        writeEditor(editor, lastValueRef.current);
      }
      return;
    }

    lastValueRef.current = next;
    onChange(next);
  };

  const applyCommand = (
    event: MouseEvent<HTMLButtonElement>,
    command: "bold" | "italic" | "underline" | "removeFormat",
  ) => {
    event.preventDefault();

    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand(command, false);
    emitValue();
  };

  const applyAlignment = (
    event: MouseEvent<HTMLButtonElement>,
    alignment: HowToGuideTextAlignment,
  ) => {
    event.preventDefault();

    const editor = editorRef.current;
    if (!editor) return;

    editor.dataset.align = alignment;
    editor.style.textAlign = alignment;

    const next = readEditor(editor);
    lastValueRef.current = next;
    onChange(next);
    editor.focus();
  };

  const clearFormatting = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();

    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand("removeFormat", false);
    editor.dataset.align = "left";
    editor.style.textAlign = "left";
    emitValue();
  };

  const handlePaste = (
    event: ClipboardEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();

    const text = event.clipboardData
      .getData("text/plain")
      .replace(/\s*\r?\n+\s*/g, " ");

    document.execCommand("insertText", false, text);
    emitValue();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };

  const plainLength = howToGuideTextPlainText(value).length;

  return (
    <div className="guide-rich-editor">
      <div
        className="guide-rich-editor-toolbar"
        role="toolbar"
        aria-label={`${ariaLabel} formatting`}
      >
        <button
          type="button"
          title="Bold"
          aria-label="Bold"
          onMouseDown={(event) => applyCommand(event, "bold")}
        >
          <strong>B</strong>
        </button>

        <button
          type="button"
          title="Italic"
          aria-label="Italic"
          onMouseDown={(event) => applyCommand(event, "italic")}
        >
          <em>I</em>
        </button>

        <button
          type="button"
          title="Underline"
          aria-label="Underline"
          onMouseDown={(event) =>
            applyCommand(event, "underline")
          }
        >
          <u>U</u>
        </button>

        <span
          className="guide-rich-editor-divider"
          aria-hidden="true"
        />

        <button
          type="button"
          title="Align left"
          aria-label="Align left"
          onMouseDown={(event) =>
            applyAlignment(event, "left")
          }
        >
          <span
            className="guide-rich-align-icon guide-rich-align-left"
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </span>
        </button>

        <button
          type="button"
          title="Align center"
          aria-label="Align center"
          onMouseDown={(event) =>
            applyAlignment(event, "center")
          }
        >
          <span
            className="guide-rich-align-icon guide-rich-align-center"
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </span>
        </button>

        <button
          type="button"
          title="Align right"
          aria-label="Align right"
          onMouseDown={(event) =>
            applyAlignment(event, "right")
          }
        >
          <span
            className="guide-rich-align-icon guide-rich-align-right"
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </span>
        </button>

        <span
          className="guide-rich-editor-divider"
          aria-hidden="true"
        />

        <button
          type="button"
          title="Clear formatting"
          aria-label="Clear formatting"
          onMouseDown={clearFormatting}
        >
          Tx
        </button>
      </div>

      <div
        ref={editorRef}
        className="guide-rich-editor-surface"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="false"
        onInput={emitValue}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
      />

      <div className="guide-rich-editor-count">
        {plainLength} / {maxLength}
      </div>
    </div>
  );
}
