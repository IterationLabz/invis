#!/bin/bash
# Build macOS .icns icon from SVG

cd "$(dirname "$0")"

echo "🎨 Building InvisAI icon..."

# Create iconset directory
mkdir -p InvisAI.iconset

# Generate PNG files at required sizes
# Using qlmanage (QuickLook) to render SVG
for size in 16 32 128 256 512; do
  echo "Generating ${size}x${size}..."
  # Use sips to convert and resize
  qlmanage -t -s $size -o . icon.svg 2>/dev/null
  mv icon.svg.png InvisAI.iconset/icon_${size}x${size}.png 2>/dev/null

  # Also create @2x versions
  double=$((size * 2))
  if [ $double -le 1024 ]; then
    qlmanage -t -s $double -o . icon.svg 2>/dev/null
    mv icon.svg.png InvisAI.iconset/icon_${size}x${size}@2x.png 2>/dev/null
  fi
done

# Create .icns file
echo "📦 Creating .icns file..."
iconutil -c icns InvisAI.iconset -o icon.icns

# Cleanup
rm -rf InvisAI.iconset

if [ -f "icon.icns" ]; then
  echo "✅ Icon created successfully: icon.icns"
  ls -lh icon.icns
else
  echo "❌ Failed to create icon"
  exit 1
fi
