import assert from "node:assert/strict";
import {
  applyReviewAction,
  createReviewComment,
  deriveReviewStatusFromComments,
  findUnconfirmedSalesForWorkerMonth,
  normalizeSaleComments,
  pendingCommentsToSaleComments,
  resolveSaleReviewStatus,
  saleMatchesReviewFilter,
} from "../src/utils/saleComments.ts";

const note = createReviewComment({
  saleId: 1,
  kind: "note",
  body: "?? ??",
  reviewStatus: "pending",
  targetRole: "settler",
  user: { name: "???" },
});

assert.equal(note.kind, "note");
assert.equal(note.reviewStatus, "pending");
assert.equal(note.targetRole, "settler");

const pending = pendingCommentsToSaleComments(
  [{ id: "p1", body: "?? ??", authorName: "???", createdAt: "2026-06-10T09:00:00.000Z", kind: "note" }],
  99,
);
assert.equal(pending.length, 1);
assert.equal(pending[0].kind, "note");
assert.equal(pending[0].reviewStatus, "pending");

const confirmResult = applyReviewAction({
  action: "confirm",
  sale: { id: 1, reviewStatus: "pending" },
  user: { name: "???" },
});
assert.equal(confirmResult.sale.reviewStatus, "confirmed");
assert.equal(confirmResult.comment.kind, "confirm");

const questionResult = applyReviewAction({
  action: "question",
  sale: { id: 1, reviewStatus: "pending" },
  body: "?? ?? ??",
  user: { name: "???" },
});
assert.equal(questionResult.sale.reviewStatus, "needs_review");

const replyResult = applyReviewAction({
  action: "reply",
  sale: { id: 1, reviewStatus: "needs_review" },
  body: "?? ??",
  user: { name: "???" },
});
assert.equal(replyResult.sale.reviewStatus, "pending");
assert.equal(replyResult.comment.kind, "reply");

const replyWithTime = { ...replyResult.comment, createdAt: "2026-06-11T12:00:00.000Z" };
const questionWithTime = { ...questionResult.comment, createdAt: "2026-06-11T11:00:00.000Z" };
const thread = normalizeSaleComments([note, confirmResult.comment, questionWithTime, replyWithTime]);
assert.equal(deriveReviewStatusFromComments(thread), "pending");
assert.equal(resolveSaleReviewStatus({ id: 1 }, thread), "pending");
assert.equal(resolveSaleReviewStatus({ id: 2 }, []), null);

assert.equal(saleMatchesReviewFilter({ id: 1, reviewStatus: "pending" }, thread, "unconfirmed"), true);
assert.equal(saleMatchesReviewFilter({ id: 1, reviewStatus: "confirmed" }, thread, "unconfirmed"), false);

const sales = [
  {
    id: 10,
    date: "2026-06-05",
    client: "A",
    site: "S1",
    reviewStatus: "pending",
    workers: [{ worker: "???" }],
  },
  {
    id: 11,
    date: "2026-06-12",
    client: "B",
    site: "S2",
    reviewStatus: "confirmed",
    workers: [{ worker: "???" }],
  },
];
const unconfirmed = findUnconfirmedSalesForWorkerMonth(sales, "???", "2026-06", []);
assert.equal(unconfirmed.length, 1);
assert.equal(unconfirmed[0].id, 10);

console.log("verify-sale-comments: ok");
