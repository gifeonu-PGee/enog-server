const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// In-memory conversation store
const conversations = {};

const SYSTEM = `You are a WhatsApp sales rep for Enog Beauty Castle, a hair extensions shop in Owerri Nigeria. Chat like a real Nigerian hair seller — warm, natural, professional.

RULES:
- Short replies (max 3 lines)
- Max 1 emoji per reply, only if natural
- Ask only 1 question per reply
- Sound like a real person texting, NOT a bot
- NEVER greet mid-conversation

PRODUCTS: French Curls 12" & 24" from ₦4,000 | Italian Curls 18" from ₦4,000 | Body Waves/Spring Curls/Passion Twist from ₦4,000 | Bone Straight 16" & 26" from ₦4,000 | Human Hair Kinky ₦25,000 | Braid Rack ₦29,500 | Hair Clips ₦2,000 | Ponytails ₦15,000 | Mally Twist: OUT OF STOCK
Color affects price — always ask color. Long hair 4-5 packs, short 3-4 packs.
PAYMENT: Moniepoint 5057191869 / UBA 1025287866 — Enog Beauty Castle. GTB & Paystack available.
DELIVERY: Owerri free/same day. Nigeria free/5 working days. International extra charge.
POLICY: 100% refund if not as described. Mon-Sat 8am-6pm. No wigs sold. Wholesale available.`;

app.get('/', (req, res) => res.send('Enog Beauty Castle AI Agent is running! 👑'));

app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');
  
  try {
    const { Body, From, To } = req.body;
    if (!Body || !From) return;

    // Get or create conversation
    if (!conversations[From]) {
      conversations[From] = { history: [], lastActive: Date.now() };
    }
    
    const conv = conversations[From];
    conv.lastActive = Date.now();
    const isFirst = conv.history.length === 0;
    
    conv.history.push({ role: 'user', content: Body });
    if (conv.history.length > 20) conv.history = conv.history.slice(-20);

    const systemPrompt = `${SYSTEM}

CONVERSATION STATUS: ${isFirst 
  ? 'NEW conversation — give one short warm greeting then ask what they need.' 
  : 'ONGOING conversation — NO greeting at all. Reply directly to what they said.'}`;

    // Call Claude AI
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: systemPrompt,
        messages: conv.history,
      }),
    });

    const aiData = await aiRes.json();
    const reply = aiData.content?.[0]?.text || "How can I help you? 😊";
    conv.history.push({ role: 'assistant', content: reply });

    // Send WhatsApp reply
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      },
      body: new URLSearchParams({ From: To, To: From, Body: reply }).toString(),
    });

    console.log(`[${From}] Customer: ${Body}`);
    console.log(`[${From}] Agent: ${reply}`);

  } catch (err) {
    console.error('Error:', err.message);
  }
});

// Clean up old conversations every hour
setInterval(() => {
  const oneDay = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const key in conversations) {
    if (now - conversations[key].lastActive > oneDay) {
      delete conversations[key];
    }
  }
}, 3600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Enog Beauty Castle Agent running on port ${PORT}`));
