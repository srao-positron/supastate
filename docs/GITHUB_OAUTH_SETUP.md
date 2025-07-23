# GitHub OAuth Setup for Supastate

This guide walks you through configuring GitHub OAuth for Supastate authentication.

## Prerequisites

- GitHub account with ability to create OAuth Apps
- Access to your Supabase project dashboard
- Supastate running locally on port 3001

## Step 1: Create GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
   - Direct link: https://github.com/settings/developers

2. Click "New OAuth App"

3. Fill in the application details:
   - **Application name**: Supastate (or your preferred name)
   - **Homepage URL**: `http://localhost:3001` (for development)
   - **Authorization callback URL**: `http://localhost:3001/auth/callback`
   
   For production, use your actual domain:
   - **Homepage URL**: `https://your-domain.com`
   - **Authorization callback URL**: `https://your-domain.com/auth/callback`

4. Click "Register application"

5. On the next page, you'll see:
   - **Client ID**: Copy this value
   - Click "Generate a new client secret"
   - **Client Secret**: Copy this value immediately (you won't see it again)

## Step 2: Configure Supabase Auth

1. Go to your Supabase project dashboard
   - Navigate to Authentication → Providers

2. Find "GitHub" in the list of providers

3. Toggle it ON

4. Enter the credentials from GitHub:
   - **Client ID**: Paste the Client ID from GitHub
   - **Client Secret**: Paste the Client Secret from GitHub

5. Configure the redirect URL:
   - Copy the "Callback URL (for OAuth)" shown in Supabase
   - This should match what you entered in GitHub (e.g., `http://localhost:3001/auth/callback`)

6. Click "Save"

## Step 3: Environment Variables

Ensure your `.env.local` file has the correct Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Step 4: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to http://localhost:3001

3. Click "Sign in with GitHub"

4. You should be redirected to GitHub for authorization

5. After authorizing, you'll be redirected back to `/dashboard`

## Scopes Requested

The GitHub OAuth integration requests these scopes:
- `read:user` - Read user profile information
- `user:email` - Access user email addresses
- `repo` - Access user repositories (for future code graph features)

## Troubleshooting

### "Redirect URI mismatch" error
- Ensure the callback URL in GitHub matches exactly with Supabase
- Check for trailing slashes - they must match exactly
- Verify you're using the correct port (3001 in development)

### "Invalid client" error
- Double-check the Client ID and Client Secret in Supabase
- Regenerate the client secret in GitHub if needed
- Make sure you saved the changes in Supabase

### User redirected to /auth/login with error
- Check the browser console for errors
- Verify Supabase environment variables are set correctly
- Check Supabase Auth logs in the dashboard

## Production Deployment

When deploying to production:

1. Create a new GitHub OAuth App for production
2. Update the URLs to use your production domain
3. Configure environment variables in your hosting platform
4. Update Supabase Auth settings with production GitHub credentials

## Security Notes

- Never commit OAuth credentials to version control
- Use environment variables for all sensitive data
- Regularly rotate client secrets
- Monitor OAuth app usage in GitHub settings