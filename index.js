const express = require('express');
const app = express();
const port = 3000;

const fs = require('fs');
const qrcode = require('qrcode');
const { Client, LocalAuth  } = require('whatsapp-web.js');


// Initialize WhatsApp client
// FIXME: This means we only support one single client.
//        Find a way to support multiple sessions at once.
const client = new Client({
    authStrategy: new LocalAuth({
      // clientId: '11111',
    }),
    puppeteer: {
      args: ['--no-sandbox', ],
    }
});

// Generate QR code to login to WhatsApp Web.
// The QR code refreshes every 30 seconds.
let loginQR = '';
client.on('qr', qr => {
  loginQR = qr;
  qrcode.generate(loginQR, {
    small: true
  });
});

client.on('ready', () => {
  console.log('Client is ready!');
});

// This function listens to the 'message' event, meaning that reads
// every incoming message. In this example it replies every time the
// incoming message is equal to '!ping', like in IRC bots.
client.on('message', async message => {
	if (message.body === '!ping') {
		message.reply('pong');
    console.log(message.from);
	}
});

// Initialize WhatsApp client
client.initialize();


// Server routes

app.get('/', (req, res) => {
  if (loginQR) {
    res.send(loginQR);
  } else {
    res.send(`Logged in as: +${client.info.wid.user}`);
  }
});

app.get('/pair', (req, res) => {
  // TODO: create new client here

  if (loginQR) {
    res.send(loginQR);
  } else {
    res.send(`Logged in as: +${client.info.wid.user}`);
  }
});

app.get('/send', (req, res) => {
  // TODO: check if WhatsApp session is active
  // TODO: check if the recipient is a WhatsApp user

  // Convert number from international format to WhatsApp Chat ID
  // For the purpose of this demo, the full international number is
  // passed in the query string and the plus sign is decoded as
  // a whitespace character.
  let recipient = req.query.recipient.replaceAll(" ", "") + '@c.us';
  let text = 'Ciao!';
  console.log(recipient);

  client.sendMessage(recipient, text);

  res.send(recipient);
});

app.listen(port, () => {
    console.log(`wajs-demo listening on port ${port}`)
});