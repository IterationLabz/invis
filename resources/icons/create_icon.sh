#!/bin/bash
# Create simple icon using macOS built-in tools

# Create SVG icon
cat > icon.svg << 'SVGEOF'
<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Gradient background -->
  <defs>
    <radialGradient id="grad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:rgb(102,126,234);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgb(118,75,162);stop-opacity:1" />
    </radialGradient>
  </defs>

  <!-- Circle background -->
  <circle cx="512" cy="512" r="440" fill="url(#grad)" />

  <!-- Eye symbol (invisible/stealth theme) -->
  <ellipse cx="512" cy="512" rx="200" ry="100" fill="none" stroke="white" stroke-width="16" />

  <!-- Slash through eye -->
  <line x1="312" y1="612" x2="712" y2="412" stroke="white" stroke-width="24" stroke-linecap="round" />

  <!-- Text -->
  <text x="512" y="880" font-family="Arial, sans-serif" font-size="120" font-weight="bold" fill="white" text-anchor="middle">InvisAI</text>
</svg>
SVGEOF

echo "Created icon.svg"
