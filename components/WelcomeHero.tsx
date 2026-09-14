/* The welcome screen is the one place an image does real work: it answers
   "is this for someone like me" before a word is read.
 *
 * It is drawn rather than photographed on purpose. A photograph of five
 * teenagers picks five specific teenagers, and everyone who does not see
 * themselves in it gets a quieter answer to that question. Drawn figures let
 * the screen say "people your age" without saying "people like these".
 *
 * Imagery is the one exemption from the accent rule. Teal-only-for-action
 * governs the interface; a picture that obeyed it would be a picture of the
 * interface. A real photo here would contain every colour too. */

/* Swapping in a photograph: put the file at public/hero.jpg and change this
   to '/hero.jpg'. Nothing else needs touching — it fills the same frame at the
   same radius. Left as null so the page never requests a file that is not
   there, which would log a 404 on every first visit.

   If you do use a photo, pick one where the students are doing the work rather
   than posing for a camera. Posed group shots are the visual signature of a
   school district brochure, which is the one thing the product is trying not
   to look like. */
const HERO_PHOTO: string | null = null;

/* The illustration band on Screen 01. Decorative, so it is hidden from
   assistive technology entirely rather than described — the headline already
   says what the screen is.

   When no art is available the band keeps its height and shows a label, so
   the CTA never moves between the two states. */
export function WelcomeBand() {
  if (HERO_PHOTO) {
    return (
      <div className="welcome-band">
        <img src={HERO_PHOTO} alt="" />
      </div>
    );
  }
  return (
    <div className="welcome-band">
      <WelcomeHero band />
    </div>
  );
}

export function WelcomeArt() {
  if (HERO_PHOTO) {
    return (
      <img
        className="hero-art"
        src={HERO_PHOTO}
        alt="High-school students at work near you"
      />
    );
  }
  return <WelcomeHero />;
}

export function WelcomeHero({ band = false }: { band?: boolean } = {}) {
  /* In band form the art fills a full-bleed slot: no corner radius of its
     own, and it crops rather than letterboxes so the mint never shows as
     bars down the sides. */
  return (
    <svg
      className={band ? undefined : 'hero-art'}
      viewBox="0 0 400 225"
      preserveAspectRatio={band ? 'xMidYMid slice' : undefined}
      {...(band
        ? { 'aria-hidden': true as const, focusable: false as const }
        : {
            role: 'img',
            'aria-label':
              'A group of high-school students on their way to work, school and volunteering',
          })}
    >
      <defs>
        <clipPath id={band ? 'hero-band' : 'hero-frame'}>
          <rect x="0" y="0" width="400" height="225" rx={band ? 0 : 22} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${band ? 'hero-band' : 'hero-frame'})`}>
        <rect width="400" height="225" fill="#E7F3F1" />

        {/* Confetti. The only decorative marks anywhere in the product. */}
        <circle cx="34" cy="34" r="5" fill="#FFC74A" />
        <circle cx="366" cy="44" r="6" fill="#C43B0C" opacity="0.9" />
        <circle cx="312" cy="22" r="3.5" fill="#0F6B63" opacity="0.45" />
        <circle cx="80" cy="18" r="3" fill="#C43B0C" opacity="0.55" />
        <rect x="16" y="86" width="9" height="9" rx="2" fill="#FFC74A" opacity="0.8" transform="rotate(20 20 90)" />
        <rect x="378" y="104" width="8" height="8" rx="2" fill="#0F6B63" opacity="0.3" transform="rotate(-18 382 108)" />

        {/* The figures run off the bottom edge rather than standing on a
            horizon line — a line behind them at waist height reads as though
            they are sunk into it. */}

        {/* Five silhouettes with one haircut between them reads as five of the
            same person. The variation below is the whole reason this is drawn
            rather than photographed. */}

        {/* --- Apron, carrying a cup --- */}
        <g>
          <path d="M34 225 V146 a28 28 0 0 1 56 0 V225 Z" fill="#0F6B63" />
          <rect x="46" y="168" width="32" height="57" rx="4" fill="#E7F3F1" opacity="0.5" />
          <path d="M40 98 H84 V142 q0 12-22 12 q-22 0-22-12 Z" fill="#1E1508" />
          <circle cx="62" cy="100" r="20" fill="#C68642" />
          <path d="M42 99 a20 20 0 0 1 40 0 a20 14 0 0 0-40 0 Z" fill="#1E1508" />
          <circle cx="55" cy="102" r="1.9" fill="#0C2A26" />
          <circle cx="69" cy="102" r="1.9" fill="#0C2A26" />
          <path d="M56 110 q6 5 12 0" stroke="#0C2A26" strokeWidth="2" fill="none" strokeLinecap="round" />
          <rect x="88" y="150" width="14" height="17" rx="3" fill="#C43B0C" />
          <rect x="88" y="150" width="14" height="4" rx="2" fill="#FFF1E7" />
        </g>

        {/* --- Headphones, backpack strap --- */}
        <g>
          <path d="M106 225 V139 a27 27 0 0 1 54 0 V225 Z" fill="#FFC74A" />
          <path d="M120 139 V225" stroke="#6B4E0A" strokeWidth="5" opacity="0.3" />
          <circle cx="133" cy="94" r="19" fill="#8D5524" />
          <path d="M114 93 a19 19 0 0 1 38 0 a19 13 0 0 0-38 0 Z" fill="#241403" />
          <circle cx="126" cy="96" r="1.9" fill="#0C2A26" />
          <circle cx="140" cy="96" r="1.9" fill="#0C2A26" />
          <path d="M127 104 q6 5 12 0" stroke="#0C2A26" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M112 94 a21 21 0 0 1 42 0" stroke="#0C2A26" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <rect x="107" y="90" width="9" height="14" rx="4" fill="#0C2A26" />
          <rect x="150" y="90" width="9" height="14" rx="4" fill="#0C2A26" />
        </g>

        {/* --- Tallest, at the centre --- */}
        <g>
          <path d="M173 225 V135 a29 29 0 0 1 58 0 V225 Z" fill="#C43B0C" />
          <circle cx="202" cy="56" r="11" fill="#3A2A12" />
          <circle cx="202" cy="86" r="21" fill="#F1C27D" />
          <path d="M181 85 a21 21 0 0 1 42 0 a21 15 0 0 0-42 0 Z" fill="#3A2A12" />
          <circle cx="195" cy="88" r="2" fill="#0C2A26" />
          <circle cx="209" cy="88" r="2" fill="#0C2A26" />
          <path d="M195 97 q7 6 14 0" stroke="#0C2A26" strokeWidth="2.1" fill="none" strokeLinecap="round" />
        </g>

        {/* --- Holding a seedling --- */}
        <g>
          <path d="M245 225 V149 a27 27 0 0 1 54 0 V225 Z" fill="#0F6B63" opacity="0.8" />
          <path d="M250 102 a22 22 0 0 1 44 0 V144 q0 10-22 10 q-22 0-22-10 Z" fill="#F3EEE4" />
          <circle cx="272" cy="105" r="16" fill="#FFDBAC" />
          <circle cx="266" cy="106" r="1.9" fill="#0C2A26" />
          <circle cx="278" cy="106" r="1.9" fill="#0C2A26" />
          <path d="M267 113 q5 5 10 0" stroke="#0C2A26" strokeWidth="2" fill="none" strokeLinecap="round" />
          <rect x="296" y="158" width="15" height="13" rx="2" fill="#F3EEE4" />
          <path d="M303.5 158 v-10 M303.5 151 q-7-5-9 1 M303.5 151 q7-5 9 1" stroke="#0F6B63" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </g>

        {/* --- Skateboard under the arm --- */}
        <g>
          <path d="M316 225 V142 a26 26 0 0 1 52 0 V225 Z" fill="#FFC74A" opacity="0.92" />
          <circle cx="342" cy="98" r="18" fill="#E0AC69" />
          <path d="M324 97 a18 18 0 0 1 36 0 a18 12 0 0 0-36 0 Z" fill="#1E1508" />
          <circle cx="335" cy="100" r="1.8" fill="#0C2A26" />
          <circle cx="348" cy="100" r="1.8" fill="#0C2A26" />
          <path d="M336 108 q6 5 12 0" stroke="#0C2A26" strokeWidth="2" fill="none" strokeLinecap="round" />
          <g transform="rotate(-9 342 172)">
            <rect x="308" y="168" width="54" height="8" rx="4" fill="#C43B0C" />
            <circle cx="319" cy="179" r="3.2" fill="#0C2A26" opacity="0.55" />
            <circle cx="351" cy="179" r="3.2" fill="#0C2A26" opacity="0.55" />
          </g>
        </g>
      </g>
    </svg>
  );
}
