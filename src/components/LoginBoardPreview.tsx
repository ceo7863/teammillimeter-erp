import React, { useEffect, useState } from "react";
import { ClipboardList, Megaphone, Paperclip, Pin } from "lucide-react";
import { formatNoticeDateTime } from "@/utils/companyNotices";
import {
  loadLoginBoardPreview,
  type LoginBoardNoticePreview,
  type LoginBoardPreview,
  type LoginBoardWorkPostPreview,
} from "@/utils/loginBoardPreview";
import { formatWorkPostDateTime } from "@/utils/workBoard";

function truncateText(text: string, max = 120) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function PreviewEmpty({ message }: { message: string }) {
  return <p className="login-board-preview__empty erp-text-caption text-slate-500">{message}</p>;
}

function NoticeItem({ notice }: { notice: LoginBoardNoticePreview }) {
  return (
    <article className="login-board-preview__item">
      <div className="login-board-preview__item-head">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {notice.isPinned ? (
              <span className="login-board-preview__badge login-board-preview__badge--pin">
                <Pin size={12} /> 고정
              </span>
            ) : null}
            <h3 className="login-board-preview__title">{notice.title || "제목 없음"}</h3>
          </div>
          {notice.body ? <p className="login-board-preview__body">{truncateText(notice.body)}</p> : null}
        </div>
        <time className="login-board-preview__date">{formatNoticeDateTime(notice.createdAt)}</time>
      </div>
    </article>
  );
}

function WorkPostItem({ post }: { post: LoginBoardWorkPostPreview }) {
  return (
    <article className="login-board-preview__item">
      <div className="login-board-preview__item-head">
        <div className="min-w-0 flex-1">
          <h3 className="login-board-preview__title">{post.title || "제목 없음"}</h3>
          {post.body ? <p className="login-board-preview__body">{truncateText(post.body)}</p> : null}
          {post.attachmentCount > 0 ? (
            <span className="login-board-preview__attachment">
              <Paperclip size={12} /> 첨부 {post.attachmentCount}건
            </span>
          ) : null}
        </div>
        <time className="login-board-preview__date">{formatWorkPostDateTime(post.createdAt)}</time>
      </div>
    </article>
  );
}

function PreviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="login-board-preview__section">
      <div className="login-board-preview__section-head">
        <Icon size={16} />
        <h2 className="login-board-preview__section-title">{title}</h2>
      </div>
      <div className="login-board-preview__list">{children}</div>
    </section>
  );
}

export function LoginBoardPreview() {
  const [preview, setPreview] = useState<LoginBoardPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadLoginBoardPreview()
      .then((data) => {
        if (active) setPreview(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const hasContent = Boolean(preview && (preview.notices.length > 0 || preview.workPosts.length > 0));

  if (loading) {
    return (
      <div className="login-board-preview">
        <p className="erp-text-caption text-slate-500">회사게시판 미리보기를 불러오는 중…</p>
      </div>
    );
  }

  if (!hasContent) {
    return null;
  }

  return (
    <div className="login-board-preview">
      <p className="login-board-preview__lead erp-text-caption text-slate-400">
        로그인 전에도 최근 공지와 업무게시판을 확인할 수 있습니다.
      </p>
      <PreviewSection icon={Megaphone} title="공지">
        {preview!.notices.length > 0 ? (
          preview!.notices.map((notice) => <NoticeItem key={notice.id} notice={notice} />)
        ) : (
          <PreviewEmpty message="등록된 공지가 없습니다." />
        )}
      </PreviewSection>
      <PreviewSection icon={ClipboardList} title="업무게시판">
        {preview!.workPosts.length > 0 ? (
          preview!.workPosts.map((post) => <WorkPostItem key={post.id} post={post} />)
        ) : (
          <PreviewEmpty message="등록된 업무 글이 없습니다." />
        )}
      </PreviewSection>
    </div>
  );
}
