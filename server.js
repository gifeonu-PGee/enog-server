const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
      .header p{color:#c9a96e;margin:8px 0 0;}
      .body{padding:30px;}
      .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0;}
      .stat{background:#fdf8f3;border-radius:10px;padding:16px;text-align:center;border:1px solid #ede5da;}
      .stat .number{font-size:32px;font-weight:bold;color:#3b1500;}
      .stat .label{font-size:12px;color:#b59a7a;margin-top:4px;}
      .section{margin:20px 0;padding:16px;background:#fdf8f3;border-radius:10px;border:1px solid #ede5da;}
      .section h3{color:#3b1500;margin:0 0 10px;font-size:14px;}
      .section p{color:#6b4c2a;margin:4px 0;font-size:13px;}
      .footer{background:#fdf8f3;padding:20px;text-align:center;font-size:12px;color:#b59a7a;}
    </style></head><body>
    <div class="container">
      <div class="header">
        <h1>👑 Enog Beauty Castle</h1>
        <p>Weekly AI Agent Report</p>
        <p style="font-size:12px">${weekStartStr} — ${weekEndStr}</p>
      </div>
      <div class="body">
        <p style="color:#6b4c2a">Hello Enog! Here's how your AI agent performed this week:</p>
        <div class="stat-grid">
          <div class="stat"><div class="number">${analytics.totalMessages}</div><div class="label">Total Messages</div></div>
          <div class="stat"><div class="number">${analytics.uniqueCustomers.size}</div><div class="label">Unique Customers</div></div>
          <div class="stat"><div class="number">${analytics.ordersMentioned}</div><div class="label">Order Intentions</div></div>
          <div class="stat"><div class="number">${Object.keys(analytics.dailyMessages).length}</div><div class="label">Active Days</div></div>
        </div>
        <div class="section"><h3>🛍️ Most Asked Products</h3><p>${getTopItems(analytics.productMentions) || 'No product mentions yet'}</p></div>
        <div class="section"><h3>📅 Busiest Day</h3><p>${getBusiestDay(analytics.dailyMessages)}</p></div>
        <div class="section"><h3>⏰ Busiest Hour</h3><p>${getBusiestHour(analytics.hourlyMessages)}</p></div>
        <div class="section"><h3>💡 Insight</h3><p>Your AI agent handled <strong>${analytics.totalMessages} messages</strong> from <strong>${analytics.uniqueCustomers.size} customers</strong> this week — automatically, 24/7! 🎉</p></div>
      </div>
      <div class="footer">Powered by Enog Beauty Castle AI Agent 🤖 | Owerri, Nigeria</div>
    </div></body></html>`;

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
    console.log('Weekly report sent:', JSON.stringify(data));

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

const BUSINESS_PROMPT = `You are the WhatsApp sales agent for ENOG BEAUTY CASTLE — No. 1 Wholesale Supplier of hair extensions in Owerri, Nigeria. Chat like a warm, professional Nigerian hair seller.

RULES:
- Short replies (max 3 lines)
- Max 1 emoji per reply, only if natural
- Ask only 1 question per reply
- Sound like a real person texting, NOT a robot
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
- Report issues immediately upon delivery
- Report Line: 07034562686
- Report Email: enogbeatycatle@gmail.com

PACKS NEEDED FOR FULL HEAD:
- Shoulder length: 2 packs
- Bra length: 3 packs
- Waist length: 5 packs
- Hip length: 5–6 packs

DISTRIBUTORS: We are looking for distributors in different states. Interested customers can start with MOQ of 500 pieces. Direct them to manager on +2347034562686.

CATALOG LINK: When customer asks to see catalog or colors, send: https://wa.me/c/2347034562686

====== COMPLETE PRODUCT CATALOG ======

🌀 FRENCH CURLS (8", 12", 24", 26")
Single tone/mixed colors (1B, 27, 30, 33, 350, 613, 99J, Bug, Ginger, Grey, D-Pink, Mp2, Mp3, P27/33/613, P27/30, P30/33, P33/Ginger, Colour 24): N3,750
Two-tone (Ot1b/27, Otb/30, Otb/29, Ot1b/Bug, Bug/Gold, T30/60): N4,000
Three-tone (Otc/14, Otc/15): N4,500

FRENCH CURLS WHOLESALE:
1–50 packs: 1 colour N3,750 | 2 colour N4,000 | 3 colour N4,250
50–200 packs: 1 colour N3,250 | 2 colour N3,500 | 3 colour N3,750
200–500 packs: 1 colour N3,000 | 2 colour N3,250 | 3 colour N3,500
500+ packs: 1 colour N2,750 | 2 colour N3,000 | 3 colour N3,250
Pre-order: N2,600 + N220 per tone

🌊 ITALIAN / LOOSE CURLS (8", 12", 24", 26" | 150g | 3 packs full hair)
Single tone (1B, 27, 30, 33, 350, 613, 99J, Bug, Ginger, Grey, D-Pink, Mp2, Mp3, P27/30, P30/33, P33/Ginger): N3,750
Two-tone (Ot1b/27, Otb/30, Otb/29, Ot1b/Bug, Bug/Gold, T30/60): N4,000 (8", 12", 18")
Three-tone (Otc/14, Otc/15): N4,500 (8", 12", 18")

ITALIAN CURLS WHOLESALE: Same tiers as French Curls
Pre-order: N2,600 + N220 per tone

🌊 DEEP WAVE (30" | 120g | 3 packs full hair)
Single tone: N4,000 | Two-tone: N4,250 | Three-tone: N4,500

DEEP WAVE WHOLESALE:
1–50: 1 colour N4,000 | 2 colour N4,250 | 3 colour N4,500
50–200: N3,500 | N3,750 | N4,000
200–500: N3,250 | N3,500 | N3,750
500+: N3,000 | N3,250 | N3,500
Pre-order: N2,600 + N220 per tone

🌊 BODY WAVE (26")
Colors: Bug, 27, 30, 33, 350, Ginger: N4,000
WHOLESALE: Same tiers as French Curls | Pre-order: N2,820 + N220 per tone

📏 BONE STRAIGHT (16" & 26")
All colors including Ot1b/27, Otib/30, 613, 30, ginger, 350, 33, 27, bug: N4,000
WHOLESALE: Same tiers as French Curls | Pre-order: N2,600 + N220 per tone

🔄 TWISTS:
Passion Twist (24"): N4,500 | 2–3 for full hair
Malley Twist (26"): N4,500 | Extra N250 for colour
Spring Twist (150g): N4,000 (1–15 packs)

TWIST WHOLESALE (Passion, Spring, Malley):
1–50: N4,500 | 51–200: N4,250 | 201–500: N4,000 | 500–1000: N3,750
Spring/Malley OTC: +N250

💇 HUMAN HAIR BRAID EXTENSIONS (100g):
DD 14": 1–15: N40,000 | 16–30: N37,000 | 31–50: N34,000
DD 16": 1–15: N50,000 | 16–30: N47,000 | 31–50: N44,000
DD 18": 1–15: N60,000 | 16–30: N57,000 | 31–50: N54,000
SDD 14": 1–15: N90,000 | 16–30: N87,000 | 31–50: N84,000
SDD 16": 1–15: N100,000 | 16–30: N97,000 | 31–50: N94,000
SDD 18": 1–15: N115,000 | 16–30: N112,000 | 31–50: N109,000
Extra N5,000 for colours.

AFRO KINKY BULK HUMAN HAIR (30g):
14": 1–15: N25,000 | 16–30: N23,000 | 31–50: N22,000
Extra N4,000 for colours. 90–150g needed for full head.

🪮 ACCESSORIES:
Braid Rack (with tray & 6 clips): N29,500
Hair Clips: N1,500
Ponytails: N15,000
Detanglers: available — ask for price

COMMON QUESTIONS:
- Do you sell wigs? We don't sell regular wigs, but we have beautiful Braided Wigs!
- Catalog? Visit enogbeautycastle.bumpa.shop or https://wa.me/c/2347034562686
- Wholesale? Yes from 1 piece upwards with tiered pricing
- Distributors? Yes, MOQ 500 pieces — contact manager on +2347034562686
- Colors? 25–30+ colors, request catalog via link above`;

app.get('/', (req, res) => res.send('Enog Beauty Castle AI Agent is running! 👑'));
app.get('/webhook', (req, res) => res.send('Webhook is live!'));
app.get('/send-report', async (req, res) => {
  await sendWeeklyReport();
  res.send('Weekly report sent! Check pnoghayinpromise@gmail.com');
});

app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');
  try {
    const { Body, From, To, NumMedia, MediaUrl0, MediaContentType0 } = req.body;
    if (!From || !To) return;

    console.log(`[${new Date().toISOString()}] From: ${From} | Msg: ${Body || '[media]'}`);

    // Handle voice notes
    if (NumMedia > 0 && MediaContentType0 && MediaContentType0.startsWith('audio')) {
      const voiceReply = "Thank you for your voice note 😊 It has been noted and will be passed to our team for review. In the meantime, please type your message so we can attend to you faster!";
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        },
        body: new URLSearchParams({ From: To, To: From, Body: voiceReply }).toString(),
      });
      return;
    }

    // Handle images (max 3 per day per customer)
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
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
          },
          body: new URLSearchParams({ From: To, To: From, Body: "Thank you for the picture 😊 It has been received and will be reviewed by our team. Is there anything else I can help you with?" }).toString(),
        });
        return;
      }
      // Pass image to Claude for analysis
      messageContent = Body ? `[Customer sent an image with caption: "${Body}"]` : "[Customer sent an image]";
    }

    if (!messageContent) return;

    trackMessage(From, messageContent);

    if (!conversations[From]) {
      conversations[From] = { history: [], lastActive: Date.now() };
      analytics.totalConversations++;
    }

    const conv = conversations[From];
    conv.lastActive = Date.now();
    const isFirst = conv.history.length === 0;

    conv.history.push({ role: 'user', content: messageContent });
    if (conv.history.length > 20) conv.history = conv.history.slice(-20);

    const systemPrompt = `${BUSINESS_PROMPT}

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
        max_tokens: 250,
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

setInterval(() => {
  const oneDay = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const key in conversations) {
    if (now - conversations[key].lastActive > oneDay) delete conversations[key];
  }
  // Clean old image counts
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
