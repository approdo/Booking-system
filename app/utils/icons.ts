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
} as const satisfies Record<string, readonly string[]>

export type IconName = keyof typeof ICON_PATHS
