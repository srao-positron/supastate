#!/bin/bash

# Clean previous build
rm -rf lambda-dist
mkdir -p lambda-dist

# Compile TypeScript
npx tsc lambda-handler.ts --outDir lambda-dist --target es2020 --module commonjs --esModuleInterop true --resolveJsonModule true

# Copy package.json for dependencies
cp package.json lambda-dist/

# Install production dependencies in lambda-dist
cd lambda-dist
npm install --production --omit=dev
cd ..

# Rename the handler file to index.js for Lambda
mv lambda-dist/lambda-handler.js lambda-dist/index.js

echo "Lambda build complete!"