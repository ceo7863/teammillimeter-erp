import React from "react";

/** Shown on worker statement/PDF when portal acknowledgment exists for worker+month. */
export function WorkerPortalStatementAckBadge() {
  return (
    <span className="erp-worker-portal-ack-badge erp-worker-portal-ack-badge--statement is-done">
      {"\uC2DC\uACF5\uB0B4\uC5ED\uC11C \uD655\uC778"}
    </span>
  );
}
