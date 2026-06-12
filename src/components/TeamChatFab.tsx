import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import type { ErpUser } from "@/utils/erpApi";
import { canUserAccessPage } from "@/utils/pageAccess";

const L = {
  title: "talk",
  open: "\uD300\uBC00\uD1A8 \uC5F4\uAE30",
  unread: (count: number) => `\uC77D\uC9C0 \uC54A\uC740 \uBA54\uC2DC\uC9C0 ${count}\uAC74`,
};

const FAB_POSITION_KEY = "teammillimeter-erp-team-chat-fab-position";
const FAB_DRAG_THRESHOLD = 8;
const FAB_DEFAULT_SIZE = { width: 72, height: 44 };
const FAB_MARGIN = 16;

type FabPosition = {
  left: number;
  top: number;
};

function clampFabPosition(left: number, top: number, size = FAB_DEFAULT_SIZE): FabPosition {
  if (typeof window === "undefined") return { left, top };
  const maxLeft = Math.max(FAB_MARGIN, window.innerWidth - size.width - FAB_MARGIN);
  const maxTop = Math.max(FAB_MARGIN, window.innerHeight - size.height - FAB_MARGIN);
  return {
    left: Math.min(Math.max(FAB_MARGIN, left), maxLeft),
    top: Math.min(Math.max(FAB_MARGIN, top), maxTop),
  };
}

function defaultFabPosition(size = FAB_DEFAULT_SIZE): FabPosition {
  if (typeof window === "undefined") return { left: FAB_MARGIN, top: FAB_MARGIN };
  return clampFabPosition(
    window.innerWidth - size.width - FAB_MARGIN,
    window.innerHeight - size.height - FAB_MARGIN - 56,
    size,
  );
}

function loadFabPosition(): FabPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FAB_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FabPosition>;
    if (typeof parsed.left !== "number" || typeof parsed.top !== "number") return null;
    return clampFabPosition(parsed.left, parsed.top);
  } catch {
    return null;
  }
}

function saveFabPosition(position: FabPosition) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(position));
}

function prefersSimpleTapOpen() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 1023px)").matches ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches ||
    (navigator.maxTouchPoints || 0) > 0
  );
}

type TeamChatFabProps = {
  currentUser: ErpUser | null;
  enabled?: boolean;
  unreadCount?: number;
  hidden?: boolean;
  onOpen: () => void;
};

export function TeamChatFab({
  currentUser,
  enabled = true,
  unreadCount = 0,
  hidden = false,
  onOpen,
}: TeamChatFabProps) {
  const canUse = enabled && currentUser && canUserAccessPage(currentUser, "teamChat");
  const [fabPosition, setFabPosition] = useState<FabPosition>(() => loadFabPosition() || defaultFabPosition());
  const [fabDragging, setFabDragging] = useState(false);
  const [simpleTapOpen, setSimpleTapOpen] = useState(prefersSimpleTapOpen);
  const fabRef = useRef<HTMLButtonElement>(null);
  const skipClickRef = useRef(false);
  const fabDragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originLeft: 0,
    originTop: 0,
  });

  useEffect(() => {
    const updateMode = () => setSimpleTapOpen(prefersSimpleTapOpen());
    updateMode();
    window.addEventListener("resize", updateMode);
    return () => window.removeEventListener("resize", updateMode);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setFabPosition((prev) => clampFabPosition(prev.left, prev.top));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleFabPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (simpleTapOpen || event.pointerType === "touch") return;
      event.preventDefault();
      fabRef.current?.setPointerCapture(event.pointerId);
      fabDragRef.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: fabPosition.left,
        originTop: fabPosition.top,
      };
    },
    [fabPosition.left, fabPosition.top, simpleTapOpen],
  );

  const handleFabPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = fabDragRef.current;
    if (!drag.active) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > FAB_DRAG_THRESHOLD || Math.abs(dy) > FAB_DRAG_THRESHOLD)) {
      drag.moved = true;
      setFabDragging(true);
    }
    if (!drag.moved) return;
    setFabPosition(clampFabPosition(drag.originLeft + dx, drag.originTop + dy));
  }, []);

  const handleFabPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = fabDragRef.current;
      if (!drag.active) return;
      fabRef.current?.releasePointerCapture(event.pointerId);
      drag.active = false;
      setFabDragging(false);
      if (drag.moved) {
        skipClickRef.current = true;
        setFabPosition((prev) => {
          const next = clampFabPosition(prev.left, prev.top);
          saveFabPosition(next);
          return next;
        });
        return;
      }
      onOpen();
      skipClickRef.current = true;
    },
    [onOpen],
  );

  const handleFabPointerCancel = useCallback(() => {
    fabDragRef.current.active = false;
    fabDragRef.current.moved = false;
    setFabDragging(false);
  }, []);

  const handleFabClick = useCallback(() => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    onOpen();
  }, [onOpen]);

  if (!canUse || hidden) return null;

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);
  const showBadge = unreadCount > 0;

  return (
    <button
      ref={fabRef}
      type="button"
      className={`erp-team-chat-fab${fabDragging ? " erp-team-chat-fab--dragging" : ""}${simpleTapOpen ? " erp-team-chat-fab--touch" : ""}`}
      style={{ left: fabPosition.left, top: fabPosition.top }}
      onClick={handleFabClick}
      onPointerDown={simpleTapOpen ? undefined : handleFabPointerDown}
      onPointerMove={simpleTapOpen ? undefined : handleFabPointerMove}
      onPointerUp={simpleTapOpen ? undefined : handleFabPointerUp}
      onPointerCancel={simpleTapOpen ? undefined : handleFabPointerCancel}
      aria-label={showBadge ? L.unread(unreadCount) : L.open}
      title={L.title}
    >
      <span className="erp-team-chat-fab__icon-wrap">
        <MessageCircle size={22} aria-hidden="true" />
        {showBadge ? (
          <span className="erp-team-chat-fab__badge" aria-hidden="true">
            {badgeLabel}
          </span>
        ) : null}
      </span>
      <span>{L.title}</span>
    </button>
  );
}
