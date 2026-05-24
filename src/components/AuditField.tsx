import React, { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { useAudit } from "@/context/AuditContext";
import { formatAuditDateTime, type AuditLogEntry } from "@/utils/auditLog";

type AuditFieldProps = {
  label: string;
  entityType: string;
  entityId?: string | number | null;
  field: string;
  children: React.ReactNode;
  className?: string;
};

function AuditHistoryModal({
  title,
  entries,
  onClose,
}: {
  title: string;
  entries: AuditLogEntry[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="erp-audit-modal-backdrop" onClick={onClose}>
      <div className="erp-audit-modal" onClick={(event) => event.stopPropagation()}>
        <div className="erp-audit-modal-header">
          <div>
            <h3 className="erp-text-section">{title}</h3>
            <p className="erp-text-caption text-slate-500">필드별 변경 이력 {entries.length}건</p>
          </div>
          <button type="button" className="erp-audit-modal-close" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <div className="erp-audit-modal-body">
          {entries.length === 0 ? (
            <div className="erp-audit-empty">변경 이력이 없습니다.</div>
          ) : (
            <div className="erp-audit-history-list">
              {entries.map((entry) => (
                <div key={entry.id} className="erp-audit-history-item">
                  <div className="erp-audit-history-meta">
                    <span className="font-semibold text-slate-800">{entry.userName}</span>
                    <span className="text-slate-400">·</span>
                    <span>{formatAuditDateTime(entry.at)}</span>
                    <span className="erp-audit-chip">{entry.screen}</span>
                  </div>
                  <div className="erp-audit-history-change">
                    <span className="text-slate-500">{entry.before}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-semibold text-slate-900">{entry.after}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuditField({ label, entityType, entityId, field, children, className = "" }: AuditFieldProps) {
  const { getFieldHistory, getLatestFieldAudit } = useAudit();
  const [open, setOpen] = useState(false);

  if (entityId == null || entityId === "") {
    return (
      <label className={`block ${className}`}>
        <div className="erp-text-caption mb-1.5 font-semibold text-slate-500">{label}</div>
        {children}
      </label>
    );
  }

  const history = getFieldHistory(entityType, entityId, field);
  const latest = getLatestFieldAudit(entityType, entityId, field);

  return (
    <>
      <label className={`block ${className}`}>
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="erp-text-caption font-semibold text-slate-500">{label}</span>
          {history.length > 0 && (
            <button
              type="button"
              className="erp-audit-info-btn"
              onClick={() => setOpen(true)}
              title="변경 이력 보기"
            >
              <History size={14} />
              <span>{history.length}</span>
            </button>
          )}
        </div>
        {children}
        {latest && (
          <div className="erp-audit-last-line">
            최종 수정: {latest.userName} · {formatAuditDateTime(latest.at)} · {latest.screen}
          </div>
        )}
      </label>
      {open && <AuditHistoryModal title={`${label} 변경 이력`} entries={history} onClose={() => setOpen(false)} />}
    </>
  );
}

export function EntityAuditButton({
  entityType,
  entityId,
  title,
}: {
  entityType: string;
  entityId?: string | number | null;
  title?: string;
}) {
  const { getEntityHistory } = useAudit();
  const [open, setOpen] = useState(false);

  if (entityId == null || entityId === "") return null;

  const history = getEntityHistory(entityType, entityId);
  if (!history.length) return null;

  return (
    <>
      <button
        type="button"
        className="erp-audit-info-btn"
        onClick={() => setOpen(true)}
        title={title || "전체 변경 이력"}
      >
        <History size={14} />
        <span>{history.length}</span>
      </button>
      {open && (
        <AuditHistoryModal
          title={title || "전체 변경 이력"}
          entries={history}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function AuditCellHint({
  entityType,
  entityId,
  field,
  fieldLabel,
}: {
  entityType: string;
  entityId?: string | number | null;
  field: string;
  fieldLabel: string;
}) {
  const { getFieldHistory, getLatestFieldAudit } = useAudit();
  const [open, setOpen] = useState(false);

  if (entityId == null || entityId === "") return null;

  const history = getFieldHistory(entityType, entityId, field);
  const latest = getLatestFieldAudit(entityType, entityId, field);
  if (!history.length) return null;

  return (
    <>
      <button type="button" className="erp-audit-cell-btn" onClick={() => setOpen(true)} title={`${fieldLabel} 변경 이력`}>
        <History size={12} />
      </button>
      {latest && <div className="erp-audit-cell-line">{latest.userName} · {formatAuditDateTime(latest.at)}</div>}
      {open && <AuditHistoryModal title={`${fieldLabel} 변경 이력`} entries={history} onClose={() => setOpen(false)} />}
    </>
  );
}
