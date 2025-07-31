#!/usr/bin/env npx tsx

// Simple test to understand what Show More should do

const mockResult = {
  content: {
    highlights: [
      "First highlight - this is the main content",
      "Second highlight - this is additional context", 
      "Third highlight - more details here",
      "Fourth highlight - even more information"
    ]
  },
  relationships: {
    memories: [
      { snippet: "Related memory 1" },
      { snippet: "Related memory 2" },
      { snippet: "Related memory 3" }
    ],
    code: [
      { path: "/src/file1.ts" },
      { path: "/src/file2.ts" },
      { path: "/src/file3.ts" }
    ]
  }
}

console.log("=== When collapsed (expanded = false) ===")
console.log("Highlights shown:", mockResult.content.highlights.slice(0, 2))
console.log("Memories shown:", mockResult.relationships.memories.slice(0, 2))
console.log("Code shown:", mockResult.relationships.code.slice(0, 2))

console.log("\n=== When expanded (expanded = true) ===")
console.log("Highlights shown:", mockResult.content.highlights.slice(0, undefined))
console.log("Memories shown:", mockResult.relationships.memories.slice(0, undefined))
console.log("Code shown:", mockResult.relationships.code.slice(0, undefined))

console.log("\n=== The issue ===")
console.log("If we only have 2 highlights total, Show More won't show any additional highlights")
console.log("If we only have duplicate highlights, it looks broken")