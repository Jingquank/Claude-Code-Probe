import { test } from "node:test";
import assert from "node:assert/strict";
import { measureGap } from "../src/geometry.js";
const card = { x: 10, y: 10, w: 100, h: 160 };
test("measures neighbouring cards in both pointing directions", () => {
  const next = { ...card, x: 134 };
  assert.equal(measureGap(card, next).gap, 24);
  assert.deepEqual(measureGap(card, next), measureGap(next, card));
});
test("measures vertical spacing and touching edges", () => {
  assert.equal(measureGap(card, { ...card, y: 186 }).gap, 16);
  assert.equal(measureGap(card, { ...card, x: 110 }).gap, 0);
});
test("does not invent an external gap for overlapping or nested elements", () => {
  assert.equal(measureGap(card, { ...card, x: 60 }), null);
  assert.equal(measureGap(card, { x: 20, y: 20, w: 50, h: 50 }), null);
});
