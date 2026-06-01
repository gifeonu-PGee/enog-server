const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// CORS - allow all origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

const conversations = {};
const imageCounts = {};

const analytics = {
  totalMessages: 0,
  totalConversations: 0,
  uniqueCustomers: new Set(),
  productMentions: {},
  dailyMessages: {},
  hourlyMessages: {},
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
  const products = ['french curl', 'italian curl', 'body wave', 'deep wave', 'spring twist',
    'passion twist', 'bone straight', 'human hair', 'kinky', 'braid rack', 'gogo curl',
    'malley twist', 'mally twist', 'boho braid', 'braided wig'];
  products.forEach(p => {
    if (bodyLower.includes(p)) {
      analytics.productMentions[p] = (analytics.productMentions[p] || 0) + 1;
    }
  });
  if (bodyLower.includes('order') || bodyLower.includes('buy') || bodyLower.includes('want')) {
    analytics.ordersMentioned++;
  }
}

function getTopItems(obj, n = 3) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${k}: ${v}`).join(', ') || 'None';
}

function getBusiestDay(dailyMessages) {
  if (!Object.keys(dailyMessages).length) return 'N/A';
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const busiest = Object.entries(dailyMessages).sort((a, b) => b[1] - a[1])[0];
  if (!busiest) return 'N/A';
  return `${days[new Date(busiest[0]).getDay()]} (${busiest[1]} messages)`;
}

function getBusiestHour(hourlyMessages) {
  if (!Object.keys(hourlyMessages).length) return 'N/A';
  const busiest = Object.entries(hourlyMessages).sort((a, b) => b[1] - a[1])[0];
  if (!busiest) return 'N/A';
  const hour = parseInt(busiest[0]);
  return `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}

// Upstash Redis helpers
async function redisGet(key) {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    const r = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, ex = 604800) {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    await fetch(`${url}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(value), ex: ex })
    });
  } catch (e) { console.error('Redis set error:', e.message); }
}

async function redisKeys(pattern) {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    const r = await fetch(`${url}/keys/${pattern}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    return d.result || [];
  } catch { return []; }
}

async function saveConversation(from, name, messages, status = 'needs_reply') {
  const key = `conv_${from.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const existing = await redisGet(key);
  const conv = {
    id: key,
    from,
    name: name || from,
    messages,
    status: existing ? existing.status : status,
    lastActive: Date.now(),
    unread: existing ? (existing.unread || 0) + 1 : 1,
  };
  await redisSet(key, conv);
  return conv;
}

async function sendWeeklyReport() {
  try {
    const weekEnd = new Date();
    const weekStartStr = analytics.weekStart.toDateString();
    const weekEndStr = weekEnd.toDateString();

    const htmlReport = `<!DOCTYPE html><html><head><style>
      body{font-family:Arial,sans-serif;background:#f9f9f9;padding:20px;}
      .container{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);}
      .header{background:linear-gradient(135deg,#1c0a00,#c9a96e);padding:30px;text-align:center;}
      .header h1{color:#f0cc8a;margin:0;font-size:24px;}
      .body{padding:30px;}
      .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0;}
      .stat{background:#fdf8f3;border-radius:10px;padding:16px;text-align:center;border:1px solid #ede5da;}
      .stat .number{font-size:32px;font-weight:bold;color:#3b1500;}
      .stat .label{font-size:12px;color:#b59a7a;margin-top:4px;}
      .section{margin:20px 0;padding:16px;background:#fdf8f3;border-radius:10px;border:1px solid #ede5da;}
      .footer{background:#fdf8f3;padding:20px;text-align:center;font-size:12px;color:#b59a7a;}
    </style></head><body>
    <div class="container">
      <div class="header"><h1>👑 Enog Beauty Castle</h1><p>Weekly AI Agent Report</p><p style="font-size:12px">${weekStartStr} — ${weekEndStr}</p></div>
      <div class="body">
        <p style="color:#6b4c2a">Hello Enog! Here's how your AI agent performed this week:</p>
        <div class="stat-grid">
          <div class="stat"><div class="number">${analytics.totalMessages}</div><div class="label">Total Messages</div></div>
          <div class="stat"><div class="number">${analytics.uniqueCustomers.size}</div><div class="label">Unique Customers</div></div>
          <div class="stat"><div class="number">${analytics.ordersMentioned}</div><div class="label">Order Intentions</div></div>
          <div class="stat"><div class="number">${Object.keys(analytics.dailyMessages).length}</div><div class="label">Active Days</div></div>
        </div>
        <div class="section"><h3>🛍️ Most Asked Products</h3><p>${getTopItems(analytics.productMentions) || 'None yet'}</p></div>
        <div class="section"><h3>📅 Busiest Day</h3><p>${getBusiestDay(analytics.dailyMessages)}</p></div>
        <div class="section"><h3>⏰ Busiest Hour</h3><p>${getBusiestHour(analytics.hourlyMessages)}</p></div>
        <div class="section"><h3>💡 Insight</h3><p>Your AI agent handled <strong>${analytics.totalMessages} messages</strong> from <strong>${analytics.uniqueCustomers.size} customers</strong> this week — automatically, 24/7! 🎉</p></div>
      </div>
      <div class="footer">Powered by Enog Beauty Castle AI Agent 🤖 | Owerri, Nigeria</div>
    </div></body></html>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Enog Beauty Castle AI <onboarding@resend.dev>',
        to: ['pnoghayinpromise@gmail.com'],
        subject: `📊 Weekly Report — ${weekStartStr} to ${weekEndStr}`,
        html: htmlReport,
      }),
    });

    analytics.totalMessages = 0;
    analytics.uniqueCustomers = new Set();
    analytics.productMentions = {};
    analytics.dailyMessages = {};
    analytics.hourlyMessages = {};
    analytics.ordersMentioned = 0;
    analytics.weekStart = getMonday(new Date());
    console.log('Weekly report sent!');
  } catch (err) { console.error('Report error:', err.message); }
}

function scheduleWeeklyReport() {
  const nextMonday = getMonday(new Date());
  nextMonday.setDate(nextMonday.getDate() + 7);
  nextMonday.setHours(7, 0, 0, 0);
  setTimeout(() => {
    sendWeeklyReport();
    setInterval(sendWeeklyReport, 7 * 24 * 60 * 60 * 1000);
  }, nextMonday - new Date());
}

const BUSINESS_PROMPT = `You are the WhatsApp sales agent for ENOG BEAUTY CASTLE — No. 1 Wholesale Supplier of hair extensions in Owerri, Nigeria. Chat like a warm, professional Nigerian hair seller.

RULES:
- Short replies (max 3 lines)
- Max 1 emoji per reply, only if natural
- Ask only 1 question per reply
- Sound like a real person texting, NOT a bot
- NEVER greet mid-conversation
- For orders, direct customers to website: enogbeautycastle.bumpa.shop OR they can order via WhatsApp

BUSINESS INFO:
- Address: 124 Okigwe Road, Owerri, Imo State, Nigeria
- Website: enogbeautycastle.bumpa.shop
- Instagram: @enogbeautycastle
- Manager WhatsApp: +2347034562686 (advise customers to save and follow)
- Hours: Monday–Saturday 8am–6pm | Sunday: Closed | Public Holidays: Open

PAYMENT:
- Moniepoint: 5057191869 — Enog Beauty Castle
- UBA: 1025287966 — Enog Beauty Castle

DELIVERY:
- Within Owerri: FREE, same day/24 hours
- Nationwide: FREE, 5 working days (GIG, GUO, FedEx, dispatch riders)
- Outside Nigeria: 7–14 days, charges apply

RETURN POLICY:
- 100% refund if item doesn't match quality described
- Report Line: 07034562686 | Email: enogbeatycatle@gmail.com

PACKS NEEDED:
- Shoulder: 2 packs | Bra length: 3 packs | Waist: 5 packs | Hip: 5–6 packs

DISTRIBUTORS: Looking for distributors in all states. MOQ 500 pieces. Direct to +2347034562686.
CATALOG: https://wa.me/c/2347034562686

PRODUCTS:
French Curls (8",12",24",26"): Single tone N3,750 | Two-tone N4,000 | Three-tone N4,500
Italian Curls (150g, 3 packs full): Single N3,750 | Two-tone N4,000 | Three-tone N4,500
Deep Wave (30", 120g): Single N4,000 | Two-tone N4,250 | Three-tone N4,500
Body Wave (26"): N4,000
Bone Straight (16",26"): N4,000
Passion Twist (24"): N4,500 | Malley Twist (26"): N4,500 | Spring Twist: N4,000
Human Hair DD 14": N40,000 | 16": N50,000 | 18": N60,000
Human Hair SDD 14": N90,000 | 16": N100,000 | 18": N115,000
Afro Kinky 14": N25,000 | +N4,000 for colors
Braid Rack: N29,500 | Hair Clips: N1,500 | Ponytails: N15,000

WHOLESALE (French Curls, Italian, Body Wave, Bone Straight):
1-50: N3,750 | 50-200: N3,250 | 200-500: N3,000 | 500+: N2,750 (add N250 per tone)
Pre-order: N2,600 + N220 per tone

WHOLESALE (Passion/Spring/Malley Twist):
1-50: N4,500 | 51-200: N4,250 | 201-500: N4,000 | 500-1000: N3,750`;

// ── API Routes for Dashboard ──────────────────────────────────────────────────

// Get all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const keys = await redisKeys('conv_*');
    const convs = await Promise.all(keys.map(k => redisGet(k)));
    const valid = convs.filter(Boolean).sort((a, b) => b.lastActive - a.lastActive);
    res.json(valid);
  } catch (e) {
    res.json([]);
  }
});

// Update conversation status
app.post('/api/conversations/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const conv = await redisGet(req.params.id);
    if (conv) {
      conv.status = status;
      if (status === 'done') conv.unread = 0;
      await redisSet(req.params.id, conv);
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// Send manual reply from dashboard
app.post('/api/reply', async (req, res) => {
  try {
    const { to, message, convId } = req.body;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      },
      body: new URLSearchParams({ From: twilioFrom, To: to, Body: message }).toString(),
    });

    // Save reply to conversation
    const conv = await redisGet(convId);
    if (conv) {
      conv.messages.push({ from: 'business', text: message, time: new Date().toISOString() });
      conv.status = 'done';
      conv.unread = 0;
      await redisSet(convId, conv);
    }

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Analytics endpoint
app.get('/api/analytics', (req, res) => {
  res.json({
    totalMessages: analytics.totalMessages,
    uniqueCustomers: analytics.uniqueCustomers.size,
    ordersMentioned: analytics.ordersMentioned,
    topProducts: getTopItems(analytics.productMentions),
    busiestDay: getBusiestDay(analytics.dailyMessages),
    busiestHour: getBusiestHour(analytics.hourlyMessages),
  });
});

// ── Health & Utility ──────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Enog Beauty Castle AI Agent is running! 👑'));
app.get('/webhook', (req, res) => res.send('Webhook is live!'));

// Debug Redis connection
app.get('/debug', async (req, res) => {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  try {
    const r = await fetch(`${url}/set/test_key`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['test_value', 'EX', '60'])
    });
    const d = await r.json();
    res.json({ hasUrl: !!url, hasToken: !!token, urlPreview: url ? url.substring(0,30) : 'MISSING', redisTest: d, inMemoryConvs: Object.keys(conversations).length });
  } catch(e) {
    res.json({ hasUrl: !!url, hasToken: !!token, error: e.message });
  }
});
app.get('/send-report', async (req, res) => {
  await sendWeeklyReport();
  res.send('Weekly report sent!');
});

// ── Main WhatsApp Webhook ─────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');
  try {
    const { Body, From, To, ProfileName, NumMedia, MediaUrl0, MediaContentType0 } = req.body;
    if (!From || !To) return;

    const customerName = ProfileName || From;
    console.log(`[${new Date().toISOString()}] From: ${customerName} (${From}) | Msg: ${Body || '[media]'}`);

    // Handle voice notes
    if (NumMedia > 0 && MediaContentType0 && MediaContentType0.startsWith('audio')) {
      const voiceReply = "Thank you for your voice note 😊 It has been noted and will be passed to our team for review. In the meantime, please type your message so we can attend to you faster!";
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
        body: new URLSearchParams({ From: To, To: From, Body: voiceReply }).toString(),
      });
      // Save to dashboard
      const key = `conv_${From.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const existing = await redisGet(key) || { id: key, from: From, name: customerName, messages: [], status: 'needs_reply', lastActive: Date.now(), unread: 0 };
      existing.messages.push({ from: 'customer', text: '[Voice note received]', time: new Date().toISOString() });
      existing.messages.push({ from: 'business', text: voiceReply, time: new Date().toISOString() });
      existing.lastActive = Date.now();
      await redisSet(key, existing);
      return;
    }

    // Handle images
    let messageContent = Body || '';
    if (NumMedia > 0 && MediaUrl0 && MediaContentType0 && MediaContentType0.startsWith('image')) {
      const today = new Date().toISOString().split('T')[0];
      const imgKey = `${From}_${today}`;
      imageCounts[imgKey] = (imageCounts[imgKey] || 0) + 1;
      if (imageCounts[imgKey] > 3) {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
          body: new URLSearchParams({ From: To, To: From, Body: "Thank you for the picture 😊 It has been received and will be reviewed by our team." }).toString(),
        });
        return;
      }
      messageContent = Body ? `[Customer sent an image with caption: "${Body}"]` : "[Customer sent an image - describe what you see and how it relates to hair extensions if relevant]";
    }

    if (!messageContent) return;

    trackMessage(From, messageContent);

    // Load conversation from Redis
    const convKey = `conv_${From.replace(/[^a-zA-Z0-9]/g, '_')}`;
    let convData = await redisGet(convKey) || { id: convKey, from: From, name: customerName, messages: [], status: 'needs_reply', lastActive: Date.now(), unread: 0 };

    // Use in-memory as PRIMARY source for conversation history
    if (!conversations[From]) {
      // Rebuild from Redis on first load
      conversations[From] = convData.messages.slice(-20)
        .map(m => ({ role: m.from === "customer" ? "user" : "assistant", content: m.text }))
        .filter(m => m.content && !m.content.startsWith("[Voice"));
    }
    const isFirst = conversations[From].length === 0;
    conversations[From].push({ role: "user", content: messageContent });
    if (conversations[From].length > 20) conversations[From] = conversations[From].slice(-20);
    const aiHistory = conversations[From];

    const systemPrompt = `${BUSINESS_PROMPT}

CONVERSATION STATUS: ${isFirst ? 'NEW - greet warmly and briefly.' : 'ONGOING - NO greeting. Reply directly.'}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 250, system: systemPrompt, messages: aiHistory }),
    });

    const aiData = await aiRes.json();
    const reply = aiData.content?.[0]?.text || "How can I help you? 😊";

    console.log(`Reply: ${reply}`);

    // Save AI reply to in-memory history
    conversations[From].push({ role: "assistant", content: reply });

    // Save both messages to Redis
    convData.messages.push({ from: 'customer', text: messageContent === Body ? messageContent : '[Image]', time: new Date().toISOString() });
    convData.messages.push({ from: 'business', text: reply, time: new Date().toISOString() });
    convData.lastActive = Date.now();
    convData.name = customerName;
    convData.unread = (convData.unread || 0) + 1;
    convData.status = 'needs_reply';
    if (convData.messages.length > 100) convData.messages = convData.messages.slice(-100);
    await redisSet(convKey, convData);

    // Send WhatsApp reply
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
      body: new URLSearchParams({ From: To, To: From, Body: reply }).toString(),
    });

  } catch (err) {
    console.error('Error:', err.message);
  }
});

setInterval(() => {
  const today = new Date().toISOString().split('T')[0];
  for (const key in imageCounts) {
    if (!key.includes(today)) delete imageCounts[key];
  }
}, 3600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Enog Beauty Castle Agent running on port ${PORT}`);
  scheduleWeeklyReport();
});
