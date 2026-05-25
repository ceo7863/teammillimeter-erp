import React, { useEffect, useMemo, useState } from "react";
import { ClipboardList, Paperclip, Pencil, Pin, Plus, Search, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import type { ErpUser } from "@/utils/erpApi";
import { confirmDelete } from "@/utils/confirmDelete";
import {
  deleteBoardAttachment,
  deleteBoardAttachments,
  downloadAttachmentBlob,
  fetchBoardAttachmentBlob,
  formatAttachmentSize,
  isImageMimeType,
  uploadBoardAttachment,
} from "@/utils/boardAttachments";
import {
  canManageWorkPost,
  countWorkPostsThisMonth,
  filterWorkPosts,
  formatWorkPostDateTime,
  makeWorkPostId,
  sortWorkPosts,
  validateWorkPostInput,
  type WorkPost,
  type WorkPostAttachment,
} from "@/utils/workBoard";

type PostModalState = {
  mode: "create" | "edit";
  id?: string;
  title: string;
  body: string;
  isPinned: boolean;
  attachments: WorkPostAttachment[];
};

const L = {
  pageTitle: "\uC5C5\uBB34\uAC8C\uC2DC\uD310",
  pageDesc: "\uC5C5\uBB34 \uACF5\uC720 \uBC0F \uCCB4\uBD80\uD30C\uC77C\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
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
  author: "\uC791\uC131\uC790",
  createdAt: "\uC791\uC131\uC77C",
  updatedAt: "\uC218\uC815\uC77C",
  pinnedLabel: "\uC0C1\uB2E8 \uACE0\uC815",
  deleteConfirm: "\uC774 \uAE00\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
  createTitle: "\uAE00 \uC791\uC131",
  editTitle: "\uAE00 \uC218\uC815",
  count: "\uAC74",
  attachments: "\uCCB4\uBD80\uD30C\uC77C",
  addFiles: "\uD30C\uC77C \uCD94\uAC00",
  saving: "\uC800\uC7A5 \uC911...",
  saveFailed: "\uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function AttachmentThumb({ attachment }: { attachment: WorkPostAttachment }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImageMimeType(attachment.mimeType)) return;
    let cancelled = false;
    let objectUrl = "";
    (async () => {
      try {
        const blob = await fetchBoardAttachmentBlob(attachment.id);
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        // ignore preview errors
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.mimeType]);

  const handleDownload = async () => {
    try {
      const blob = await fetchBoardAttachmentBlob(attachment.id);
      if (blob) downloadAttachmentBlob(blob, attachment.fileName);
    } catch {
      window.alert("\uD30C\uC77C\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    }
  };

  return (
    <div className="erp-board-attachment-chip">
      {url ? (
        <button type="button" className="erp-board-attachment-thumb" onClick={handleDownload} title={attachment.fileName}>
          <img src={url} alt={attachment.fileName} />
        </button>
      ) : (
        <button type="button" className="erp-board-attachment-file" onClick={handleDownload}>
          <Paperclip size={14} />
          <span className="truncate">{attachment.fileName}</span>
          <span className="text-slate-400">({formatAttachmentSize(attachment.fileSize)})</span>
        </button>
      )}
    </div>
  );
}

export function WorkBoardPage({
  workPosts,
  setWorkPosts,
  currentUser,
  embedded = false,
}: {
  workPosts: WorkPost[];
  setWorkPosts: React.Dispatch<React.SetStateAction<WorkPost[]>>;
  currentUser: ErpUser | null;
  embedded?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<PostModalState | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const sortedPosts = useMemo(() => sortWorkPosts(workPosts), [workPosts]);
  const filteredPosts = useMemo(() => filterWorkPosts(sortedPosts, query), [sortedPosts, query]);
  const selectedPost = useMemo(
    () => filteredPosts.find((post) => post.id === selectedId) || filteredPosts[0] || null,
    [filteredPosts, selectedId]
  );

  useEffect(() => {
    if (selectedId && !filteredPosts.some((post) => post.id === selectedId)) {
      setSelectedId(filteredPosts[0]?.id || null);
    }
  }, [filteredPosts, selectedId]);

  const stats = useMemo(
    () => ({
      total: workPosts.length,
      pinned: workPosts.filter((post) => post.isPinned).length,
      thisMonth: countWorkPostsThisMonth(workPosts),
    }),
    [workPosts]
  );

  const openCreateModal = () => {
    setFormError("");
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    setModal({ mode: "create", title: "", body: "", isPinned: false, attachments: [] });
  };

  const openEditModal = (post: WorkPost) => {
    setFormError("");
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    setModal({
      mode: "edit",
      id: post.id,
      title: post.title,
      body: post.body,
      isPinned: Boolean(post.isPinned),
      attachments: post.attachments || [],
    });
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    setFormError("");
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files]);
    event.target.value = "";
  };

  const removePendingFile = (index: number) => {
    if (!confirmDelete("선택한 첨부 파일을 삭제할까요?")) return;
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingAttachment = (id: string) => {
    if (!confirmDelete("첨부 파일을 삭제할까요?")) return;
    setRemovedAttachmentIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setModal((prev) =>
      prev ? { ...prev, attachments: prev.attachments.filter((item) => item.id !== id) } : prev
    );
  };

  const savePost = async () => {
    if (!modal || saving) return;
    const error = validateWorkPostInput({ title: modal.title, body: modal.body });
    if (error) {
      setFormError(error);
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const postId = modal.mode === "edit" && modal.id ? modal.id : makeWorkPostId();
      const uploaded: WorkPostAttachment[] = [];
      for (const file of pendingFiles) {
        uploaded.push(await uploadBoardAttachment(file, postId));
      }

      for (const id of removedAttachmentIds) {
        await deleteBoardAttachment(id);
      }

      const attachments = [...modal.attachments, ...uploaded];
      const now = new Date().toISOString();
      const authorName = currentUser?.name || currentUser?.loginId || "\uC0AC\uC6A9\uC790";
      const authorLoginId = currentUser?.loginId || "";

      if (modal.mode === "edit" && modal.id) {
        setWorkPosts((prev) =>
          prev.map((post) =>
            post.id === modal.id
              ? {
                  ...post,
                  title: modal.title.trim(),
                  body: modal.body.trim(),
                  isPinned: modal.isPinned,
                  attachments,
                  updatedAt: now,
                  updatedBy: authorName,
                }
              : post
          )
        );
        setSelectedId(modal.id);
      } else {
        const next: WorkPost = {
          id: postId,
          title: modal.title.trim(),
          body: modal.body.trim(),
          isPinned: modal.isPinned,
          attachments,
          createdAt: now,
          createdBy: authorName,
          createdByLoginId: authorLoginId,
        };
        setWorkPosts((prev) => [next, ...prev]);
        setSelectedId(next.id);
      }

      setModal(null);
      setPendingFiles([]);
      setRemovedAttachmentIds([]);
      setFormError("");
    } catch (saveError) {
      console.error(saveError);
      setFormError(L.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (post: WorkPost) => {
    if (!window.confirm(L.deleteConfirm)) return;
    try {
      if (post.attachments?.length) {
        await deleteBoardAttachments(post.attachments.map((item) => item.id));
      }
      setWorkPosts((prev) => prev.filter((row) => row.id !== post.id));
      if (selectedId === post.id) setSelectedId(null);
    } catch (error) {
      console.error(error);
      window.alert(L.saveFailed);
    }
  };

  return (
    <div className={embedded ? "erp-work-board-section" : "erp-page erp-work-board-page"}>
      {!embedded ? (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="erp-text-page-title">{L.pageTitle}</h1>
              <p className="mt-1 erp-text-body text-slate-500">{L.pageDesc}</p>
            </div>
            <Button type="button" className="rounded-2xl" onClick={openCreateModal}>
              <Plus size={16} className="mr-2" />
              {L.write}
            </Button>
          </div>

          <Card className="mb-4 rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="rounded-2xl bg-slate-100 p-2 text-slate-600">
                <ClipboardList size={18} />
              </div>
              <div>
                <div className="erp-text-section font-bold text-slate-900">{L.pageTitle}</div>
                <p className="mt-1 erp-text-caption text-slate-500">{L.pageDesc}</p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="mb-4 flex justify-end">
          <Button type="button" className="rounded-2xl" onClick={openCreateModal}>
            <Plus size={16} className="mr-2" />
            {L.write}
          </Button>
        </div>
      )}

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
            <TableExportSection fileName="\uC5C5\uBB34\uAC8C\uC2DC\uD310" title={L.pageTitle} disabled={filteredPosts.length === 0}>
              <MobileRecordList>
                {filteredPosts.length ? (
                  filteredPosts.map((post) => (
                    <MobileRecordCard
                      key={post.id}
                      title={post.title}
                      selected={selectedPost?.id === post.id}
                      onClick={() => setSelectedId(post.id)}
                      badge={post.isPinned ? L.pinnedLabel : undefined}
                      fields={[
                        { label: L.author, value: post.createdBy },
                        { label: L.createdAt, value: formatWorkPostDateTime(post.createdAt) },
                        ...(post.attachments?.length
                          ? [{ label: L.attachments, value: `${post.attachments.length}${L.count}` }]
                          : []),
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
                      <th className="text-center">{L.attachments}</th>
                      <th className="text-center">{L.pinnedLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPosts.map((post) => (
                      <tr
                        key={post.id}
                        className={`cursor-pointer border-t hover:bg-slate-50 ${selectedPost?.id === post.id ? "bg-sky-50" : ""}`}
                        onClick={() => setSelectedId(post.id)}
                      >
                        <td className="font-semibold text-slate-900">
                          <span className="inline-flex items-center gap-2">
                            {post.isPinned ? <Pin size={14} className="text-amber-600" /> : null}
                            {post.title}
                          </span>
                        </td>
                        <td>{post.createdBy}</td>
                        <td className="whitespace-nowrap">{formatWorkPostDateTime(post.createdAt)}</td>
                        <td className="text-center">{post.attachments?.length || "-"}</td>
                        <td className="text-center">{post.isPinned ? "Y" : "-"}</td>
                      </tr>
                    ))}
                    {!filteredPosts.length ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500">
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
            {selectedPost ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {selectedPost.isPinned ? (
                        <span className="erp-notice-pin-badge">
                          <Pin size={12} />
                          {L.pinnedLabel}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="erp-text-section font-bold text-slate-900">{selectedPost.title}</h2>
                    <p className="mt-2 erp-text-caption text-slate-500">
                      {L.author} {selectedPost.createdBy} {" \u00B7 "} {formatWorkPostDateTime(selectedPost.createdAt)}
                      {selectedPost.updatedAt ? ` \u00B7 ${L.updatedAt} ${formatWorkPostDateTime(selectedPost.updatedAt)}` : ""}
                    </p>
                  </div>
                  {canManageWorkPost(selectedPost, currentUser) ? (
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => openEditModal(selectedPost)}>
                        <Pencil size={14} className="mr-1" />
                        {L.edit}
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl text-red-600" onClick={() => deletePost(selectedPost)}>
                        <Trash2 size={14} className="mr-1" />
                        {L.delete}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="erp-notice-body whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-800">
                  {selectedPost.body}
                </div>
                {selectedPost.attachments?.length ? (
                  <div className="erp-board-attachments mt-4">
                    <div className="erp-text-caption mb-2 font-semibold text-slate-500">{L.attachments}</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPost.attachments.map((attachment) => (
                        <AttachmentThumb key={attachment.id} attachment={attachment} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="py-10 text-center text-slate-500">{filteredPosts.length ? L.selectHint : L.empty}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {modal ? (
        <div className="erp-ledger-modal-backdrop" onClick={closeModal}>
          <div className="erp-ledger-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="erp-text-section font-bold">{modal.mode === "create" ? L.createTitle : L.editTitle}</h2>
              <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={closeModal} disabled={saving}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
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
              <Field label={L.attachments}>
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    <Paperclip size={15} />
                    {L.addFiles}
                    <input type="file" multiple className="hidden" onChange={handleFileChange} />
                  </label>
                  {modal.attachments.length ? (
                    <div className="space-y-1">
                      {modal.attachments.map((attachment) => (
                        <div key={attachment.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                          <span className="truncate">{attachment.fileName}</span>
                          <button
                            type="button"
                            className="ml-2 text-red-500"
                            onClick={() => removeExistingAttachment(attachment.id)}
                            disabled={saving}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {pendingFiles.length ? (
                    <div className="space-y-1">
                      {pendingFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
                          <span className="truncate">{file.name}</span>
                          <button type="button" className="ml-2 text-red-500" onClick={() => removePendingFile(index)} disabled={saving}>
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={modal.isPinned}
                  onChange={(event) => setModal((prev) => (prev ? { ...prev, isPinned: event.target.checked } : prev))}
                  disabled={saving}
                />
                {L.pinnedLabel}
              </label>
              {formError ? <p className="text-sm font-semibold text-red-600">{formError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-2xl" onClick={closeModal} disabled={saving}>
                  {L.cancel}
                </Button>
                <Button type="button" className="rounded-2xl" onClick={savePost} disabled={saving}>
                  {saving ? L.saving : L.save}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
