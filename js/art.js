"use strict";
/* ============ CARD ART ============
   Every card has a living face and a dead ("crossed over") face.
   Hand-drawn SVG is the guaranteed baseline. If art/manifest.js exists
   (written by tools/generate-art.mjs after ComfyUI renders PNGs),
   those images are used instead — same living/dead face keys. */

const SV = inner => `<svg viewBox="0 0 100 56" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;

const ART = {
  peasant:{
    l: SV(`<path d="M14 50h72" stroke="#4a7a4f" stroke-width="4"/><path d="M24 50q7-15 17 0" fill="#c9a54a"/><line x1="62" y1="10" x2="52" y2="48" stroke="#8a6b3f" stroke-width="4"/><path d="M55 21l16 5M61 9l-3 15M69 11l-4 14M76 14l-4 13" stroke="#b8bcc8" stroke-width="3"/>`),
    d: SV(`<path d="M14 50h72" stroke="#3a3f4e" stroke-width="4"/><path d="M40 50V34M33 41l7-5M47 39l-5-4M40 34q0-7 5-9" stroke="#cfd3dc" stroke-width="3" fill="none"/><line x1="64" y1="26" x2="58" y2="48" stroke="#5a4a33" stroke-width="3"/><circle cx="72" cy="18" r="2.2" fill="#9fd0f0"/><circle cx="26" cy="24" r="1.6" fill="#9fd0f0"/>`)},
  gravrat:{
    l: SV(`<ellipse cx="46" cy="38" rx="20" ry="11" fill="#6a6f7d"/><circle cx="66" cy="33" r="7" fill="#6a6f7d"/><circle cx="64" cy="25" r="3" fill="#6a6f7d"/><path d="M27 41Q10 46 8 32" stroke="#6a6f7d" stroke-width="3" fill="none"/><circle cx="69" cy="32" r="1.6" fill="#e07a7a"/>`),
    d: SV(`<path d="M26 40Q46 22 66 34" stroke="#cfd3dc" stroke-width="4" fill="none"/><path d="M34 36v8M42 32v9M50 30v9M58 31v8" stroke="#cfd3dc" stroke-width="2.5"/><circle cx="70" cy="33" r="6" fill="#cfd3dc"/><circle cx="72" cy="32" r="1.8" fill="#ff5050"/><path d="M26 40Q12 46 8 34" stroke="#cfd3dc" stroke-width="2" fill="none"/>`)},
  hound:{
    l: SV(`<path d="M22 42Q34 28 56 33L70 24 76 30 64 40Q44 47 26 45Z" fill="#9a7648"/><path d="M30 45l-5 9M58 41l5 9" stroke="#9a7648" stroke-width="4"/><circle cx="72" cy="28" r="1.6" fill="#12141c"/>`),
    d: SV(`<path d="M22 42Q34 28 56 33L70 24 76 30 64 40Q44 47 26 45Z" fill="#5d7fa0" opacity=".72"/><path d="M30 45l-5 9M58 41l5 9" stroke="#5d7fa0" stroke-width="4" opacity=".72"/><circle cx="72" cy="28" r="2.2" fill="#9fd0f0"/><path d="M20 32q-8-4-7-12M28 28q-5-4-4-9" stroke="#9fd0f0" stroke-width="2" fill="none" opacity=".55"/>`)},
  shambler:{
    l: SV(`<path d="M14 48h72" stroke="#4a7a4f" stroke-width="4"/><circle cx="42" cy="36" r="9" fill="#d8d4c8"/><circle cx="39" cy="35" r="2.2" fill="#20242f"/><circle cx="46" cy="35" r="2.2" fill="#20242f"/><path d="M62 48V36q0-6 6-6" stroke="#d8d4c8" stroke-width="3.5" fill="none"/>`),
    d: SV(`<circle cx="50" cy="15" r="8" fill="#d8d4c8"/><circle cx="47" cy="14" r="2" fill="#ff5050"/><circle cx="53" cy="14" r="2" fill="#ff5050"/><path d="M50 23v17M38 30h24M50 40l-9 12M50 40l9 12M42 27v7M58 27v7" stroke="#d8d4c8" stroke-width="3" fill="none"/>`)},
  priest:{
    l: SV(`<path d="M42 50L50 24l8 26Z" fill="#e8e4d8"/><circle cx="50" cy="17" r="6" fill="#e8cfa8"/><ellipse cx="50" cy="7" rx="8" ry="2.5" fill="none" stroke="#e8c15a" stroke-width="2"/><line x1="66" y1="12" x2="66" y2="50" stroke="#8a6b3f" stroke-width="3"/><circle cx="66" cy="9" r="3" fill="#e8c15a"/>`),
    d: SV(`<path d="M40 52Q38 24 50 15q12 9 10 37Z" fill="#3a3448"/><circle cx="50" cy="20" r="6" fill="#171223"/><circle cx="48" cy="19" r="1.5" fill="#9fd0f0"/><circle cx="53" cy="19" r="1.5" fill="#9fd0f0"/><path d="M66 12v38" stroke="#4a4054" stroke-width="3"/><path d="M66 12q7 4 0 9" stroke="#7b5bb5" stroke-width="2.5" fill="none"/>`)},
  collector:{
    l: SV(`<line x1="28" y1="10" x2="40" y2="42" stroke="#8a6b3f" stroke-width="3"/><path d="M38 40q9 12-2 15-11 2-6-13Z" fill="#9aa0b0"/><path d="M58 30q17 0 15 16-2 8-13 8-12 0-12-11 0-11 10-13Z" fill="#8a6b3f"/><path d="M61 30l6-7" stroke="#5a4426" stroke-width="3"/>`),
    d: SV(`<path d="M42 26q21-4 23 14 2 12-13 12-16 0-16-12 0-10 6-14Z" fill="#4a4433"/><circle cx="50" cy="38" r="2.2" fill="#ff8c3c"/><circle cx="58" cy="38" r="2.2" fill="#ff8c3c"/><path d="M30 48l9-3M28 42l10 1M33 52l7-5" stroke="#cfd3dc" stroke-width="2.5"/>`)},
  flameblade:{
    l: SV(`<line x1="50" y1="6" x2="50" y2="40" stroke="#c8ccd8" stroke-width="4"/><line x1="41" y1="38" x2="59" y2="38" stroke="#8a6b3f" stroke-width="3"/><line x1="50" y1="38" x2="50" y2="49" stroke="#8a6b3f" stroke-width="3"/><path d="M50 4q7 8 2 15 9-2 6 9 7 0 4 9" stroke="#e8823c" stroke-width="2.5" fill="none"/><path d="M50 9q-7 8-2 13-9 0-5 9" stroke="#e8b13c" stroke-width="2.5" fill="none"/>`),
    d: SV(`<line x1="50" y1="8" x2="50" y2="40" stroke="#6a7284" stroke-width="4"/><line x1="41" y1="38" x2="59" y2="38" stroke="#5a4a33" stroke-width="3"/><line x1="50" y1="38" x2="50" y2="49" stroke="#5a4a33" stroke-width="3"/><path d="M50 8q7-7 4-2M45 16q-8-3-4 2M55 22q8-2 4 2" stroke="#8a8fa3" stroke-width="2" fill="none" opacity=".7"/><circle cx="50" cy="7" r="2.2" fill="#ff8c3c"/>`)},
  plague:{
    l: SV(`<circle cx="48" cy="27" r="13" fill="#7da05a"/><rect x="42" y="36" width="12" height="7" rx="2" fill="#7da05a"/><circle cx="44" cy="25" r="3" fill="#1c2416"/><circle cx="53" cy="25" r="3" fill="#1c2416"/><circle cx="75" cy="15" r="2" fill="#3a4430"/><path d="M71 11q4 2 8 0" stroke="#3a4430" stroke-width="1.5" fill="none"/><circle cx="23" cy="41" r="2" fill="#3a4430"/>`),
    d: SV(`<path d="M50 10v36M40 18q10 9 20 0M38 27q12 10 24 0M40 36q10 9 20 0" stroke="#cfd3dc" stroke-width="3" fill="none"/><path d="M28 15q7-9 11 0M61 13q7-7 9 3" stroke="#7da05a" stroke-width="2" fill="none" opacity=".7"/>`)},
  warden:{
    l: SV(`<rect x="42" y="18" width="16" height="22" rx="3" fill="none" stroke="#8a8fa3" stroke-width="3"/><circle cx="50" cy="29" r="5.5" fill="#6ab7e8"/><path d="M46 18q4-9 8 0" stroke="#8a8fa3" stroke-width="3" fill="none"/><line x1="41" y1="44" x2="59" y2="44" stroke="#8a8fa3" stroke-width="3"/>`),
    d: SV(`<rect x="42" y="18" width="16" height="22" rx="3" fill="none" stroke="#8a8fa3" stroke-width="3"/><circle cx="50" cy="29" r="6" fill="#7b5bb5"/><circle cx="48" cy="28" r="1.3" fill="#e8e4f4"/><circle cx="53" cy="28" r="1.3" fill="#e8e4f4"/><path d="M46 18q4-9 8 0" stroke="#8a8fa3" stroke-width="3" fill="none"/><path d="M62 26q9-2 11-9M38 26q-9-2-11-9" stroke="#9fd0f0" stroke-width="2" fill="none" opacity=".6"/>`)},
  wraithcaller:{
    l: SV(`<path d="M38 52Q36 24 50 16q14 8 12 36Z" fill="#5a4386"/><circle cx="50" cy="21" r="6" fill="#171223"/><path d="M40 34Q28 26 26 14M60 34q12-8 14-20" stroke="#5a4386" stroke-width="4" fill="none"/><circle cx="26" cy="10" r="3" fill="#9fd0f0" opacity=".85"/><circle cx="74" cy="10" r="3" fill="#9fd0f0" opacity=".85"/>`),
    d: SV(`<path d="M36 52q-2-30 14-38 16 8 14 38l-5-6-5 6-4-6-4 6-5-6Z" fill="#4a3670"/><path d="M42 11l4 6 4-6 4 6 4-6" stroke="#d8a93d" stroke-width="2.5" fill="none"/><circle cx="46" cy="23" r="2.2" fill="#9fd0f0"/><circle cx="54" cy="23" r="2.2" fill="#9fd0f0"/>`)},
  ghoul:{
    l: SV(`<path d="M32 52Q30 30 46 22q16-6 22 8 4 10-2 22Z" fill="#55606e"/><circle cx="56" cy="29" r="2.2" fill="#ff8c3c"/><circle cx="63" cy="30" r="2.2" fill="#ff8c3c"/><path d="M36 44l-7 7M40 47l-5 8" stroke="#55606e" stroke-width="3"/>`),
    d: SV(`<path d="M32 52Q30 30 46 22q16-6 22 8 4 10-2 22Z" fill="#2e2a33"/><path d="M40 34l9 7M46 28l6 9M55 41l7 5" stroke="#ff8c3c" stroke-width="2"/><circle cx="56" cy="28" r="2.2" fill="#ffb03c"/><circle cx="63" cy="30" r="2.2" fill="#ffb03c"/>`)},
  deathknight:{
    l: SV(`<path d="M38 46V26q0-12 12-12t12 12v20Z" fill="#3a4152"/><rect x="42" y="30" width="16" height="4" fill="#12141c"/><circle cx="46" cy="32" r="1.8" fill="#ff5050"/><circle cx="54" cy="32" r="1.8" fill="#ff5050"/><path d="M38 26Q26 22 24 10M62 26q12-4 14-16" stroke="#6a7284" stroke-width="4" fill="none"/>`),
    d: SV(`<path d="M38 46V26q0-12 12-12t12 12v20Z" fill="#232838"/><rect x="42" y="30" width="16" height="4" fill="#0c0e14"/><circle cx="46" cy="32" r="2.2" fill="#9fd0f0"/><circle cx="54" cy="32" r="2.2" fill="#9fd0f0"/><path d="M38 26Q26 22 24 10M62 26q12-4 14-16" stroke="#4a5268" stroke-width="4" fill="none"/><path d="M44 14q2-7 6-9 4 2 6 9M50 21l4 9" stroke="#7b5bb5" stroke-width="2" fill="none"/>`)},
  spirit:{
    l: SV(`<circle cx="55" cy="22" r="10" fill="#9fd0f0" opacity=".9"/><path d="M47 30Q34 40 24 38q10 6 21 2" fill="#9fd0f0" opacity=".55"/><circle cx="52" cy="20" r="2" fill="#1c2833"/><circle cx="59" cy="20" r="2" fill="#1c2833"/>`),
    d: SV(`<circle cx="55" cy="22" r="10" fill="#9fd0f0" opacity=".9"/><path d="M47 30Q34 40 24 38q10 6 21 2" fill="#9fd0f0" opacity=".55"/><circle cx="52" cy="20" r="2" fill="#1c2833"/><circle cx="59" cy="20" r="2" fill="#1c2833"/>`)},
  cull:{
    l: SV(`<path d="M50 8l4 26-4 12-4-12Z" fill="#c8ccd8"/><line x1="41" y1="12" x2="59" y2="12" stroke="#8a6b3f" stroke-width="3"/><path d="M50 49q4 4 0 7-4-3 0-7" fill="#d05252"/>`),
    d: SV(`<circle cx="50" cy="15" r="7" fill="#e8e4d8"/><path d="M50 23q-2 12-7 21M50 23q2 12 7 21" stroke="#e8e4d8" stroke-width="3" fill="none" opacity=".8"/><path d="M50 5V1M33 10l-6-5M67 10l6-5M27 24h-9M73 24h9" stroke="#e8c15a" stroke-width="2.5"/>`)},
  smite:{
    l: SV(`<path d="M56 4L38 30h12L42 52l22-28H52Z" fill="#e8c15a"/>`),
    d: SV(`<path d="M30 8Q38 30 32 50M48 6q8 22 2 46M66 8q8 22 2 42" stroke="#a071d8" stroke-width="4" fill="none" stroke-linecap="round"/>`)},
  tome:{
    l: SV(`<path d="M50 12Q36 6 24 10v32q12-4 26 2V12Z" fill="#e4d9b0"/><path d="M50 12q14-6 26-2v32q-12-4-26 2V12Z" fill="#d6c896"/><circle cx="37" cy="26" r="6" fill="none" stroke="#b8862d" stroke-width="2"/><path d="M63 20h8M63 26h8M63 32h8" stroke="#8a6b3f" stroke-width="2"/>`),
    d: SV(`<path d="M50 12Q36 6 24 10v32q12-4 26 2V12Z" fill="#2c2438"/><path d="M50 12q14-6 26-2v32q-12-4-26 2V12Z" fill="#241d30"/><circle cx="37" cy="26" r="6" fill="none" stroke="#7b5bb5" stroke-width="2"/><circle cx="37" cy="26" r="2" fill="#9fd0f0"/><path d="M63 20h8M63 27h8" stroke="#5a4386" stroke-width="2"/><path d="M30 46q6 4 12 2" stroke="#9fd0f0" stroke-width="1.5" opacity=".6"/>`)},
  h_alder:{
    l: SV(`<circle cx="50" cy="18" r="9" fill="#d8c9a8"/><path d="M36 52q0-20 14-22 14 2 14 22Z" fill="#5f8a56"/><path d="M40 33q-10 2-12 14l8 2q1-9 4-16Z" fill="#c9a227"/><path d="M43 12q7-7 14 0l-2 6H45Z" fill="#8a8fa3"/><circle cx="47" cy="18" r="1.5" fill="#2c2c22"/><circle cx="54" cy="18" r="1.5" fill="#2c2c22"/>`),
    d: SV(`<circle cx="50" cy="18" r="9" fill="#a8b4c2" opacity=".85"/><path d="M36 52q0-20 14-22 14 2 14 22Z" fill="#3c5060" opacity=".85"/><path d="M43 12q7-7 14 0l-2 6H45Z" fill="#5a6a7c"/><circle cx="47" cy="18" r="1.8" fill="#9fd0f0"/><circle cx="54" cy="18" r="1.8" fill="#9fd0f0"/><path d="M34 40q-6-2-8-8" stroke="#9fd0f0" stroke-width="2" fill="none" opacity=".5"/>`)},
  h_morwen:{
    l: SV(`<circle cx="50" cy="19" r="9" fill="#e4d4c4"/><path d="M38 52q0-18 12-21 12 3 12 21Z" fill="#3a3448"/><path d="M41 11l3 5 3-6 3 6 3-5 3 5 2-4v6H40v-6Z" fill="#2c2534"/><circle cx="46.5" cy="19" r="1.5" fill="#402838"/><circle cx="53.5" cy="19" r="1.5" fill="#402838"/><path d="M44 26q6 3 12 0" stroke="#8a5a6a" stroke-width="1.5" fill="none"/>`),
    d: SV(`<circle cx="50" cy="19" r="9" fill="#d8d4c8"/><path d="M38 52q0-18 12-21 12 3 12 21Z" fill="#241d30"/><path d="M41 11l3 5 3-6 3 6 3-5 3 5 2-4v6H40v-6Z" fill="#7b5bb5"/><circle cx="46.5" cy="19" r="2" fill="#b79ce8"/><circle cx="53.5" cy="19" r="2" fill="#b79ce8"/><path d="M45 27h10" stroke="#4a3f5e" stroke-width="1.5"/>`)},
  h_vex:{
    l: SV(`<path d="M38 52q-2-26 12-32 14 6 12 32Z" fill="#2e3440"/><circle cx="50" cy="21" r="6.5" fill="#12141c"/><circle cx="47.5" cy="20" r="1.6" fill="#e8c15a"/><circle cx="52.5" cy="20" r="1.6" fill="#e8c15a"/><line x1="68" y1="8" x2="64" y2="50" stroke="#6a6f7d" stroke-width="3"/><path d="M68 8q12 2 14 12-8-4-16-2Z" fill="#9aa0b0"/>`),
    d: SV(`<path d="M38 52q-2-26 12-32 14 6 12 32l-4-5-4 5-4-5-4 5-4-5Z" fill="#241d30"/><circle cx="50" cy="21" r="6.5" fill="#0c0a14"/><circle cx="47.5" cy="20" r="2" fill="#9fd0f0"/><circle cx="52.5" cy="20" r="2" fill="#9fd0f0"/><line x1="68" y1="8" x2="64" y2="50" stroke="#4a4054" stroke-width="3"/><path d="M68 8q12 2 14 12-8-4-16-2Z" fill="#b79ce8" opacity=".8"/>`)},
  h_brann:{
    l: SV(`<circle cx="50" cy="19" r="9" fill="#d8b894"/><path d="M38 52q0-18 12-20 12 2 12 20Z" fill="#5e3a2a"/><path d="M41 12v-6l4 4 5-6 5 6 4-4v6Z" fill="#e8823c"/><circle cx="46.5" cy="19" r="1.5" fill="#3a2418"/><circle cx="53.5" cy="19" r="1.5" fill="#3a2418"/><path d="M44 28q6 4 12 0" stroke="#8a5a3a" stroke-width="1.5" fill="none"/><circle cx="62" cy="40" r="1.5" fill="#ff8c3c"/><circle cx="37" cy="44" r="1.2" fill="#ff8c3c"/>`),
    d: SV(`<circle cx="50" cy="19" r="9" fill="#cfd3dc"/><path d="M38 52q0-18 12-20 12 2 12 20Z" fill="#3a3f4e"/><path d="M41 12v-6l4 4 5-6 5 6 4-4v6Z" fill="#55606e"/><circle cx="46.5" cy="19" r="1.8" fill="#ff8c3c"/><circle cx="53.5" cy="19" r="1.8" fill="#ff8c3c"/><path d="M50 26l2 5M46 24l-2 4" stroke="#2c3038" stroke-width="1.5"/><circle cx="63" cy="38" r="1.5" fill="#ff8c3c"/>`)},
  h_sylvara:{
    l: SV(`<line x1="50" y1="4" x2="50" y2="52" stroke="#c9a227" stroke-width="1.5" opacity=".65"/><path d="M38 52q0-20 11-24 11 4 11 24Z" fill="#3f6a4c"/><path d="M50 28q6 2 6 10" stroke="#7b5bb5" stroke-width="2" fill="none" opacity=".7"/><circle cx="50" cy="19" r="8" fill="#dcc9a8"/><path d="M42 14q8-8 16 0l-2 5H44Z" fill="#2c4434"/><circle cx="47" cy="19" r="1.5" fill="#2c3a2c"/><circle cx="53" cy="19" r="1.5" fill="#5a3f86"/><circle cx="64" cy="12" r="2" fill="#b79ce8" opacity=".8"/><circle cx="35" cy="10" r="1.6" fill="#86c99a" opacity=".8"/>`),
    d: SV(`<line x1="50" y1="4" x2="50" y2="52" stroke="#ff5f6d" stroke-width="1.5" opacity=".6"/><path d="M38 52q0-20 11-24 11 4 11 24l-4-5-3 5-4-5-4 5Z" fill="#3c3550"/><circle cx="50" cy="19" r="8" fill="#c9c2d8" opacity=".9"/><circle cx="47" cy="19" r="1.8" fill="#9fd0f0"/><circle cx="53" cy="19" r="1.8" fill="#9fd0f0"/><path d="M32 30q-6-4-6-12M68 30q6-4 6-12" stroke="#b79ce8" stroke-width="2" fill="none" opacity=".55"/>`)},
  h_corvus:{
    l: SV(`<path d="M38 52q0-18 12-20 12 2 12 20Z" fill="#2e3440"/><circle cx="50" cy="18" r="8" fill="#d8c9a8"/><path d="M42 12q8-9 16 0l-3 4H45Z" fill="#1c2028"/><circle cx="47" cy="18" r="1.5" fill="#2c2c22"/><circle cx="53" cy="18" r="1.5" fill="#2c2c22"/><rect x="26" y="34" width="12" height="17" rx="2" fill="#e4d9b0" transform="rotate(-12 32 42)"/><rect x="62" y="34" width="12" height="17" rx="2" fill="#d6c896" transform="rotate(12 68 42)"/><path d="M66 8q6 2 8 7-5-1-9 1 0-5 1-8Z" fill="#20242e"/>`),
    d: SV(`<path d="M38 52q0-18 12-20 12 2 12 20l-4-4-4 4-4-4-4 4Z" fill="#241d30"/><circle cx="50" cy="18" r="8" fill="#cfd3dc" opacity=".9"/><circle cx="47" cy="18" r="1.8" fill="#9fd0f0"/><circle cx="53" cy="18" r="1.8" fill="#9fd0f0"/><rect x="26" y="34" width="12" height="17" rx="2" fill="#3c3550" transform="rotate(-12 32 42)"/><rect x="62" y="34" width="12" height="17" rx="2" fill="#4a4066" transform="rotate(12 68 42)"/><path d="M28 39l8 3M64 40l8-2" stroke="#b79ce8" stroke-width="1.5" opacity=".7"/><path d="M66 8q6 2 8 7-5-1-9 1 0-5 1-8Z" fill="#b79ce8" opacity=".7"/>`)},
  h_maelis:{
    l: SV(`<path d="M38 52q0-18 12-21 12 3 12 21Z" fill="#5e2430"/><circle cx="50" cy="19" r="8.5" fill="#e8dcd0"/><path d="M41 13l4 4 5-7 5 7 4-4v7H41Z" fill="#3a1420"/><circle cx="46.5" cy="19" r="1.5" fill="#7a2434"/><circle cx="53.5" cy="19" r="1.5" fill="#7a2434"/><path d="M45 27q5 3 10 0" stroke="#a04050" stroke-width="1.5" fill="none"/><path d="M66 36q4 5 0 8-4-3 0-8" fill="#c14343"/><path d="M32 38q-3 4 0 7-3-2 0-7" fill="#c14343" opacity=".8"/>`),
    d: SV(`<path d="M38 52q0-18 12-21 12 3 12 21Z" fill="#2c1a26"/><circle cx="50" cy="19" r="8.5" fill="#d8d0dc"/><path d="M41 13l4 4 5-7 5 7 4-4v7H41Z" fill="#4a2438"/><circle cx="46.5" cy="19" r="1.9" fill="#ff5050"/><circle cx="53.5" cy="19" r="1.9" fill="#ff5050"/><path d="M45 28h10" stroke="#6a3448" stroke-width="1.5"/><path d="M66 36q4 5 0 8-4-3 0-8" fill="#7b5bb5"/><path d="M50 30v6" stroke="#c14343" stroke-width="2" opacity=".8"/>`)},
  h_oswin:{
    l: SV(`<path d="M38 52q0-16 12-18 12 2 12 18Z" fill="#4a4433"/><circle cx="50" cy="20" r="8" fill="#d8c9a8"/><path d="M43 13q7-6 14 0v4H43Z" fill="#6a5a3f"/><circle cx="47" cy="20" r="1.5" fill="#3a3428"/><circle cx="53" cy="20" r="1.5" fill="#3a3428"/><path d="M50 25q-2 3 0 5 2-2 0-5" fill="#b8bcc8"/><path d="M68 10q9 2 9 13v6H61v-6q0-11 7-13Z" fill="#c9a227"/><circle cx="68" cy="32" r="2.5" fill="#8a6b3f"/>`),
    d: SV(`<path d="M38 52q0-16 12-18 12 2 12 18l-4-4-4 4-4-4-4 4Z" fill="#2c2a38"/><circle cx="50" cy="20" r="8" fill="#cfd3dc"/><circle cx="47" cy="20" r="1.8" fill="#9fd0f0"/><circle cx="53" cy="20" r="1.8" fill="#9fd0f0"/><path d="M68 10q9 2 9 13v6H61v-6q0-11 7-13Z" fill="#3c3550"/><circle cx="68" cy="32" r="2.5" fill="#b79ce8"/><path d="M56 22q-4 5 0 10M82 22q4 5 0 10" stroke="#b79ce8" stroke-width="2" fill="none" opacity=".6"/>`)},
  grove:{
    l: SV(`<path d="M14 48h72" stroke="#4a7a4f" stroke-width="4"/><line x1="50" y1="48" x2="50" y2="26" stroke="#8a6b3f" stroke-width="4"/><circle cx="50" cy="20" r="12" fill="#5f9c68"/><circle cx="40" cy="26" r="8" fill="#6fae76"/><circle cx="60" cy="26" r="8" fill="#6fae76"/><path d="M50 8V4M38 12l-4-4M62 12l4-4" stroke="#e8c15a" stroke-width="2"/>`),
    d: SV(`<path d="M14 48h72" stroke="#3a3f4e" stroke-width="4"/><path d="M26 48q24-30 48 0Z" fill="#3c3550"/><path d="M50 30v10M45 34h10" stroke="#cfd3dc" stroke-width="2.5"/><circle cx="34" cy="26" r="2.5" fill="#9fd0f0" opacity=".8"/><path d="M34 29q-2 8 2 12" stroke="#9fd0f0" stroke-width="1.5" opacity=".5" fill="none"/>`)},
  gravedigger:{
    l: SV(`<path d="M14 50h72" stroke="#4a7a4f" stroke-width="4"/><path d="M30 50q10-16 24-8Z" fill="#5a4a33"/><line x1="66" y1="14" x2="66" y2="50" stroke="#8a6b3f" stroke-width="3"/><path d="M62 14h8l-4-9Z" fill="#9aa0b0"/><circle cx="28" cy="34" r="3" fill="#e8c15a"/>`),
    d: SV(`<path d="M14 50h72" stroke="#3a3f4e" stroke-width="4"/><path d="M30 50q10-16 24-8Z" fill="#2c2438"/><path d="M38 44l8-3M40 40l6 3" stroke="#cfd3dc" stroke-width="2"/><line x1="66" y1="14" x2="66" y2="50" stroke="#5a4a33" stroke-width="3"/><circle cx="70" cy="10" r="2.5" fill="#9fd0f0"/>`)},
  pallbearer:{
    l: SV(`<path d="M30 24l40-6 4 10-40 8Z" fill="#6a5a3f"/><path d="M36 36v14M60 32v18" stroke="#3a3428" stroke-width="4"/><circle cx="32" cy="18" r="4" fill="#2e3440"/>`),
    d: SV(`<path d="M30 22l40-6 4 10-40 8Z" fill="#3c3550"/><path d="M32 42q18 8 42-4" stroke="#9fd0f0" stroke-width="2" opacity=".5" fill="none"/><circle cx="72" cy="14" r="2.2" fill="#9fd0f0"/><circle cx="26" cy="38" r="1.8" fill="#9fd0f0"/>`)},
  ratcatcher:{
    l: SV(`<line x1="40" y1="8" x2="40" y2="50" stroke="#8a6b3f" stroke-width="3"/><rect x="46" y="12" width="14" height="12" rx="2" fill="none" stroke="#9aa0b0" stroke-width="2"/><ellipse cx="28" cy="46" rx="8" ry="4" fill="#6a6f7d"/><ellipse cx="58" cy="48" rx="7" ry="3.5" fill="#6a6f7d"/><circle cx="34" cy="45" r="1" fill="#12141c"/>`),
    d: SV(`<ellipse cx="30" cy="44" rx="8" ry="4" fill="#5d7fa0" opacity=".8"/><ellipse cx="52" cy="48" rx="7" ry="3.5" fill="#5d7fa0" opacity=".7"/><ellipse cx="68" cy="40" rx="6" ry="3" fill="#5d7fa0" opacity=".6"/><circle cx="34" cy="43" r="1.2" fill="#ff5050"/><circle cx="55" cy="47" r="1.2" fill="#ff5050"/><circle cx="71" cy="39" r="1.2" fill="#ff5050"/>`)},
  sentinel:{
    l: SV(`<path d="M50 8q14 6 20 4v22q0 12-20 18-20-6-20-18V12q6 2 20-4Z" fill="#3f5a76"/><path d="M50 16v28M40 28h20" stroke="#c9a227" stroke-width="3"/>`),
    d: SV(`<path d="M50 8q14 6 20 4v22q0 12-20 18-20-6-20-18V12q6 2 20-4Z" fill="#4a3670" opacity=".88"/><path d="M50 16v28M40 28h20" stroke="#9fd0f0" stroke-width="3"/><path d="M42 20l7 9-5 9" stroke="#241d30" stroke-width="2" fill="none"/>`)},
  bonegolem:{
    l: SV(`<rect x="38" y="12" width="24" height="18" rx="4" fill="#55606e"/><rect x="28" y="30" width="44" height="18" rx="5" fill="#454f5c"/><circle cx="46" cy="21" r="2" fill="#ffb03c"/><circle cx="56" cy="21" r="2" fill="#ffb03c"/><path d="M34 34h10M58 40h8" stroke="#333b46" stroke-width="3"/>`),
    d: SV(`<rect x="38" y="12" width="24" height="18" rx="4" fill="#cfd3dc"/><rect x="28" y="30" width="44" height="18" rx="5" fill="#a8adb8"/><circle cx="46" cy="21" r="2.5" fill="#9fd0f0"/><circle cx="56" cy="21" r="2.5" fill="#9fd0f0"/><path d="M34 36l8 8M64 34l-6 10" stroke="#7c828e" stroke-width="2"/>`)},
  ferryman:{
    l: SV(`<path d="M22 42q28 10 56 0l-6 8H30Z" fill="#5a4a33"/><path d="M58 8v32" stroke="#8a6b3f" stroke-width="3"/><path d="M44 20q-2 14 3 20" stroke="#2e3440" stroke-width="7" fill="none"/><circle cx="45" cy="15" r="5" fill="#2e3440"/>`),
    d: SV(`<path d="M22 42q28 10 56 0l-6 8H30Z" fill="#3c3550"/><path d="M58 8v32" stroke="#4a4054" stroke-width="3"/><path d="M44 20q-2 14 3 20" stroke="#241d30" stroke-width="7" fill="none"/><circle cx="45" cy="15" r="5" fill="#241d30"/><circle cx="45" cy="14" r="1.5" fill="#9fd0f0"/><circle cx="66" cy="22" r="3" fill="#e8c15a" opacity=".9"/>`)},
  banish:{
    l: SV(`<circle cx="50" cy="28" r="16" fill="#0c0e14" stroke="#c9a227" stroke-width="3"/><path d="M44 23q6-6 12 0M44 33q6 6 12 0" stroke="#5a6a7c" stroke-width="2" fill="none"/><path d="M50 12v-6M50 50v-6" stroke="#c9a227" stroke-width="2"/>`),
    d: SV(`<path d="M46 4l6 14-8 6 12 8-8 6 6 14" stroke="#b79ce8" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M46 4l6 14-8 6 12 8-8 6 6 14" stroke="#12060e" stroke-width="1.5" fill="none"/>`)},
  soultap:{
    l: SV(`<path d="M40 50V36q0-6 5-8M50 50V33M60 50V36q0-6-5-8" stroke="#d8c9a8" stroke-width="4" fill="none"/><circle cx="50" cy="14" r="4.5" fill="#b79ce8"/><path d="M50 19v7" stroke="#b79ce8" stroke-width="2"/>`),
    d: SV(`<path d="M40 50V36q0-6 5-8M50 50V33M60 50V36q0-6-5-8" stroke="#8a94a8" stroke-width="4" fill="none"/><circle cx="50" cy="14" r="4.5" fill="#d05252"/><path d="M50 19v7" stroke="#d05252" stroke-width="2"/>`)},
  requiem:{
    l: SV(`<path d="M50 8q13 2 13 17v9H37v-9q0-15 13-17Z" fill="#c9a227"/><circle cx="50" cy="39" r="3.5" fill="#8a6b3f"/><path d="M26 20q-5 7 0 14M74 20q5 7 0 14" stroke="#8a8fa3" stroke-width="2" fill="none"/>`),
    d: SV(`<path d="M50 8q13 2 13 17v9H37v-9q0-15 13-17Z" fill="#3c3550"/><circle cx="50" cy="39" r="3.5" fill="#241d30"/><path d="M26 20q-5 7 0 14M74 20q5 7 0 14" stroke="#b79ce8" stroke-width="2" fill="none"/>`)},
  siphon:{
    l: SV(`<path d="M50 46C39 38 35 31 39 26q4-5 11 1 7-6 11-1 4 5-11 20Z" fill="#d05252"/><path d="M28 10q10 7 16 10M72 10q-10 7-16 10" stroke="#86c99a" stroke-width="2" fill="none"/>`),
    d: SV(`<circle cx="50" cy="26" r="10" fill="#cfd3dc"/><circle cx="46" cy="24" r="2.5" fill="#241d30"/><circle cx="54" cy="24" r="2.5" fill="#241d30"/><path d="M28 46q12-7 17-5M72 46q-12-7-17-5" stroke="#b79ce8" stroke-width="2" fill="none"/>`)},
};
ART.rat = ART.gravrat; // token reuses the rat motif

/* Rites & Ruin + omen units — simple sigils until generated art lands */
ART.dispel = {l: SV(`<path d="M28 28q11-14 22 0t22 0" stroke="#c9a227" stroke-width="3" fill="none"/><path d="M66 20l12-9" stroke="#c9a227" stroke-width="2" stroke-dasharray="3 3"/>`),
              d: SV(`<path d="M28 28q11-14 22 0t22 0" stroke="#7b5bb5" stroke-width="3" fill="none" opacity=".6"/><path d="M60 8l-16 40" stroke="#b79ce8" stroke-width="3"/>`)};
ART.darkpact = {l: SV(`<rect x="30" y="12" width="40" height="34" rx="3" fill="#d8cfae"/><path d="M36 20h28M36 27h28M36 34h16" stroke="#5a4a33" stroke-width="2"/><path d="M62 40q4 4 0 6-4-2 0-6" fill="#c14343"/>`),
                d: SV(`<rect x="30" y="12" width="40" height="34" rx="3" fill="#2c2438"/><path d="M36 20h28M36 27h28M36 34h16" stroke="#7b5bb5" stroke-width="2"/><path d="M64 8q-6 8-10 8" stroke="#cfd3dc" stroke-width="3"/>`)};
ART.surge = {l: SV(`<circle cx="50" cy="28" r="13" fill="#2a5f86"/><path d="M50 15q10 6 0 13t0 13" stroke="#9fd4f0" stroke-width="3" fill="none"/>`),
             d: SV(`<circle cx="50" cy="28" r="13" fill="#41306a"/><path d="M50 15q10 6 0 13t0 13" stroke="#c9aef2" stroke-width="3" fill="none"/>`)};
ART.mend = {l: SV(`<path d="M50 44C40 37 36 30 40 25q4-4 10 1 6-5 10-1 4 5-10 19Z" fill="#d05252"/><path d="M50 6v10M44 10h12" stroke="#e8c15a" stroke-width="3"/>`),
            d: SV(`<circle cx="50" cy="26" r="12" fill="none" stroke="#b79ce8" stroke-width="3"/><path d="M40 20l20 12M40 32l20-12" stroke="#e8e4f4" stroke-width="1.5" stroke-dasharray="3 2"/>`)};
ART.haunt = {l: SV(`<path d="M30 48l14-30 6 12 8-6-6 24Z" fill="#8a6b3f"/><path d="M56 12l14 10" stroke="#e8c15a" stroke-width="3"/>`),
             d: SV(`<circle cx="42" cy="24" r="8" fill="#9fd0f0" opacity=".85"/><path d="M56 16q8 8 0 16M64 10q12 12 0 28" stroke="#b79ce8" stroke-width="2.5" fill="none"/>`)};
ART.warbanner = {l: SV(`<line x1="36" y1="6" x2="36" y2="50" stroke="#8a6b3f" stroke-width="3"/><path d="M36 8h32l-8 8 8 8H36Z" fill="#a03030"/><circle cx="52" cy="16" r="4" fill="#e8c15a"/>`),
                 d: SV(`<line x1="36" y1="6" x2="36" y2="50" stroke="#cfd3dc" stroke-width="3"/><path d="M36 8h32l-8 8 8 8H36Z" fill="#3c3550"/><path d="M44 12v8M52 12v8M60 12v8" stroke="#cfd3dc" stroke-width="2"/>`)};
ART.font = {l: SV(`<path d="M34 44h32l-4-8H38Z" fill="#6a7284"/><path d="M42 36q8-18 16 0" stroke="#6ab7e8" stroke-width="4" fill="none"/><circle cx="50" cy="14" r="3" fill="#9fd4f0"/>`),
            d: SV(`<path d="M34 44h32l-4-8H38Z" fill="#4a4054"/><path d="M42 36q8-18 16 0" stroke="#8a5ad0" stroke-width="4" fill="none"/><circle cx="50" cy="14" r="3" fill="#c9aef2"/>`)};
ART.ward = {l: SV(`<circle cx="50" cy="28" r="16" fill="none" stroke="#4a7a4f" stroke-width="3"/><path d="M38 16l-5-5M62 16l5-5M38 40l-5 5M62 40l5 5" stroke="#4a7a4f" stroke-width="2.5"/>`),
            d: SV(`<circle cx="50" cy="28" r="16" fill="none" stroke="#7b5bb5" stroke-width="3"/><circle cx="42" cy="26" r="2" fill="#9fd0f0"/><circle cx="58" cy="26" r="2" fill="#9fd0f0"/><path d="M44 34q6 4 12 0" stroke="#9fd0f0" stroke-width="2" fill="none"/>`)};
ART.candlemaid = {l: SV(`<path d="M42 50L50 26l8 24Z" fill="#a8a49a"/><circle cx="50" cy="19" r="6" fill="#e8cfa8"/><line x1="64" y1="26" x2="64" y2="44" stroke="#e4d9b0" stroke-width="4"/><path d="M64 20q3 4 0 6-3-2 0-6" fill="#e8983c"/>`),
                  d: SV(`<line x1="50" y1="24" x2="50" y2="46" stroke="#e4d9b0" stroke-width="5"/><path d="M50 14q4 6 0 9-4-3 0-9" fill="#9fd0f0"/><path d="M38 48h24" stroke="#3a3f4e" stroke-width="3"/>`)};
ART.drummer = {l: SV(`<ellipse cx="50" cy="34" rx="16" ry="6" fill="#a03030"/><rect x="34" y="34" width="32" height="12" fill="#6b2020"/><line x1="38" y1="18" x2="46" y2="30" stroke="#8a6b3f" stroke-width="3"/><line x1="62" y1="18" x2="54" y2="30" stroke="#8a6b3f" stroke-width="3"/>`),
               d: SV(`<ellipse cx="50" cy="34" rx="16" ry="6" fill="#241d30"/><rect x="34" y="34" width="32" height="12" fill="#171123"/><path d="M24 24q-4 6 0 12M76 24q4 6 0 12" stroke="#b79ce8" stroke-width="2.5" fill="none"/>`)};
ART.lamplighter = {l: SV(`<line x1="60" y1="8" x2="48" y2="48" stroke="#8a6b3f" stroke-width="3"/><rect x="58" y="6" width="10" height="12" rx="2" fill="none" stroke="#c9a227" stroke-width="2"/><circle cx="63" cy="12" r="2.5" fill="#e8c15a"/><circle cx="42" cy="20" r="5" fill="#2e3440"/>`),
                   d: SV(`<circle cx="50" cy="24" r="9" fill="#5f9c68" opacity=".7"/><circle cx="50" cy="24" r="4" fill="#c9f0b0"/><path d="M50 34q-4 10 0 16" stroke="#5f9c68" stroke-width="2" fill="none" opacity=".5"/>`)};

const ART_GENERIC = SV(`<circle cx="50" cy="28" r="14" fill="none" stroke="#8a8fa3" stroke-width="2"/><path d="M50 10v36M32 28h36" stroke="#8a8fa3" stroke-width="1.5" opacity=".55"/>`);

function artFor(cardId, dead){
  const key = cardId + "_" + (dead ? "dead" : "living");
  if(typeof window !== "undefined" && window.ART_MANIFEST && window.ART_MANIFEST[key]){
    return `<img class="artimg" src="art/${key}.png" alt="" draggable="false">`;
  }
  const a = ART[cardId];
  return a ? (dead && a.d ? a.d : a.l) : ART_GENERIC;
}
