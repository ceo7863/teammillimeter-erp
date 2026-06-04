import React, { useCallback, useEffect, useRef } from "react";

type WorkerPortalSignaturePadProps = {
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  className?: string;
};

function getPoint(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

export function WorkerPortalSignaturePad({ onChange, disabled = false, className = "" }: WorkerPortalSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(Math.floor(rect.width), 280);
    const height = Math.max(Math.floor(rect.height), 140);
    if (canvas.width === width && canvas.height === height) return;
    const ctx = canvas.getContext("2d");
    const previous = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = width;
    canvas.height = height;
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      if (previous && previous.width > 0 && previous.height > 0) {
        ctx.putImageData(previous, 0, 0);
      }
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  const emitChange = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) {
      onChange("");
      return;
    }
    onChange(canvas.toDataURL("image/png"));
  }, [onChange]);

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    hasInkRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const point = getPoint(event, canvas);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const moveStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const point = getPoint(event, canvas);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    emitChange();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    onChange("");
  };

  return (
    <div className={`erp-worker-portal-signature ${className}`.trim()}>
      <canvas
        ref={canvasRef}
        className="erp-worker-portal-signature__canvas"
        aria-label={"\uC11C\uBA85 \uC785\uB825"}
        onPointerDown={startStroke}
        onPointerMove={moveStroke}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        onPointerCancel={endStroke}
      />
      <button
        type="button"
        className="erp-worker-portal-signature__clear"
        onClick={clear}
        disabled={disabled}
      >
        {"\uC11C\uBA85 \uC9C0\uC6B0\uAE30"}
      </button>
    </div>
  );
}
