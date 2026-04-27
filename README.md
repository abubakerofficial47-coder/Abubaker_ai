# Abubaker AI - JavaGoat WhatsApp Agent

A full WhatsApp AI Agent powered by [Baileys](https://github.com/WhiskeySockets/Baileys) and Google Gemini AI. Connects to the JavaGoat food ordering app via Firebase.

## Features

- **AI Chat** – Google Gemini AI for intelligent conversations in Urdu and English
- **Live Menu** – Fetches the latest menu from Firebase in real-time
- **Smart Ordering** – Full order flow with quantity selection and delivery details
- **Order Tracking** – Customers can check their order status
- **Product Images** – Sends product images from Firebase when ordering
- **Admin Panel** – Admin commands to manage orders and update status
- **Auto Reconnect** – Automatically reconnects if disconnected
- **Cancel Support** – Customers can cancel orders mid-flow

## Customer Commands

| Command | Description |
|---------|-------------|
| `hi` / `hello` / `salam` | Welcome message |
| `menu` | View the live menu with prices |
| `order [dish name]` | Start ordering a dish |
| `my orders` | Check your order status |
| `cancel` | Cancel current order |
| `help` | Show all commands |
| Any message | AI will respond intelligently |

## Admin Commands

Set your WhatsApp number as `ADMIN_NUMBER` to access:

| Command | Description |
|---------|-------------|
| `admin orders` | View all orders |
| `pending orders` | View pending orders only |
| `update [id] [status]` | Update an order's status |
| `admin help` | Show admin commands |

## Setup

### Prerequisites
- Node.js 20+
- Firebase Realtime Database URL
- Google Gemini API Key (free)

### Installation

```bash
git clone https://github.com/abubakerofficial47-coder/Abubaker_ai.git
cd Abubaker_ai
npm install
```

### Configuration

Set these environment variables:

```bash
export FIREBASE_URL="https://your-project.firebaseio.com"
export GEMINI_API_KEY="your-gemini-api-key"
export ADMIN_NUMBER="923001234567"   # Your WhatsApp number (with country code, no +)
```

### Get Gemini API Key (Free)

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Copy the key

### Run

```bash
npm start
```

Scan the QR code with WhatsApp:
1. Open WhatsApp on your phone
2. Go to **Settings** > **Linked Devices**
3. Click **Link a Device**
4. Scan the QR code shown in terminal

## GitHub Actions Setup

The bot runs automatically via GitHub Actions. Add these secrets:

1. Go to **Settings** > **Secrets and variables** > **Actions**
2. Add these secrets:

| Secret | Required | Description |
|--------|----------|-------------|
| `FIREBASE_URL` | Yes | Your Firebase Realtime Database URL |
| `GEMINI_API_KEY` | No | Google Gemini API key (AI chat disabled without it) |
| `ADMIN_NUMBER` | No | Your WhatsApp number for admin commands |

## How It Works

1. Customer sends a message on WhatsApp
2. Bot checks if it's a command (menu, order, etc.)
3. If it's a command, processes it directly
4. If it's general chat, Gemini AI generates a smart response
5. For orders: shows product image > asks quantity > asks delivery details > saves to Firebase
6. Orders appear in the JavaGoat admin panel

## License

MIT
