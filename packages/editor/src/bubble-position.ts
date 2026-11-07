export interface Box {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/**
 * Where to put the floating toolbar, in the coordinates of its positioned container. It goes above the selection, flips
 * below when there is no room above, and is clamped so it never leaves the container horizontally.
 */
export function placeBubble(selection: Box, container: Box, size: { width: number; height: number }, gap = 6): { top: number; left: number } {
  const above = selection.top - container.top - size.height - gap;
  const top = above >= 0 ? above : selection.bottom - container.top + gap;
  const room = container.right - container.left - size.width;
  const left = Math.min(Math.max(0, selection.left - container.left), Math.max(0, room));
  return { top, left };
}
