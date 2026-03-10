"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Square,
  Settings,
  X,
  RotateCcw,
  Columns,
} from "lucide-react";

export type WidgetSize  = "compact" | "normal" | "full";
export type WidgetWidth = "full" | "half";

export interface WidgetConfig {
  id: string;
  label: string;
  visible: boolean;
  size: WidgetSize;
  width: WidgetWidth;
}

const STORAGE_KEY = "dashboard_layout_v2";

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "metrics", label: "Market Metrics",  visible: true, size: "normal", width: "full" },
  { id: "news",    label: "Market News",     visible: true, size: "normal", width: "full" },
  { id: "filings", label: "BSE Filings",     visible: true, size: "normal", width: "full" },
  { id: "sectors", label: "Sector Leaders",  visible: true, size: "normal", width: "full" },
  { id: "preview", label: "Quick Access",    visible: true, size: "normal", width: "full" },
];

function loadLayout(): WidgetConfig[] {
  if (typeof window === "undefined") return DEFAULT_WIDGETS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDGETS;
    const saved = JSON.parse(raw) as Partial<WidgetConfig>[];
    // Backfill `width` for entries saved before this field existed
    const hydrated: WidgetConfig[] = saved.map((w) => ({
      width: "full",
      size: "normal",
      visible: true,
      ...w,
    } as WidgetConfig));
    const savedIds = new Set(hydrated.map((w) => w.id));
    return [
      ...hydrated,
      ...DEFAULT_WIDGETS.filter((d) => !savedIds.has(d.id)),
    ];
  } catch {
    return DEFAULT_WIDGETS;
  }
}

function saveLayout(widgets: WidgetConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch { /* quota exceeded */ }
}

// ── Height-size config ────────────────────────────────────────────────────────
// compact → clamps height, scrollable internally
// normal  → natural height
// full    → natural + subtle amber ring emphasis
const SIZE_CONTENT_CLASS: Record<WidgetSize, string> = {
  compact: "max-h-[260px] overflow-y-auto",
  normal:  "",
  full:    "rounded-xl ring-1 ring-amber/20",
};

// ── Sortable widget wrapper ───────────────────────────────────────────────────
interface SortableWidgetProps {
  widget: WidgetConfig;
  children: React.ReactNode;
  onToggleVisible: (id: string) => void;
  onCycleSize: (id: string) => void;
  onToggleWidth: (id: string) => void;
  isEditMode: boolean;
}

function SortableWidget({
  widget,
  children,
  onToggleVisible,
  onCycleSize,
  onToggleWidth,
  isEditMode,
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  const sizeIcons = {
    compact: <Minimize2 className="w-3 h-3" />,
    normal:  <Square    className="w-3 h-3" />,
    full:    <Maximize2 className="w-3 h-3" />,
  };

  if (!widget.visible && !isEditMode) return null;

  // col-span drives whether the widget is full-width or side-by-side
  const colClass = widget.width === "half" ? "col-span-1" : "col-span-2";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${colClass} group/widget relative ${
        !widget.visible && isEditMode ? "opacity-40" : ""
      } ${isDragging ? "ring-1 ring-amber/40 rounded-xl" : ""}`}
    >
      {/* Edit-mode control bar */}
      {isEditMode && (
        <div className="flex items-center gap-1 mb-1.5 px-1">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted hover:text-amber transition-colors p-1 touch-none"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <span className="text-[11px] font-mono text-muted uppercase tracking-wider flex-1">
            {widget.label}
          </span>

          {/* Width toggle — Columns icon is amber when in half-width mode */}
          <button
            onClick={() => onToggleWidth(widget.id)}
            className={`p-1 transition-colors ${
              widget.width === "half"
                ? "text-amber"
                : "text-muted hover:text-primary"
            }`}
            title={widget.width === "half" ? "Expand to full width" : "Split to half width"}
          >
            <Columns className="w-3 h-3" />
          </button>

          {/* Size cycle */}
          <button
            onClick={() => onCycleSize(widget.id)}
            className="p-1 text-muted hover:text-primary transition-colors"
            title={`Height: ${widget.size}`}
          >
            {sizeIcons[widget.size]}
          </button>

          {/* Visibility toggle */}
          <button
            onClick={() => onToggleVisible(widget.id)}
            className={`p-1 transition-colors ${
              widget.visible ? "text-teal hover:text-muted" : "text-muted hover:text-teal"
            }`}
            title={widget.visible ? "Hide widget" : "Show widget"}
          >
            {widget.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Widget content — height controlled by size, scrollable in compact */}
      <div className={`relative transition-all duration-300 ${SIZE_CONTENT_CLASS[widget.size]}`}>
        {children}
      </div>
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
interface SettingsPanelProps {
  widgets: WidgetConfig[];
  onClose: () => void;
  onReset: () => void;
  onToggleVisible: (id: string) => void;
  onCycleSize: (id: string) => void;
  onToggleWidth: (id: string) => void;
}

function SettingsPanel({
  widgets,
  onClose,
  onReset,
  onToggleVisible,
  onCycleSize,
  onToggleWidth,
}: SettingsPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const sizeLabel: Record<WidgetSize, string>  = { compact: "Compact", normal: "Normal", full: "Full" };
  const widthLabel: Record<WidgetWidth, string> = { full: "Full", half: "½ Width" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end pt-14 pr-4"
      style={{ backdropFilter: "blur(2px)", backgroundColor: "rgba(12,14,20,0.6)" }}
    >
      <div
        ref={ref}
        className="w-80 bg-[#13151E] border border-[#1E2235] rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2235]">
          <span className="text-xs font-mono font-semibold text-primary uppercase tracking-widest">
            Dashboard Layout
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="text-[11px] font-mono text-muted hover:text-amber transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button onClick={onClose} className="text-muted hover:text-primary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3 space-y-1">
          {widgets.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <span className="flex-1 text-xs font-mono text-primary">{w.label}</span>

              {/* Width toggle */}
              <button
                onClick={() => onToggleWidth(w.id)}
                className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                  w.width === "half"
                    ? "bg-amber/10 border-amber/30 text-amber"
                    : "bg-[#1E2235] border-transparent text-muted hover:text-primary"
                }`}
              >
                {widthLabel[w.width]}
              </button>

              {/* Size cycle */}
              <button
                onClick={() => onCycleSize(w.id)}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1E2235] text-muted hover:text-primary transition-colors"
              >
                {sizeLabel[w.size]}
              </button>

              {/* Visibility */}
              <button
                onClick={() => onToggleVisible(w.id)}
                className={`transition-colors ${w.visible ? "text-teal" : "text-muted hover:text-teal"}`}
              >
                {w.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-[#1E2235]">
          <p className="text-[10px] font-mono text-muted">
            Drag handles appear in edit mode · ½ Width places widgets side-by-side · Saved automatically
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main DashboardShell ───────────────────────────────────────────────────────
interface DashboardShellProps {
  children: Record<string, React.ReactNode>;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [widgets, setWidgets]         = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [isEditMode, setIsEditMode]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mounted, setMounted]         = useState(false);

  useEffect(() => {
    setWidgets(loadLayout());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) saveLayout(widgets);
  }, [widgets, mounted]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setWidgets((prev) => {
        const oldIdx = prev.findIndex((w) => w.id === active.id);
        const newIdx = prev.findIndex((w) => w.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }

  const toggleVisible = useCallback((id: string) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  }, []);

  const SIZES: WidgetSize[] = ["normal", "compact", "full"];
  const cycleSize = useCallback((id: string) => {
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const next = SIZES[(SIZES.indexOf(w.size) + 1) % SIZES.length];
        return { ...w, size: next };
      })
    );
  }, []);

  const toggleWidth = useCallback((id: string) => {
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, width: w.width === "full" ? "half" : "full" } : w
      )
    );
  }, []);

  const resetLayout = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
  }, []);

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="absolute -top-10 right-0 flex items-center gap-2 z-10">
        <button
          onClick={() => setIsEditMode((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all border ${
            isEditMode
              ? "bg-amber/10 border-amber/30 text-amber"
              : "border-[#1E2235] text-muted hover:text-primary hover:border-[#2a2f47]"
          }`}
        >
          {isEditMode ? (
            <><X className="w-3 h-3" /> Done</>
          ) : (
            <><GripVertical className="w-3 h-3" /> Edit Layout</>
          )}
        </button>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="p-1.5 rounded-lg border border-[#1E2235] text-muted hover:text-primary hover:border-[#2a2f47] transition-all"
          title="Widget settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          widgets={widgets}
          onClose={() => setShowSettings(false)}
          onReset={resetLayout}
          onToggleVisible={toggleVisible}
          onCycleSize={cycleSize}
          onToggleWidth={toggleWidth}
        />
      )}

      {/* 2-column widget grid — full widgets span both columns, half spans one */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-6" style={{ gridAutoFlow: "dense" }}>
            {widgets.map((widget) => (
              <SortableWidget
                key={widget.id}
                widget={widget}
                isEditMode={isEditMode}
                onToggleVisible={toggleVisible}
                onCycleSize={cycleSize}
                onToggleWidth={toggleWidth}
              >
                {children[widget.id] ?? null}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
