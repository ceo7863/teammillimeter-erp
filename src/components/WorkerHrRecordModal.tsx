import { useMemo, useState } from "react";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkerHrRecordSheet } from "@/components/WorkerHrRecordSheet";
import type { CompanyProfile } from "@/utils/companyProfile";
import { buildWorkerHrRecordData } from "@/utils/probationEvalHrRecord";
import type { ProbationEvalRequest, ProbationEvalTemplate } from "@/utils/probationEval";
import type { WorkerMasterLike } from "@/utils/workerPayments";
import { downloadWorkerHrRecordPdf } from "@/utils/workerHrRecordPdf";

type WorkerHrRecordModalProps = {
  open: boolean;
  onClose: () => void;
  workerId: string;
  workerName: string;
  dateFrom: string;
  dateTo: string;
  workers: WorkerMasterLike[];
  requests: ProbationEvalRequest[];
  templates: ProbationEvalTemplate[];
  companyProfile: CompanyProfile;
};

export function WorkerHrRecordModal({
  open,
  onClose,
  workerId,
  workerName,
  dateFrom,
  dateTo,
  workers,
  requests,
  templates,
  companyProfile,
}: WorkerHrRecordModalProps) {
  const [pdfBusy, setPdfBusy] = useState(false);

  const data = useMemo(
    () =>
      buildWorkerHrRecordData({
        workerId,
        workerName,
        workers,
        requests,
        templates,
        dateFrom,
        dateTo,
        companyProfile,
      }),
    [workerId, workerName, workers, requests, templates, dateFrom, dateTo, companyProfile],
  );

  if (!open) return null;

  const handlePdf = async () => {
    const root = document.getElementById("worker-hr-record-export");
    if (!root) return;
    setPdfBusy(true);
    try {
      const safeName = workerName.replace(/[^\w\uAC00-\uD7A3.-]+/g, "_") || "worker";
      await downloadWorkerHrRecordPdf(root, `\uC778\uC0AC\uAE30\uB85D\uBD80_${safeName}_${data.issuedAt}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 print:static print:bg-transparent print:p-0">
      <div className="relative my-4 w-full max-w-[880px] rounded-2xl bg-slate-100 p-4 shadow-xl print:my-0 print:max-w-none print:bg-white print:p-0 print:shadow-none">
        <div className="mb-3 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <FileText size={18} />
            {workerName} {"\uC778\uC0AC\uAE30\uB85D\uBD80"}
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <WorkerHrRecordSheet
          data={data}
          companyProfile={companyProfile}
          onDownloadPdf={handlePdf}
          pdfBusy={pdfBusy}
        />
      </div>
    </div>
  );
}
