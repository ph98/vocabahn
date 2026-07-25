import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.resolve('apps/web/public');

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Helper to wrap SVG in HTML document for Playwright rendering
function wrapSvgInHtml(svgContent, width, height, bgColor = 'transparent') {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: ${width}px;
            height: ${height}px;
            background: ${bgColor};
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          }
          svg { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `;
}

// -----------------------------------------------------------------------------
// SVG DEFINITIONS
// -----------------------------------------------------------------------------

// Logomark Symbol SVG (Dark mode)
const LOGO_MARK_DARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="vGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="50%" stop-color="#8b5cf6" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <linearGradient id="vGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background rounded card -->
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bgGrad)" stroke="#1e293b" stroke-width="8" />
  
  <!-- Subtle speed lines / Autobahn motif -->
  <path d="M 80 140 Q 256 80 432 140" stroke="#334155" stroke-width="6" stroke-dasharray="16 12" opacity="0.4" fill="none" />
  <path d="M 60 220 Q 256 160 452 220" stroke="#475569" stroke-width="4" stroke-dasharray="24 16" opacity="0.3" fill="none" />

  <!-- Back Card visual layer -->
  <rect x="160" y="110" width="240" height="150" rx="24" fill="#6366f1" opacity="0.18" transform="rotate(-12 280 185)" />

  <!-- Main Aerodynamic V / Flashcard motif -->
  <g filter="url(#glow)">
    <!-- Left Stem of V -->
    <path d="M 112 144 L 236 392 C 244 408 268 408 276 392 L 400 144 C 408 128 392 112 374 124 L 256 280 L 138 124 C 120 112 104 128 112 144 Z" fill="url(#vGrad)" />
    
    <!-- Accent forward arrow highlight inside V -->
    <path d="M 196 160 L 256 280 L 316 160 C 322 148 310 136 298 144 L 256 200 L 214 144 C 202 136 190 148 196 160 Z" fill="url(#vGradLight)" opacity="0.9" />
  </g>
  
  <!-- Fast-lane speed dot -->
  <circle cx="384" cy="128" r="20" fill="#10b981" />
</svg>`;

// Logomark Symbol SVG (Light mode)
const LOGO_MARK_LIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bgGradL" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f1f5f9" />
    </linearGradient>
    <linearGradient id="vGradL" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5" />
      <stop offset="50%" stop-color="#7c3aed" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bgGradL)" stroke="#e2e8f0" stroke-width="8" />
  <rect x="160" y="110" width="240" height="150" rx="24" fill="#4f46e5" opacity="0.12" transform="rotate(-12 280 185)" />
  <path d="M 112 144 L 236 392 C 244 408 268 408 276 392 L 400 144 C 408 128 392 112 374 124 L 256 280 L 138 124 C 120 112 104 128 112 144 Z" fill="url(#vGradL)" />
  <circle cx="384" cy="128" r="20" fill="#059669" />
</svg>`;

// Full Logo Dark SVG (Mark + Wordmark)
const LOGO_DARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 240" fill="none">
  <g transform="translate(20, 20) scale(0.39)">
    ${LOGO_MARK_DARK_SVG}
  </g>
  <text x="240" y="145" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="96" font-weight="900" letter-spacing="-2" fill="#ffffff">
    Vocab<tspan fill="#6366f1">ahn</tspan>
  </text>
  <text x="245" y="185" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="24" font-weight="600" letter-spacing="4" fill="#94a3b8">
    GERMAN IN THE FAST LANE
  </text>
</svg>`;

// Full Logo Light SVG (Mark + Wordmark)
const LOGO_LIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 240" fill="none">
  <g transform="translate(20, 20) scale(0.39)">
    ${LOGO_MARK_LIGHT_SVG}
  </g>
  <text x="240" y="145" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="96" font-weight="900" letter-spacing="-2" fill="#0f172a">
    Vocab<tspan fill="#4f46e5">ahn</tspan>
  </text>
  <text x="245" y="185" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="24" font-weight="600" letter-spacing="4" fill="#64748b">
    GERMAN IN THE FAST LANE
  </text>
</svg>`;

// PWA Maskable Icon SVG
const MASKABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="#090d16" />
  <g transform="translate(64, 64) scale(0.75)">
    <path d="M 112 144 L 236 392 C 244 408 268 408 276 392 L 400 144 C 408 128 392 112 374 124 L 256 280 L 138 124 C 120 112 104 128 112 144 Z" fill="url(#maskGrad)" />
    <circle cx="384" cy="128" r="24" fill="#10b981" />
  </g>
  <defs>
    <linearGradient id="maskGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
  </defs>
</svg>`;

// Open Graph (OG) Image (1200x630)
const OG_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" fill="none">
  <defs>
    <linearGradient id="ogBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="ogGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.4" />
      <stop offset="50%" stop-color="#8b5cf6" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#10b981" stop-opacity="0.4" />
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#ogBg)" />
  
  <!-- Glowing meshes -->
  <circle cx="200" cy="100" r="300" fill="#6366f1" opacity="0.15" filter="blur(80px)" />
  <circle cx="1000" cy="500" r="350" fill="#10b981" opacity="0.15" filter="blur(100px)" />
  
  <!-- Top Banner Line -->
  <rect x="0" y="0" width="1200" height="6" fill="url(#ogGlow)" />

  <!-- Logo Left -->
  <g transform="translate(80, 80) scale(0.35)">
    ${LOGO_MARK_DARK_SVG}
  </g>
  <text x="280" y="180" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="80" font-weight="900" letter-spacing="-2" fill="#ffffff">
    Vocab<tspan fill="#6366f1">ahn</tspan>
  </text>

  <!-- Headline -->
  <text x="80" y="310" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="52" font-weight="800" fill="#ffffff" letter-spacing="-1">
    Learn German in the Fast Lane.
  </text>

  <!-- Subheadline -->
  <text x="80" y="375" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="28" font-weight="500" fill="#94a3b8" width="700">
    FSRS Spaced Repetition • AI-Enriched Dictionary • CEFR A1-C2 Progression
  </text>

  <!-- Feature Badge Chips -->
  <g transform="translate(80, 440)">
    <rect width="180" height="52" rx="26" fill="#1e293b" stroke="#334155" stroke-width="2" />
    <text x="90" y="33" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" fill="#818cf8">🧠 FSRS v4</text>
  </g>
  <g transform="translate(280, 440)">
    <rect width="220" height="52" rx="26" fill="#1e293b" stroke="#334155" stroke-width="2" />
    <text x="110" y="33" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" fill="#34d399">✨ LLM Enriched</text>
  </g>
  <g transform="translate(520, 440)">
    <rect width="200" height="52" rx="26" fill="#1e293b" stroke="#334155" stroke-width="2" />
    <text x="100" y="33" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" fill="#fbbf24">⚡ Native PWA</text>
  </g>

  <!-- Flashcard Mockup Right Side -->
  <g transform="translate(780, 140)">
    <!-- Back Card -->
    <rect x="40" y="40" width="340" height="230" rx="24" fill="#334155" opacity="0.4" transform="rotate(8 210 155)" />
    <!-- Main Card -->
    <rect x="0" y="0" width="350" height="240" rx="24" fill="url(#cardGrad)" stroke="#334155" stroke-width="3" />
    
    <!-- Card content -->
    <rect x="30" y="30" width="60" height="28" rx="8" fill="#6366f1" opacity="0.2" />
    <text x="60" y="49" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="800" fill="#818cf8">B2</text>
    
    <text x="30" y="110" font-family="sans-serif" font-size="36" font-weight="800" fill="#ffffff">der Wortschatz</text>
    <text x="30" y="145" font-family="sans-serif" font-size="20" font-weight="500" fill="#94a3b8">vocabulary, word power</text>
    
    <line x1="30" y1="175" x2="320" y2="175" stroke="#334155" stroke-width="2" stroke-dasharray="6 4" />
    <text x="30" y="205" font-family="sans-serif" font-size="15" font-weight="500" font-style="italic" fill="#34d399">"Mein Wortschatz wächst jeden Tag."</text>
  </g>
</svg>`;

// Hero Illustration SVG
const HERO_ILLUSTRATION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" fill="none">
  <defs>
    <linearGradient id="heroBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="glowIndigo" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>
  </defs>
  
  <rect width="1000" height="600" rx="32" fill="url(#heroBgGrad)" />
  
  <!-- Autobahn motion path -->
  <path d="M -50 450 Q 350 200 1050 480" stroke="url(#glowIndigo)" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.8" />
  <path d="M -50 470 Q 350 220 1050 500" stroke="#10b981" stroke-width="6" stroke-linecap="round" stroke-dasharray="24 16" fill="none" opacity="0.6" />

  <!-- Card Stack 1: German Article Card -->
  <g transform="translate(180, 140) rotate(-6)">
    <rect width="280" height="180" rx="20" fill="#1e293b" stroke="#334155" stroke-width="3" />
    <rect x="24" y="24" width="50" height="24" rx="6" fill="#ef4444" opacity="0.2" />
    <text x="49" y="41" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="800" fill="#f87171">die</text>
    <text x="24" y="90" font-family="sans-serif" font-size="28" font-weight="800" fill="#ffffff">Geschwindigkeit</text>
    <text x="24" y="120" font-family="sans-serif" font-size="16" font-weight="500" fill="#94a3b8">speed, velocity</text>
    <rect x="24" y="140" width="100" height="18" rx="9" fill="#10b981" opacity="0.2" />
    <text x="74" y="153" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#34d399">Mastered • FSRS</text>
  </g>

  <!-- Card Stack 2: Main Active Card -->
  <g transform="translate(480, 180) rotate(4)">
    <rect width="320" height="210" rx="24" fill="#0f172a" stroke="#6366f1" stroke-width="4" />
    <rect x="28" y="24" width="56" height="26" rx="6" fill="#3b82f6" opacity="0.2" />
    <text x="56" y="42" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="800" fill="#60a5fa">der</text>
    <text x="28" y="98" font-family="sans-serif" font-size="32" font-weight="900" fill="#ffffff">Durchbruch</text>
    <text x="28" y="132" font-family="sans-serif" font-size="18" font-weight="500" fill="#cbd5e1">breakthrough, advance</text>
    <rect x="28" y="155" width="264" height="32" rx="8" fill="#1e293b" />
    <text x="40" y="176" font-family="sans-serif" font-size="13" font-style="italic" fill="#a7f3d0">"Ein echter Durchbruch beim Lernen!"</text>
  </g>
  
  <!-- Floating CEFR Badges -->
  <g transform="translate(100, 360)">
    <circle cx="30" cy="30" r="30" fill="#0ea5e9" opacity="0.2" stroke="#38bdf8" stroke-width="2" />
    <text x="30" y="37" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="800" fill="#38bdf8">A1</text>
  </g>
  <g transform="translate(380, 420)">
    <circle cx="30" cy="30" r="30" fill="#10b981" opacity="0.2" stroke="#34d399" stroke-width="2" />
    <text x="30" y="37" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="800" fill="#34d399">B1</text>
  </g>
  <g transform="translate(820, 360)">
    <circle cx="30" cy="30" r="30" fill="#f59e0b" opacity="0.2" stroke="#fbbf24" stroke-width="2" />
    <text x="30" y="37" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="800" fill="#fbbf24">C1</text>
  </g>
</svg>`;

// FSRS Feature Graphic SVG
const FEATURE_FSRS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" fill="none">
  <rect width="800" height="500" rx="24" fill="#0f172a" stroke="#1e293b" stroke-width="4" />
  
  <text x="40" y="60" font-family="sans-serif" font-size="28" font-weight="800" fill="#ffffff">FSRS Spaced Repetition Algorithm</text>
  <text x="40" y="90" font-family="sans-serif" font-size="16" font-weight="500" fill="#94a3b8">Optimized review intervals for 90%+ long-term retention</text>
  
  <!-- Graph axes -->
  <line x1="80" y1="400" x2="720" y2="400" stroke="#334155" stroke-width="3" />
  <line x1="80" y1="150" x2="80" y2="400" stroke="#334155" stroke-width="3" />
  <text x="40" y="160" font-family="sans-serif" font-size="14" font-weight="700" fill="#94a3b8">100%</text>
  <text x="45" y="405" font-family="sans-serif" font-size="14" font-weight="700" fill="#94a3b8">0%</text>
  
  <!-- Intervals -->
  <text x="180" y="430" font-family="sans-serif" font-size="14" font-weight="600" fill="#64748b">Day 1</text>
  <text x="320" y="430" font-family="sans-serif" font-size="14" font-weight="600" fill="#64748b">Day 3</text>
  <text x="480" y="430" font-family="sans-serif" font-size="14" font-weight="600" fill="#64748b">Day 10</text>
  <text x="640" y="430" font-family="sans-serif" font-size="14" font-weight="600" fill="#64748b">Day 30</text>

  <!-- Retention Decay & Review Curves -->
  <!-- Curve 1 -->
  <path d="M 80 160 Q 130 360 180 370" stroke="#ef4444" stroke-width="3" stroke-dasharray="6 4" fill="none" opacity="0.6" />
  <!-- Review 1 boost -->
  <path d="M 180 160 Q 250 290 320 310" stroke="#f59e0b" stroke-width="3" stroke-dasharray="6 4" fill="none" opacity="0.7" />
  <!-- Review 2 boost -->
  <path d="M 320 160 Q 400 220 480 230" stroke="#6366f1" stroke-width="3" stroke-dasharray="6 4" fill="none" opacity="0.8" />
  <!-- Review 3 boost (FSRS curve) -->
  <path d="M 480 160 Q 560 180 680 190" stroke="#10b981" stroke-width="4" fill="none" />

  <!-- Node points -->
  <circle cx="180" cy="160" r="10" fill="#ef4444" />
  <circle cx="320" cy="160" r="10" fill="#f59e0b" />
  <circle cx="480" cy="160" r="10" fill="#6366f1" />
  <circle cx="680" cy="160" r="12" fill="#10b981" />
  
  <text x="680" y="130" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="800" fill="#34d399">Permanent Memory</text>
</svg>`;

// LLM Feature Graphic SVG
const FEATURE_LLM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" fill="none">
  <rect width="800" height="500" rx="24" fill="#0f172a" stroke="#1e293b" stroke-width="4" />

  <text x="40" y="60" font-family="sans-serif" font-size="28" font-weight="800" fill="#ffffff">LLM Contextual Enrichment</text>
  <text x="40" y="90" font-family="sans-serif" font-size="16" font-weight="500" fill="#94a3b8">Instant AI sentence generation, collocations & mnemonic hooks</text>

  <!-- Central AI Spark Node -->
  <circle cx="400" cy="280" r="60" fill="#6366f1" opacity="0.2" />
  <circle cx="400" cy="280" r="40" fill="#6366f1" opacity="0.4" />
  <text x="400" y="288" text-anchor="middle" font-family="sans-serif" font-size="28">✨</text>

  <!-- Connected Nodes -->
  <!-- Top Node: Dictionary Definition -->
  <g transform="translate(140, 160)">
    <rect width="180" height="90" rx="16" fill="#1e293b" stroke="#3b82f6" stroke-width="2" />
    <text x="20" y="35" font-family="sans-serif" font-size="16" font-weight="700" fill="#60a5fa">📖 Definition</text>
    <text x="20" y="65" font-family="sans-serif" font-size="13" fill="#cbd5e1">Grammar & CEFR</text>
  </g>
  <line x1="300" y1="210" x2="360" y2="260" stroke="#3b82f6" stroke-width="2" stroke-dasharray="4 4" />

  <!-- Right Node: AI Context Sentences -->
  <g transform="translate(480, 160)">
    <rect width="180" height="90" rx="16" fill="#1e293b" stroke="#10b981" stroke-width="2" />
    <text x="20" y="35" font-family="sans-serif" font-size="16" font-weight="700" fill="#34d399">💬 Sentences</text>
    <text x="20" y="65" font-family="sans-serif" font-size="13" fill="#cbd5e1">Natural examples</text>
  </g>
  <line x1="480" y1="210" x2="440" y2="260" stroke="#10b981" stroke-width="2" stroke-dasharray="4 4" />

  <!-- Bottom Left: Audio & Pronunciation -->
  <g transform="translate(140, 320)">
    <rect width="180" height="90" rx="16" fill="#1e293b" stroke="#a855f7" stroke-width="2" />
    <text x="20" y="35" font-family="sans-serif" font-size="16" font-weight="700" fill="#c084fc">🔊 Native Audio</text>
    <text x="20" y="65" font-family="sans-serif" font-size="13" fill="#cbd5e1">IPA & Pronunciation</text>
  </g>
  <line x1="300" y1="350" x2="360" y2="300" stroke="#a855f7" stroke-width="2" stroke-dasharray="4 4" />

  <!-- Bottom Right: Memory Hook -->
  <g transform="translate(480, 320)">
    <rect width="180" height="90" rx="16" fill="#1e293b" stroke="#f59e0b" stroke-width="2" />
    <text x="20" y="35" font-family="sans-serif" font-size="16" font-weight="700" fill="#fbbf24">💡 Mnemonic</text>
    <text x="20" y="65" font-family="sans-serif" font-size="13" fill="#cbd5e1">Memory hooks</text>
  </g>
  <line x1="480" y1="350" x2="440" y2="300" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 4" />
</svg>`;

// CEFR Feature Graphic SVG
const FEATURE_CEFR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" fill="none">
  <rect width="800" height="500" rx="24" fill="#0f172a" stroke="#1e293b" stroke-width="4" />

  <text x="40" y="60" font-family="sans-serif" font-size="28" font-weight="800" fill="#ffffff">CEFR Level Progression (A1 → C2)</text>
  <text x="40" y="90" font-family="sans-serif" font-size="16" font-weight="500" fill="#94a3b8">Structured roadmap from beginner to native-like fluency</text>

  <!-- Level Stairs/Pillars -->
  <!-- A1 -->
  <g transform="translate(80, 280)">
    <rect width="90" height="120" rx="12" fill="#0ea5e9" opacity="0.2" stroke="#38bdf8" stroke-width="2" />
    <text x="45" y="50" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="800" fill="#38bdf8">A1</text>
    <text x="45" y="80" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#94a3b8">Breakthrough</text>
  </g>
  <!-- A2 -->
  <g transform="translate(190, 240)">
    <rect width="90" height="160" rx="12" fill="#06b6d4" opacity="0.2" stroke="#22d3ee" stroke-width="2" />
    <text x="45" y="50" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="800" fill="#22d3ee">A2</text>
    <text x="45" y="80" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#94a3b8">Waystage</text>
  </g>
  <!-- B1 -->
  <g transform="translate(300, 200)">
    <rect width="90" height="200" rx="12" fill="#10b981" opacity="0.2" stroke="#34d399" stroke-width="2" />
    <text x="45" y="50" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="800" fill="#34d399">B1</text>
    <text x="45" y="80" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#94a3b8">Threshold</text>
  </g>
  <!-- B2 -->
  <g transform="translate(410, 160)">
    <rect width="90" height="240" rx="12" fill="#f59e0b" opacity="0.2" stroke="#fbbf24" stroke-width="2" />
    <text x="45" y="50" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="800" fill="#fbbf24">B2</text>
    <text x="45" y="80" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#94a3b8">Vantage</text>
  </g>
  <!-- C1 -->
  <g transform="translate(520, 120)">
    <rect width="90" height="280" rx="12" fill="#8b5cf6" opacity="0.2" stroke="#a78bfa" stroke-width="2" />
    <text x="45" y="50" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="800" fill="#a78bfa">C1</text>
    <text x="45" y="80" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#94a3b8">Effective</text>
  </g>
  <!-- C2 -->
  <g transform="translate(630, 80)">
    <rect width="90" height="320" rx="12" fill="#ec4899" opacity="0.2" stroke="#f472b6" stroke-width="2" />
    <text x="45" y="50" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="800" fill="#f472b6">C2</text>
    <text x="45" y="80" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#94a3b8">Mastery</text>
  </g>

  <!-- Progression Curve Arrow -->
  <path d="M 125 270 Q 350 180 675 70" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" stroke-dasharray="8 6" opacity="0.7" />
</svg>`;

// CEFR Level Badges Helper
function createCEFRBadgeSvg(level, color, textColor, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
    <defs>
      <linearGradient id="bg_${level}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25" />
        <stop offset="100%" stop-color="${color}" stop-opacity="0.05" />
      </linearGradient>
    </defs>
    <!-- Shield Container -->
    <path d="M 60 10 L 100 26 C 100 70 60 106 60 106 C 60 106 20 70 20 26 Z" fill="url(#bg_${level})" stroke="${color}" stroke-width="4" />
    <text x="60" y="58" text-anchor="middle" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="32" font-weight="900" fill="${textColor}">${level}</text>
    <text x="60" y="78" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="${color}" letter-spacing="1">${title.toUpperCase()}</text>
  </svg>`;
}

// Streak & Achievement Badges Helper
function createStreakBadgeSvg(days, color, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none">
    <circle cx="80" cy="80" r="70" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="4" />
    <!-- Flame Shape -->
    <path d="M 80 30 C 95 50 110 70 100 95 C 95 85 85 82 83 90 C 80 82 72 80 68 90 C 60 75 55 60 80 30 Z" fill="${color}" />
    <text x="80" y="125" text-anchor="middle" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="22" font-weight="900" fill="#ffffff">${days} DAYS</text>
    <text x="80" y="142" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="${color}" letter-spacing="1">${title.toUpperCase()}</text>
  </svg>`;
}

// Daily Goal Reached Badge
const BADGE_GOAL_REACHED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none">
  <circle cx="80" cy="80" r="70" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="4" />
  <path d="M 80 35 L 93 62 L 123 66 L 101 87 L 106 117 L 80 103 L 54 117 L 59 87 L 37 66 L 67 62 Z" fill="#10b981" />
  <path d="M 68 80 L 76 88 L 94 70" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  <text x="80" y="140" text-anchor="middle" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="12" font-weight="800" fill="#34d399" letter-spacing="1">GOAL COMPLETE</text>
</svg>`;

// Empty States
const EMPTY_QUEUE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" fill="none">
  <rect width="400" height="300" rx="20" fill="none" />
  <!-- Sparkles & Celebration -->
  <circle cx="200" cy="130" r="70" fill="#10b981" opacity="0.1" />
  <circle cx="200" cy="130" r="50" fill="#10b981" opacity="0.2" />
  <!-- Target Checkmark -->
  <path d="M 175 130 L 192 147 L 228 110" stroke="#10b981" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  <text x="200" y="230" text-anchor="middle" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="24" font-weight="800" fill="#ffffff">All Caught Up!</text>
  <text x="200" y="260" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="500" fill="#94a3b8">Your review queue is clear for now.</text>
</svg>`;

const EMPTY_SEARCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" fill="none">
  <rect width="400" height="300" rx="20" fill="none" />
  <circle cx="200" cy="120" r="50" fill="#6366f1" opacity="0.1" />
  <circle cx="190" cy="110" r="28" stroke="#6366f1" stroke-width="5" fill="none" />
  <line x1="210" y1="130" x2="230" y2="150" stroke="#6366f1" stroke-width="5" stroke-linecap="round" />
  <text x="200" y="220" text-anchor="middle" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="24" font-weight="800" fill="#ffffff">No Results Found</text>
  <text x="200" y="250" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="500" fill="#94a3b8">Try searching for another German or English word.</text>
</svg>`;

const EMPTY_COURSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" fill="none">
  <rect width="400" height="300" rx="20" fill="none" />
  <rect x="140" y="80" width="120" height="90" rx="16" fill="#f59e0b" opacity="0.15" stroke="#fbbf24" stroke-width="3" />
  <path d="M 185 125 L 215 125 M 200 110 L 200 140" stroke="#fbbf24" stroke-width="4" stroke-linecap="round" />
  <text x="200" y="220" text-anchor="middle" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="24" font-weight="800" fill="#ffffff">Start a New Course</text>
  <text x="200" y="250" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="500" fill="#94a3b8">Explore curated vocabulary decks from A1 to C2.</text>
</svg>`;

// Custom UI Icon Set
const MODE_FLASHCARDS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <rect x="12" y="16" width="36" height="28" rx="6" opacity="0.4" />
  <rect x="20" y="24" width="36" height="28" rx="6" />
  <line x1="28" y1="36" x2="48" y2="36" />
</svg>`;

const MODE_WRITING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M 12 52 L 20 52 L 48 24 L 40 16 L 12 44 Z" />
  <line x1="36" y1="20" x2="44" y2="28" />
  <line x1="12" y1="56" x2="52" y2="56" />
</svg>`;

const MODE_DIAGNOSTICS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M 12 48 L 24 32 L 36 40 L 52 16" />
  <circle cx="52" cy="16" r="4" fill="currentColor" />
  <line x1="12" y1="56" x2="52" y2="56" />
</svg>`;

const MODE_DICTIONARY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M 12 12 H 44 C 50 12 52 16 52 22 V 52 H 12 Z" />
  <line x1="22" y1="12" x2="22" y2="52" />
  <line x1="30" y1="24" x2="44" y2="24" />
  <line x1="30" y1="34" x2="44" y2="34" />
</svg>`;


// -----------------------------------------------------------------------------
// MAIN BUILD SCRIPT
// -----------------------------------------------------------------------------
async function generateAllAssets() {
  console.log('🚀 Starting Vocabahn Web Asset Generation...');

  // Write SVGs directly to public dir
  const svgFiles = {
    'icon.svg': LOGO_MARK_DARK_SVG,
    'icon-maskable.svg': MASKABLE_SVG,
    'logo-mark-dark.svg': LOGO_MARK_DARK_SVG,
    'logo-mark-light.svg': LOGO_MARK_LIGHT_SVG,
    'logo-dark.svg': LOGO_DARK_SVG,
    'logo-light.svg': LOGO_LIGHT_SVG,
    'logo.svg': LOGO_DARK_SVG,
    'hero-illustration.svg': HERO_ILLUSTRATION_SVG,
    'feature-fsrs.svg': FEATURE_FSRS_SVG,
    'feature-llm.svg': FEATURE_LLM_SVG,
    'feature-cefr.svg': FEATURE_CEFR_SVG,
    'badge-cefr-a1.svg': createCEFRBadgeSvg('A1', '#38bdf8', '#38bdf8', 'Beginner'),
    'badge-cefr-a2.svg': createCEFRBadgeSvg('A2', '#22d3ee', '#22d3ee', 'Elementary'),
    'badge-cefr-b1.svg': createCEFRBadgeSvg('B1', '#34d399', '#34d399', 'Intermediate'),
    'badge-cefr-b2.svg': createCEFRBadgeSvg('B2', '#fbbf24', '#fbbf24', 'Upper Int'),
    'badge-cefr-c1.svg': createCEFRBadgeSvg('C1', '#a78bfa', '#a78bfa', 'Advanced'),
    'badge-cefr-c2.svg': createCEFRBadgeSvg('C2', '#f472b6', '#f472b6', 'Mastery'),
    'badge-streak-7.svg': createStreakBadgeSvg(7, '#cd7f32', 'Bronze Streak'),
    'badge-streak-30.svg': createStreakBadgeSvg(30, '#c0c0c0', 'Silver Streak'),
    'badge-streak-100.svg': createStreakBadgeSvg(100, '#ffd700', 'Gold Streak'),
    'badge-goal-reached.svg': BADGE_GOAL_REACHED_SVG,
    'empty-queue.svg': EMPTY_QUEUE_SVG,
    'empty-search.svg': EMPTY_SEARCH_SVG,
    'empty-course.svg': EMPTY_COURSE_SVG,
    'mode-flashcards.svg': MODE_FLASHCARDS_SVG,
    'mode-writing.svg': MODE_WRITING_SVG,
    'mode-diagnostics.svg': MODE_DIAGNOSTICS_SVG,
    'mode-dictionary.svg': MODE_DICTIONARY_SVG,
  };

  for (const [filename, content] of Object.entries(svgFiles)) {
    fs.writeFileSync(path.join(PUBLIC_DIR, filename), content, 'utf8');
    console.log(` Saved SVG: ${filename}`);
  }

  // Launch Playwright Browser for rendering raster PNGs/WebPs
  const browser = await chromium.launch();
  const context = await browser.newContext();

  const rasterTasks = [
    { filename: 'favicon-16x16.png', svg: LOGO_MARK_DARK_SVG, w: 16, h: 16 },
    { filename: 'favicon-32x32.png', svg: LOGO_MARK_DARK_SVG, w: 32, h: 32 },
    { filename: 'favicon.ico', svg: LOGO_MARK_DARK_SVG, w: 32, h: 32 }, // Browser standard
    { filename: 'apple-touch-icon.png', svg: LOGO_MARK_DARK_SVG, w: 180, h: 180 },
    { filename: 'icon-192.png', svg: LOGO_MARK_DARK_SVG, w: 192, h: 192 },
    { filename: 'icon-512.png', svg: LOGO_MARK_DARK_SVG, w: 512, h: 512 },
    { filename: 'icon-maskable-192.png', svg: MASKABLE_SVG, w: 192, h: 192 },
    { filename: 'icon-maskable-512.png', svg: MASKABLE_SVG, w: 512, h: 512 },
    { filename: 'logo-mark-dark.png', svg: LOGO_MARK_DARK_SVG, w: 512, h: 512 },
    { filename: 'logo-mark-light.png', svg: LOGO_MARK_LIGHT_SVG, w: 512, h: 512 },
    { filename: 'logo-dark.png', svg: LOGO_DARK_SVG, w: 800, h: 240 },
    { filename: 'logo-light.png', svg: LOGO_LIGHT_SVG, w: 800, h: 240 },
    { filename: 'logo.png', svg: LOGO_DARK_SVG, w: 800, h: 240 },
    { filename: 'og-image.png', svg: OG_IMAGE_SVG, w: 1200, h: 630 },
    { filename: 'og-image.webp', svg: OG_IMAGE_SVG, w: 1200, h: 630, type: 'webp' },
    { filename: 'hero-bg.png', svg: HERO_ILLUSTRATION_SVG, w: 1000, h: 600 },
    { filename: 'hero-bg.webp', svg: HERO_ILLUSTRATION_SVG, w: 1000, h: 600, type: 'webp' },
    { filename: 'feature-fsrs.png', svg: FEATURE_FSRS_SVG, w: 800, h: 500 },
    { filename: 'feature-fsrs.webp', svg: FEATURE_FSRS_SVG, w: 800, h: 500, type: 'webp' },
    { filename: 'feature-llm.png', svg: FEATURE_LLM_SVG, w: 800, h: 500 },
    { filename: 'feature-llm.webp', svg: FEATURE_LLM_SVG, w: 800, h: 500, type: 'webp' },
    { filename: 'feature-cefr.png', svg: FEATURE_CEFR_SVG, w: 800, h: 500 },
    { filename: 'feature-cefr.webp', svg: FEATURE_CEFR_SVG, w: 800, h: 500, type: 'webp' },
  ];

  for (const task of rasterTasks) {
    const page = await context.newPage();
    await page.setViewportSize({ width: task.w, height: task.h });
    const html = wrapSvgInHtml(task.svg, task.w, task.h);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const screenshotFormat = task.type === 'webp' ? 'webp' : 'png';
    const filePath = path.join(PUBLIC_DIR, task.filename);
    await page.screenshot({ path: filePath, type: screenshotFormat, omitBackground: false });
    await page.close();
    console.log(` Generated Raster Asset (${task.w}x${task.h}): ${task.filename}`);
  }

  await browser.close();
  console.log('✅ Asset Generation Complete!');
}

generateAllAssets().catch((err) => {
  console.error('❌ Error generating assets:', err);
  process.exit(1);
});
