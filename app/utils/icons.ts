/**
 * Line icons drawn for this design (spec section 3): 24 × 24, stroke 1.8, round ends. The paths are those
 * of the mockup's <symbol>s (the designer's own drawing, not an icon library); circles and rectangles are
 * written as paths. <UiIcon name="..."> draws them.
 */
const CIRCLE = 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0z'

export const ICON_PATHS = {
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  left: ['M15 5l-7 7 7 7'],
  right: ['M9 5l7 7-7 7'],
  alert: ['M12 3.5L2.5 20h19L12 3.5z', 'M12 10v4.5M12 17.3v.2'],
  err: [CIRCLE, 'M12 7.5v5.5M12 16.3v.2'],
  info: [CIRCLE, 'M12 11v5.5M12 7.7v.2'],
  any: ['M12 3l1.9 4.8L18.7 9.7l-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9z', 'M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z'],
  copy: [
    'M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
    'M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8',
  ],
  // The back office (spec section 7): tabs, sign out, search, add.
  list: ['M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01'],
  tag: ['M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z', 'M10 8.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0z'],
  set: ['M4 7h10M18 7h2M4 17h4M12 17h8', 'M18 7a2 2 0 1 1-4 0a2 2 0 1 1 4 0z', 'M12 17a2 2 0 1 1-4 0a2 2 0 1 1 4 0z'],
  out: ['M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14', 'M10 8l-4 4 4 4M6 12h10'],
  search: ['M17.5 11a6.5 6.5 0 1 1-13 0a6.5 6.5 0 1 1 13 0z', 'M16 16l4.5 4.5'],
  plus: ['M12 5v14M5 12h14'],
  // The chevron of a select (spec section 3, Field).
  down: ['M6 9l6 6 6-6'],
  close: ['M6 6l12 12M18 6L6 18'],
} as const satisfies Record<string, readonly string[]>

export type IconName = keyof typeof ICON_PATHS
