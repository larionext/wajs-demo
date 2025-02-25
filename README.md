# Integrazione di WhatsApp in un progetto Node.js
## Panoramica
Questa demo nasce dall’esigenza di fornire un MVP per l’implementazione di WhatsApp all’interno di una web app. Esistono diverse opzioni per integrare la messaggistica su WhatsApp:
1. WhatsApp Business Platform
2. Twilio WhatsApp Conversations
3. whatsapp-web.js

Le prime due soluzioni sono quelle supportate ufficialmente da Meta, ma portano un grosso svantaggio a livello di user experience: il numero di telefono associato non può essere utilizzato tramite app (né WhatsApp, né WhatsApp Business – quest’ultima non va confusa con WhatsApp Business Platform). Twilio, essendo carrier internazionale, mitiga questa problematica dando la possibilità di attivare nuove numerazioni da utilizzare per lo scopo.

Ulteriore svantaggio in termini di user experience con WhatsApp Business Platform è la procedura di onboarding in qualità di vendor indipendente, che richiede un processo di verifica e autorizzazione da parte di Meta per poter associare numeri di terzi (ritornando poi al problema esposto nel paragrafo precedente).

L’unica soluzione in linea con i requisiti di implementazione in Memofly è la libreria JavaScript `whatsapp-web.js`, una soluzione non ufficiale che espone le funzioni di WhatsApp come API facendo da wrapper attorno a WhatsApp Web. Per fare ciò utilizza dietro le quinte Puppeteer (Headless Chrome). Il developer che implementi la libreria whatsapp-web.js, perciò, non dovrà interagire con Puppeteer perché il lavoro di astrazione è compito proprio della libreria in questione. Ciò che rimane da fare, quindi, è implementare la libreria in un progetto.

Essendo una libreria non ufficiale si raccomanda di utilizzarla con parsimonia (es. con limite giornaliero o mensile di messaggi, 50 per utente) e di tenerla sempre aggiornata, onde evitare ban da parte di Meta (che nel caso applicherebbe il ban all’utente, non al client di per sé) ad esempio per l’utilizzo di API deprecate.

## Come funziona whatsapp-web.js?
`whatsapp-web.js` è una libreria JavaScript che implementa API client per WhatsApp, sfruttando Puppeteer per interfacciarsi con WhatsApp tramite WhatsApp Web.

Puppeteer richiede Chromium e viene scaricato e configurato in automatico al primo avvio dell’app che implementa `whatsapp-web.js` (tecnicamente viene fatto al momento della prima creazione di un `Client` di `whatsapp-web.js`). Il dev quindi non dovrà interagire con Puppeteer, perché il lavoro di astrazione è già stato fatto dai dev di `whatsapp-web.js`. Pertanto l’integrazione di WhatsApp tramite questa libreria è trasparente ed è, a livello concettuale, simile all’integrazione di altri canali di messaggistica.

Ogni utente è rappresentato da un `Client`. Perciò, per supportare più utenti è necessario creare più client, ciascuno identificato dal proprio ID.

## Funzioni da implementare
1. Gestione delle sessioni: login tramite QR code, logout e persistenza delle sessioni degli utenti
2. Invio dei messaggi e controllo dello stato

### Gestione delle sessioni
Per avviare una sessione è necessario creare un [`Client`](https://docs.wwebjs.dev/Client.html).

```
const client = new Client({
    authStrategy: new LocalAuth()
});
```

È possibile memorizzare ogni sessione con 3 strategie:
1. Nessuna memorizzazione: la sessione in questo caso è effimera
2. Memorizzazione in locale: la sessione viene memorizzata su filesystem locale
3. Memorizzazione su sistemi remoti (Remote Auth): la sessione viene memorizzata su datastore esterni quali [MongoDB](https://github.com/jtouris/wwebjs-mongo) e [S3](https://github.com/arbisyarifudin/wwebjs-aws-s3) (sono i due datastore supportati dalla libreria)

Per salvare la sessione è necessario attendere circa un minuto per il completamento.[^ Dalla guida della libreria: https://wwebjs.dev/guide/creating-your-bot/authentication.html#session-saved]

Per accedere è necessario ottenere il QR code dal client creato. In questo esempio viene generato con la libreria `qrcode-terminal` e mostrato in console (ogni 30 secondi ne viene generato uno nuovo, finché l’utente non associa il proprio account):
```
client.on('qr', qr => {
    qrcode.generate(qr, {
        small: true
    });
});
```

Notare che questo fa ancora parte della configurazione del client. Il QR viene generato e mostrato una volta che viene chiamata la funzione `client.initialize()` (per la definizione di `client` vedi l’esempio precedente).

### Invio dei messaggi
Per inviare un messaggio bisogna chiamare sul client, creato come da indicazioni nel paragrafo precedente, la funzione [`sendMessage`](https://docs.wwebjs.dev/Client.html#sendMessage) con i seguenti parametri: 

- `chatId`: il numero di telefono nel formato XMPP usato da WhatsApp, ovvero numero in formato internazionale (senza il +, ovvero il MSISDN) e dominio @c.us. Es.: 393351234567@c.us
- `content`: il messaggio di testo da inviare

```
app.get('/send', (req, res) => {
  // TODO: check if WhatsApp session is active
  // TODO: check if the recipient is a WhatsApp user

  // Convert number from international format to WhatsApp Chat ID
  let recipient = req.query.recipient.replace('+') + '@c.us';
  let text = 'Ciao!';
      
  client.sendMessage(recipient, text);

  res.send('Messaggio inviato!');
});
```

In questo esempio viene aggiunto l’endpoint `/send` in un’app Express. Chiamando l’endpoint in GET col parametro `recipient`  (es. `/send?recipient=+393351234567`) verrà inviato un messaggio contenente il testo “Ciao!” al numero indicato.

#### Controllare lo stato dell’invio
È possibile controllare lo stato dell’invio ascoltando l’evento `message_ack` e definendo una callback che leggerà i parametri restituiti dalla funzione.

```
client.on('message_ack', (msg, ack) => {
    if (ack == 3) {
        // Il messaggio è stato letto
        console.log(`Il messaggio ${msg} è stato letto.`);
    }
});
```

A seconda del codice restituito è possibile determinare lo stato dell’invio:
- **-1**: errore
- **0**: invio in corso
- **1**: inviato a WhatsApp
- **2**: ricevuto dal destinatario
- **3**: messaggio letto (se il destinatario ha abilitato la conferma della lettura, c.d. “spunta blu”)
- **4**: riprodotto (questo per quanto riguarda contenuti multimediali, es. audio o video, e sempre se la notifica di lettura è abilitata)

## Come implementarlo in Memofly/Notify
Premessa: queste sono indicazioni generiche, basate solo su una descrizione ad alto livello dell’architettura di Memofly, che prescindono dalla reale architettura dell’app. Il documento perciò andrà aggiornato regolarmente in base alle indicazioni che emergeranno dalle varie discussioni a riguardo.

Idealmente WhatsApp andrebbe integrato come ulteriore provider in Notify e decidere, in base alle impostazioni dell’utente, se inviare il messaggio tramite SMS o tramite WhatsApp.

La parte più *tricky* è sicuramente l’implementazione dei client per ciascun cliente Memofly e la gestione delle rispettive sessioni.

In ogni caso, la libreria `whatsapp-web.js` va implementata nel backend in Notify. Notify poi si occupa del mantenimento delle sessioni e dell’invio dei messaggi su WhatsApp.

Per poter permettere agli utenti Memofly di configurare il proprio account WhatsApp è necessario implementare in Notify un endpoint che permetta di creare un nuovo client ed invii al frontend esponga il QR per l’associazione dell’account WhatsApp. Una volta che l’utente ha effettuato l’associazione, Notify memorizza la sessione e la associa al rispettivo utente Memofly, rendendo disponibile WhatsApp come metodo di invio.

Idealmente tutto questo andrebbe inserito, nel frontend, in una scheda dedicata all’interno delle impostazioni. Aperta questa scheda, si verifica se per l’utente è presente un account WhatsApp. Se sì, semplicemente si mostra lo stato della sessione (es. “Hai già configurato WhatsApp col numero +39XXX. Vuoi cambiare account?”), altrimenti Notify crea un nuovo client, invia il QR al frontend, l’utente lo scansiona e Notify memorizza i dati di accesso al nuovo account.