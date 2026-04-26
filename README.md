# Abubaker AI - JavaGoat WhatsApp Bot 🤖

A WhatsApp bot powered by [Baileys](https://github.com/WhiskeySockets/Baileys) that connects to the JavaGoat food ordering app via Firebase.

## Features

- **Live Menu** – Fetches the latest menu from Firebase in real-time
- **Order Flow** – Customers can order food directly via WhatsApp
- **Product Images** – Sends product images from Firebase when ordering
- **Cash on Delivery** – Orders are saved to Firebase with delivery details
- **Auto Reconnect** – Automatically reconnects if disconnected

## Commands

| Command | Description |
|---------|-------------|
| `hi` / `hello` | Welcome message |
| `menu` | View the live menu |
| `order [dish name]` | Start ordering a dish |
| `contact` | Get contact info |

## Setup

### Prerequisites
- Node.js 20+
- A Firebase Realtime Database URL

### Installation

```bash
git clone https://github.com/abubakerofficial47-coder/Abubaker_ai.git
cd Abubaker_ai
npm install
```

### Configuration

Set the `FIREBASE_URL` environment variable:

```bash
export FIREBASE_URL="https://your-firebase-project.firebaseio.com"
```

### Run

```bash
npm start
```

Scan the QR code with WhatsApp to connect the bot.

## GitHub Actions

The bot runs automatically via GitHub Actions. Make sure to add `FIREBASE_URL` as a repository secret:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `FIREBASE_URL`
4. Value: Your Firebase Realtime Database URL

## How It Works

1. Customer sends a message on WhatsApp
2. Bot checks the message and responds accordingly
3. For orders, bot fetches the live menu from Firebase
4. Customer provides delivery details
5. Order is saved to Firebase and appears in the admin panel

## License

MIT
