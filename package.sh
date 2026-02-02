#!/bin/bash
set -e

VERSION="1.0.0.0"
PLUGIN_NAME="Jellyfin.Plugin.TheDwarfsHammer"
OUTPUT_DIR="releases"
FRAMEWORK="net9.0"

ZIP_NAME="TheDwarfsHammer_${VERSION}.zip"
DLL_PATH="bin/Release/${FRAMEWORK}/${PLUGIN_NAME}.dll"

echo "📦 Packaging The Dwarf's Hammer v${VERSION}"
echo "-------------------------------------------"

# Clean
echo "🧹 Cleaning..."
rm -rf bin obj "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

# Build
echo "🔨 Building (Release)..."
dotnet build --configuration Release

# Verify DLL exists
if [ ! -f "${DLL_PATH}" ]; then
  echo "❌ DLL not found at ${DLL_PATH}"
  exit 1
fi

# Create zip with DLL at ROOT
echo "🗜️  Creating zip (DLL at root)..."
zip -j "${OUTPUT_DIR}/${ZIP_NAME}" "${DLL_PATH}"

# Compute MD5
echo "🔐 Calculating MD5..."
CHECKSUM=$(md5sum "${OUTPUT_DIR}/${ZIP_NAME}" | cut -d' ' -f1)

echo ""
echo "✅ SUCCESS"
echo "📦 Zip: ${OUTPUT_DIR}/${ZIP_NAME}"
echo "🔐 MD5: ${CHECKSUM}"
echo ""
echo "👉 Put this in your manifest:"
echo "  \"checksum\": \"${CHECKSUM}\""
echo ""

