import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Megaphone, MessageSquareWarning, Pencil, Pin, Plus, Search, Trash2, X } from "lucide-react";
import { TeamChatShareButton } from "@/components/TeamChatShareButton";
import { buildPageTeamChatLink } from "@/utils/teamChatLinks";
import { WorkBoardPage } from "@/components/WorkBoardPage";
import type { WorkPost } from "@/utils/workBoard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import type { ErpUser } from "@/utils/erpApi";
import {
  canManageNotice,
  countNoticesThisMonth,
  DEFAULT_NOTICE_BOARD,
  filterCompanyNotices,
  filterCompanyNoticesByBoard,
  formatNoticeDateTime,
  getNoticeBoardLabel,
  makeNoticeId,
  NOTICE_BOARD_OPTIONS,
  sortCompanyNotices,
  validateNoticeInput,
  type CompanyNotice,
  type NoticeBoardKey,
} from "@/utils/companyNotices";
import { useAudit } from "@/context/AuditContext";
import { COMPANY_NOTICE_AUDIT_FIELDS, snapshotCompanyNoticeForAudit } from "@/utils/auditLog";

type CompanyBoardTabKey = NoticeBoardKey | "work";

type NoticeModalState = {
  mode: "create" | "edit";
  id?: string;
  board: NoticeBoardKey;
  title: string;
  body: string;
  isPinned: boolean;
};

const L = {
  pageTitle: "\uD68C\uC0AC\uAC8C\uC2DC\uD310",
  pageDesc: "\uACF5\uC9C0, \uC5D0\uB7EC\uC0AC\uD56D, \uC694\uCCAD\uC0AC\uD56D, \uC5C5\uBB34\uAC8C\uC2DC\uD310\uC744 \uD55C \uACF3\uC5D0\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
  workBoard: "\uC5C5\uBB34\uAC8C\uC2DC\uD310",
  workBoardDesc: "\uC5C5\uBB34 \uACF5\uC720 \uBC0F \uCCB4\uBD80\uD30C\uC77C\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
  write: "\uAE00 \uC791\uC131",
  edit: "\uC218\uC815",
  delete: "\uC0AD\uC81C",
  save: "\uC800\uC7A5",
  cancel: "\uCDE8\uC18C",
  search: "\uC81C\uBAA9, \uB0B4\uC6A9, \uC791\uC131\uC790 \uAC80\uC0C9",
  total: "\uAC8C\uC2DC\uAE00",
  pinned: "\uC0C1\uB2E8 \uACE0\uC815",
  thisMonth: "\uC774\uBC88 \uB2EC \uB4F1\uB85D",
  empty: "\uB4F1\uB85D\uB41C \uAE00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  selectHint: "\uBAA9\uB85D\uC5D0\uC11C \uAE00\uC744 \uC120\uD0DD\uD558\uBA74 \uB0B4\uC6A9\uC744 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  title: "\uC81C\uBAA9",
  body: "\uB0B4\uC6A9",
  board: "\uAC8C\uC2DC\uD310",
  author: "\uC791\uC131\uC790",
  createdAt: "\uC791\uC131\uC77C",
  updatedAt: "\uC218\uC815\uC77C",
  pinnedLabel: "\uC0C1\uB2E8 \uACE0\uC815",
  deleteConfirm: "\uC774 \uAE00\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
  createTitle: "\uAE00 \uC791\uC131",
  editTitle: "\uAE00 \uC218\uC815",
  count: "\uAC74",
};

function boardIcon(board: CompanyBoardTabKey) {
  if (board === "work") return ClipboardList;
  if (board === "error") return AlertTriangle;
  if (board === "request") return MessageSquareWarning;
  return Megaphone;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function CompanyNoticeBoardPage({
  companyNotices,
  setCompanyNotices,
  workPosts,
  setWorkPosts,
  currentUser,
}: {
  companyNotices: CompanyNotice[];
  setCompanyNotices: React.Dispatch<React.SetStateAction<CompanyNotice[]>>;
  workPosts: WorkPost[];
  setWorkPosts: React.Dispatch<React.SetStateAction<WorkPost[]>>;
  currentUser: ErpUser | null;
}) {
  const { recordAudit } = useAudit();
  const [activeBoard, setActiveBoard] = useState<CompanyBoardTabKey>(DEFAULT_NOTICE_BOARD);
  const isWorkBoard = activeBoard === "work";
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<NoticeModalState | null>(null);
  const [formError, setFormError] = useState("");

  const activeBoardMeta = useMemo(() => {
    if (isWorkBoard) {
      return { key: "work" as const, label: L.workBoard, desc: L.workBoardDesc };
    }
    return NOTICE_BOARD_OPTIONS.find((item) => item.key === activeBoard) || NOTICE_BOARD_OPTIONS[0];
  }, [activeBoard, isWorkBoard]);

  const boardNotices = useMemo(
    () =>
      isWorkBoard
        ? []
        : sortCompanyNotices(filterCompanyNoticesByBoard(companyNotices, activeBoard as NoticeBoardKey)),
    [companyNotices, activeBoard, isWorkBoard]
  );
  const filteredNotices = useMemo(() => filterCompanyNotices(boardNotices, query), [boardNotices, query]);
  const selectedNotice = useMemo(
    () => filteredNotices.find((notice) => notice.id === selectedId) || filteredNotices[0] || null,
    [filteredNotices, selectedId]
  );

  useEffect(() => {
    if (selectedId && !filteredNotices.some((notice) => notice.id === selectedId)) {
      setSelectedId(filteredNotices[0]?.id || null);
    }
  }, [filteredNotices, selectedId]);

  const stats = useMemo(
    () => ({
      total: boardNotices.length,
      pinned: boardNotices.filter((notice) => notice.isPinned).length,
      thisMonth: countNoticesThisMonth(boardNotices),
    }),
    [boardNotices]
  );

  const openCreateModal = () => {
    setFormError("");
    setModal({ mode: "create", board: activeBoard, title: "", body: "", isPinned: false });
  };

  const openEditModal = (notice: CompanyNotice) => {
    setFormError("");
    setModal({
      mode: "edit",
      id: notice.id,
      board: notice.board,
      title: notice.title,
      body: notice.body,
      isPinned: Boolean(notice.isPinned),
    });
  };

  const saveNotice = () => {
    if (!modal) return;
    const error = validateNoticeInput({ title: modal.title, body: modal.body });
    if (error) {
      setFormError(error);
      return;
    }

    const now = new Date().toISOString();
    const authorName = currentUser?.name || currentUser?.loginId || "\uC0AC\uC6A9\uC790";
    const authorLoginId = currentUser?.loginId || "";

    if (modal.mode === "edit" && modal.id) {
      const existing = companyNotices.find((notice) => notice.id === modal.id);
      const updated = {
        ...(existing || {}),
        board: modal.board,
        title: modal.title.trim(),
        body: modal.body.trim(),
        isPinned: modal.isPinned,
        updatedAt: now,
        updatedBy: authorName,
      };
      recordAudit({
        entityType: "companyNotice",
        entityId: modal.id,
        entityLabel: updated.title,
        screen: getNoticeBoardLabel(modal.board),
        action: "update",
        before: existing ? snapshotCompanyNoticeForAudit(existing) : undefined,
        after: snapshotCompanyNoticeForAudit(updated),
        fields: COMPANY_NOTICE_AUDIT_FIELDS,
        user: currentUser,
      });
      setCompanyNotices((prev) =>
        prev.map((notice) =>
          notice.id === modal.id
            ? {
                ...notice,
                board: modal.board,
                title: modal.title.trim(),
                body: modal.body.trim(),
                isPinned: modal.isPinned,
                updatedAt: now,
                updatedBy: authorName,
              }
            : notice
        )
      );
      setSelectedId(modal.id);
      setActiveBoard(modal.board);
    } else {
      const next: CompanyNotice = {
        id: makeNoticeId(),
        board: modal.board,
        title: modal.title.trim(),
        body: modal.body.trim(),
        isPinned: modal.isPinned,
        createdAt: now,
        createdBy: authorName,
        createdByLoginId: authorLoginId,
      };
      recordAudit({
        entityType: "companyNotice",
        entityId: next.id,
        entityLabel: next.title,
        screen: getNoticeBoardLabel(next.board),
        action: "create",
        after: snapshotCompanyNoticeForAudit(next),
        fields: COMPANY_NOTICE_AUDIT_FIELDS,
        user: currentUser,
      });
      setCompanyNotices((prev) => [next, ...prev]);
      setSelectedId(next.id);
      setActiveBoard(next.board);
    }

    setModal(null);
    setFormError("");
  };

  const deleteNotice = (notice: CompanyNotice) => {
    if (!window.confirm(L.deleteConfirm)) return;
    recordAudit({
      entityType: "companyNotice",
      entityId: notice.id,
      entityLabel: notice.title,
      screen: getNoticeBoardLabel(notice.board),
      action: "delete",
      before: snapshotCompanyNoticeForAudit(notice),
      fields: COMPANY_NOTICE_AUDIT_FIELDS,
      user: currentUser,
    });
    setCompanyNotices((prev) => prev.filter((row) => row.id !== notice.id));
    if (selectedId === notice.id) setSelectedId(null);
  };

  const ActiveBoardIcon = boardIcon(activeBoard);

  return (
    <div className="erp-page erp-notice-board-page">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="erp-text-page-title">{L.pageTitle}</h1>
          <p className="mt-1 erp-text-body text-slate-500">{L.pageDesc}</p>
        </div>
        {!isWorkBoard ? (
          <Button type="button" className="rounded-2xl" onClick={openCreateModal}>
            <Plus size={16} className="mr-2" />
            {L.write}
          </Button>
        ) : null}
      </div>

      <div className="erp-ledger-tabs mb-4 flex flex-wrap gap-2">
        {NOTICE_BOARD_OPTIONS.map((tab) => {
          const TabIcon = boardIcon(tab.key);
          const count = filterCompanyNoticesByBoard(companyNotices, tab.key).length;
          return (
            <Button
              key={tab.key}
              type="button"
              variant={activeBoard === tab.key ? "default" : "outline"}
              className="rounded-2xl"
              onClick={() => {
                setActiveBoard(tab.key);
                setSelectedId(null);
              }}
            >
              <TabIcon size={15} className="mr-1.5" />
              {tab.label}
              <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[0.6875rem] font-bold">{count}</span>
            </Button>
          );
        })}
        <Button
          type="button"
          variant={isWorkBoard ? "default" : "outline"}
          className="rounded-2xl"
          onClick={() => {
            setActiveBoard("work");
            setSelectedId(null);
          }}
        >
          <ClipboardList size={15} className="mr-1.5" />
          {L.workBoard}
          <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[0.6875rem] font-bold">{workPosts.length}</span>
        </Button>
      </div>

      {isWorkBoard ? (
        <WorkBoardPage embedded workPosts={workPosts} setWorkPosts={setWorkPosts} currentUser={currentUser} />
      ) : (
        <>
      <Card className="mb-4 rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="rounded-2xl bg-slate-100 p-2 text-slate-600">
            <ActiveBoardIcon size={18} />
          </div>
          <div>
            <div className="erp-text-section font-bold text-slate-900">{activeBoardMeta.label}</div>
            <p className="mt-1 erp-text-caption text-slate-500">{activeBoardMeta.desc}</p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">{L.total}</div>
            <div className="mt-1 text-2xl font-black text-slate-900">
              {stats.total}
              {L.count}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">{L.pinned}</div>
            <div className="mt-1 text-2xl font-black text-amber-700">
              {stats.pinned}
              {L.count}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">{L.thisMonth}</div>
            <div className="mt-1 text-2xl font-black text-slate-900">
              {stats.thisMonth}
              {L.count}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="erp-input w-full rounded-2xl border bg-white py-2.5 pl-9 pr-3"
              placeholder={L.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              lang="ko"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-0">
            <TableExportSection
              fileName={`\uD68C\uC0AC\uAC8C\uC2DC\uD310_${activeBoardMeta.label}`}
              title={`${L.pageTitle} ${activeBoardMeta.label}`}
              disabled={filteredNotices.length === 0}
            >
              <MobileRecordList>
                {filteredNotices.length ? (
                  filteredNotices.map((notice) => (
                    <MobileRecordCard
                      key={notice.id}
                      title={notice.title}
                      selected={selectedNotice?.id === notice.id}
                      onClick={() => setSelectedId(notice.id)}
                      badge={notice.isPinned ? L.pinnedLabel : undefined}
                      fields={[
                        { label: L.author, value: notice.createdBy },
                        { label: L.createdAt, value: formatNoticeDateTime(notice.createdAt) },
                      ]}
                    />
                  ))
                ) : (
                  <MobileRecordCard empty emptyLabel={L.empty} />
                )}
              </MobileRecordList>
              <DesktopTableWrap>
                <table className="erp-table min-w-full">
                  <thead>
                    <tr>
                      <th>{L.title}</th>
                      <th>{L.author}</th>
                      <th>{L.createdAt}</th>
                      <th className="text-center">{L.pinnedLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNotices.map((notice) => (
                      <tr
                        key={notice.id}
                        className={`cursor-pointer border-t hover:bg-slate-50 ${selectedNotice?.id === notice.id ? "bg-sky-50" : ""}`}
                        onClick={() => setSelectedId(notice.id)}
                      >
                        <td className="font-semibold text-slate-900">
                          <span className="inline-flex items-center gap-2">
                            {notice.isPinned ? <Pin size={14} className="text-amber-600" /> : null}
                            {notice.title}
                          </span>
                        </td>
                        <td>{notice.createdBy}</td>
                        <td className="whitespace-nowrap">{formatNoticeDateTime(notice.createdAt)}</td>
                        <td className="text-center">{notice.isPinned ? "Y" : "-"}</td>
                      </tr>
                    ))}
                    {!filteredNotices.length ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-500">
                          {L.empty}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </DesktopTableWrap>
            </TableExportSection>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4 md:p-5">
            {selectedNotice ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="erp-notice-board-badge">{getNoticeBoardLabel(selectedNotice.board)}</span>
                      {selectedNotice.isPinned ? (
                        <span className="erp-notice-pin-badge">
                          <Pin size={12} />
                          {L.pinnedLabel}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="erp-text-section font-bold text-slate-900">{selectedNotice.title}</h2>
                    <p className="mt-2 erp-text-caption text-slate-500">
                      {L.author} {selectedNotice.createdBy} {" \u00B7 "} {formatNoticeDateTime(selectedNotice.createdAt)}
                      {selectedNotice.updatedAt ? ` \u00B7 ${L.updatedAt} ${formatNoticeDateTime(selectedNotice.updatedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <TeamChatShareButton
                      payload={{
                        link: buildPageTeamChatLink({ page: "companyNotices", label: selectedNotice.title }),
                        body: selectedNotice.body,
                      }}
                    />
                    {canManageNotice(selectedNotice, currentUser) ? (
                      <>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => openEditModal(selectedNotice)}>
                        <Pencil size={14} className="mr-1" />
                        {L.edit}
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl text-red-600" onClick={() => deleteNotice(selectedNotice)}>
                        <Trash2 size={14} className="mr-1" />
                        {L.delete}
                      </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="erp-notice-body whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-800">
                  {selectedNotice.body}
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-slate-500">{filteredNotices.length ? L.selectHint : L.empty}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {modal ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setModal(null)}>
          <div className="erp-ledger-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="erp-text-section font-bold">{modal.mode === "create" ? L.createTitle : L.editTitle}</h2>
              <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={() => setModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <Field label={L.board}>
                <select
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                  value={modal.board}
                  onChange={(event) =>
                    setModal((prev) => (prev ? { ...prev, board: event.target.value as NoticeBoardKey } : prev))
                  }
                >
                  {NOTICE_BOARD_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={L.title}>
                <input
                  className="erp-input w-full rounded-2xl border px-3 py-2.5"
                  value={modal.title}
                  onChange={(event) => setModal((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                  lang="ko"
                />
              </Field>
              <Field label={L.body}>
                <textarea
                  className="erp-input min-h-[12rem] w-full rounded-2xl border px-3 py-2.5"
                  value={modal.body}
                  onChange={(event) => setModal((prev) => (prev ? { ...prev, body: event.target.value } : prev))}
                  lang="ko"
                />
              </Field>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={modal.isPinned}
                  onChange={(event) => setModal((prev) => (prev ? { ...prev, isPinned: event.target.checked } : prev))}
                />
                {L.pinnedLabel}
              </label>
              {formError ? <p className="text-sm font-semibold text-red-600">{formError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setModal(null)}>
                  {L.cancel}
                </Button>
                <Button type="button" className="rounded-2xl" onClick={saveNotice}>
                  {L.save}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}
