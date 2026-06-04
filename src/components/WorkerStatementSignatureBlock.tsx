import React from "react";
import { WorkerPortalSignaturePad } from "@/components/WorkerPortalSignaturePad";
import { formatWorkerPortalAckConfirmedAt } from "@/utils/workerPortalAcknowledgment";

type WorkerStatementSignatureBlockProps = {
  workerName: string;
  signatureDataUrl?: string;
  confirmedAt?: string;
  interactive?: boolean;
  disabled?: boolean;
  onSignatureChange?: (dataUrl: string) => void;
};

export function WorkerStatementSignatureBlock({
  workerName,
  signatureDataUrl = "",
  confirmedAt = "",
  interactive = false,
  disabled = false,
  onSignatureChange,
}: WorkerStatementSignatureBlockProps) {
  const isSaved = Boolean(confirmedAt);
  const showPad = interactive && !isSaved;

  return (
    <table className="excel-header-table excel-worker-signature-table">
      <colgroup>
        <col style={{ width: "12%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "5%" }} />
        <col style={{ width: "15%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "38%" }} />
      </colgroup>
      <tbody>
        <tr>
          <td className="label">{"\uD655\uC778"}</td>
          <td colSpan={5} className="excel-worker-signature-confirm-text">
            {"\uC704 \uC2DC\uACF5 \uB0B4\uC5ED\uC744 \uD655\uC778\uD558\uC600\uC73C\uBA70, \uC544\uB798\uC640 \uAC19\uC774 \uC11C\uBA85\uD569\uB2C8\uB2E4."}
          </td>
        </tr>
        <tr>
          <td className="label">{"\uC11C\uBA85"}</td>
          <td colSpan={3} className="excel-worker-signature-cell">
            {isSaved && signatureDataUrl ? (
              <img
                src={signatureDataUrl}
                alt={"\uC2DC\uACF5\uC790 \uC11C\uBA85"}
                className="excel-worker-signature-image"
              />
            ) : showPad ? (
              <div className="excel-worker-signature-pad-host">
                <WorkerPortalSignaturePad onChange={onSignatureChange} disabled={disabled} />
              </div>
            ) : (
              <div className="excel-worker-signature-empty" aria-hidden="true" />
            )}
          </td>
          <td className="label">{"\uC77C\uC790"}</td>
          <td className="excel-worker-signature-date">
            {confirmedAt ? formatWorkerPortalAckConfirmedAt(confirmedAt) : "-"}
          </td>
        </tr>
        <tr>
          <td className="label">{"\uC131\uBA85"}</td>
          <td colSpan={5}>{workerName || "\uC2DC\uACF5\uC790"}</td>
        </tr>
      </tbody>
    </table>
  );
}
