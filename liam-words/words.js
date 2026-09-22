/* Liam Words — vocabulary. Auslan tips are parent guidance only. */
(function (g) {
  "use strict";
  const SIGNBANK_SEARCH = "https://auslan.org.au/dictionary/search/?query=";
  const WORDS = [
    {
      id: "mummy",
      label: "mummy",
      speak: "mummy",
      chunks: ["MUM", "mee"],
      auslanTip:
        "Family signs for mummy often use a handshape near the chin or cheek. Confirm the exact Auslan form on Signbank before treating any tip as correct.",
    },
    {
      id: "daddy",
      label: "daddy",
      speak: "daddy",
      chunks: ["DAD", "dee"],
      auslanTip:
        "Family signs for daddy often use a handshape near the forehead or temple. Check Signbank for the preferred Auslan entry and dialect.",
    },
    {
      id: "milk",
      label: "milk",
      speak: "milk",
      chunks: ["mm", "ilk"],
      auslanTip:
        "Parents often look for a fist-squeezing motion (like milking). Use Signbank video to confirm handshape, location, and movement.",
    },
    {
      id: "more",
      label: "more",
      speak: "more",
      chunks: ["maw"],
      auslanTip:
        "A common tip is fingertips of both hands tapping together. Always match Liam’s therapists’ preferred form via Signbank.",
    },
    {
      id: "ball",
      label: "ball",
      speak: "ball",
      chunks: ["baw", "l"],
      auslanTip:
        "Parents often outline a round shape with cupped hands. Confirm the Signbank entry — shapes can vary by dialect.",
    },
    {
      id: "dog",
      label: "dog",
      speak: "dog",
      chunks: ["dog"],
      auslanTip:
        "Look up ‘dog’ on Signbank — some signs use a pat or finger action. Follow the video, not this placeholder tip.",
    },
    {
      id: "water",
      label: "water",
      speak: "water",
      chunks: ["WAW", "ter"],
      auslanTip:
        "A frequent tip is a W-ish handshape near the mouth. Verify on Signbank; never invent a sign from text alone.",
    },
    {
      id: "bye",
      label: "bye",
      speak: "bye",
      chunks: ["bye"],
      auslanTip:
        "Waving is a natural goodbye gesture — still check Signbank for the Auslan goodbye / bye entries used in therapy.",
    },
    {
      id: "eat",
      label: "eat",
      speak: "eat",
      chunks: ["eet"],
      auslanTip:
        "Parents often bring fingertips toward the mouth. Confirm with Signbank and Liam’s speech / Auslan team.",
    },
    {
      id: "book",
      label: "book",
      speak: "book",
      chunks: ["book"],
      auslanTip:
        "A common tip is palms together then opening like a book. Match the Signbank video exactly.",
    },
    {
      id: "car",
      label: "car",
      speak: "car",
      chunks: ["kar"],
      auslanTip:
        "Steering-wheel style movements appear in many parent tips. Confirm the official Auslan form on Signbank.",
    },
    {
      id: "sleep",
      label: "sleep",
      speak: "sleep",
      chunks: ["sleep"],
      auslanTip:
        "Look for a sign near the face / eyes on Signbank. Use the video with Liam rather than memorising this tip.",
    },
  ];
  g.LIAM_WORDS = { SIGNBANK_SEARCH, WORDS };
})(window);
