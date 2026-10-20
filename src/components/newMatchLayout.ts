/** Phone layouts (portrait and landscape) show New match edge to edge; tablets and desktop keep the centred window. */
export function isFullScreenLayout(layout: string): boolean { return layout === 'phone' || layout === 'landscape' }
