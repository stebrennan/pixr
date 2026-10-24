#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
APP="$ROOT/Pixr.app"
CONTENTS="$APP/Contents"
RESOURCES="$CONTENTS/Resources"
EXECUTABLE="$CONTENTS/MacOS/Pixr"

rm -rf "$APP"
mkdir -p "$CONTENTS/MacOS" "$RESOURCES/Web" "$ROOT/.build/module-cache"
swiftc -parse-as-library -O -module-cache-path "$ROOT/.build/module-cache" \
  "$SCRIPT_DIR/generate-icons.swift" -o "$ROOT/.build/generate-icons"
"$ROOT/.build/generate-icons" "$ROOT/assets/pixr-icon.svg" "$ROOT/assets" "$ROOT/.build/Pixr.iconset"
rm -f "$ROOT/assets/Pixr.icns"
iconutil -c icns "$ROOT/.build/Pixr.iconset" -o "$ROOT/assets/Pixr.icns"
rm -rf "$ROOT/.build/Pixr.iconset"
swiftc -parse-as-library -O -module-cache-path "$ROOT/.build/module-cache" -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
  "$SCRIPT_DIR/PixrApp.swift" -o "$EXECUTABLE"
cp "$ROOT/index.html" "$ROOT/style.css" "$ROOT/manifest.webmanifest" "$ROOT/README.md" "$RESOURCES/Web/"
cp -R "$ROOT/js" "$ROOT/assets" "$RESOURCES/Web/"
cp "$ROOT/assets/Pixr.icns" "$RESOURCES/Pixr.icns"
cat > "$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>en</string>
<key>CFBundleDisplayName</key><string>Pixr</string>
<key>CFBundleExecutable</key><string>Pixr</string>
<key>CFBundleIconFile</key><string>Pixr</string>
<key>CFBundleIdentifier</key><string>com.stebrennan.pixr</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleName</key><string>Pixr</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSApplicationCategoryType</key><string>public.app-category.graphics-design</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --deep --sign - "$APP"
echo "Built $APP"
