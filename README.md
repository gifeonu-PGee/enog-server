# Enog Beauty Castle — WhatsApp AI Server

## Deploy on Railway

1. Go to https://railway.app and sign up with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select this repository
4. Add these Environment Variables:
   - ANTHROPIC_API_KEY = your Claude API key
   - TWILIO_ACCOUNT_SID = your Twilio SID
   - TWILIO_AUTH_TOKEN = your Twilio Auth Token
5. Click Deploy
6. Copy the generated URL (e.g. https://enog-server.up.railway.app)
7. Go to Twilio Sandbox Settings
8. Set webhook URL to: https://your-railway-url/webhook
9. Done! Full memory WhatsApp AI agent is live!
