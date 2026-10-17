// Shared bee drawing. Builds the bee SVG from a "skin" (colors + accessories).
// Loaded before content.js on pages and before popup.js in the popup.
(() => {
  if (globalThis.BuzzyBeeArt) return;

  const OUTLINE = "#3b2a14";

  const DEFAULT_SKIN = {
    body: "#ffd23f",
    stripes: "#3b2a14",
    antenna: "#3b2a14",
    wings: "#e3f6ff",
    wingStyle: "classic",
    pattern: "stripes",
    hat: "none",
    hatColor: "#3b2a14",
    glasses: "none",
    outfit: "none",
    outfitColor: "#e63946",
  };

  const OPTIONS = {
    wingStyle: [["classic", "Classic"], ["round", "Round"], ["long", "Long"], ["heart", "Heart"]],
    pattern: [["stripes", "Stripes"], ["thin", "Thin stripes"], ["dots", "Polka dots"], ["none", "Plain"]],
    hat: [["none", "None"], ["tophat", "Top hat"], ["cap", "Cap"], ["beanie", "Beanie"], ["party", "Party hat"], ["crown", "Crown"], ["flower", "Flower"]],
    glasses: [["none", "None"], ["specs", "Specs"], ["shades", "Sunglasses"], ["hearts", "Heart shades"], ["monocle", "Monocle"]],
    outfit: [["none", "None"], ["coat", "Coat"], ["scarf", "Scarf"], ["bowtie", "Bow tie"], ["cape", "Cape"]],
  };

  const PRESETS = [
    { id: "classic", name: "Classic", skin: {} },
    { id: "bumble", name: "Bumble", skin: { body: "#ffa62b", stripes: "#1d1d1d", antenna: "#1d1d1d", pattern: "thin" } },
    { id: "gentleman", name: "Gentleman", skin: { hat: "tophat", hatColor: "#2b2b2b", glasses: "specs", outfit: "coat", outfitColor: "#3d405b" } },
    { id: "bubblegum", name: "Bubblegum", skin: { body: "#ffb3d1", stripes: "#ff5fa2", antenna: "#ff5fa2", wings: "#fff0f7", wingStyle: "heart", glasses: "hearts", outfit: "bowtie", outfitColor: "#ff5fa2" } },
    { id: "midnight", name: "Midnight", skin: { body: "#8b7cf8", stripes: "#2b2363", antenna: "#ffd23f", wings: "#d9d4ff", wingStyle: "long", glasses: "shades", outfit: "scarf", outfitColor: "#ffd23f" } },
    { id: "mint", name: "Mint", skin: { body: "#9ef0c8", stripes: "#1f7a5a", antenna: "#1f7a5a", wings: "#e8fff6", wingStyle: "round", pattern: "dots", hat: "cap", hatColor: "#1f7a5a" } },
    { id: "royal", name: "Royal", skin: { stripes: "#5b2a86", antenna: "#e63946", hat: "crown", hatColor: "#e63946", glasses: "monocle", outfit: "cape", outfitColor: "#c1121f" } },
    { id: "party", name: "Party", skin: { body: "#ffe066", stripes: "#3a86ff", antenna: "#ff006e", hat: "party", hatColor: "#ff006e", outfit: "bowtie", outfitColor: "#3a86ff" } },
    { id: "winter", name: "Winter", skin: { body: "#ffd23f", stripes: "#264653", antenna: "#264653", wings: "#eaf4ff", hat: "beanie", hatColor: "#e63946", outfit: "scarf", outfitColor: "#e63946" } },
  ];

  const isColor = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

  // Fill in defaults and drop anything invalid (the skin ends up inside SVG markup).
  function normalize(skin) {
    const out = { ...DEFAULT_SKIN };
    for (const [k, def] of Object.entries(DEFAULT_SKIN)) {
      const v = skin?.[k];
      if (OPTIONS[k] ? OPTIONS[k].some(([id]) => id === v) : isColor(def) && isColor(v)) out[k] = v;
    }
    return out;
  }

  // lighten (amt > 0) or darken (amt < 0) a hex color
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) =>
      Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)
    );
    return "#" + ch.map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  function wingShape(style, cx, cy, angle, scale, fill, opacity) {
    const common = `fill="${fill}" fill-opacity="${opacity}" stroke="${OUTLINE}" stroke-width="3"`;
    const t = `transform="translate(${cx} ${cy}) rotate(${angle}) scale(${scale})"`;
    switch (style) {
      case "round":
        return `<ellipse ${t} rx="22" ry="22" ${common}/>`;
      case "long":
        return `<ellipse ${t} rx="12" ry="34" ${common}/>`;
      case "heart":
        return `<path ${t} d="M0 24 C-34 2 -22 -30 0 -12 C22 -30 34 2 0 24 Z" ${common} vector-effect="non-scaling-stroke"/>`;
      default:
        return `<ellipse ${t} rx="17" ry="26" ${common}/>`;
    }
  }

  function pattern(kind, color) {
    switch (kind) {
      case "thin":
        return [34, 50, 66].map((x) => `<rect x="${x}" y="30" width="6" height="72" rx="3"/>`).join("");
      case "dots":
        return [[40, 56, 5], [52, 80, 5], [60, 50, 4], [70, 70, 5], [36, 76, 4], [80, 54, 4]]
          .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");
      case "none":
        return "";
      default:
        return `<rect x="38" y="30" width="11" height="72" rx="4"/><rect x="60" y="30" width="11" height="72" rx="4"/>`;
    }
  }

  function hat(kind, color) {
    const s = `stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"`;
    switch (kind) {
      case "tophat":
        return `<g transform="rotate(-8 106 34)">
          <rect x="93" y="4" width="26" height="30" rx="3" fill="${color}" ${s}/>
          <rect x="94.5" y="25" width="23" height="6" fill="#e63946"/>
          <ellipse cx="106" cy="34" rx="22" ry="5" fill="${color}" ${s}/></g>`;
      case "cap":
        return `<g transform="rotate(-6 106 34)">
          <path d="M84 42 Q84 16 106 16 Q128 16 128 40 Z" fill="${color}" ${s}/>
          <path d="M122 36 Q142 32 149 41 Q136 46 121 43 Z" fill="${shade(color, -0.2)}" ${s}/>
          <circle cx="106" cy="16" r="3" fill="${shade(color, -0.2)}" ${s} stroke-width="2"/></g>`;
      case "beanie":
        return `<g transform="rotate(-6 106 34)">
          <path d="M84 42 Q84 12 106 12 Q128 12 128 42 Z" fill="${color}" ${s}/>
          <path d="M96 16 V38 M106 13 V38 M116 16 V38" stroke="${shade(color, -0.2)}" stroke-width="2"/>
          <rect x="81" y="35" width="50" height="11" rx="5.5" fill="${shade(color, 0.35)}" ${s}/>
          <circle cx="106" cy="9" r="6.5" fill="#fffaf0" ${s} stroke-width="2.5"/></g>`;
      case "party":
        return `<g transform="rotate(14 108 40)">
          <path d="M92 40 L108 0 L124 40 Z" fill="${color}" ${s}/>
          <circle cx="103" cy="30" r="2.5" fill="#fff"/><circle cx="113" cy="22" r="2.5" fill="#ffd23f"/>
          <circle cx="108" cy="12" r="2" fill="#fff"/><circle cx="116" cy="34" r="2" fill="#3a86ff"/>
          <circle cx="108" cy="0" r="5" fill="#fffaf0" ${s} stroke-width="2.5"/></g>`;
      case "crown":
        return `<g transform="rotate(-8 106 34)">
          <path d="M88 40 L88 16 L97 28 L106 10 L115 28 L124 16 L124 40 Z" fill="#ffcc33" ${s}/>
          <circle cx="97" cy="34" r="3" fill="${color}"/><circle cx="106" cy="33" r="3.5" fill="${color}"/>
          <circle cx="115" cy="34" r="3" fill="${color}"/></g>`;
      case "flower":
        return `<g transform="translate(94 38)">
          ${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="5.5" ry="8" cy="-8" transform="rotate(${a})" fill="${color}" stroke="${OUTLINE}" stroke-width="2"/>`).join("")}
          <circle r="5" fill="#fff3b0" stroke="${OUTLINE}" stroke-width="2"/></g>`;
      default:
        return "";
    }
  }

  function glasses(kind) {
    const arm = `<path d="M101 49 L86 46" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`;
    switch (kind) {
      case "specs":
        return `${arm}<circle cx="114" cy="52" r="12" fill="#fff" fill-opacity="0.15" stroke="${OUTLINE}" stroke-width="3"/>
          <path d="M126 50 L130 48" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`;
      case "shades":
        return `${arm}<rect x="100" y="43" width="28" height="17" rx="7" fill="#1d1d1d" stroke="${OUTLINE}" stroke-width="2.5"/>
          <path d="M106 47 L111 47" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>`;
      case "hearts":
        return `${arm}<path transform="translate(114 51)" d="M0 11 C-17 1 -12 -15 0 -6 C12 -15 17 1 0 11 Z" fill="#ff4d8d" stroke="${OUTLINE}" stroke-width="2.5"/>
          <path d="M106 47 Q108 44 111 45" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.8"/>`;
      case "monocle":
        return `<circle cx="113" cy="52" r="12" fill="#fff" fill-opacity="0.15" stroke="#c9a227" stroke-width="3"/>
          <path d="M108 63 Q100 80 92 84" stroke="#c9a227" stroke-width="1.5" fill="none"/>`;
      default:
        return "";
    }
  }

  // outfit pieces drawn behind the body (cape), on the body (coat), or over the neck (scarf, bow tie)
  function outfitBehind(kind, color) {
    if (kind !== "cape") return "";
    return `<path d="M90 44 C62 26 30 36 12 58 C22 64 22 80 16 98 C46 86 70 88 92 72 Z"
      fill="${color}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M84 50 C60 40 38 46 24 60" stroke="${shade(color, -0.25)}" stroke-width="2.5" fill="none"/>`;
  }

  function outfitOnBody(kind, color) {
    if (kind !== "coat") return "";
    return `<path d="M58 30 Q48 66 58 102 L110 102 L110 30 Z" fill="${color}"/>
      <path d="M58 30 Q48 66 58 102" stroke="${OUTLINE}" stroke-width="2.5" fill="none"/>
      <path d="M80 40 L66 66 L82 60 Z" fill="${shade(color, 0.25)}" stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M58 82 Q66 80 72 84" stroke="${shade(color, -0.3)}" stroke-width="2" fill="none"/>
      <circle cx="66" cy="74" r="2.8" fill="#ffcc33" stroke="${OUTLINE}" stroke-width="1.5"/>
      <circle cx="68" cy="88" r="2.8" fill="#ffcc33" stroke="${OUTLINE}" stroke-width="1.5"/>`;
  }

  function outfitOverNeck(kind, color) {
    const s = `stroke="${OUTLINE}" stroke-width="2.5" stroke-linejoin="round"`;
    switch (kind) {
      case "scarf":
        return `<path d="M84 74 L76 98 L86 97 L91 78 Z" fill="${shade(color, -0.12)}" ${s}/>
          <path d="M80 58 Q90 56 98 68 Q100 78 94 84 Q84 86 79 78 Q83 68 80 58 Z" fill="${color}" ${s}/>
          <path d="M84 62 Q90 68 90 80" stroke="${shade(color, 0.4)}" stroke-width="2.5" fill="none"/>`;
      case "bowtie":
        return `<path d="M97 82 L85 74 L85 90 Z" fill="${color}" ${s}/>
          <path d="M97 82 L109 74 L109 90 Z" fill="${color}" ${s}/>
          <circle cx="97" cy="82" r="3.5" fill="${shade(color, -0.2)}" ${s} stroke-width="2"/>`;
      default:
        return "";
    }
  }

  // ---- random looks ----

  // small seeded PRNG (mulberry32): the same seed gives the same bees in every tab
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const BODY_COLORS = ["#ffd23f", "#ffa62b", "#ffb3d1", "#9ef0c8", "#8b7cf8", "#7ad3ff", "#ffe066", "#ff8c69", "#c3f584", "#f4f1de"];
  const DARK_COLORS = ["#3b2a14", "#1d1d1d", "#2b2363", "#1f7a5a", "#5b2a86", "#264653", "#c1121f", "#3a86ff"];
  const BRIGHT_COLORS = ["#e63946", "#ff006e", "#3a86ff", "#2ecc71", "#ffcc33", "#8338ec", "#fb8500", "#2b2b2b", "#3d405b", "#ff5fa2"];
  const WING_COLORS = ["#e3f6ff", "#fff0f7", "#e8fff6", "#d9d4ff", "#fff7d6", "#eaf4ff"];

  function randomSkin(seed, index) {
    const r = rng(Math.imul(seed | 0, 31) + index * 7919 + 1);
    const pick = (list) => list[Math.floor(r() * list.length)];
    const option = (key) => pick(OPTIONS[key])[0];
    return normalize({
      body: pick(BODY_COLORS),
      stripes: pick(DARK_COLORS),
      antenna: pick([...DARK_COLORS, ...BRIGHT_COLORS]),
      wings: pick(WING_COLORS),
      wingStyle: option("wingStyle"),
      pattern: option("pattern"),
      hat: option("hat"),
      hatColor: pick(BRIGHT_COLORS),
      glasses: option("glasses"),
      outfit: option("outfit"),
      outfitColor: pick(BRIGHT_COLORS),
    });
  }

  const MAX_BEES = 7;

  // the look of bee number `index`, given the saved settings
  function skinForBee(index, { skin, randomOutfits, randomSeed }) {
    return randomOutfits ? randomSkin(randomSeed || 1, index) : normalize(skin);
  }

  // width: rendered px width; uid: unique per SVG on the same page (clip-path ids)
  function svg(skinIn, { width = 110, uid = "bee" } = {}) {
    const k = normalize(skinIn);
    const clip = `buzzy-clip-${uid}`;
    const height = (width * 110) / 140;
    const shine = k.wingStyle === "classic" || k.wingStyle === "long";
    const wingScale = k.wingStyle === "heart" ? 0.8 : 1;

    return `<svg class="bee-svg" viewBox="0 0 140 110" width="${width}" height="${height}" aria-hidden="true">
  <defs><clipPath id="${clip}"><ellipse cx="62" cy="66" rx="36" ry="28"/></clipPath></defs>

  <g class="wing wing-back">${wingShape(k.wingStyle, 58, 22, -28, wingScale, shade(k.wings, -0.08), 0.75)}</g>

  ${outfitBehind(k.outfit, k.outfitColor)}

  <path d="M28 64 L10 70 L28 76 Z" fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>

  <g stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round" fill="none">
    <path class="leg leg-1" d="M50 92 q-2 8 -7 10"/>
    <path class="leg leg-2" d="M66 93 q0 8 -4 11"/>
    <path class="leg leg-3" d="M80 90 q2 8 -1 12"/>
  </g>

  <ellipse cx="62" cy="66" rx="36" ry="28" fill="${k.body}"/>
  <g clip-path="url(#${clip})" fill="${k.stripes}">
    ${pattern(k.pattern)}
    ${outfitOnBody(k.outfit, k.outfitColor)}
  </g>
  <ellipse cx="60" cy="54" rx="20" ry="7" fill="#fff" fill-opacity="0.35"/>
  <ellipse cx="62" cy="66" rx="36" ry="28" fill="none" stroke="${OUTLINE}" stroke-width="3.5"/>

  <circle cx="106" cy="58" r="24" fill="${k.body}" stroke="${OUTLINE}" stroke-width="3.5"/>

  <g class="eye">
    <ellipse cx="113" cy="52" rx="8" ry="10" fill="#fff" stroke="${OUTLINE}" stroke-width="2.5"/>
    <ellipse cx="115" cy="54" rx="5" ry="6.5" fill="#1d140a"/>
    <circle cx="117" cy="51" r="2" fill="#fff"/>
  </g>
  <ellipse class="eyelid" cx="113" cy="52" rx="8.5" ry="10.5" fill="${k.body}" stroke="${OUTLINE}" stroke-width="2.5"/>

  <ellipse cx="104" cy="68" rx="6" ry="4" fill="#ff8fa3" fill-opacity="0.8"/>
  <path d="M112 68 q6 7 13 1" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round" fill="none"/>

  ${outfitOverNeck(k.outfit, k.outfitColor)}
  ${glasses(k.glasses)}
  <g transform="translate(106 36) scale(1.2) translate(-106 -36)">${hat(k.hat, k.hatColor)}</g>

  <g stroke="${OUTLINE}" stroke-width="3.5" stroke-linecap="round" fill="none">
    <path d="M102 34 q-2 -16 -12 -22"/>
    <path d="M110 36 q6 -15 18 -18"/>
  </g>
  <circle class="antenna-ring" cx="89" cy="11" r="9"/>
  <circle class="antenna-ring" cx="129" cy="17" r="9"/>
  <circle class="antenna-tip" cx="89" cy="11" r="5" fill="${k.antenna}" stroke="${OUTLINE}" stroke-width="2"/>
  <circle class="antenna-tip" cx="129" cy="17" r="5" fill="${k.antenna}" stroke="${OUTLINE}" stroke-width="2"/>

  <g class="wing wing-front">
    ${wingShape(k.wingStyle, 72, 24, 18, wingScale * 1.1, k.wings, 0.85)}
    ${shine ? `<path d="M70 12 q4 10 2 22" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.9"/>` : ""}
  </g>
</svg>`;
  }

  // animation styles for the SVG above (wings, blink, legs, online ring)
  const CSS = `
.bee-svg { display: block; overflow: visible; }
.wing { transform-box: fill-box; animation: buzzy-flap 0.09s ease-in-out infinite alternate; }
.wing-back  { transform-origin: 70% 95%; animation-delay: -0.045s; }
.wing-front { transform-origin: 20% 95%; }
.eyelid { transform-box: fill-box; transform-origin: 50% 0%; transform: scaleY(0); animation: buzzy-blink 4s infinite; }
.leg { animation: buzzy-wiggle 0.6s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 50% 0%; }
.leg-2 { animation-delay: -0.2s; }
.leg-3 { animation-delay: -0.4s; }
.antenna-ring { fill: none; stroke: #2ecc71; stroke-width: 3; opacity: 0; }
.peer-online .antenna-ring { animation: buzzy-ring 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes buzzy-flap {
  from { transform: rotate(-14deg) scaleY(1); }
  to   { transform: rotate(16deg) scaleY(0.55); }
}
@keyframes buzzy-blink {
  0%, 92%, 100% { transform: scaleY(0); }
  95%           { transform: scaleY(1); }
}
@keyframes buzzy-wiggle {
  from { transform: rotate(-12deg); }
  to   { transform: rotate(12deg); }
}
@keyframes buzzy-ring {
  0%   { opacity: 0.9; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(1.4); }
}`;

  globalThis.BuzzyBeeArt = { DEFAULT_SKIN, OPTIONS, PRESETS, MAX_BEES, normalize, randomSkin, skinForBee, svg, CSS };
})();
