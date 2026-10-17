"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSyncExternalStore, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

const noSubscription = () => () => {};

const STRATEGIES = { vertical: verticalListSortingStrategy, horizontal: horizontalListSortingStrategy, grid: rectSortingStrategy };

export type DragHandle = {
  ref: (el: HTMLElement | null) => void;
  style: CSSProperties;
  /** Spread on the drag handle (a button): pointer drag plus Space/arrow keys (dnd-kit's keyboard sensor). */
  handle: HTMLAttributes<HTMLElement>;
  /** Pointer drag only, for items that are links and keep their own role (page tabs). */
  listeners: HTMLAttributes<HTMLElement>;
  dragging: boolean;
};

/**
 * Drag to reorder (SPC-3, PG-3, BLK-3, TODO-3, RM-6), keyboard included. The parent owns the list:
 * onMove gets the old and new index and decides what to save.
 */
export function Sortable<T extends { id: string }>({
  id,
  items,
  strategy = "vertical",
  onMove,
  render,
}: {
  /** Stable id: dnd-kit's describedby ids must match between server and client renders. */
  id: string;
  items: T[];
  strategy?: keyof typeof STRATEGIES;
  onMove: (from: number, to: number) => void;
  render: (item: T, drag: DragHandle) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // dnd-kit's screen-reader announcements go to <body> (inside a list they would be invalid children);
  // inline on the server and the first client render, so hydration matches.
  const announcer = useSyncExternalStore(noSubscription, () => document.body, () => undefined);

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  }

  return (
    <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ container: announcer }}>
      <SortableContext items={items.map((i) => i.id)} strategy={STRATEGIES[strategy]}>
        {items.map((item) => (
          <Item key={item.id} id={item.id}>
            {(drag) => render(item, drag)}
          </Item>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function Item({ id, children }: { id: string; children: (drag: DragHandle) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return children({
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 10 : undefined },
    handle: { ...attributes, ...listeners },
    listeners: { ...listeners },
    dragging: isDragging,
  });
}
