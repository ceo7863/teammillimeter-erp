import { useMemo, useState } from "react";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfficeStaffHrRecordSheet } from "@/components/OfficeStaffHrRecordSheet";
import type { CompanyProfile } from "@/utils/companyProfile";
import { DEFAULT_COMPANY_PROFILE } from "@/utils/companyProfile";
import { buildOfficeStaffHrRecordData, type OfficeStaffRecord } from "@/utils/officeStaff";
import { downloadWorkerHrRecordPdf } from "@/utils/workerHrRecordPdf";

type OfficeStaffHrRecordModalProps = {
  open: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
  officeStaff: OfficeStaffRecord[];
  companyProfile?: CompanyProfile;
};

export function OfficeStaffHrRecordModal({
  open,
  onClose,
  staffId,
  staffName,
  officeStaff,
  companyProfile,
}: OfficeStaffHrRecordModalProps) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const resolvedCompanyProfile = companyProfile || DEFAULT_COMPANY_PROFILE;

  const data = useMemo(
    () =>
      buildOfficeStaffHrRecordData({
        staffId,
        staffName,
        officeStaff,
        companyProfile: resolvedCompanyProfile,
      }),
    [staffId, staffName, officeStaff, resolvedCompanyProfile],
  );

  if (!open) return null;

  const handlePdf = async () => {
    const root = document.getElementById("office-staff-hr-record-export");
    if (!root) return;
    setPdfBusy(true);
    try {
      const safeName = staffName.replace(/[^\w\uAC00-\uD7A3.-]+/g, "_") || "staff";
      await downloadWorkerHrRecordPdf(root, `내근직_인사기록부_${safeName}_${data.issuedAt}.pdf`);
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
            {staffName} 내근직 인사기록부
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <OfficeStaffHrRecordSheet
          data={data}
          companyProfile={resolvedCompanyProfile}
          onDownloadPdf={handlePdf}
          pdfBusy={pdfBusy}
        />
      </div>
    </div>
  );
}
