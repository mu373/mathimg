#!/bin/bash
set -e

# Configuration
VERSION="${1:-1.0.0}"
APP_NAME="MathEdit"
SCHEME="MathEdit"
PROJECT_DIR="MathEdit"
BUILD_DIR="build"
DMG_NAME="${APP_NAME}-${VERSION}.dmg"

echo "Building ${APP_NAME} v${VERSION}"

# Step 1: Build web assets
echo "Building web assets..."
pnpm install
pnpm build:native

# Step 2: Build macOS app
echo "Building macOS app..."
mkdir -p "${BUILD_DIR}"

xcodebuild -project "${PROJECT_DIR}/${APP_NAME}.xcodeproj" \
    -scheme "${SCHEME}" \
    -configuration Release \
    -archivePath "${BUILD_DIR}/${APP_NAME}.xcarchive" \
    archive

# Step 3: Export app
echo "Exporting app..."
xcodebuild -exportArchive \
    -archivePath "${BUILD_DIR}/${APP_NAME}.xcarchive" \
    -exportPath "${BUILD_DIR}/export" \
    -exportOptionsPlist "scripts/ExportOptions.plist"

# Step 4: Create DMG
echo "Creating DMG..."
DMG_TEMP="/tmp/dmg-contents"
rm -rf "${DMG_TEMP}"
mkdir -p "${DMG_TEMP}"

cp -R "${BUILD_DIR}/export/${APP_NAME}.app" "${DMG_TEMP}/"
ln -s /Applications "${DMG_TEMP}/Applications"

hdiutil create -volname "${APP_NAME}" \
    -srcfolder "${DMG_TEMP}" \
    -ov -format UDZO \
    "${BUILD_DIR}/${DMG_NAME}"

rm -rf "${DMG_TEMP}"

echo "Build complete: ${BUILD_DIR}/${DMG_NAME}"

# Step 5: Create GitHub release (optional)
if command -v gh &> /dev/null && [ "${2}" = "--release" ]; then
    echo "Creating GitHub release..."

    # Create tag if it doesn't exist
    if ! git rev-parse "v${VERSION}" >/dev/null 2>&1; then
        git tag "v${VERSION}"
    fi
    git push origin "v${VERSION}" --force

    # Get tag message if available (strip PGP signature if present)
    TAG_MESSAGE=$(git tag -l --format='%(contents)' "v${VERSION}" 2>/dev/null | sed '/-----BEGIN PGP SIGNATURE-----/,$d' | head -20)

    # Build release notes
    RELEASE_NOTES="## Installation

1. Download \`${DMG_NAME}\`
2. Open the DMG and drag ${APP_NAME} to Applications
3. **First launch:** Right-click the app → Open → Click \"Open\"

> **Note:** The app is not notarized by Apple. When opened with double-click, macOS will show a security warning. Use right-click → Open to bypass this.

## Requirements
- macOS 15.0 or later"

    # Append tag message if available
    if [ -n "${TAG_MESSAGE}" ]; then
        RELEASE_NOTES="${TAG_MESSAGE}

${RELEASE_NOTES}"
    fi

    gh release create "v${VERSION}" "${BUILD_DIR}/${DMG_NAME}" \
        --title "v${VERSION} (macOS)" \
        --notes "${RELEASE_NOTES}"

    echo "Release published!"
fi
