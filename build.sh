#!/bin/bash

# Build script for The Dwarf's Hammer Jellyfin Plugin

echo "Building The Dwarf's Hammer plugin..."

# Clean previous builds
if [ -d "bin" ]; then
    echo "Cleaning previous build..."
    rm -rf bin
fi

if [ -d "obj" ]; then
    rm -rf obj
fi

# Build the plugin
echo "Building plugin..."
dotnet build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "Plugin DLL location:"
    echo "  bin/Release/net9.0/Jellyfin.Plugin.TheDwarfsHammer.dll"
    echo ""
    echo "To install:"
    echo "  1. Copy the DLL to your Jellyfin plugins folder:"
    echo "     /var/lib/jellyfin/plugins/TheDwarfsHammer/"
    echo ""
    echo "  2. Restart Jellyfin"
    echo ""
    echo "  3. Go to Dashboard → Plugins → The Dwarf's Hammer to configure"
    echo ""
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi
