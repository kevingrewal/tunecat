#!/usr/bin/env python3
"""
Generate TuneCat Chrome extension icons (16x16, 48x48, 128x128).
Pure Python PNG generation using only struct and zlib.
Produces a cat face silhouette with pointed ears on a transparent background.
"""

import struct
import zlib
import math


def create_png(width, height, pixels):
    """
    Create a PNG file from RGBA pixel data.
    pixels: list of rows, each row is a list of (R, G, B, A) tuples.
    """

    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + chunk + crc

    # PNG signature
    signature = b"\x89PNG\r\n\x1a\n"

    # IHDR chunk: width, height, bit depth 8, color type 6 (RGBA)
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    ihdr = make_chunk(b"IHDR", ihdr_data)

    # IDAT chunk - image data
    raw_data = b""
    for row in pixels:
        raw_data += b"\x00"  # filter byte (None)
        for r, g, b, a in row:
            raw_data += struct.pack("BBBB", r, g, b, a)

    compressed = zlib.compress(raw_data)
    idat = make_chunk(b"IDAT", compressed)

    # IEND chunk
    iend = make_chunk(b"IEND", b"")

    return signature + ihdr + idat + iend


def point_in_ellipse(px, py, cx, cy, rx, ry):
    """Check if point (px,py) is inside ellipse centered at (cx,cy) with radii rx,ry."""
    if rx == 0 or ry == 0:
        return False
    return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1.0


def point_in_triangle(px, py, x1, y1, x2, y2, x3, y3):
    """Check if point is inside triangle using barycentric coordinates."""
    denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
    if abs(denom) < 1e-10:
        return False
    a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / denom
    b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / denom
    c = 1.0 - a - b
    return a >= 0 and b >= 0 and c >= 0


def sample_pixel(x, y, size, is_cat_func):
    """
    Supersample a pixel with NxN grid for antialiasing.
    Returns alpha value 0-255.
    """
    samples = 5 if size >= 48 else 4
    count = 0
    for sy in range(samples):
        for sx in range(samples):
            fx = x + (sx + 0.5) / samples
            fy = y + (sy + 0.5) / samples
            if is_cat_func(fx, fy, size):
                count += 1
    return int(255 * count / (samples * samples))


def is_cat_shape(fx, fy, size):
    """
    Define the cat face silhouette shape for 48px and 128px.
    Coordinates normalized to [0,1].
    Features: rounded head, pointed ears, music note cutout.
    """
    s = size
    nx = fx / s
    ny = fy / s

    # --- Main head: ellipse ---
    head_cx, head_cy = 0.50, 0.58
    head_rx, head_ry = 0.35, 0.33

    in_head = point_in_ellipse(nx, ny, head_cx, head_cy, head_rx, head_ry)

    # --- Cheeks: slight bulge on sides for rounder look ---
    left_cheek = point_in_ellipse(nx, ny, 0.30, 0.62, 0.14, 0.18)
    right_cheek = point_in_ellipse(nx, ny, 0.70, 0.62, 0.14, 0.18)

    # --- Left ear (triangle) ---
    left_ear = point_in_triangle(
        nx, ny,
        0.14, 0.46,   # outer base
        0.38, 0.46,   # inner base
        0.20, 0.08,   # tip
    )

    # --- Right ear (triangle, mirrored) ---
    right_ear = point_in_triangle(
        nx, ny,
        0.62, 0.46,   # inner base
        0.86, 0.46,   # outer base
        0.80, 0.08,   # tip
    )

    # --- Inner ear cutouts (negative space for detail) ---
    left_ear_inner = point_in_triangle(
        nx, ny,
        0.20, 0.44,
        0.35, 0.44,
        0.23, 0.17,
    )
    right_ear_inner = point_in_triangle(
        nx, ny,
        0.65, 0.44,
        0.80, 0.44,
        0.77, 0.17,
    )

    # --- Music note (negative space cutout from head) ---
    # Note head: small tilted ellipse
    note_cx, note_cy = 0.62, 0.68
    note_rx, note_ry = 0.050, 0.035

    # Rotate the note head slightly
    angle = -0.3
    dnx = nx - note_cx
    dny = ny - note_cy
    rnx = dnx * math.cos(angle) - dny * math.sin(angle)
    rny = dnx * math.sin(angle) + dny * math.cos(angle)
    in_note_head = (rnx / note_rx) ** 2 + (rny / note_ry) ** 2 <= 1.0

    # Stem
    stem_x = note_cx + note_rx * 0.85
    stem_bottom = note_cy - note_ry * 0.2
    stem_top = note_cy - 0.19
    stem_w = 0.015
    in_stem = (abs(nx - stem_x) < stem_w / 2 and stem_top <= ny <= stem_bottom)

    # Flag at top of stem
    flag_cx = stem_x + 0.025
    flag_cy = stem_top + 0.025
    flag_rx = 0.030
    flag_ry = 0.035
    in_flag = point_in_ellipse(nx, ny, flag_cx, flag_cy, flag_rx, flag_ry)

    is_note = in_note_head or in_stem or in_flag

    # --- Eyes (negative space - two small ellipses) ---
    left_eye = point_in_ellipse(nx, ny, 0.38, 0.56, 0.040, 0.035)
    right_eye = point_in_ellipse(nx, ny, 0.62, 0.56, 0.040, 0.035)

    # Only show eyes at 128px (too small otherwise)
    show_eyes = size >= 96

    # --- Combine shape ---
    in_silhouette = in_head or left_cheek or right_cheek or left_ear or right_ear

    # Inner ear cutouts (only at larger sizes)
    if size >= 40 and (left_ear_inner or right_ear_inner):
        in_silhouette = False

    # Note cutout
    if is_note and in_silhouette:
        in_silhouette = False

    # Eye cutouts
    if show_eyes and (left_eye or right_eye) and in_silhouette:
        in_silhouette = False

    return in_silhouette


def is_cat_shape_16(fx, fy, size):
    """
    Simplified cat shape for 16x16 pixel art.
    Bigger features, no fine details. Must read as 'cat' at tiny size.
    """
    s = size
    nx = fx / s
    ny = fy / s

    # Bigger rounder head
    head_cx, head_cy = 0.50, 0.60
    head_rx, head_ry = 0.40, 0.34

    in_head = point_in_ellipse(nx, ny, head_cx, head_cy, head_rx, head_ry)

    # Prominent ears
    left_ear = point_in_triangle(
        nx, ny,
        0.10, 0.48,
        0.40, 0.48,
        0.16, 0.04,
    )
    right_ear = point_in_triangle(
        nx, ny,
        0.60, 0.48,
        0.90, 0.48,
        0.84, 0.04,
    )

    return in_head or left_ear or right_ear


def in_rounded_rect(fx, fy, size, radius_frac=0.15):
    """Check if point is inside a rounded rectangle filling the icon."""
    nx = fx / size
    ny = fy / size
    r = radius_frac
    # Inset slightly from edges
    margin = 0.02
    x0, y0 = margin, margin
    x1, y1 = 1.0 - margin, 1.0 - margin

    # Inside the main body (excluding corners)
    if x0 + r <= nx <= x1 - r and y0 <= ny <= y1:
        return True
    if x0 <= nx <= x1 and y0 + r <= ny <= y1 - r:
        return True
    # Check rounded corners
    corners = [
        (x0 + r, y0 + r),
        (x1 - r, y0 + r),
        (x0 + r, y1 - r),
        (x1 - r, y1 - r),
    ]
    for cx, cy in corners:
        if ((nx - cx) / r) ** 2 + ((ny - cy) / r) ** 2 <= 1.0:
            return True
    return False


def sample_bg_pixel(x, y, size):
    """Supersample the background rounded rect for antialiasing."""
    samples = 5 if size >= 48 else 4
    count = 0
    for sy in range(samples):
        for sx in range(samples):
            fx = x + (sx + 0.5) / samples
            fy = y + (sy + 0.5) / samples
            if in_rounded_rect(fx, fy, size):
                count += 1
    return int(255 * count / (samples * samples))


def generate_icon(size, filepath):
    """Generate a single icon PNG file."""
    cat_r, cat_g, cat_b = 0x1A, 0x1A, 0x2E  # dark cat silhouette
    bg_r, bg_g, bg_b = 0xFF, 0x4D, 0x6A      # red accent background

    pixels = []
    shape_func = is_cat_shape_16 if size <= 16 else is_cat_shape

    for y in range(size):
        row = []
        for x in range(size):
            cat_alpha = sample_pixel(x, y, size, shape_func)
            bg_alpha = sample_bg_pixel(x, y, size)

            if bg_alpha == 0:
                # Outside the rounded rect — transparent
                row.append((0, 0, 0, 0))
            elif cat_alpha == 255:
                # Fully inside cat — dark color
                row.append((cat_r, cat_g, cat_b, bg_alpha))
            elif cat_alpha > 0:
                # Cat edge — blend cat over background
                t = cat_alpha / 255.0
                r = int(cat_r * t + bg_r * (1 - t))
                g = int(cat_g * t + bg_g * (1 - t))
                b = int(cat_b * t + bg_b * (1 - t))
                row.append((r, g, b, bg_alpha))
            else:
                # Inside rounded rect but outside cat — red background
                row.append((bg_r, bg_g, bg_b, bg_alpha))
        pixels.append(row)

    png_data = create_png(size, size, pixels)
    with open(filepath, "wb") as f:
        f.write(png_data)
    print(f"  Generated {filepath} ({size}x{size}, {len(png_data)} bytes)")


def main():
    base_dir = "/Users/shroom/Desktop/Personal_Projects/tunecat/src/icons"
    icons = [
        (16, f"{base_dir}/icon16.png"),
        (48, f"{base_dir}/icon48.png"),
        (128, f"{base_dir}/icon128.png"),
    ]

    print("Generating TuneCat icons...")
    for size, path in icons:
        generate_icon(size, path)
    print("Done! All icons generated successfully.")


if __name__ == "__main__":
    main()
