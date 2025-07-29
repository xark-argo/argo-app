#!/bin/bash

cd "$(dirname "$0")"/..


APP_PATH="${1:-}"
OUTPUT_DMG="${2:-}"

if [[ -z "$APP_PATH" || -z "$OUTPUT_DMG" ]]; then
  echo "❌ Usage: $0 <APP_PATH> <DMG_OUT_PATH>"
  exit 1
fi

if [ ! -d "$APP_PATH" ]; then
  echo "❌ App path does not exist: $APP_PATH"
  exit 1
fi

DMG_CONFIG_FILE="appdmg.json"

if ! command -v appdmg &> /dev/null; then
    echo "appdmg is not installed, installing..."
    npm install -g appdmg
fi

echo "🔧 Generating DMG configuration..."
cat <<EOF > "$DMG_CONFIG_FILE"
{
  "title": "Argo Application",
  "icon": "icons/argo.icns",
  "icon-size": 114,
  "background": "icons/dmg_background.png",
  "contents": [
    { "x": 480, "y": 220, "type": "link", "path": "/Applications" },
    { "x": 140, "y": 220, "type": "file", "path": "$APP_PATH" }
  ]
}
EOF

echo "📦 Building DMG: $OUTPUT_DMG..."
npx appdmg "$DMG_CONFIG_FILE" "$OUTPUT_DMG"

if [ $? -eq 0 ]; then
    echo "✅ DMG created successfully: $OUTPUT_DMG"
else
    echo "❌ Failed to create DMG"
    exit 1
fi

rm "$DMG_CONFIG_FILE"