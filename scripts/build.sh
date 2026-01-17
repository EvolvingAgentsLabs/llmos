#!/bin/bash
# Build script for Vercel - Next.js only, no FastAPI detection

echo "Building Next.js application..."
npm run build

echo "Build complete! Python functions will be handled separately."
