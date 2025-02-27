const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', ],
  },
});

client.once('ready', () => {
  console.log('Client is ready!');

  let rcpt = '+39';
  let recipient = rcpt.replaceAll("+", "") + '@c.us';
  let text = 'Ciao!';

  client.sendMessage(recipient, text);
  console.log(`Sent message: ${text}`);
});

client.on('qr', qr => {
  qrcode.generate(qr, {small: true});
});

client.initialize();
