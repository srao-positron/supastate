#!/bin/bash
# Generate a test embedding array with 3072 values

# Create array with 3072 values of 0.1
values=""
for i in {1..3072}; do
  if [ -z "$values" ]; then
    values="0.1"
  else
    values="${values},0.1"
  fi
done

echo "$values"