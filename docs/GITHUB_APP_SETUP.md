# GitHub App Setup Guide

## Quick Setup Checklist

### 1. Create GitHub App
- [ ] Go to https://github.com/settings/apps/new
- [ ] App name: `Supastate Reviews`
- [ ] Homepage URL: Your Vercel URL
- [ ] Webhook URL: `https://your-app.vercel.app/api/webhooks/github`
- [ ] Generate and save webhook secret

### 2. Set Permissions
Repository permissions:
- [ ] Contents: Read
- [ ] Metadata: Read
- [ ] Pull requests: Read & Write
- [ ] Checks: Write (optional)

### 3. Subscribe to Events
- [ ] Pull request
- [ ] Pull request review
- [ ] Pull request review comment

### 4. After Creation
- [ ] Note your App ID
- [ ] Generate and download private key (.pem file)
- [ ] Install app on your repositories

### 5. Configure Vercel
Add environment variables:
```
GITHUB_APP_ID=your-app-id
GITHUB_APP_WEBHOOK_SECRET=your-webhook-secret
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...entire private key content...
-----END RSA PRIVATE KEY-----"
```

### 6. Test Webhook
1. Create a test PR in a repository where the app is installed
2. Check Vercel function logs for webhook activity
3. Verify review session is created in Supabase

## Troubleshooting

### Webhook not triggering
- Verify webhook URL is correct in GitHub App settings
- Check webhook secret matches in Vercel env vars
- Look for delivery attempts in GitHub App advanced settings

### Authentication errors
- Ensure private key is correctly formatted (include BEGIN/END lines)
- Verify App ID is correct
- Check app is installed on the repository

### Permission errors
- Verify all required permissions are granted
- Re-install the app if permissions were changed
- Check installation has access to the specific repository