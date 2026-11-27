/* Hand-authored offline lessons using the v2 card + animation kit. */
window.DL_V2_TOPICS = [
{
  id: "water-cycle", emoji: "\uD83D\uDCA7", title: "The Water Cycle", blurb: "The same water has been looping for billions of years.",
  sections: [
    { title: "Round and round", cards: [
      { type: "explain", title: "Water never runs out \u2014 it loops", text: "The sun lifts water up as vapour, it cools into clouds, falls as rain, and flows back to the sea.",
        scene: { kind: "cycle", title: "The water cycle", particle: "\uD83D\uDCA7", items: [
          { label: "Ocean", icon: "\uD83C\uDF0A", color: "blue" }, { label: "Evaporation", icon: "\u2600\uFE0F", color: "yellow" },
          { label: "Clouds", shape: "cloud", color: "gray" }, { label: "Rain", icon: "\uD83C\uDF27\uFE0F", color: "teal" }, { label: "Rivers", icon: "\uD83C\uDFDE\uFE0F", color: "green" } ],
          steps: [ { caption: "Most water sits in the ocean." }, { caption: "Sunshine warms it into invisible vapour." }, { caption: "High up it cools and clumps into clouds." }, { caption: "Heavy drops fall as rain." }, { caption: "Rivers carry it back to the sea \u2014 and repeat!" } ] } },
      { type: "reveal", prompt: "Think of it like\u2026", reveal: "A giant water-park lazy river: the same water keeps going around, it just changes outfits (liquid, gas, ice) along the way." },
      { type: "quiz", q: "What powers evaporation in the water cycle?", choices: ["The Moon", "The Sun's heat", "Wind only", "Fish"], correct: 1, why: "Sunlight heats water so its molecules escape into the air as vapour." }
    ] },
    { title: "Changing outfits", cards: [
      { type: "explain", title: "Liquid to gas", text: "Heat makes water molecules move fast enough to fly off as vapour.",
        scene: { kind: "morph", items: [ { label: "Liquid water", icon: "\uD83D\uDCA7", sub: "Molecules huddle close", color: "blue", value: 20 }, { label: "Water vapour", icon: "\uD83C\uDF2B\uFE0F", sub: "Molecules zoom apart", color: "orange", value: 100 } ],
          steps: [ { caption: "Cool water: molecules slow and close." }, { caption: "Add heat: they speed up\u2026" }, { caption: "\u2026and break free as vapour!" } ] } },
      { type: "match", prompt: "Match each word to what happens", pairs: [
        { term: "Evaporation", meaning: "Liquid water turns into gas" }, { term: "Condensation", meaning: "Gas cools into tiny droplets" },
        { term: "Precipitation", meaning: "Water falls as rain, hail or snow" }, { term: "Runoff", meaning: "Water flows over land into rivers" } ] },
      { type: "quiz", q: "Clouds form mainly because water vapour\u2026", choices: ["heats up", "cools and condenses", "turns into salt", "gets heavier than rock"], correct: 1, why: "Air is colder higher up, so vapour condenses into droplets that make clouds." }
    ] },
    { title: "Where water hides", cards: [
      { type: "explain", title: "Earth's water, by share", text: "Almost all water is salty ocean; fresh water is a tiny slice, mostly frozen.",
        scene: { kind: "bars", unit: "%", unitPos: "after", items: [ { label: "Oceans", icon: "\uD83C\uDF0A", value: 97, color: "blue" }, { label: "Ice", icon: "\uD83E\uDDCA", value: 2, color: "teal" }, { label: "Ground", icon: "\uD83E\uDEA8", value: 0.7, color: "orange" }, { label: "Lakes+rivers", icon: "\uD83C\uDFDE\uFE0F", value: 0.3, color: "green" } ],
          steps: [ { caption: "Oceans hold about 97% of Earth's water." }, { caption: "Ice caps and glaciers lock up about 2%." }, { caption: "Groundwater hides under our feet." }, { caption: "Lakes and rivers are a tiny sliver!" } ] } },
      { type: "swipe", statements: [
        { text: "Most of Earth's water is fresh water.", answer: false, why: "About 97% is salty ocean water." },
        { text: "The water you drink may once have been dinosaur sweat.", answer: true, why: "Water keeps cycling, so it is billions of years old." },
        { text: "Snow is a kind of precipitation.", answer: true, why: "Precipitation is any water falling from clouds." } ] },
      { type: "order", prompt: "Follow one raindrop", steps: [ "Sun warms the ocean", "Vapour rises", "Vapour cools into a cloud", "Drop falls as rain", "River carries it to sea" ] },
      { type: "quiz", q: "Where is most of Earth's fresh water?", choices: ["Rivers", "Ice and glaciers", "Clouds", "Puddles"], correct: 1, why: "Most fresh water is frozen in ice caps and glaciers." }
    ] }
  ],
  boss: [
    { q: "Which step turns vapour back into liquid droplets?", choices: ["Evaporation", "Condensation", "Runoff", "Melting"], correct: 1, why: "Condensation is gas cooling into liquid." },
    { q: "Why does the water cycle never run out of water?", choices: ["New water rains from space", "The same water keeps looping", "Volcanoes make it daily", "It does run out"], correct: 1, why: "Water changes form but stays on Earth, looping endlessly." },
    { q: "About how much of Earth's water is in the oceans?", choices: ["10%", "50%", "75%", "97%"], correct: 3, why: "Roughly 97% is ocean water." },
    { q: "What usually happens right after clouds get heavy with droplets?", choices: ["Precipitation", "Evaporation", "Photosynthesis", "Freezing of oceans"], correct: 0, why: "Big droplets fall as rain, snow or hail \u2014 precipitation." }
  ]
},
{
  id: "compound-interest-animated", emoji: "\uD83D\uDCB0", title: "Money Snowballs", blurb: "Why waiting makes money grow faster and faster.",
  sections: [
    { title: "Interest on interest", cards: [
      { type: "explain", title: "$100 at 10% a year", text: "Each year you earn 10% of everything you have \u2014 including last year's interest.",
        scene: { kind: "bars", unit: "$", items: [ { label: "Start", value: 100, color: "gray" }, { label: "Year 1", value: 110, color: "green" }, { label: "Year 2", value: 121, color: "green" }, { label: "Year 3", value: 133, color: "green" }, { label: "Year 10", value: 259, color: "yellow" } ],
          steps: [ { caption: "You start with $100." }, { caption: "Year 1: +$10 interest." }, { caption: "Year 2: +$11 \u2014 interest on interest!" }, { caption: "Year 3: +$12, growing each year." }, { caption: "By year 10 it's more than doubled." } ] } },
      { type: "reveal", prompt: "Think of it like\u2026", reveal: "A snowball rolling downhill: the bigger it gets, the more snow it grabs each roll." },
      { type: "quiz", q: "$110 earns 10% interest. How much interest is that?", choices: ["$10", "$11", "$1.10", "$21"], correct: 1, why: "10% of $110 is $11 \u2014 more than the first year's $10." }
    ] },
    { title: "Simple vs compound", cards: [
      { type: "explain", title: "After 20 years at 10%", text: "Simple interest only pays on the start amount; compound pays on the growing total.",
        scene: { kind: "morph", items: [ { label: "Simple: $300", icon: "\uD83D\uDCCF", sub: "Same $10 every year", color: "gray", value: 300 }, { label: "Compound: $673", icon: "\uD83D\uDE80", sub: "Interest keeps growing", color: "green", value: 673 } ],
          steps: [ { caption: "Simple interest: $100 + $10 \u00d7 20 years." }, { caption: "Now let interest earn interest\u2026" }, { caption: "Compound ends with more than double!" } ] } },
      { type: "match", prompt: "Match the money words", pairs: [ { term: "Principal", meaning: "The money you start with" }, { term: "Interest", meaning: "Extra money paid for saving" }, { term: "Rate", meaning: "The percent paid each year" }, { term: "Compounding", meaning: "Earning interest on interest" } ] },
      { type: "quiz", q: "Which grows faster over many years?", choices: ["Simple interest", "Compound interest", "They are always equal", "Neither grows"], correct: 1, why: "Compound interest grows on a bigger base every year." }
    ] },
    { title: "Time is the secret", cards: [
      { type: "explain", title: "How compounding feeds itself", text: "Saving early gives the snowball more rolls.",
        scene: { kind: "flow", particle: "\uD83E\uDE99", items: [ { label: "Save money", shape: "coin_single", color: "pink" }, { label: "Earn interest", shape: "clock", color: "green" }, { label: "Add to pile", shape: "coin", color: "blue" }, { label: "Bigger pile", shape: "coin", color: "yellow" } ],
          steps: [ { caption: "Put money in a savings account." }, { caption: "The bank pays you interest." }, { caption: "Leave it in, so it joins the pile." }, { caption: "A bigger pile earns even more next time." } ] } },
      { type: "swipe", statements: [ { text: "Starting to save earlier usually beats saving more later.", answer: true, why: "More years means more rounds of compounding." }, { text: "Compound interest only works for banks, not people.", answer: false, why: "Anyone's savings or investments can compound." }, { text: "Loans can compound against you, too.", answer: true, why: "Unpaid interest on debt can grow the same way." } ] },
      { type: "order", prompt: "Order one year of compounding", steps: [ "Start with your balance", "Bank calculates 10%", "Interest is added", "New, bigger balance" ] },
      { type: "quiz", q: "What makes compounding most powerful?", choices: ["Lots of time", "Checking your balance daily", "Using cash only", "A new piggy bank"], correct: 0, why: "Each extra year adds another round of growth on a bigger total." }
    ] }
  ],
  boss: [
    { q: "$200 at 10% for one year earns\u2026", choices: ["$2", "$10", "$20", "$220"], correct: 2, why: "10% of $200 is $20." },
    { q: "Compound interest means earning interest on\u2026", choices: ["only the start amount", "the start amount plus past interest", "other people's money", "nothing"], correct: 1, why: "That's the snowball effect." },
    { q: "Which saver ends up with more (same rate and amount)?", choices: ["Starts at 20", "Starts at 40", "Same for both", "Whoever checks more"], correct: 0, why: "Starting earlier gives far more years of compounding." },
    { q: "Why can credit card debt get scary fast?", choices: ["Cards expire", "Interest compounds on unpaid interest", "Banks forget", "It can't"], correct: 1, why: "Debt compounds just like savings, but against you." }
  ]
},
{
  id: "vaccines-animated", emoji: "\uD83D\uDC89", title: "How Vaccines Train You", blurb: "A practice drill for your immune system.",
  sections: [
    { title: "The practice drill", cards: [
      { type: "explain", title: "From jab to protection", text: "A vaccine shows your body a harmless 'wanted poster' of a germ so it can practise.",
        scene: { kind: "chain", items: [ { label: "Vaccine shows a safe germ piece", icon: "\uD83D\uDC89", color: "blue" }, { label: "Immune cells spot it", icon: "\uD83D\uDD0E", color: "purple" }, { label: "Body makes antibodies", icon: "\uD83D\uDEE1\uFE0F", color: "green" }, { label: "Memory cells remember it", shape: "book", color: "yellow" } ],
          steps: [ { caption: "The vaccine carries a harmless piece of the germ." }, { caption: "Immune cells notice the stranger." }, { caption: "They build antibodies that fit it exactly." }, { caption: "Memory cells keep the recipe for later." } ] } },
      { type: "reveal", prompt: "Think of it like\u2026", reveal: "A fire drill: everyone practises with no real fire, so when one happens, they know exactly what to do." },
      { type: "quiz", q: "What does a vaccine mainly give your body?", choices: ["A full-strength infection", "A safe preview of a germ", "Extra blood", "Vitamins only"], correct: 1, why: "It's a harmless preview, so your body can practise." }
    ] },
    { title: "The real attack", cards: [
      { type: "explain", title: "Second time, faster", text: "Because the body remembers, it fights the real germ before you get very sick.",
        scene: { kind: "timeline", particle: "\uD83E\uDDA0", items: [ { label: "Vaccine given", icon: "\uD83D\uDC89", sub: "Day 0", color: "blue" }, { label: "Antibodies build", icon: "\uD83D\uDEE1\uFE0F", sub: "Week 2", color: "green" }, { label: "Real germ arrives", icon: "\uD83E\uDDA0", sub: "Months later", color: "red" }, { label: "Quick defeat", icon: "\uD83C\uDFC6", sub: "Days", color: "yellow" } ],
          steps: [ { caption: "Day 0: the vaccine starts the drill." }, { caption: "About two weeks: protection is built." }, { caption: "Later, the real germ shows up\u2026" }, { caption: "\u2026and memory cells crush it fast." } ] } },
      { type: "match", prompt: "Match the immune heroes", pairs: [ { term: "Antigen", meaning: "The germ's tell-tale shape" }, { term: "Antibody", meaning: "A Y-shaped grabber that sticks to germs" }, { term: "Memory cell", meaning: "Remembers a germ for years" } ] },
      { type: "quiz", q: "Why do vaccinated people often get less sick?", choices: ["Germs avoid them", "Their body reacts faster", "They have no blood", "Vaccines are antibiotics"], correct: 1, why: "Memory cells launch a quick, strong response." }
    ] },
    { title: "Protecting everyone", cards: [
      { type: "explain", title: "Herd immunity", text: "When most people are protected, a germ can't hop from person to person.",
        scene: { kind: "flow", particle: "\uD83E\uDDA0", items: [ { label: "Sick person", shape: "person", color: "red" }, { label: "Vaccinated", icon: "\uD83D\uDEE1\uFE0F", color: "green" }, { label: "Vaccinated", icon: "\uD83D\uDEE1\uFE0F", color: "green" }, { label: "Baby kept safe", shape: "person", color: "yellow" } ],
          steps: [ { caption: "A germ tries to spread from a sick person." }, { caption: "It hits a vaccinated person and stalls." }, { caption: "Another protected person blocks it again." }, { caption: "So people who can't get vaccines stay safe." } ] } },
      { type: "swipe", statements: [ { text: "Vaccines contain a full-strength version of the disease.", answer: false, why: "They use weakened, inactive or partial pieces." }, { text: "Vaccines can protect people who aren't vaccinated.", answer: true, why: "Herd immunity stops the germ spreading." }, { text: "Some vaccines need boosters.", answer: true, why: "Boosters refresh the body's memory." } ] },
      { type: "order", prompt: "Order the defence", steps: [ "Vaccine given", "Immune system practises", "Memory cells stored", "Real germ arrives", "Fast defence wins" ] },
      { type: "quiz", q: "Herd immunity works because\u2026", choices: ["germs can't find new hosts", "everyone takes antibiotics", "germs hate crowds", "it's winter"], correct: 0, why: "With many protected people, the germ's chain of spread breaks." }
    ] }
  ],
  boss: [
    { q: "Antibodies are best described as\u2026", choices: ["germ-grabbing proteins", "a type of germ", "vitamins", "blood cells that carry oxygen"], correct: 0, why: "Antibodies latch onto specific germs." },
    { q: "What lets your body remember a germ for years?", choices: ["Red blood cells", "Memory cells", "Bones", "Skin"], correct: 1, why: "Memory immune cells store the recipe." },
    { q: "Why might someone need a booster?", choices: ["To refresh fading memory", "Because the first shot was fake", "To change blood type", "No reason"], correct: 0, why: "Protection can fade; boosters top it up." },
    { q: "A vaccine is most like\u2026", choices: ["a fire drill", "a medicine for a cold", "a bandage", "a vitamin gummy"], correct: 0, why: "It's practice before a real emergency." }
  ]
},
{
  id: "volcano-animated", emoji: "\uD83C\uDF0B", title: "Why Volcanoes Erupt", blurb: "Inside Earth's pressure cooker.",
  sections: [
    { title: "Inside the Earth", cards: [
      { type: "explain", title: "Earth's layers", text: "Earth is built in layers, and super-hot rock deep down can melt into magma.",
        scene: { kind: "stack", items: [ { label: "Inner core", icon: "\uD83D\uDD34", color: "red" }, { label: "Outer core", icon: "\uD83D\uDFE0", color: "orange" }, { label: "Mantle", icon: "\uD83D\uDFE1", color: "yellow" }, { label: "Crust (we live here)", icon: "\uD83C\uDFE0", color: "green" } ],
          steps: [ { caption: "At the centre: a solid, scorching inner core." }, { caption: "Around it: a liquid metal outer core." }, { caption: "Then the thick, slowly flowing mantle." }, { caption: "On top: the thin crust we live on." } ] } },
      { type: "reveal", prompt: "Think of it like\u2026", reveal: "A peach: thin skin (crust), thick juicy flesh (mantle), and a hard stone in the middle (core)." },
      { type: "quiz", q: "Which layer do we live on?", choices: ["Mantle", "Crust", "Outer core", "Inner core"], correct: 1, why: "The crust is Earth's thin outer shell." }
    ] },
    { title: "Pressure builds", cards: [
      { type: "explain", title: "From magma to eruption", text: "Melted rock rises, gas bubbles build pressure, and the volcano blows.",
        scene: { kind: "chain", items: [ { label: "Rock melts into magma", icon: "\uD83D\uDD25", color: "orange" }, { label: "Magma rises (it's lighter)", icon: "\u2B06\uFE0F", color: "yellow" }, { label: "Gas bubbles build pressure", icon: "\uD83E\uDEE7", color: "purple" }, { label: "Eruption!", icon: "\uD83C\uDF0B", color: "red" } ],
          steps: [ { caption: "Deep heat melts rock into magma." }, { caption: "Magma is lighter, so it rises." }, { caption: "Gas bubbles squeeze like a shaken soda." }, { caption: "Pop! Lava, ash and gas burst out." } ] } },
      { type: "match", prompt: "Match the volcano words", pairs: [ { term: "Magma", meaning: "Melted rock underground" }, { term: "Lava", meaning: "Melted rock above ground" }, { term: "Ash", meaning: "Tiny bits of shattered rock" }, { term: "Vent", meaning: "Opening where it all escapes" } ] },
      { type: "quiz", q: "Magma becomes 'lava' when it\u2026", choices: ["cools", "reaches the surface", "turns to gas", "sinks"], correct: 1, why: "Same melted rock, new name above ground." }
    ] },
    { title: "Sticky or runny?", cards: [
      { type: "explain", title: "Two kinds of eruption", text: "Runny lava lets gas escape gently; sticky lava traps gas until it explodes.",
        scene: { kind: "morph", items: [ { label: "Runny lava", icon: "\uD83E\uDED7", sub: "Gas slips out: gentle flows (Hawaii)", color: "orange", value: 25 }, { label: "Sticky lava", icon: "\uD83D\uDCA5", sub: "Gas trapped: explosive blast", color: "red", value: 100 } ],
          steps: [ { caption: "Runny lava: bubbles escape easily." }, { caption: "Make it thick and sticky\u2026" }, { caption: "Trapped gas means a big explosion!" } ] } },
      { type: "swipe", statements: [ { text: "Sticky magma usually makes gentler eruptions.", answer: false, why: "Sticky magma traps gas, so eruptions are more explosive." }, { text: "Volcanic ash can travel thousands of kilometres.", answer: true, why: "Winds carry fine ash very far." }, { text: "Volcanoes also build new land.", answer: true, why: "Hawaii's islands were built by eruptions." } ] },
      { type: "order", prompt: "Order an eruption", steps: [ "Rock melts deep down", "Magma rises", "Gas pressure builds", "Lava bursts out", "Lava cools into new rock" ] },
      { type: "quiz", q: "What makes an eruption explosive?", choices: ["Trapped gas in sticky magma", "Cold weather", "Too much water in lakes", "Earthquakes only"], correct: 0, why: "Gas can't escape thick magma until it bursts." }
    ] }
  ],
  boss: [
    { q: "Earth's thick, slowly flowing layer is the\u2026", choices: ["crust", "mantle", "inner core", "atmosphere"], correct: 1, why: "The mantle flows very slowly, like hot putty." },
    { q: "Why does magma rise?", choices: ["It's lighter than solid rock", "Wind pulls it", "The Moon lifts it", "It doesn't"], correct: 0, why: "Hot melted rock is less dense, so it floats up." },
    { q: "A shaken soda bottle is like\u2026", choices: ["gas pressure in magma", "the crust", "a glacier", "ash clouds"], correct: 0, why: "Dissolved gas wants out \u2014 just like in magma." },
    { q: "Hawaii's gentle eruptions come from\u2026", choices: ["sticky lava", "runny lava", "no lava", "ice"], correct: 1, why: "Runny lava lets gas escape, so it flows gently." }
  ]
}
];
