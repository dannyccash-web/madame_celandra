// Madame Celandra — custom 35-card deck
//
// Card definitions are the seeker's own deck (not the Rider-Waite-Smith).
// Upright + inverted phrasing is condensed from the deck's own
// definitions document so the model has a tight classical-meaning seed
// to weave each per-card reading from. Illustrations are local PNGs in
// the "tarot card illustrations/" folder — same-origin, so the PDF
// export can rotate inverted draws without CORS pain.

const IMG_BASE = "tarot card illustrations/";

const TAROT_DECK = [
  { name: "Death",          img: IMG_BASE + "death.png",
    upright:  "necessary endings, transformation through surrender, the clearing of what can no longer continue",
    reversed: "resistance to change, clinging to the past, stagnation that should have been released long ago" },

  { name: "Life",           img: IMG_BASE + "life.png",
    upright:  "vitality, renewal, emergence, the return of energy and the filling of empty space",
    reversed: "blocked growth, exhaustion, a vital force drained by the wrong circumstances" },

  { name: "Destruction",    img: IMG_BASE + "destruction.png",
    upright:  "the collapse of false structures, sudden upheaval, liberating revelation",
    reversed: "delayed reckoning, suppressed chaos, inner destruction or self-sabotage" },

  { name: "Creation",       img: IMG_BASE + "creation.png",
    upright:  "manifestation, invention, imagination joined to action, the divine spark made real",
    reversed: "creative blockage, perfectionism, unfinished ideas, careless making without intention" },

  { name: "Abundance",      img: IMG_BASE + "abundance.png",
    upright:  "prosperity, fullness, gratitude, a harvest after effort",
    reversed: "greed, scarcity-thinking despite plenty, surface plenty without true nourishment" },

  { name: "Scarcity",       img: IMG_BASE + "scarcity.png",
    upright:  "lack, insecurity, the belief that there is not enough, the call to seek help rather than suffer alone",
    reversed: "release from lack, recovery from hardship, scarcity revealed as an inner story rather than the truth" },

  { name: "Nourishment",    img: IMG_BASE + "nourishment.png",
    upright:  "care, sustenance, the environments and routines that allow growth",
    reversed: "neglect, depletion, surviving without truly being fed in body or spirit" },

  { name: "Famine",         img: IMG_BASE + "famine.png",
    upright:  "deprivation, lean seasons, the deeper hunger for meaning beneath ordinary lack",
    reversed: "the end of deprivation, first signs of relief, or denial of true need" },

  { name: "Fortitude",      img: IMG_BASE + "fortitude.png",
    upright:  "composed strength, moral courage, steady endurance under pressure",
    reversed: "burnout, force masquerading as strength, the need to rest or ask for help" },

  { name: "Frailty",        img: IMG_BASE + "frailty.png",
    upright:  "vulnerability, tenderness, the honest delicate parts of a life that ask for gentleness",
    reversed: "denial of vulnerability, shame around weakness, or overexposure to those who haven't earned trust" },

  { name: "The Sun",        img: IMG_BASE + "the_sun.png",
    upright:  "joy, illumination, confidence, triumph, the freedom of no longer hiding",
    reversed: "diminished joy, clouded confidence, success delayed or unfelt" },

  { name: "The Moon",       img: IMG_BASE + "the_moon.png",
    upright:  "mystery, intuition, dreams, the unconscious speaking through what isn't yet visible",
    reversed: "confusion lifting and secrets revealed, or a deeper illusion mistaken for instinct" },

  { name: "The Stars",      img: IMG_BASE + "the_stars.png",
    upright:  "hope, healing, faith, orientation after darkness, a long-term dream worth following",
    reversed: "loss of faith, disconnection from purpose, hopelessness obscuring the guidance still present" },

  { name: "The Castle",     img: IMG_BASE + "the_castle.png",
    upright:  "security, legacy, established power, achievement built over time",
    reversed: "isolation, defensiveness, walls that once protected now preventing growth" },

  { name: "Fire",           img: IMG_BASE + "fire.png",
    upright:  "passion, will, ignition, the spark that begins movement",
    reversed: "burnout, recklessness, anger, a flame too wild or too weak to act on cleanly" },

  { name: "Ice",            img: IMG_BASE + "ice.png",
    upright:  "stillness, restraint, preservation, the wisdom of waiting",
    reversed: "coldness, repression, emotional shutdown, or old defenses beginning to thaw" },

  { name: "Water",          img: IMG_BASE + "water.png",
    upright:  "feeling, intuition, healing, adaptability, moving with life rather than against it",
    reversed: "emotional overwhelm, blocked feelings, or moods flooding the situation" },

  { name: "Air",            img: IMG_BASE + "air.png",
    upright:  "thought, communication, perspective, the clarity of seeing from above",
    reversed: "overthinking, harsh words, gossip, intellect detached from heart and body" },

  { name: "Earth",          img: IMG_BASE + "earth.png",
    upright:  "grounding, patience, body, slow growth, practical work that lasts",
    reversed: "instability, neglect of the body, stubbornness, or the need to return from fantasy to real steps" },

  { name: "The Emperor",    img: IMG_BASE + "the_emperor.png",
    upright:  "authority, structure, discipline, the keeper of order and protector of what's been built",
    reversed: "tyranny, rigidity, weak leadership, or rebellion against necessary order" },

  { name: "The Empress",    img: IMG_BASE + "the_empress.png",
    upright:  "fertility, beauty, sensuality, nurturing care, growth made visible",
    reversed: "smothering care, vanity, dependency, or disconnection from the body and its pleasures" },

  { name: "The Wizard",     img: IMG_BASE + "the_wizard.png",
    upright:  "skill, mastery, focus, the ability to shape reality through will and applied knowledge",
    reversed: "wasted talent, manipulation, scattered focus, or power present but disbelieved" },

  { name: "The Witch",      img: IMG_BASE + "the_witch.png",
    upright:  "instinctive knowledge, folk wisdom, healing, the courage of the outsider trusting what cannot be proven",
    reversed: "fear of one's own power, exile, secrecy, or intuition without grounding" },

  { name: "The Knight",     img: IMG_BASE + "the_knight.png",
    upright:  "quest, loyalty, bravery, dedicated action in service of a cause",
    reversed: "impulsiveness, recklessness, misplaced loyalty, or hesitation to begin a known journey" },

  { name: "The Jester",     img: IMG_BASE + "the_jester.png",
    upright:  "the sacred fool, leaps of faith, freedom, the courage to risk looking foolish",
    reversed: "foolish choices, immaturity, denial, or fear of embarrassment that prevents growth" },

  { name: "The Dragon",     img: IMG_BASE + "the_dragon.png",
    upright:  "primal power, guarded treasure, transformation through facing what is fierce and untamed",
    reversed: "rule by fear or greed, possessiveness, or treasure unreachable because the guardian has not been faced" },

  { name: "The Sword",      img: IMG_BASE + "the_sword.png",
    upright:  "truth, decisive clarity, severance, the cutting of illusion through honest words",
    reversed: "cruelty, indecision, lies, or truths avoided because they would demand painful action" },

  { name: "The Staff",      img: IMG_BASE + "the_staff.png",
    upright:  "support, rightful authority, guidance, both walking stick and channel of spiritual power",
    reversed: "lack of support, misused authority, leaning too heavily on outside validation" },

  { name: "The Unknown",    img: IMG_BASE + "the_unknown.png",
    upright:  "mystery, fate not yet revealed, the call to humility and willingness to proceed without certainty",
    reversed: "fear of uncertainty, obsession with control, or hidden things just beginning to take shape" },

  { name: "The Deity",      img: IMG_BASE + "the_deity.png",
    upright:  "divine will, transcendence, alignment with a higher pattern or sacred calling",
    reversed: "spiritual arrogance, false idols, loss of faith, or personal desire mistaken for divine will" },

  { name: "The Wolf",       img: IMG_BASE + "the_wolf.png",
    upright:  "instinct, loyalty, the call of the wild self, hunger for what truly sustains",
    reversed: "isolation, mistrust, predatory hunger, or remaining loyal to a pack that no longer protects" },

  { name: "The Snake",      img: IMG_BASE + "the_snake.png",
    upright:  "transformation, shedding old skin, hidden knowledge, healing through patient secrecy",
    reversed: "deception, poison, manipulation, or refusal to shed an old identity that has gone toxic" },

  { name: "The Hawk",       img: IMG_BASE + "the_hawk.png",
    upright:  "vision, focus, precision, the higher perspective that sees patterns beneath emotional noise",
    reversed: "tunnel vision, arrogance, missed signals, or acting before truly seeing" },

  { name: "The Mountain",   img: IMG_BASE + "the_mountain.png",
    upright:  "obstacle, endurance, ambition, the long meaningful climb that cannot be rushed",
    reversed: "feeling blocked, intimidated, or stuck — perhaps needing another route rather than direct conquest" },

  { name: "Time",           img: IMG_BASE + "time.png",
    upright:  "cycles, patience, fate unfolding, the importance of moving in step with a larger rhythm",
    reversed: "impatience, delay, regret, or trying to force a result before it is ready" }
];

// Expose globally for the browser
window.TAROT_DECK = TAROT_DECK;
