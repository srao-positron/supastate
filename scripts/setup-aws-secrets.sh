#!/bin/bash

echo "Setting up AWS credentials as Supabase secrets..."
echo "Please enter your AWS credentials:"

read -p "AWS Access Key ID: " AWS_ACCESS_KEY_ID
read -s -p "AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
echo ""
read -p "AWS Region (default: us-east-1): " AWS_REGION

AWS_REGION=${AWS_REGION:-us-east-1}

# Set the secrets in Supabase
echo "Creating Supabase secrets..."

npx supabase secrets set AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"
npx supabase secrets set AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"
npx supabase secrets set AWS_REGION="$AWS_REGION"

echo "AWS secrets configured in Supabase!"
echo "You can now use these in your Edge Functions with Deno.env.get()"