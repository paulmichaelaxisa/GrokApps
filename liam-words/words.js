/* Liam Words — vocabulary. Auslan: Signbank videos only (no invented tips). */
(function (g) {
  "use strict";
  const SIGNBANK_SEARCH = "https://auslan.org.au/dictionary/search/?query=";
  const WORDS = [
    {
      id: "mummy",
      label: "mummy",
      speak: "mummy",
      chunks: ["MUM", "mee"],
      signbankUrl: "https://auslan.org.au/dictionary/words/mummy-1.html",
    },
    {
      id: "daddy",
      label: "daddy",
      speak: "daddy",
      chunks: ["DAD", "dee"],
      signbankUrl: "https://auslan.org.au/dictionary/words/daddy-1.html",
    },
    {
      id: "milk",
      label: "milk",
      speak: "milk",
      chunks: ["mm", "ilk"],
      signbankUrl: "https://auslan.org.au/dictionary/words/milk-1.html",
    },
    {
      id: "more",
      label: "more",
      speak: "more",
      chunks: ["maw"],
      signbankUrl: "https://auslan.org.au/dictionary/words/more-1.html",
    },
    {
      id: "ball",
      label: "ball",
      speak: "ball",
      chunks: ["baw", "l"],
      signbankUrl: "https://auslan.org.au/dictionary/words/ball-1.html",
    },
    {
      id: "dog",
      label: "dog",
      speak: "dog",
      chunks: ["dog"],
      signbankUrl: "https://auslan.org.au/dictionary/words/dog-1.html",
    },
    {
      id: "water",
      label: "water",
      speak: "water",
      chunks: ["WAW", "ter"],
      signbankUrl: "https://auslan.org.au/dictionary/words/water-1.html",
    },
    {
      id: "bye",
      label: "bye",
      speak: "bye",
      chunks: ["bye"],
      signbankUrl: "https://auslan.org.au/dictionary/words/bye-1.html",
    },
    {
      id: "eat",
      label: "eat",
      speak: "eat",
      chunks: ["eet"],
      signbankUrl: "https://auslan.org.au/dictionary/words/eat-2.html",
    },
    {
      id: "book",
      label: "book",
      speak: "book",
      chunks: ["book"],
      signbankUrl: "https://auslan.org.au/dictionary/words/book-1.html",
    },
    {
      id: "car",
      label: "car",
      speak: "car",
      chunks: ["kar"],
      signbankUrl: "https://auslan.org.au/dictionary/words/car-1.html",
    },
    {
      id: "sleep",
      label: "sleep",
      speak: "sleep",
      chunks: ["sleep"],
      signbankUrl: "https://auslan.org.au/dictionary/words/sleep-2.html",
    },
  ];
  g.LIAM_WORDS = { SIGNBANK_SEARCH, WORDS };
})(window);
