// A faint "PREVIEW" mark repeated across a page shown on screen before it's paid for, so a
// screenshot or a saved picture isn't a page to print. It lies over the picture without
// catching taps (the brush and fixes still work), and prints too. The PDF is never marked.

const TILE = 110;
const svg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}">` +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" transform="rotate(-30 ${TILE / 2} ${TILE / 2})" ` +
    `font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="2" fill="rgb(90,90,90)" fill-opacity="0.3">PREVIEW</text>` +
    `</svg>`,
);

export function Watermark({ tile = TILE }: { tile?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 print:block"
      style={{
        backgroundImage: `url("data:image/svg+xml,${svg}")`,
        backgroundSize: `${tile}px ${tile}px`,
        // Keeps the mark when the page is printed from the browser.
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    />
  );
}

/** Props for what holds a page on screen: no "Save image" menu, no dragging the picture out. */
export const noSaving = {
  onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  onDragStart: (e: { preventDefault: () => void }) => e.preventDefault(),
};
