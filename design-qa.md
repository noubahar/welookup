# WeLookup Landing V2 — Design QA

## Evidence

- Source visual truth: `/Users/asus/.codex/generated_images/01a1bb34-bd79-72a3-9646-903ee7c19c08/exec-6349f39c-17d8-4f04-829a-29dc3ae0d5b2.png`
- Source pixels: `724 × 2172` generated long-page concept.
- Implementation: `http://127.0.0.1:4173/landing-v2/`
- Implementation screenshot evidence: full-page capture from the in-app browser in the active Product Design session.
- Desktop viewport: `1440 × 1024` CSS px, `devicePixelRatio: 1`.
- Desktop document pixels at final pass: `1440 × 6199`.
- Mobile viewport: `390 × 844` CSS px, `devicePixelRatio: 1`.
- Density normalization: the source concept is a compressed 724px-wide long-page board rather than a browser capture, so fidelity was judged by proportional section composition, hierarchy, repeated patterns, and normalized width—not by literal equal-height pixel diff.
- State: dark theme; page top; Overview selected; FAQ closed. Additional interaction states were tested separately.

## Full-view comparison evidence

The final browser render preserves the selected concept's defining structure and art direction:

- centered editorial hero with a compact signal eyebrow, oversized two-line headline, one dominant install CTA, and a secondary workflow link;
- near-black canvas with restrained purple/blue ambient light;
- large yellow hero media placeholder;
- `One scan. Four clear answers.` chapter with working tabs and a wide yellow walkthrough placeholder;
- four alternating capability rows for Overview, Technology, Products, and Audit;
- three-column use-case section;
- purple control/privacy band;
- compact FAQ, final CTA band, and quiet footer.

The implementation intentionally uses the real WeLookup logo and accurate current product copy. It does not reuse Claude assets or text.

## Focused-region comparison evidence

- **Hero:** headline scale, centered alignment, CTA hierarchy, ambient purple/blue light, and yellow media block match the source's top-of-page composition. Final hero media measures `1180 × 390` CSS px.
- **Tabbed walkthrough:** compact four-tab control and wide yellow media region match the source. Final walkthrough media measures `1180 × 300` CSS px; tab content and accessible labels update correctly.
- **Capability rows:** alternating text/media direction, thin separators, purple icon containers, uppercase labels, and bright yellow placeholders match the source pattern. Final desktop capability media measures `616 × 240` CSS px.
- **Lower page:** research use cases, privacy statement, FAQ dividers, and final CTA preserve the source hierarchy while using clearer production spacing.
- **Mobile:** the layout becomes a single readable column, navigation moves into a working menu, placeholders retain clear labels, and the page has no horizontal overflow (`scrollWidth = clientWidth = 390`).

## Required fidelity surfaces

- **Fonts and typography:** Inter is used consistently with 400–800 weights. The headline uses an 88px desktop maximum and responsive mobile sizing, tight display tracking, readable 1.55 body line height, and no clipped or truncated copy.
- **Spacing and layout rhythm:** the 1180px shell, compact header, reduced media heights, alternating rows, and section separators align with the selected concept. Final pass corrected the initial overlong rhythm.
- **Colors and visual tokens:** midnight `#070912`, white `#f5f6ff`, muted slate, purple `#5f50ff`, soft purple `#938aff`, and yellow `#ffef00` reproduce the source's contrast and emphasis. Contrast remains strong for body and control text.
- **Image quality and asset fidelity:** the real WeLookup raster logo is reused. The generated ambient background is a dedicated 1672 × 941 raster asset. Product imagery is deliberately represented by the user-requested yellow placeholders; no fake screenshots or code-drawn illustration assets were substituted.
- **Copy and content:** all claims map to current extension behavior: Overview summary, technology detection, Shopify catalog quick/full scan with search/export, Shopify-specific AI-readiness audit, public storefront data, on-device results, and no admin requirement.

## Interaction and runtime checks

- Desktop Technology tab selected and panel copy/placeholder updated.
- Mobile Products tab selected and ARIA state updated.
- FAQ disclosure opened successfully.
- Mobile navigation opened successfully and reported `aria-expanded="true"`.
- Three Chrome Web Store CTAs use the existing extension listing URL.
- `noindex, nofollow` verified for the preview route.
- Desktop and mobile horizontal overflow checks passed.
- Browser console warnings/errors checked: none.
- JavaScript syntax check passed.
- Existing homepage and shared site files were not modified.

## Comparison history

### Pass 1

- **[P1] Below-fold sections appeared blank in full-page evidence.**
  - Cause: scroll-triggered reveal styles kept off-screen content at opacity zero until scrolled.
  - Fix: content now renders visibly by default, preserving progressive enhancement and eliminating blank sections if JavaScript is slow or unavailable.
  - Post-fix evidence: the next full-page browser capture showed all sections and placeholders.
- **[P2] Skip link left a visible edge at the top of the capture.**
  - Fix: moved the unfocused skip link fully off-canvas and returned it to `top: 12px` only on focus.
  - Post-fix evidence: no skip-link artifact appears in the final desktop or clean mobile capture.

### Pass 2

- **[P2] Initial page rhythm was too tall compared with the selected concept.**
  - Fix: reduced global section spacing, hero media from 520px to 390px, walkthrough media from 380px to 300px, capability media from 315px to 240px, and capability row padding from 74px to 50px.
  - Post-fix evidence: final desktop document height reduced from `7001` to `6199` px while keeping text readable and media placeholders prominent.
- **[P2] Walkthrough region used an extra split text/media panel not present in the selected concept.**
  - Fix: converted the selected tab region to a full-width media placeholder while retaining tab-driven accessible labeling and content updates.
  - Post-fix evidence: final walkthrough matches the source's wide placeholder composition.

## Findings

No actionable P0, P1, or P2 issues remain.

## Follow-up polish

- **[P3]** Replace yellow placeholders with final screenshots/video while preserving their current aspect ratios.
- **[P3]** Revisit final marketing copy after the media assets are chosen so captions can describe the exact visible state.

## Implementation checklist

- [x] Selected visual direction implemented.
- [x] Preview isolated at `/landing-v2/`.
- [x] Main homepage left unchanged.
- [x] Desktop and mobile layouts verified.
- [x] Tabs, FAQ, mobile navigation, and CTAs verified.
- [x] Preview route excluded from indexing.
- [x] P0/P1/P2 findings resolved.

final result: passed
