const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Conversation Memory ───────────────────────────────────────────────────────
const conversations = {};

// ── Analytics Tracking ────────────────────────────────────────────────────────
const analytics = {
  totalMessages: 0,
  totalConversations: 0,
  uniqueCustomers: new Set(),
  productMentions: {},
  dailyMessages: {},
  hourlyMessages: {},
  commonQuestions: {},
  ordersMentioned: 0,
  weekStart: getMonday(new Date()),
};

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function trackMessage(from, body) {
  const now = new Date();
  const dayKey = now.toISOString().split('T')[0];
  const hourKey = now.getHours();

  analytics.totalMessages++;
  analytics.uniqueCustomers.add(from);
  analytics.dailyMessages[dayKey] = (analytics.dailyMessages[dayKey] || 0) + 1;
  analytics.hourlyMessages[hourKey] = (analytics.hourlyMessages[hourKey] || 0) + 1;

  const bodyLower = body.toLowerCase();

  // Track product mentions
  const products = [
    'french curl', 'italian curl', 'body wave', 'spring curl',
    'passion twist', 'bone straight', 'human hair', 'kinky',
    'braid rack', 'hair clip', 'ponytail', 'mally twist'
  ];
  products.forEach(p => {
    if (bodyLower.includes(p)) {
      analytics.productMentions[p] = (analytics.productMentions[p] || 0) + 1;
    }
  });

  // Track order intent
  if (bodyLower.includes('order') || bodyLower.includes('buy') || bodyLower.includes('purchase') || bodyLower.includes('want')) {
    analytics.ordersMentioned++;
  }
}

function getTopItems(obj, n = 3) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ') || 'None';
}

function getBusiestDay(dailyMessages) {
  if (Object.keys(dailyMessages).length === 0) return 'N/A';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const busiest = Object.entries(dailyMessages).sort((a, b) => b[1] - a[1])[0];
  if (!busiest) return 'N/A';
  const date = new Date(busiest[0]);
  return `${days[date.getDay()]} (${busiest[1]} messages)`;
}

function getBusiestHour(hourlyMessages) {
  if (Object.keys(hourlyMessages).length === 0) return 'N/A';
  const busiest = Object.entries(hourlyMessages).sort((a, b) => b[1] - a[1])[0];
  if (!busiest) return 'N/A';
  const hour = parseInt(busiest[0]);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:00 ${ampm}`;
}

// ── Send Email via Resend API ─────────────────────────────────────────────────
async function sendWeeklyReport() {
  try {
    const weekEnd = new Date();
    const weekStartStr = analytics.weekStart.toDateString();
    const weekEndStr = weekEnd.toDateString();

    const topProducts = getTopItems(analytics.productMentions);
    const busiestDay = getBusiestDay(analytics.dailyMessages);
    const busiestHour = getBusiestHour(analytics.hourlyMessages);

    const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1c0a00, #c9a96e); padding: 30px; text-align: center; }
    .header h1 { color: #f0cc8a; margin: 0; font-size: 24px; }
    .header p { color: #c9a96e; margin: 8px 0 0; }
    .body { padding: 30px; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; }
    .stat { background: #fdf8f3; border-radius: 10px; padding: 16px; text-align: center; border: 1px solid #ede5da; }
    .stat .number { font-size: 32px; font-weight: bold; color: #3b1500; }
    .stat .label { font-size: 12px; color: #b59a7a; margin-top: 4px; }
    .section { margin: 20px 0; padding: 16px; background: #fdf8f3; border-radius: 10px; border: 1px solid #ede5da; }
    .section h3 { color: #3b1500; margin: 0 0 10px; font-size: 14px; }
    .section p { color: #6b4c2a; margin: 4px 0; font-size: 13px; }
    .footer { background: #fdf8f3; padding: 20px; text-align: center; font-size: 12px; color: #b59a7a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>👑 Enog Beauty Castle</h1>
      <p>Weekly AI Agent Report</p>
      <p style="font-size:12px">${weekStartStr} — ${weekEndStr}</p>
    </div>
    <div class="body">
      <p style="color:#6b4c2a">Hello Enog! Here's how your AI agent performed this week:</p>
      
      <div class="stat-grid">
        <div class="stat">
          <div class="number">${analytics.totalMessages}</div>
          <div class="label">Total Messages</div>
        </div>
        <div class="stat">
          <div class="number">${analytics.uniqueCustomers.size}</div>
          <div class="label">Unique Customers</div>
        </div>
        <div class="stat">
          <div class="number">${analytics.ordersMentioned}</div>
          <div class="label">Order Intentions</div>
        </div>
        <div class="stat">
          <div class="number">${Object.keys(analytics.dailyMessages).length}</div>
          <div class="label">Active Days</div>
        </div>
      </div>

      <div class="section">
        <h3>🛍️ Most Asked Products</h3>
        <p>${topProducts || 'No product mentions yet'}</p>
      </div>

      <div class="section">
        <h3>📅 Busiest Day</h3>
        <p>${busiestDay}</p>
      </div>

      <div class="section">
        <h3>⏰ Busiest Hour</h3>
        <p>${busiestHour}</p>
      </div>

      <div class="section">
        <h3>💡 Insight</h3>
        <p>Your AI agent handled <strong>${analytics.totalMessages} messages</strong> from <strong>${analytics.uniqueCustomers.size} customers</strong> this week — all automatically, 24/7, even while you slept! 🎉</p>
      </div>
    </div>
    <div class="footer">
      Powered by Enog Beauty Castle AI Agent 🤖 | Owerri, Nigeria
    </div>
  </div>
</body>
</html>`;

    // Send via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Enog Beauty Castle AI <onboarding@resend.dev>',
        to: ['pnoghayinpromise@gmail.com'],
        subject: `📊 Weekly Report — ${weekStartStr} to ${weekEndStr}`,
        html: htmlReport,
      }),
    });

    const data = await response.json();
    console.log('Weekly report sent:', data.id);

    // Reset analytics for new week
    analytics.totalMessages = 0;
    analytics.uniqueCustomers = new Set();
    analytics.productMentions = {};
    analytics.dailyMessages = {};
    analytics.hourlyMessages = {};
    analytics.ordersMentioned = 0;
    analytics.weekStart = getMonday(new Date());

  } catch (err) {
    console.error('Failed to send weekly report:', err.message);
  }
}

// Schedule weekly report every Monday at 8am Nigeria time (7am UTC)
function scheduleWeeklyReport() {
  const now = new Date();
  const nextMonday = getMonday(new Date());
  nextMonday.setDate(nextMonday.getDate() + 7);
  nextMonday.setHours(7, 0, 0, 0);
  const msUntilMonday = nextMonday - now;
  console.log(`Next weekly report in ${Math.round(msUntilMonday / 3600000)} hours`);
  setTimeout(() => {
    sendWeeklyReport();
    setInterval(sendWeeklyReport, 7 * 24 * 60 * 60 * 1000);
  }, msUntilMonday);
}

// ── Business System Prompt ────────────────────────────────────────────────────
const BUSINESS_INFO = `You are a WhatsApp sales rep for Enog Beauty Castle, a hair extensions shop in Owerri Nigeria. Chat like a real Nigerian hair seller — warm, natural, professional.

RULES:
- Short replies (max 3 lines)
- Max 1 emoji per reply, only if natural
- Ask only 1 question per reply
- Sound like a real person texting, NOT a bot
- NEVER greet mid-conversation

PRODUCTS: French Curls 12" & 24" from N4,000 | Italian Curls 18" from N4,000 | Body Waves/Spring Curls/Passion Twist from N4,000 | Bone Straight 16" & 26" from N4,000 | Human Hair Kinky N25,000 | Braid Rack N29,500 | Hair Clips N2,000 | Ponytails N15,000 | Mally Twist: OUT OF STOCK
Color affects price - always ask color. Long hair 4-5 packs, short 3-4 packs.
PAYMENT: Moniepoint 5057191869 / UBA 1025287866 - Enog Beauty Castle. GTB & Paystack available.
DELIVERY: Owerri free/same day. Nigeria free/5 working days. International extra charge.
POLICY: 100% refund if not as described. Mon-Sat 8am-6pm. No wigs sold. Wholesale available.`;

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Enog Beauty Castle AI Agent is running! 👑'));
app.get('/webhook', (req, res) => res.send('Webhook is live!'));

// Manual report trigger (for testing)
app.get('/send-report', async (req, res) => {
  await sendWeeklyReport();
  res.send('Weekly report sent!');
});

app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');

  try {
    const { Body, From, To } = req.body;
    if (!Body || !From || !To) return;

    console.log(`[${new Date().toISOString()}] From: ${From} | Message: ${Body}`);

    // Track analytics
    trackMessage(From, Body);

    // Get or create conversation
    if (!conversations[From]) {
      conversations[From] = { history: [], lastActive: Date.now() };
      analytics.totalConversations++;
    }

    const conv = conversations[From];
    conv.lastActive = Date.now();
    const isFirst = conv.history.length === 0;

    conv.history.push({ role: 'user', content: Body });
    if (conv.history.length > 20) conv.history = conv.history.slice(-20);

    const systemPrompt = `${BUSINESS_INFO}

CONVERSATION STATUS: ${isFirst
  ? 'NEW conversation - give one short warm greeting then ask what they need.'
  : 'ONGOING conversation - DO NOT greet. Reply directly to what they said.'}`;

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

    console.log(`[${new Date().toISOString()}] Reply: ${reply}`);

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

  } catch (err) {
    console.error('Error:', err.message);
  }
});

// Clean up old conversations every hour
setInterval(() => {
  const oneDay = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const key in conversations) {
    if (now - conversations[key].lastActive > oneDay) delete conversations[key];
  }
}, 3600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Enog Beauty Castle Agent running on port ${PORT}`);
  scheduleWeeklyReport();
});
