import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  OfficeStaffFormModal,
  createEmptyOfficeStaffForm,
} from "@/components/OfficeStaffFormModal";
import { OfficeStaffHrRecordPanel } from "@/components/OfficeStaffHrRecordPanel";
import type { CompanyProfile } from "@/utils/companyProfile";
import {
  OFFICE_STAFF_STATUS_LABELS,
  compareOfficeStaffDefault,
  isOfficeStaffActive,
  normalizeOfficeStaffRecordId,
  allocateNextOfficeStaffEmployeeNo,
  officeStaffFormFromRecord,
  officeStaffRecordFromForm,
  officeStaffSearchText,
  type OfficeStaffRecord,
} from "@/utils/officeStaff";
import {
  applyOfficeStaffPhotoMetaToStaff,
  deleteOfficeStaffPhoto,
  fetchOfficeStaffPhotoBlob,
  officeStaffHasPhoto,
  uploadOfficeStaffPhoto,
} from "@/utils/officeStaffPhotoFile";

type OfficeStaffPageProps = {
  officeStaff: OfficeStaffRecord[];
  companyProfile?: CompanyProfile;
  onPersistOfficeStaffImmediate?: (
    nextOfficeStaff: OfficeStaffRecord[],
    options?: { flushNow?: boolean },
  ) => boolean | void | Promise<boolean | void>;
};

function PageTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h1 className="erp-text-page-title text-slate-900">{title}</h1>
      <p className="mt-1 erp-text-body text-slate-600">{desc}</p>
    </div>
  );
}

export function OfficeStaffPage({
  officeStaff,
  companyProfile,
  onPersistOfficeStaffImmediate,
}: OfficeStaffPageProps) {
  const [view, setView] = useState<"list" | "hr">("list");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(createEmptyOfficeStaffForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const officeStaffRef = useRef(officeStaff);
  officeStaffRef.current = officeStaff;

  const editingStaff = useMemo(
    () =>
      editingId != null
        ? officeStaff.find((row) => normalizeOfficeStaffRecordId(row.id) === editingId) || null
        : null,
    [officeStaff, editingId],
  );

  useEffect(() => {
    if (!modalOpen) return undefined;

    let objectUrl = "";
    let cancelled = false;

    async function loadPreview() {
      if (pendingPhotoFile) {
        objectUrl = URL.createObjectURL(pendingPhotoFile);
        if (!cancelled) setPhotoPreviewUrl(objectUrl);
        return;
      }

      if (editingStaff && officeStaffHasPhoto(editingStaff)) {
        try {
          const blob = await fetchOfficeStaffPhotoBlob(editingStaff.id);
          if (cancelled) return;
          if (blob) {
            objectUrl = URL.createObjectURL(blob);
            setPhotoPreviewUrl(objectUrl);
          } else {
            setPhotoPreviewUrl(null);
          }
        } catch {
          if (!cancelled) setPhotoPreviewUrl(null);
        }
        return;
      }

      if (!cancelled) setPhotoPreviewUrl(null);
    }

    void loadPreview();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    modalOpen,
    editingId,
    editingStaff?.photoFileId,
    editingStaff?.photoUploadedAt,
    pendingPhotoFile,
    editingStaff,
  ]);

  const displayedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return officeStaff
      .filter((row) => !q || officeStaffSearchText(row).includes(q))
      .sort(compareOfficeStaffDefault);
  }, [officeStaff, query]);

  const nextEmployeeNoPreview = useMemo(
    () => allocateNextOfficeStaffEmployeeNo(officeStaff),
    [officeStaff],
  );

  const resetForm = useCallback(() => {
    setForm(createEmptyOfficeStaffForm());
    setEditingId(null);
    setFormError("");
    setPendingPhotoFile(null);
    setPhotoPreviewUrl(null);
  }, []);

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (row: OfficeStaffRecord) => {
    setEditingId(normalizeOfficeStaffRecordId(row.id));
    setForm(officeStaffFormFromRecord(row));
    setFormError("");
    setPendingPhotoFile(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const persistRows = (nextRows: OfficeStaffRecord[]) => {
    void onPersistOfficeStaffImmediate?.(nextRows, { flushNow: true });
  };

  const persistPhotoMeta = useCallback(
    (staffId: string, meta: Parameters<typeof applyOfficeStaffPhotoMetaToStaff>[1], existing?: OfficeStaffRecord | null) => {
      const patch = applyOfficeStaffPhotoMetaToStaff(existing || {}, meta) as OfficeStaffRecord;
      const nextRows = officeStaffRef.current.map((row) =>
        normalizeOfficeStaffRecordId(row.id) === staffId ? { ...row, ...patch } : row,
      );
      persistRows(nextRows);
    },
    [onPersistOfficeStaffImmediate],
  );

  const handlePhotoSelect = useCallback(
    async (file: File) => {
      setFormError("");
      if (editingId == null) {
        setPendingPhotoFile(file);
        return;
      }
      setPhotoUploading(true);
      try {
        const meta = await uploadOfficeStaffPhoto(editingId, file);
        persistPhotoMeta(editingId, meta, editingStaff);
        setPendingPhotoFile(null);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "인사사진 저장에 실패했습니다.");
      } finally {
        setPhotoUploading(false);
      }
    },
    [editingId, editingStaff, persistPhotoMeta],
  );

  const handlePhotoDelete = useCallback(async () => {
    setFormError("");
    if (pendingPhotoFile) {
      setPendingPhotoFile(null);
      return;
    }
    if (editingId == null) return;
    setPhotoUploading(true);
    try {
      await deleteOfficeStaffPhoto(editingId);
      persistPhotoMeta(editingId, null, editingStaff);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "인사사진 삭제에 실패했습니다.");
    } finally {
      setPhotoUploading(false);
    }
  }, [editingId, editingStaff, pendingPhotoFile, persistPhotoMeta]);

  const handleSubmit = () => {
    const name = form.name.trim();
    if (!name) {
      setFormError("이름을 입력해 주세요.");
      return;
    }
    const duplicate = officeStaff.find(
      (row) =>
        row.name.trim() === name &&
        normalizeOfficeStaffRecordId(row.id) !== normalizeOfficeStaffRecordId(editingId),
    );
    if (duplicate) {
      setFormError("같은 이름의 내근직이 이미 있습니다.");
      return;
    }

    let record: OfficeStaffRecord;
    try {
      record = officeStaffRecordFromForm(form, editingId || undefined, editingStaff, officeStaffRef.current);
    } catch (error) {
      console.error("[office-staff] save failed:", error);
      setFormError("저장 중 오류가 발생했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.");
      return;
    }

    const nextRows = editingId
      ? officeStaff.map((row) => (normalizeOfficeStaffRecordId(row.id) === editingId ? record : row))
      : [record, ...officeStaff];
    persistRows(nextRows);

    const pendingPhoto = pendingPhotoFile;
    setPendingPhotoFile(null);
    setPhotoPreviewUrl(null);
    closeModal();

    if (pendingPhoto) {
      void uploadOfficeStaffPhoto(record.id, pendingPhoto)
        .then((meta) => persistPhotoMeta(record.id, meta, record))
        .catch((error) => {
          console.error("[office-staff-photo] upload after create failed:", error);
        });
    }
  };

  const handleDelete = (row: OfficeStaffRecord) => {
    if (!window.confirm(`${row.name} 내근직 정보를 삭제할까요?`)) return;
    void deleteOfficeStaffPhoto(row.id).catch(() => {});
    persistRows(officeStaff.filter((item) => item.id !== row.id));
  };

  return (
    <div className="erp-page">
      <PageTitle title="내근직" desc="사무·관리 등 내근직 인사 정보를 등록하고 인사기록부를 관리합니다." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" variant={view === "list" ? "default" : "outline"} size="sm" className="rounded-lg" onClick={() => setView("list")}>
          내근직 목록
        </Button>
        <Button type="button" variant={view === "hr" ? "default" : "outline"} size="sm" className="rounded-lg" onClick={() => setView("hr")}>
          인사기록부
        </Button>
      </div>

      {view === "hr" ? (
        <OfficeStaffHrRecordPanel officeStaff={officeStaff} companyProfile={companyProfile} />
      ) : (
        <>
          <div className="mb-4">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름, 사번, 부서, 직급, 연락처, 이메일 검색"
              className="rounded-xl"
            />
          </div>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="erp-text-section">내근직 목록</h2>
                  <p className="erp-text-caption mt-1 text-slate-500">총 {displayedRows.length}명</p>
                </div>
                <Button className="rounded-2xl" onClick={openCreateModal}>
                  <Plus size={16} className="mr-1" />
                  내근직 등록
                </Button>
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 pr-3">이름</th>
                      <th className="py-2 pr-3">사번</th>
                      <th className="py-2 pr-3">부서</th>
                      <th className="py-2 pr-3">직급/직책</th>
                      <th className="py-2 pr-3">입사일</th>
                      <th className="py-2 pr-3">상태</th>
                      <th className="py-2 pr-3">연락처</th>
                      <th className="py-2 pr-3">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-semibold text-slate-900">{row.name}</td>
                        <td className="py-2 pr-3">{row.employeeNo || "—"}</td>
                        <td className="py-2 pr-3">{row.department || "—"}</td>
                        <td className="py-2 pr-3">{row.position || "—"}</td>
                        <td className="py-2 pr-3">{row.hireDate || "—"}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isOfficeStaffActive(row) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {OFFICE_STAFF_STATUS_LABELS[row.status || "active"]}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{row.phone || "—"}</td>
                        <td className="py-2 pr-3">
                          <div className="flex flex-wrap gap-1">
                            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => openEditModal(row)}>
                              <Pencil size={14} />
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="rounded-lg text-rose-600" onClick={() => handleDelete(row)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!displayedRows.length && <p className="py-6 text-sm text-slate-500">등록된 내근직이 없습니다.</p>}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <OfficeStaffFormModal
        open={modalOpen}
        editing={Boolean(editingId)}
        form={form}
        formError={formError}
        photoPreviewUrl={photoPreviewUrl}
        photoHasSaved={officeStaffHasPhoto(editingStaff)}
        photoUploading={photoUploading}
        onClose={closeModal}
        onReset={resetForm}
        onSubmit={handleSubmit}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onPhotoSelect={handlePhotoSelect}
        onPhotoDelete={handlePhotoDelete}
        nextEmployeeNoPreview={nextEmployeeNoPreview}
      />
    </div>
  );
}
