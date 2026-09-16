#!/usr/bin/env python3
"""
Create a custom icon for InvisAI
This creates a simple but professional icon with a privacy theme
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon():
    # Create icon sizes for macOS
    sizes = [16, 32, 64, 128, 256, 512, 1024]

    for size in sizes:
        # Create image with transparent background
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Calculate dimensions
        padding = size // 8

        # Draw gradient circle background
        for i in range(size):
            for j in range(size):
                # Calculate distance from center
                dx = i - size/2
                dy = j - size/2
                distance = (dx**2 + dy**2)**0.5

                if distance < size/2 - padding:
                    # Purple gradient
                    r = int(102 + (distance / (size/2)) * 50)
                    g = int(126 - (distance / (size/2)) * 50)
                    b = int(234 - (distance / (size/2)) * 100)
                    a = 255
                    img.putpixel((i, j), (r, g, b, a))

        # Draw privacy symbol (eye with line through it)
        eye_width = size // 3
        eye_height = size // 6
        center_x = size // 2
        center_y = size // 2

        # Draw eye outline
        eye_bbox = [
            center_x - eye_width,
            center_y - eye_height,
            center_x + eye_width,
            center_y + eye_height
        ]
        draw.ellipse(eye_bbox, outline=(255, 255, 255), width=max(2, size//64))

        # Draw slash through eye
        slash_start = (center_x - eye_width, center_y + eye_height)
        slash_end = (center_x + eye_width, center_y - eye_height)
        draw.line([slash_start, slash_end], fill=(255, 255, 255), width=max(3, size//32))

        # Save
        output_file = f'resources/icons/icon_{size}x{size}.png'
        img.save(output_file, 'PNG')
        print(f'Created {output_file}')

    # Create .icns file for macOS
    print('\nTo create .icns file, run:')
    print('mkdir icon.iconset')
    print('sips -z 16 16     resources/icons/icon_16x16.png     --out icon.iconset/icon_16x16.png')
    print('sips -z 32 32     resources/icons/icon_32x32.png     --out icon.iconset/icon_16x16@2x.png')
    print('sips -z 32 32     resources/icons/icon_32x32.png     --out icon.iconset/icon_32x32.png')
    print('sips -z 64 64     resources/icons/icon_64x64.png     --out icon.iconset/icon_32x32@2x.png')
    print('sips -z 128 128   resources/icons/icon_128x128.png   --out icon.iconset/icon_128x128.png')
    print('sips -z 256 256   resources/icons/icon_256x256.png   --out icon.iconset/icon_128x128@2x.png')
    print('sips -z 256 256   resources/icons/icon_256x256.png   --out icon.iconset/icon_256x256.png')
    print('sips -z 512 512   resources/icons/icon_512x512.png   --out icon.iconset/icon_256x256@2x.png')
    print('sips -z 512 512   resources/icons/icon_512x512.png   --out icon.iconset/icon_512x512.png')
    print('sips -z 1024 1024 resources/icons/icon_1024x1024.png --out icon.iconset/icon_512x512@2x.png')
    print('iconutil -c icns icon.iconset -o resources/icons/icon.icns')

if __name__ == '__main__':
    try:
        from PIL import Image, ImageDraw
        create_icon()
    except ImportError:
        print("PIL not installed. Creating icon using ImageMagick instead...")
        print("Run: brew install imagemagick")
