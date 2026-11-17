import { test } from "node:test";
import assert from "node:assert/strict";
import { CC_KEY, NON_PRICING_KEYS, REVIEW_CC_KEY, parseCcList } from "./cc-shared";

test("parses one per line, commas or semicolons; dedupes case-insensitively", () => {
  assert.deepEqual(parseCcList("a@x.com\nB@x.com, a@X.com; c@y.co.uk\n\n"), { valid: ["a@x.com", "b@x.com", "c@y.co.uk"], invalid: [] });
});
test("flags invalid entries", () => {
  assert.deepEqual(parseCcList("good@x.com\nnot-an-email\n<d@z.ng>"), { valid: ["good@x.com", "d@z.ng"], invalid: ["not-an-email"] });
});
test("empty means no copy", () => {
  assert.deepEqual(parseCcList("  \n "), { valid: [], invalid: [] });
});

test("both CC lists are hidden from the pricing settings page", () => {
  assert.deepEqual(NON_PRICING_KEYS, ["client_email_cc", "review_alert_cc"]);
  assert.notEqual(CC_KEY, REVIEW_CC_KEY);
});
