import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCcList } from "./cc-shared";

test("parses one per line, commas or semicolons; dedupes case-insensitively", () => {
  assert.deepEqual(parseCcList("a@x.com\nB@x.com, a@X.com; c@y.co.uk\n\n"), { valid: ["a@x.com", "b@x.com", "c@y.co.uk"], invalid: [] });
});
test("flags invalid entries", () => {
  assert.deepEqual(parseCcList("good@x.com\nnot-an-email\n<d@z.ng>"), { valid: ["good@x.com", "d@z.ng"], invalid: ["not-an-email"] });
});
test("empty means no copy", () => {
  assert.deepEqual(parseCcList("  \n "), { valid: [], invalid: [] });
});
