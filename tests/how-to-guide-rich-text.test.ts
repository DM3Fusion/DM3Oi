import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  defaultHowToGuideContent,
  howToGuideTextPlainText,
  parseHowToGuideContent,
  type HowToGuideRichText,
} from "../lib/how-to-guide-content.ts";

const source = (path: string) => readFileSync(path, "utf8");

const editor = source(
  "components/admin/how-to-guide-rich-text-editor.tsx",
);
const renderer = source(
  "components/how-to-guides/rich-text.tsx",
);
const migration = source(
  "supabase/migrations/20261004113000_dm3oi_how_to_guide_rich_text.sql",
);

const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

test("plain strings remain valid How-to Guide text", () => {
  assert.equal(
    parseHowToGuideContent(
      "OWNER_ADMIN",
      defaultHowToGuideContent.OWNER_ADMIN,
    ),
    defaultHowToGuideContent.OWNER_ADMIN,
  );
});

test("bounded rich text is accepted in editable guide body fields", () => {
  const content = clone(
    defaultHowToGuideContent.OWNER_ADMIN,
  );

  const rich: HowToGuideRichText = {
    align: "left",
    runs: [
      {
        text: "Know your workspace:",
        bold: true,
      },
      {
        text: " Confirm the active organization.",
      },
    ],
  };

  content.sections[0]!.paragraphs[0] = rich;
  content.sections[0]!.callout!.text = rich;

  assert.ok(
    parseHowToGuideContent("OWNER_ADMIN", content),
  );

  assert.equal(
    howToGuideTextPlainText(rich),
    "Know your workspace: Confirm the active organization.",
  );
});

test("rich text accepts only the approved alignment values", () => {
  const content = clone(
    defaultHowToGuideContent.OWNER_ADMIN,
  );

  content.sections[0]!.paragraphs[0] = {
    align: "justify",
    runs: [{ text: "Not allowed" }],
  } as never;

  assert.equal(
    parseHowToGuideContent("OWNER_ADMIN", content),
    null,
  );
});

test("rich text accepts only bold italic and underline marks", () => {
  const content = clone(
    defaultHowToGuideContent.OWNER_ADMIN,
  );

  content.sections[0]!.paragraphs[0] = {
    align: "left",
    runs: [
      {
        text: "Unsafe mark",
        color: "red",
      },
    ],
  } as never;

  assert.equal(
    parseHowToGuideContent("OWNER_ADMIN", content),
    null,
  );
});

test("rich text rejects HTML-like text and empty content", () => {
  const html = clone(
    defaultHowToGuideContent.OWNER_ADMIN,
  );

  html.sections[0]!.paragraphs[0] = {
    align: "left",
    runs: [
      {
        text: "<script>alert(1)</script>",
        bold: true,
      },
    ],
  };

  assert.equal(
    parseHowToGuideContent("OWNER_ADMIN", html),
    null,
  );

  const empty = clone(
    defaultHowToGuideContent.OWNER_ADMIN,
  );

  empty.sections[0]!.paragraphs[0] = {
    align: "left",
    runs: [{ text: "   " }],
  };

  assert.equal(
    parseHowToGuideContent("OWNER_ADMIN", empty),
    null,
  );
});

test("rich text enforces the existing text length limits", () => {
  const content = clone(
    defaultHowToGuideContent.STAFF,
  );

  content.sections[0]!.paragraphs[0] = {
    align: "left",
    runs: [{ text: "x".repeat(2001) }],
  };

  assert.equal(
    parseHowToGuideContent("STAFF", content),
    null,
  );
});

test("WYSIWYG editor exposes only the approved formatting controls", () => {
  for (const label of [
    "Bold",
    "Italic",
    "Underline",
    "Align left",
    "Align center",
    "Align right",
    "Clear formatting",
  ]) {
    assert.match(
      editor,
      new RegExp(`aria-label="${label}"`),
    );
  }

  assert.doesNotMatch(
    editor,
    /font family|font size|text color|highlight|insert image|insert link/i,
  );

  assert.match(
    editor,
    /getData\("text\/plain"\)/,
  );
});

test("renderer emits React formatting without dangerouslySetInnerHTML", () => {
  assert.match(renderer, /<strong>/);
  assert.match(renderer, /<em>/);
  assert.match(renderer, /<u>/);

  assert.doesNotMatch(
    renderer,
    /dangerouslySetInnerHTML/,
  );
});

test("database rich-text validator mirrors the application allowlist", () => {
  assert.match(
    migration,
    /'left','center','right'/,
  );

  assert.match(
    migration,
    /'text','bold','italic','underline'/,
  );

  assert.match(
    migration,
    /jsonb_array_length\(target_value->'runs'\) not between 1 and 100/,
  );

  assert.match(
    migration,
    /position\('<' in run_text\) <> 0/,
  );

  assert.match(
    migration,
    /position\('>' in run_text\) <> 0/,
  );
});

test("database validator remains backward-compatible with plain strings", () => {
  assert.match(
    migration,
    /if jsonb_typeof\(target_value\) = 'string'/,
  );

  assert.match(
    migration,
    /public\.is_valid_how_to_guide_text/,
  );
});
