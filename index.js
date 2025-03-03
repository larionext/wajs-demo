const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { v4: uuidv4 } = require('uuid');

const port = process.env.PORT || 3000;

const app = express();
app.use(express.json());

/**
 * A simple session manager to hold and restore WhatsApp client sessions
 */
class WhatsAppSessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionsDir = path.join(__dirname, '.wwebjs_auth');
    this.restoreSessions();
  }

  // Create a new session if one doesn't already exist
  createSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId, // Unique identifier for session persistence
        dataPath: path.join(this.sessionsDir, sessionId) // Store session data under a dedicated folder
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    // Listen for QR event to allow authentication and save the last QR for later retrieval if needed
    client.on('qr', (qr) => {
      console.log(`QR for session ${sessionId}:`);
      qrcode.generate(qr, { small: true });
      client.qr = qr;
    });

    // Log when the client is authenticated
    client.on('ready', () => {
      console.log(`Client for session ${sessionId} is ready!`);
    });

    this.sessions.set(sessionId, client);
    client.initialize(); // Start the client and trigger QR generation if needed
    return client;
  }

  // Retrieve an existing session by sessionId
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  // Restore sessions from the sessions directory on app startup
  restoreSessions() {
    if (!fs.existsSync(this.sessionsDir)) {
      console.log("No sessions directory found. Skipping session restore.");
      return;
    }
    const sessionFolders = fs.readdirSync(this.sessionsDir);
    sessionFolders.forEach((sessionId) => {
      const sessionPath = path.join(this.sessionsDir, sessionId);
      if (fs.statSync(sessionPath).isDirectory()) {
        console.log(`Restoring session: ${sessionId}`);
        this.createSession(sessionId);
      }
    });
  }
}

const sessionManager = new WhatsAppSessionManager();

/**
 * Endpoint to create a new WhatsApp session.
 * If no sessionId is provided in the request, it will generate one automatically.
 * Expects an optional JSON body with { sessionId: "your-unique-id" }.
 * Returns { sessionId, qr } once the client emits a "qr" event or is ready.
 */
app.post('/create-session', async (req, res) => {
  // Generate a sessionId if not provided by the user
  let { sessionId } = req.body;
  if (!sessionId) {
    sessionId = uuidv4();
  }
  
  // Create and store the client session
  const client = sessionManager.createSession(sessionId);

  // Wrap QR event in a promise to await its emission
  const qrCodePromise = new Promise((resolve) => {
    client.once('qr', (qr) => {
      resolve({ qr });
    });
    // If the session is already authenticated then resolve immediately
    client.once('ready', () => {
      resolve({ message: 'Client is ready and authenticated', qr: null });
    });
  });

  const result = await qrCodePromise;
  // Return the sessionId along with the result (QR code or ready status)
  return res.status(200).json({ sessionId, ...result });
});

/**
 * Optional endpoint: retrieve an already generated QR code if needed.
 */
app.get('/session/:id/qr', (req, res) => {
  const sessionId = req.params.id;
  const client = sessionManager.getSession(sessionId);
  if (!client) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (client.qr) {
    return res.status(200).json({ qr: client.qr });
  } else {
    return res.status(200).json({ message: 'Client is ready', qr: null });
  }
});

/**
 * Additional endpoint to send a message using a stored session.
 * Expects a JSON body with { phone: "+number", message: "Your Message" }
 */
app.post('/session/:id/send', async (req, res) => {
  const sessionId = req.params.id;
  const { phone, message } = req.body;
  const client = sessionManager.getSession(sessionId);
  if (!client) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!phone || !message) {
    return res.status(400).json({ error: 'Missing phone or message parameter' });
  }
  // Format the phone number to WhatsApp chat id format
  const chatId = phone.startsWith('+') ? phone.substring(1) + '@c.us' : phone + '@c.us';
  try {
    await client.sendMessage(chatId, message);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`wajs-demo listening on port ${port}`)
});
