/** Images de test partagées par scripts/reference-masks.mjs et scripts/bench/compare-candidates.mjs. */
// Copie de src/ui/home/visuals.ts > EXAMPLE_PATHS et upload-card.ts > EXAMPLES (indices 0..2).
export const REFERENCE_EXAMPLES = [
  {
    name: "person",
    bg: "#ffb27a",
    fg: "#5c3a1e",
    d: "M100 40a28 28 0 1 0 0.01 0Z M60 172c0-33 18-54 40-54s40 21 40 54a4 4 0 0 1-4 4H64a4 4 0 0 1-4-4Z",
  },
  {
    name: "sneaker",
    bg: "#9ad1c8",
    fg: "#17433c",
    d: "M22 150c0-11 8-19 19-23l68-25c15-5 30-4 43 4l27 17c7 4 11 10 11 17v8c0 8-6 14-14 14H36c-8 0-14-6-14-14Z M74 106l16-24 26 9-7 21Z",
  },
  {
    name: "cat",
    bg: "#f2c744",
    fg: "#4a3a06",
    d: "M100 58a46 46 0 1 0 0.01 0Z M62 40l12 28-28-8Z M138 40l-12 28 28-8Z M58 152c0-31 19-50 42-50s42 19 42 50v6H58Z",
  },
];
