#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
OUTPUT_DIR="$PROJECT_ROOT/dist"

rm -rf "$OUTPUT_DIR"

cd "$FRONTEND_DIR"
rm -rf dist
yarn install --frozen-lockfile
npm run build

cp -r dist "$OUTPUT_DIR"