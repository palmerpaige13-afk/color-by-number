// Ready-made mural pictures: tested to give every sheet plenty to color. All free to use
// commercially: the paintings are public domain (the artists died over 100 years ago), the
// photos are CC0 (from Unsplash, via Wikimedia Commons) or public domain (the temples). Files
// are in public/murals, 2000 px on the long side. The sunflower field's tiny white sun is
// tinted the yellow of its glow (white, it came out a teal dot).

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
  { id: "good-shepherd", title: "The Good Shepherd", credit: "Bernhard Plockhorst", faces: true },
  { id: "laie-hawaii-temple", title: "Laie Hawaii Temple", credit: "Photo: Gh5046", faces: false },
  { id: "washington-dc-temple", title: "Washington D.C. Temple", credit: "Photo: Carol M. Highsmith", faces: false },
  { id: "koi-pond", title: "Koi Pond", credit: "Photo: Frank Green", faces: false },
  { id: "peacock", title: "Peacock", credit: "Photo: Dean Nahum", faces: false },
  { id: "sea-turtle", title: "Sea Turtle", credit: "Photo: Jeremy Bishop", faces: false },
  { id: "barn-owl", title: "Barn Owl", credit: "Photo: Andy Chilton", faces: false },
  { id: "macaw", title: "Macaw", credit: "Photo: Christopher Kuszajewski", faces: false },
  { id: "tulip-field", title: "Tulip Field", credit: "Photo: Filio", faces: false },
  { id: "monet-tulip-fields", title: "Tulip Fields in Holland", credit: "Claude Monet", faces: false },
  { id: "sunflower-field", title: "Sunflower Field at Sunset", credit: "Photo: Summer Stock", faces: false },
  { id: "autumn-waterfall", title: "Autumn Waterfall", credit: "Photo: Scott Webb", faces: false },
];

export const muralSrc = (p: MuralPicture) => `/murals/${p.id}.jpg`;
export const muralThumb = (p: MuralPicture) => `/murals/${p.id}-thumb.jpg`;
