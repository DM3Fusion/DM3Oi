import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const form = source(
  "components/admin/customer-import-delete-source-form.tsx",
);
const queue = source(
  "components/admin/customer-import-submission-queue.tsx",
);
const actions = source(
  "app/admin/customer-import/submission-actions.ts",
);

test("imported submissions can delete retained source files directly", () => {
  assert.match(
    form,
    /submissionStatus === "IMPORTED"/,
  );
  assert.match(
    form,
    /importedSubmission \|\| DELETE_DISPOSITIONS\.has\(fileDisposition\)/,
  );
  assert.match(
    queue,
    /submissionStatus=\{submission\.status\}/,
  );
});

test("imported source deletion records Deleted after Processing automatically", () => {
  assert.match(
    actions,
    /const importedSubmission = submission\.status === "IMPORTED"/,
  );
  assert.match(
    actions,
    /importedSubmission[\s\S]*file_disposition: "DELETED_AFTER_PROCESSING"/,
  );
  assert.match(
    form,
    /record the file as Deleted after Processing/,
  );
});

test("unprocessed submissions retain the explicit disposition guard", () => {
  assert.match(
    actions,
    /!importedSubmission[\s\S]*submission\.file_disposition !== "DELETED_WITHOUT_PROCESSING"[\s\S]*submission\.file_disposition !== "DELETED_AFTER_PROCESSING"/,
  );
  assert.match(
    actions,
    /Set File Disposition to a deleted state and save the review before deleting the source file\./,
  );
});

test("source deletion remains explicitly confirmed and SUPER_ADMIN-only", () => {
  assert.match(
    actions,
    /const context = await requireSuperAdmin\(\)/,
  );
  assert.match(
    actions,
    /confirmation !== "DELETE FILE"/,
  );
  assert.match(
    form,
    /confirmation === "DELETE FILE"/,
  );
});

test("source cleanup preserves imported Customers and the submission record", () => {
  assert.match(
    actions,
    /\.from\(BUCKET\)[\s\S]*\.remove\(\[submission\.storage_path\]\)/,
  );
  assert.doesNotMatch(
    actions,
    /\.from\("customers"\)[\s\S]*\.delete\(/,
  );
  assert.doesNotMatch(
    actions,
    /\.from\("customer_import_submissions"\)[\s\S]*\.delete\(/,
  );
});
