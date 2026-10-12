// Ready-made mural pictures: tested to give every sheet plenty to color. All free to use
// commercially: the paintings are public domain (the artists died over 100 years ago), the
// photos are CC0 (from Unsplash, via Wikimedia Commons). Files are in public/murals.

export interface MuralPicture {
  id: string;
  title: string;
  /** Who made it, shown under the picture. */
  credit: string;
  /** People's faces are shown in their own colors (paintings of people). */
  faces: boolean;
}

export const MURAL_PICTURES: MuralPicture[] = [
  { id: "christ-the-consolator", title: "Christ the Consolator", credit: "Carl Bloch", faces: true },
  { id: "sermon-on-the-mount", title: "The Sermon on the Mount", credit: "Carl Bloch", faces: true },
  { id: "koi-pond", title: "Koi Pond", credit: "Photo: Frank Green", faces: false },
  { id: "peacock", title: "Peacock", credit: "Photo: Dean Nahum", faces: false },
];

export const muralSrc = (p: MuralPicture) => `/murals/${p.id}.jpg`;
export const muralThumb = (p: MuralPicture) => `/murals/${p.id}-thumb.jpg`;
