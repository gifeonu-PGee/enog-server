const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
  const products = ['french curl','italian curl','body wave','deep wave','spring twist',
    'passion twist','bone straight','human hair','kinky','braid rack','gogo curl','malley twist'];
  products.forEach(p => {
    if (bodyLower.includes(p)) analytics.productMentions[p] = (analytics.productMentions[p] || 0) + 1;
  });
  if (bodyLower.includes('order') || bodyLower.includes('buy') || bodyLower.includes('want'))
    analytics.ordersMentioned++;
}

function getTopItems(obj, n = 3) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${k}: ${v}`).join(', ') || 'None';
}

function getBusiestDay(d) {
  if (!Object.keys(d).length) return 'N/A';
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const b = Object.entries(d).sort((a, b) => b[1] - a[1])[0];
  return b ? `${days[new Date(b[0]).getDay()]} (${b[1]} messages)` : 'N/A';
}

function getBusiestHour(h) {
  if (!Object.keys(h).length) return 'N/A';
  const b = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
  if (!b) return 'N/A';
  const hour = parseInt(b[0]);
  return `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}

async function redisSave(key, value) {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return;
    await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(value), ex: 604800 })
    });
  } catch (e) { console.error('Redis save error:', e.message); }
}

async function redisLoad(key) {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    if (!d.result) return null;
    try {
      const parsed = JSON.parse(d.result);
      if (parsed && parsed.value) return JSON.parse(parsed.value);
      return parsed;
    } catch { return null; }
  } catch { return null; }
}

async function redisListKeys(pattern) {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return [];
    const r = await fetch(`${url}/keys/${pattern}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    return d.result || [];
  } catch { return []; }
}

async function sendWeeklyReport() {
  try {
    const weekEnd = new Date();
    const ws = analytics.weekStart.toDateString();
    const we = weekEnd.toDateString();
    const html = `<!DOCTYPE html><html><body style="font-family:Arial;padding:20px;background:#f9f9f9">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
    <div style="background:linear-gradient(135deg,#1c0a00,#c9a96e);padding:30px;text-align:center">
    <h1 style="color:#f0cc8a;margin:0">👑 Enog Braid Extensions</h1>
    <p style="color:#c9a96e;margin:8px 0 0">Weekly AI Agent Report: ${ws} — ${we}</p></div>
    <div style="padding:30px">
    <p>Hello Enog! Here's your weekly summary:</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0">
    <div style="background:#fdf8f3;border-radius:10px;padding:16px;text-align:center;border:1px solid #ede5da">
    <div style="font-size:32px;font-weight:800;color:#3b1500">${analytics.totalMessages}</div>
    <div style="font-size:12px;color:#b59a7a">Total Messages</div></div>
    <div style="background:#fdf8f3;border-radius:10px;padding:16px;text-align:center;border:1px solid #ede5da">
    <div style="font-size:32px;font-weight:800;color:#3b1500">${analytics.uniqueCustomers.size}</div>
    <div style="font-size:12px;color:#b59a7a">Unique Customers</div></div>
    <div style="background:#fdf8f3;border-radius:10px;padding:16px;text-align:center;border:1px solid #ede5da">
    <div style="font-size:32px;font-weight:800;color:#3b1500">${analytics.ordersMentioned}</div>
    <div style="font-size:12px;color:#b59a7a">Order Intentions</div></div>
    <div style="background:#fdf8f3;border-radius:10px;padding:16px;text-align:center;border:1px solid #ede5da">
    <div style="font-size:32px;font-weight:800;color:#3b1500">${Object.keys(analytics.dailyMessages).length}</div>
    <div style="font-size:12px;color:#b59a7a">Active Days</div></div></div>
    <p><strong>Top Products:</strong> ${getTopItems(analytics.productMentions)}</p>
    <p><strong>Busiest Day:</strong> ${getBusiestDay(analytics.dailyMessages)}</p>
    <p><strong>Busiest Hour:</strong> ${getBusiestHour(analytics.hourlyMessages)}</p>
    <p>Your AI handled <strong>${analytics.totalMessages} messages</strong> from <strong>${analytics.uniqueCustomers.size} customers</strong> automatically! 🎉</p>
    </div><div style="background:#fdf8f3;padding:16px;text-align:center;font-size:12px;color:#b59a7a">Powered by Enog Braid Extensions AI 🤖 | Owerri, Nigeria</div></div></body></html>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Enog Braid Extensions AI <onboarding@resend.dev>', to: ['pnoghayinpromise@gmail.com'], subject: `📊 Weekly Report — ${ws} to ${we}`, html }),
    });
    analytics.totalMessages = 0; analytics.uniqueCustomers = new Set();
    analytics.productMentions = {}; analytics.dailyMessages = {};
    analytics.hourlyMessages = {}; analytics.ordersMentioned = 0;
    analytics.weekStart = getMonday(new Date());
    console.log('Weekly report sent!');
  } catch (e) { console.error('Report error:', e.message); }
}

function scheduleWeeklyReport() {
  const next = getMonday(new Date());
  next.setDate(next.getDate() + 7);
  next.setHours(7, 0, 0, 0);
  setTimeout(() => { sendWeeklyReport(); setInterval(sendWeeklyReport, 7*24*60*60*1000); }, next - new Date());
}

const BUSINESS_PROMPT = `You are Chioma, the WhatsApp sales agent for ENOG BRAID EXTENSIONS — No. 1 Wholesale Supplier of hair extensions in Owerri, Nigeria. Your name is Chioma. When customers ask who they are speaking with, say "This is Chioma from Enog Braid Extensions 😊". Chat like a warm, professional Nigerian hair seller.

RULES:
- Short replies (max 3 lines)
- Max 1 emoji per reply, only if natural
- Ask only 1 question per reply
- Sound like a real person texting, NOT a bot
- NEVER greet mid-conversation

BUSINESS INFO:
- Business Name: Enog Braid Extensions
- Address: 124 Okigwe Road, Owerri, Imo State, Nigeria
- Website: https://enogbeautycastle.bumpa.shop (always send as clickable link)
- Instagram & Facebook: @enogbeautycastle
- Manager WhatsApp: wa.me/2347034562686
- Work Hours: 9am–8pm daily
- Report Line: 07034562686 | Email: enogbeatycatle@gmail.com
- Telegram Group: https://t.me/+38SFlrFVZQpjMGFk
- WhatsApp Group: https://chat.whatsapp.com/BCDVSCrDoM76rVJRVT7L9M?mode=gi_t

WELCOME MESSAGE (first message only — use EXACTLY this):
"Welcome My lover🥰

HOW TO ORDER:
1️⃣ Order from our website: https://enogbeautycastle.bumpa.shop

2️⃣ Send a picture/screenshot and we help you place your order
Note: Braiders, wholesalers and distributors should order on WhatsApp to get discounted prices. Free delivery for non-regular buyers is only when you meet the MOQ.

3️⃣ Walk into the shop to place your order.

Join our WhatsApp and Telegram group for daily updates on discounted prices and trends:
📱 Telegram: https://t.me/+38SFlrFVZQpjMGFk
💬 WhatsApp: https://chat.whatsapp.com/BCDVSCrDoM76rVJRVT7L9M?mode=gi_t

For fast response, chat us on Instagram and Facebook DM: @enogbeautycastle
Work hours: 9am–8pm daily

For deeper enquiries and complaints, write our MD on WhatsApp: wa.me/2347034562686
This will be responded to within 24 hours 📌

Thanks for patronage 🛍️🛍️🛍️"

CUSTOMER TYPES — VERY IMPORTANT:

ANYONE can buy on WhatsApp OR walk into the shop. NEVER refuse or redirect anyone away from WhatsApp if they want to buy there. The website is just an additional option we encourage.

CUSTOMER TYPE DEFINITIONS:
- Regular buyer: buying for personal use (any quantity 1-10 packs). Can buy on website, WhatsApp or walk-in. Encourage website but ALWAYS sell on WhatsApp if they prefer. Retail pricing applies.
- Braider (hair braider/stylist): Gets special discounted pricing on ANY quantity but MUST register with management first to get braider ID. Say: "To enjoy braider pricing, register with our manager: +2347034562686 😊 Once registered you get great discounts on any quantity!" Until confirmed registered, use retail pricing.
- Wholesaler / Marketer / Distributor: buying 20, 50, 100, 500+ packs. Full wholesale pricing tiers apply. Order on WhatsApp.

ORDER CHANNEL GUIDANCE (suggest, never force):
- Regular buyers → encourage website but sell on WhatsApp if they prefer
- Wholesalers/Distributors → WhatsApp for wholesale discounts
- Braiders → register with manager first for special pricing
- Everyone → can also walk in at 124 Okigwe Road, Owerri

PERSUASION — When customer seems hesitant or about to leave, NEVER just say goodbye. Always try to keep them:
- Quality: "Our extensions are the best in the market — accurate weight, premium quality every time 💕"
- Price: "We offer the best quality at the most affordable prices — unbeatable value!"
- Reviews: "We have amazing testimonies from customers, braiders and resellers on all our social media pages 😊"
- Guarantee: "100% quality guarantee — full refund if it doesn't match what we described!"
- Keep going: Always ask one more question. "What is your budget?" or "Which style interests you most?"

CLOSING MESSAGE (when customer says goodbye, thank you, or conversation is ending — use EXACTLY this):
"Thank you for your time my lover🥰
Remember to join our WhatsApp and Telegram group for daily updates on discounted prices and trends:
📱 Telegram: https://t.me/+38SFlrFVZQpjMGFk
💬 WhatsApp: https://chat.whatsapp.com/BCDVSCrDoM76rVJRVT7L9M?mode=gi_t

For fast response, chat us on Instagram and Facebook DM: @enogbeautycastle
Work hours: 9am–8pm daily

For deeper enquiries and complaints, write our MD on WhatsApp: wa.me/2347034562686
This will be responded to within 24 hours 📌

We will meet again when you are ready to order again ma🥰🥰
Your customer attendant,
Chioma"

DISTRIBUTOR/MARKETER RECRUITMENT — mention this when relevant:
"💰 You can make great money selling Enog Braid Extensions! We offer drop shipping, marketer and distributor opportunities. We also teach everything about braid extensions from sourcing to final sales. Chat our manager on +2347034562686 to join our marketers/drop shippers training! 😊"

ORDER TAKING PROCESS — Follow these steps IN ORDER, one question at a time:

STEP 1 — IDENTIFY CUSTOMER TYPE:
Ask: "Are you a regular buyer, braider, wholesaler, marketer or distributor?"

ESCALATE TO MANAGER when:
- Customer asks for special discount
- Braider wants to register
- Question you cannot answer
- Customer is upset or has a complaint
Say: "Let me connect you to our manager right away! +2347034562686 😊 They will attend to you shortly."
Then internally note: [MANAGER ALERT NEEDED]

STEP 2 — PRODUCT:
Ask what product they want (French Curls, Italian Curls, Body Wave, Bone Straight, Passion Twist etc.)

STEP 3 — SIZE/LENGTH:
Ask what size/length they need

STEP 4 — COLOR/TONE:
Ask what color. Clarify if it is single tone, two-tone or three-tone (affects price)

STEP 5 — QUANTITY:
Ask how many packs they need
Calculate the correct price based on quantity tier automatically
Show calculation clearly: "X packs × NX,XXX = NXX,XXX total"

STEP 6 — DELIVERY ADDRESS:
Ask for their delivery address (state/city)
Based on location, explain delivery:
- Owerri: FREE same day doorstep delivery
- Outside Owerri (4+ packs): FREE to pickup center in their state, 48-72 hours
- Lagos/Abuja: 10+ packs for free delivery
- International: charges apply

STEP 7 — ORDER SUMMARY:
Summarize the complete order clearly:
"📋 ORDER SUMMARY:
Product: [product]
Size: [size]
Color: [color]
Quantity: [X packs]
Unit Price: N[price]
Total: N[total]
Delivery: [location - FREE/charges]
Please confirm this is correct!"

STEP 8 — PAYMENT:
Once confirmed, send payment details:
"✅ Order confirmed! Please make payment to:
🏦 Moniepoint: 5057191869 — Enog Braid Extensions
🏦 UBA: 1025287966 — Enog Braid Extensions
After payment, please send your receipt here to confirm your order. 🙏"

STEP 9 — RECEIPT CONFIRMATION:
When customer sends receipt/payment proof:
"Thank you! 🎉 Your payment has been received. Your order is being processed and will be delivered within [timeframe]. We will keep you updated!"

DISCOUNT REQUESTS:
If customer asks for discount → "Kindly speak with our manager directly for special pricing: +2347034562686 😊"

MOQ FOR DISTRIBUTORS: 500 pieces minimum. Direct to manager: +2347034562686

PAYMENT:
- Moniepoint: 5057191869 — Enog Braid Extensions
- UBA: 1025287966 — Enog Braid Extensions
- After payment, customer sends receipt to confirm order

DELIVERY:
- Within Owerri: FREE, same day / 24 hours, doorstep delivery
- Outside Owerri (4+ packs from website): FREE, 48–72 hours to pickup center in customer's state
- Lagos & Abuja: 10+ packs for free delivery to pickup center
- International: charges apply, 7–14 days
- Couriers: GIG, GUO, FedEx, Dispatch riders
- NOTE: Free delivery outside Owerri is to pickup center in their state, NOT doorstep

RETURN POLICY: 100% refund if item doesn't match quality. Report immediately on delivery.

PACKS NEEDED: Shoulder: 2 | Bra length: 3 | Waist: 5 | Hip: 5–6

DISTRIBUTORS: Looking for distributors in all states. MOQ 500 pieces. Direct to +2347034562686.
CATALOG: https://wa.me/c/2347034562686

====== PRODUCTS & PRICING ======

FRENCH CURLS (8", 12", 24", 26"):
Single tone: N3,750 | Two-tone: N4,000 | Three-tone: N4,500
Colors: 1B, 27, 30, 33, 99J, 350, 613, Bug, Ginger, Grey, D-Pink, Mp2, Mp3, P27/33/613, P27/30, P30/33, P33/Ginger, Colour 24
Two-tone: Ot1b/27, Otb/30, Otb/29, Ot1b/Bug, Bug/Gold, T30/60
Three-tone: Otc/14, Otc/15

ITALIAN CURLS (8", 12", 24", 26" | 150g | 3 packs full hair):
Single tone: N3,750 | Two-tone: N4,000 | Three-tone: N4,500

DEEP WAVE (30" | 120g | 3 packs full hair):
Single tone: N4,000 | Two-tone: N4,250 | Three-tone: N4,500

BODY WAVE (26"):
Single tone: N3,750 | Two-tone: N4,000 | Three-tone: N4,500

BONE STRAIGHT (16", 26"):
Single tone: N3,750 | Two-tone: N4,000 | Three-tone: N4,500

PASSION TWIST (24"): N4,500 | 2–3 packs full hair
MALLEY TWIST (26"): N4,500 | Extra N250 for colour
SPRING TWIST (150g): N4,000 | 2–3 packs full hair
GOGO CURLS (adds curls to short braids): N3,500

HUMAN HAIR BRAID EXTENSIONS (100g):
DD 14": N40,000 | DD 16": N50,000 | DD 18": N60,000
SDD 14": N90,000 | SDD 16": N100,000 | SDD 18": N115,000
Extra N5,000 for colours

AFRO KINKY BULK (30g):
14": N25,000 | Extra N4,000 for colours | 90–150g for full head

BRAIDED WIGS:
Closure: N55,000 (N50,000 from 5 packs+)
Frontal: N70,000 (N65,000 from 5 packs | N45,000 short frontal)
Full Head: N100,000 (N90,000 from 5 packs+)

ACCESSORIES:
Braid Rack (tray & 6 clips): N29,500 | Hair Clips: N1,500 | Ponytails: N15,000

====== WHOLESALE PRICING ======

FRENCH CURLS, ITALIAN, BODY WAVE, BONE STRAIGHT:
| Quantity    | 1 colour | 2 colour | 3 colour |
| 1–50        | N3,750   | N4,000   | N4,250   |
| 50–200      | N3,250   | N3,500   | N3,750   |
| 200–500     | N3,000   | N3,250   | N3,500   |
| 500+        | N2,750   | N3,000   | N3,250   |
Pre-order: N2,600 + N220 per tone

DEEP WAVE:
| 1–50: N4,000 | 50–200: N3,500 | 200–500: N3,250 | 500+: N3,000 | +N250 per tone
Pre-order: N2,600 + N220 per tone

PASSION TWIST, SPRING TWIST, MALLEY TWIST:
| 1–50: N4,500 | 51–200: N4,250 | 201–500: N4,000 | 500–1000: N3,750 | +N250 for OTC

HUMAN HAIR BRAID EXTENSIONS WHOLESALE:
DD 14": 1–15: N40,000 | 16–30: N37,000 | 31–50: N34,000 | 50+: N34,500
DD 16": 1–15: N50,000 | 16–30: N47,000 | 31–50: N44,000
DD 18": 1–15: N60,000 | 16–30: N57,000 | 31–50: N54,000
SDD 14": 1–15: N90,000 | 16–30: N87,000 | 31–50: N84,000
SDD 16": 1–15: N100,000 | 16–30: N97,000 | 31–50: N94,000
SDD 18": 1–15: N115,000 | 16–30: N112,000 | 31–50: N109,000
Extra N5,000 for colours

AFRO KINKY BULK WHOLESALE:
14": 1–15: N25,000 | 16–30: N23,000 | 31–50: N22,000 | Extra N4,000 for colours`;

// ── API Routes ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Enog Braid Extensions AI Agent is running! 👑'));
app.get('/webhook', (req, res) => res.send('Webhook is live!'));

app.get('/debug', (req, res) => {
  res.json({
    hasRedisUrl: !!process.env.KV_REST_API_URL,
    hasRedisToken: !!process.env.KV_REST_API_TOKEN,
    inMemoryConversations: Object.keys(conversations).length,
    customers: Object.keys(conversations),
  });
});

app.get('/send-report', async (req, res) => {
  await sendWeeklyReport();
  res.send('Weekly report sent!');
});


// ── Broadcast Messages ────────────────────────────────────────────────────────
app.post('/api/broadcast', async (req, res) => {
  try {
    const { message, filter } = req.body;
    if (!message) return res.json({ success: false, error: 'No message provided' });

    const keys = await redisListKeys('enog_conv_*');
    if (!keys.length) return res.json({ success: true, sent: 0, message: 'No conversations found' });

    const convs = await Promise.all(keys.map(k => redisLoad(k)));
    const valid = convs.filter(Boolean);

    // Filter by status if specified
    let targets = valid;
    if (filter && filter !== 'all') {
      targets = valid.filter(c => c.status === filter);
    }

    // Only send to customers within 24 hour window
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const reachable = targets.filter(c => c.from && (now - (c.lastActive || 0)) < twentyFourHours);

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+2348061511729';

    let sent = 0;
    let failed = 0;
    const results = [];

    for (const conv of reachable) {
      try {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
          },
          body: new URLSearchParams({ From: from, To: conv.from, Body: message }).toString(),
        });

        // Save to conversation history
        conv.messages = conv.messages || [];
        conv.messages.push({ from: 'business', text: message, time: new Date().toISOString() });
        conv.lastActive = now;
        await redisSave(`enog_conv_${conv.from.replace(/[^a-zA-Z0-9]/g, '_')}`, conv);

        // Update in-memory
        if (conversations[conv.from]) {
          conversations[conv.from].push({ role: 'assistant', content: message });
        }

        sent++;
        results.push({ name: conv.name || conv.from, status: 'sent' });
        console.log(`Broadcast sent to ${conv.name || conv.from}`);

        // Small delay to avoid Twilio rate limits
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        failed++;
        results.push({ name: conv.name || conv.from, status: 'failed', error: e.message });
        console.error(`Broadcast failed for ${conv.from}:`, e.message);
      }
    }

    res.json({
      success: true,
      sent,
      failed,
      skipped: targets.length - reachable.length,
      total: targets.length,
      results
    });
  } catch (e) {
    console.error('Broadcast error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/conversations', async (req, res) => {
  try {
    const keys = await redisListKeys('enog_conv_*');
    if (!keys.length) return res.json([]);
    const convs = await Promise.all(keys.map(k => redisLoad(k)));
    const valid = convs.filter(Boolean).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
    res.json(valid);
  } catch (e) {
    console.error('Get convs error:', e.message);
    res.json([]);
  }
});

app.post('/api/conversations/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const conv = await redisLoad(req.params.id);
    if (conv) {
      conv.status = status;
      if (status === 'done') conv.unread = 0;
      await redisSave(req.params.id, conv);
    }
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

app.post('/api/reply', async (req, res) => {
  try {
    const { to, message, convId } = req.body;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+2348061511729';
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
      body: new URLSearchParams({ From: from, To: to, Body: message }).toString(),
    });
    const conv = await redisLoad(convId);
    if (conv) {
      conv.messages.push({ from: 'business', text: message, time: new Date().toISOString() });
      conv.status = 'done'; conv.unread = 0;
      await redisSave(convId, conv);
    }
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// AI pause/resume for takeover
app.post('/api/pause', async (req, res) => {
  try {
    const { convId, paused } = req.body;
    const conv = await redisLoad(convId);
    if (conv) {
      conv.aiPaused = paused;
      await redisSave(convId, conv);
    }
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

// Conversation summary
app.post('/api/summarize', async (req, res) => {
  try {
    const { messages } = req.body;
    const transcript = messages.slice(-20).map(m =>
      `${m.from === 'customer' ? 'Customer' : 'Agent'}: ${m.text}`
    ).join('\n');
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: 'Summarize this WhatsApp conversation in 3-4 bullet points. Focus on: what the customer wants, any products discussed, pricing discussed, current status (ordered/paid/pending/browsing). Be brief and clear.',
        messages: [{ role: 'user', content: transcript }]
      }),
    });
    const data = await aiRes.json();
    res.json({ summary: data.content?.[0]?.text || 'No summary available' });
  } catch (e) { res.json({ summary: 'Could not generate summary' }); }
});

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

// ── Main Webhook ──────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      const { Body, From, To, ProfileName, NumMedia, MediaUrl0, MediaContentType0 } = req.body;
      if (!From || !To) return;

      const customerName = ProfileName || From;
      console.log(`MSG from ${customerName}: ${Body || '[media]'}`);

      const sid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      async function sendWA(text) {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${sid}:${authToken}`).toString('base64') },
          body: new URLSearchParams({ From: To, To: From, Body: text }).toString(),
        });
      }

      // Handle voice notes
      if (NumMedia > 0 && MediaContentType0 && MediaContentType0.startsWith('audio')) {
        await sendWA("Thank you for your voice note 😊 It has been noted and will be passed to our team for review. In the meantime, please type your message so we can attend to you faster!");
        return;
      }

      // Handle images
      let messageContent = Body || '';
      if (NumMedia > 0 && MediaUrl0 && MediaContentType0 && MediaContentType0.startsWith('image')) {
        const today = new Date().toISOString().split('T')[0];
        const imgKey = `${From}_${today}`;
        imageCounts[imgKey] = (imageCounts[imgKey] || 0) + 1;
        if (imageCounts[imgKey] > 3) {
          await sendWA("Thank you for the picture 😊 It has been received and will be reviewed by our team.");
          return;
        }
        messageContent = Body ? `[Customer sent image with caption: "${Body}"]` : "[Customer sent an image]";
      }

      if (!messageContent) return;

      trackMessage(From, messageContent);

      // Check if AI is paused for this customer (Enog took over)
      const redisKey = `enog_conv_${From.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const existingConv = await redisLoad(redisKey);

      if (existingConv && existingConv.aiPaused) {
        // AI is paused - save message to Redis for dashboard but don't auto-reply
        existingConv.messages.push({ from: 'customer', text: messageContent, time: new Date().toISOString() });
        existingConv.lastActive = Date.now();
        existingConv.unread = (existingConv.unread || 0) + 1;
        existingConv.status = 'needs_reply';
        await redisSave(redisKey, existingConv);
        console.log(`AI paused for ${From} - message saved for Enog to handle`);
        return;
      }

      // Get or rebuild in-memory conversation
      if (!conversations[From]) {
        if (existingConv && existingConv.messages) {
          conversations[From] = existingConv.messages.slice(-20)
            .map(m => ({ role: m.from === 'customer' ? 'user' : 'assistant', content: m.text }))
            .filter(m => m.content && !m.content.startsWith('[Voice'));
        } else {
          conversations[From] = [];
          analytics.totalConversations++;
        }
      }

      const isFirst = conversations[From].length === 0;
      conversations[From].push({ role: 'user', content: messageContent });
      if (conversations[From].length > 20) conversations[From] = conversations[From].slice(-20);

      const systemPrompt = `${BUSINESS_PROMPT}

CONVERSATION: ${isFirst ? 'NEW — use the welcome message above then ask how you can help.' : 'ONGOING — NO greeting at all. Reply directly to what they said.'}`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, system: systemPrompt, messages: conversations[From] }),
      });

      const aiData = await aiRes.json();
      const reply = aiData.content?.[0]?.text || "How can I help you? 😊";
      console.log(`Reply: ${reply}`);

      conversations[From].push({ role: 'assistant', content: reply });

      // Send WhatsApp reply FIRST
      await sendWA(reply);
      console.log('WhatsApp reply sent!');

      // Manager alert — if AI is escalating to manager, notify manager on WhatsApp
      if (reply.includes('[MANAGER ALERT NEEDED]') || 
          reply.toLowerCase().includes('connect you to our manager') ||
          reply.toLowerCase().includes('let me connect you')) {
        try {
          const managerNumber = 'whatsapp:+2347034562686';
          const alertMsg = `🔔 MANAGER ALERT!
Customer: ${customerName}
Number: ${From}
Their message: ${messageContent.substring(0, 150)}

Please follow up with this customer urgently! 🙏`;
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${sid}:${authToken}`).toString('base64') },
            body: new URLSearchParams({ From: To, To: managerNumber, Body: alertMsg }).toString(),
          });
          console.log('Manager alert sent!');
        } catch (e) { console.error('Manager alert error:', e.message); }
      }

      // Save to Redis for dashboard
      const convData = existingConv || { id: redisKey, from: From, name: customerName, messages: [], status: 'needs_reply', lastActive: Date.now(), unread: 0 };
      convData.messages.push({ from: 'customer', text: messageContent === Body ? messageContent : '[Image]', time: new Date().toISOString() });
      convData.messages.push({ from: 'business', text: reply, time: new Date().toISOString() });
      convData.lastActive = Date.now();
      convData.name = customerName;
      convData.unread = (convData.unread || 0) + 1;
      convData.status = 'needs_reply';
      convData.aiPaused = false;
      if (convData.messages.length > 100) convData.messages = convData.messages.slice(-100);
      await redisSave(redisKey, convData);

    } catch (err) {
      console.error('Webhook error:', err.message);
    }
  });
});

setInterval(() => {
  const today = new Date().toISOString().split('T')[0];
  for (const key in imageCounts) { if (!key.includes(today)) delete imageCounts[key]; }
}, 3600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Enog Braid Extensions Agent running on port ${PORT}`);
  scheduleWeeklyReport();
  setInterval(sendFollowUps, 30 * 60 * 1000);
  console.log('Follow-up scheduler started');
});

// ── Auto Follow-up System ─────────────────────────────────────────────────────
async function sendFollowUps() {
  try {
    const keys = await redisListKeys('enog_conv_*');
    if (!keys.length) return;
    const now = Date.now();
    const oneHour = 1 * 60 * 60 * 1000;
    const threeHours = 3 * 60 * 60 * 1000;
    const twoHours = 2 * 60 * 60 * 1000;
    const sixHours = 6 * 60 * 60 * 1000;
    const twentyFourHours = 24 * 60 * 60 * 1000;
    for (const key of keys) {
      const conv = await redisLoad(key);
      if (!conv || !conv.from || !conv.messages?.length) continue;
      if (conv.aiPaused || conv.status === 'done') continue;
      const lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg.from === 'business') continue;
      if (now - conv.lastActive > twentyFourHours) continue;
      const timeSince = now - conv.lastActive;
      const followUpCount = conv.followUpCount || 0;
      let msg = null;
      if (conv.status === 'unpaid' && timeSince > threeHours && followUpCount < 2) {
        msg = followUpCount === 0
          ? "Hi! 😊 Just checking on your order — were you able to make the payment? Let me know if you need the account details again!"
          : "Hello! Your order is still pending payment. Kindly complete payment so we can process it. Need help? Contact manager: +2347034562686";
      } else if (conv.status === 'needs_reply' && timeSince > oneHour && followUpCount === 0) {
        msg = "Hi! 😊 Just checking in — have you made a decision on what to order? We are here to help!";
      } else if (conv.status === 'needs_reply' && timeSince > threeHours && followUpCount === 1) {
        msg = "Hello! We are still here if you have questions 😊 You can also speak with our manager: +2347034562686 or visit: enogbeautycastle.bumpa.shop";
      }
      if (msg) {
        try {
          const sid = process.env.TWILIO_ACCOUNT_SID;
          const token = process.env.TWILIO_AUTH_TOKEN;
          const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+2348061511729';
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
            body: new URLSearchParams({ From: from, To: conv.from, Body: msg }).toString(),
          });
          conv.messages.push({ from: 'business', text: msg, time: new Date().toISOString() });
          conv.followUpCount = followUpCount + 1;
          conv.lastActive = now;
          await redisSave(key, conv);
          if (conversations[conv.from]) conversations[conv.from].push({ role: 'assistant', content: msg });
          console.log(`Follow-up sent to ${conv.name || conv.from}`);
        } catch (e) { console.error('Follow-up send error:', e.message); }
      }
    }
  } catch (e) { console.error('Follow-up error:', e.message); }
}
