# Yashdeep Singh — Portfolio

Personal portfolio for Yashdeep Singh (Yash), software developer with a cybersecurity degree. Secure software, engineered with intent.

Pure HTML / CSS / JavaScript. No build step — open `index.html` in a browser, or serve the folder with any static server (e.g. `npx serve`) for the full experience.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure, all content, SEO meta tags, font loading |
| `style.css` | All styling, themes, Apple-grade Liquid Glass, and animations (design tokens in `:root`) |
| `script.js` | All interactions: lab, terminal, soundtrack engine, clock, counters, reveals, theme toggle |
| `favicon.svg` | YS brand mark for the browser tab |
| `robots.txt`, `sitemap.xml` | Help search engines find and index the site (replace `yourdomain.com` with your real domain) |

## Sections

01 About · 02 Expertise · 03 Lab · 04 Approach · 05 Experience · 06 Terminal · 07 Get in touch

## Features

- Particle-network hero with a headline that decrypts into place, live Calgary clock, scrolling skills ticker
- Apple-grade Liquid Glass: genuinely refracting panes (SVG displacement), cursor-tracked specular light, frosted translucency, squircle radii — with solid-panel fallbacks
- **Soundtrack:** generative futuristic ambient loop synthesized live with Web Audio (no audio file) — detuned pads, sub-bass, echoing arpeggio. Glass equalizer toggle in the rail/top bar, `sound` command in the terminal, self-healing engine that survives screen lock and backgrounding. Starts on first interaction (browser autoplay policy), mutable anytime.
- **Lab:** live AES-256-GCM encrypt / decrypt / tamper demo (Web Crypto API, key generated in-browser — nothing leaves the device). Clean output showing just ciphertext and decrypted result.
- **Terminal:** working in-page terminal — type `help` to see commands (`skills`, `goto`, `theme`, `sound`, `sudo`, …)
- Light / dark themes (deep-space navy + cyan/violet dark, icy blue/cyan light)
- Futuristic type pairing: Michroma display, Oxanium body, JetBrains Mono for terminal
- Reveal-on-scroll animations and hover micro-interactions, all disabled under `prefers-reduced-motion`
- Contact form composes a pre-addressed email in the visitor's mail app; one-click email copy button
- Privacy-friendly: no cookies, no trackers

## Deploy

Drop the folder on any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages). Then replace `yourdomain.com` in `robots.txt` and `sitemap.xml` with your real domain.
