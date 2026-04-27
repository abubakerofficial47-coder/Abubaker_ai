const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const FIREBASE_URL = process.env.FIREBASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '';

const orderStates = {};
const chatHistory = {};
const MAX_HISTORY = 10;

// ─── Firebase Helpers ───

async function getMenuFromApp() {
    try {
        const response = await fetch(`${FIREBASE_URL}/dishes.json`);
        const data = await response.json();
        if (!data) return [];
        return Object.keys(data).map(key => ({
            id: key,
            name: data[key].name,
            price: data[key].price,
            imageUrl: data[key].imageUrl
        }));
    } catch (error) {
        console.error("Failed to fetch menu:", error);
        return [];
    }
}

async function getOrders(filter) {
    try {
        const response = await fetch(`${FIREBASE_URL}/orders.json`);
        const data = await response.json();
        if (!data) return [];
        const orders = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        if (filter) return orders.filter(filter);
        return orders;
    } catch (error) {
        console.error("Failed to fetch orders:", error);
        return [];
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        await fetch(`${FIREBASE_URL}/orders/${orderId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        return true;
    } catch (error) {
        console.error("Failed to update order:", error);
        return false;
    }
}

// ─── Gemini AI ───

async function askGemini(userMessage, sender) {
    if (!GEMINI_API_KEY) return null;

    if (!chatHistory[sender]) chatHistory[sender] = [];
    chatHistory[sender].push({ role: 'user', parts: [{ text: userMessage }] });
    if (chatHistory[sender].length > MAX_HISTORY * 2) {
        chatHistory[sender] = chatHistory[sender].slice(-MAX_HISTORY * 2);
    }

    const currentMenu = await getMenuFromApp();
    let menuInfo = '';
    if (currentMenu.length > 0) {
        menuInfo = '\n\nCurrent Menu:\n' + currentMenu.map(i => `- ${i.name}: Rs.${i.price}`).join('\n');
    }

    const systemPrompt = `You are a friendly WhatsApp AI assistant for "JavaGoat" food delivery service. 
You can chat in both Urdu and English - reply in whatever language the customer uses.
Keep responses short and friendly (max 3-4 lines for general chat).
If someone asks about food/menu/ordering, guide them to use the menu and order commands.
${menuInfo}

Commands available:
- Type "menu" to see the full menu
- Type "order [dish name]" to order
- Type "my orders" to check order status
- Type "cancel" to cancel current order

Do NOT process orders yourself - just guide users to use the commands above.
Be helpful, warm, and conversational.`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: chatHistory[sender]
                })
            }
        );
        const result = await response.json();
        const reply = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
            chatHistory[sender].push({ role: 'model', parts: [{ text: reply }] });
            return reply;
        }
        return null;
    } catch (error) {
        console.error("Gemini API error:", error);
        return null;
    }
}

// ─── Message Helpers ───

function isAdmin(sender) {
    if (!ADMIN_NUMBER) return false;
    return sender.includes(ADMIN_NUMBER);
}

function formatOrderList(orders, limit) {
    const list = limit ? orders.slice(-limit) : orders;
    if (list.length === 0) return 'No orders found.';
    return list.map((o, i) => {
        const items = o.items?.map(it => it.name).join(', ') || 'Unknown';
        const date = o.timestamp ? new Date(o.timestamp).toLocaleDateString() : 'N/A';
        return `${i + 1}. *${items}* - Rs.${o.total}\n   Status: ${o.status} | ${date}`;
    }).join('\n\n');
}

// ─── Main Bot ───

async function startBot() {
    if (!FIREBASE_URL) {
        console.log("ERROR: FIREBASE_URL is missing!");
        process.exit(1);
    }
    if (!GEMINI_API_KEY) {
        console.log("WARNING: GEMINI_API_KEY not set. AI chat disabled, basic commands still work.");
    }

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["JavaGoat-AI", "Chrome", "1.0"]
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.clear();
            console.log('\n==================================================');
            console.log('  SCAN THIS QR CODE WITH YOUR WHATSAPP');
            console.log('  WhatsApp > Settings > Linked Devices > Link');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('JavaGoat AI Agent is ONLINE!');
            console.log('Bot is ready to handle messages.');
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('Connection lost. Reconnecting...');
                startBot();
            } else {
                console.log('Logged out. Delete session_data folder and restart to re-link.');
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const text = rawText.toLowerCase().trim();

        if (!text) return;

        console.log(`[${new Date().toLocaleTimeString()}] ${sender.split('@')[0]}: ${rawText}`);

        try {
            // ─── Cancel current order ───
            if (text === 'cancel') {
                if (orderStates[sender]) {
                    delete orderStates[sender];
                    await sock.sendMessage(sender, { text: 'Order cancelled. Type *menu* to start again.' });
                } else {
                    await sock.sendMessage(sender, { text: 'You have no active order to cancel.' });
                }
                return;
            }

            // ─── Order flow: waiting for address ───
            if (orderStates[sender]?.step === 'WAITING_FOR_ADDRESS') {
                const customerDetails = rawText;
                const item = orderStates[sender].item;
                const customerWaNumber = sender.split('@')[0];

                const order = {
                    userId: "whatsapp_" + customerWaNumber,
                    userEmail: "whatsapp@javagoat.com",
                    phone: customerWaNumber,
                    address: customerDetails,
                    location: { lat: 0, lng: 0 },
                    items: [{
                        id: item.id,
                        name: item.name,
                        price: parseFloat(item.price),
                        img: item.imageUrl || "",
                        quantity: orderStates[sender].quantity || 1
                    }],
                    total: (parseFloat(item.price) * (orderStates[sender].quantity || 1) + 50).toFixed(2),
                    status: "Placed",
                    method: "Cash on Delivery (WhatsApp)",
                    timestamp: new Date().toISOString()
                };

                try {
                    await fetch(`${FIREBASE_URL}/orders.json`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(order)
                    });
                } catch (error) {
                    console.error("Firebase Error:", error);
                    await sock.sendMessage(sender, { text: 'Sorry, there was an error placing your order. Please try again.' });
                    delete orderStates[sender];
                    return;
                }

                await sock.sendMessage(sender, {
                    text: `*Order Placed!*\n\n*Item:* ${item.name}\n*Total:* Rs.${order.total} (delivery included)\n*Payment:* Cash on Delivery\n\nWe will deliver it soon!\nType *my orders* to check status.`
                });
                delete orderStates[sender];
                return;
            }

            // ─── Order flow: waiting for quantity ───
            if (orderStates[sender]?.step === 'WAITING_FOR_QUANTITY') {
                const qty = parseInt(text);
                if (isNaN(qty) || qty < 1 || qty > 20) {
                    await sock.sendMessage(sender, { text: 'Please enter a valid quantity (1-20):' });
                    return;
                }
                orderStates[sender].quantity = qty;
                orderStates[sender].step = 'WAITING_FOR_ADDRESS';
                await sock.sendMessage(sender, {
                    text: `Quantity: *${qty}*\n\nNow please send your:\n*1.* Full Name\n*2.* Phone Number\n*3.* Delivery Address\n\n(Send all in one message)\nType *cancel* to cancel.`
                });
                return;
            }

            // ─── Start order ───
            if (text.startsWith("order ")) {
                const productRequested = text.replace("order ", "").trim();
                const currentMenu = await getMenuFromApp();

                const matchedItem = currentMenu.find(item =>
                    item.name.toLowerCase().includes(productRequested)
                );

                if (!matchedItem) {
                    const suggestions = currentMenu
                        .filter(item => item.name.toLowerCase().includes(productRequested.slice(0, 3)))
                        .map(item => item.name)
                        .slice(0, 3);

                    let reply = `Sorry, *${productRequested}* not found in our menu.`;
                    if (suggestions.length > 0) {
                        reply += `\n\nDid you mean:\n${suggestions.map(s => `- ${s}`).join('\n')}`;
                    }
                    reply += '\n\nType *menu* to see all items.';
                    await sock.sendMessage(sender, { text: reply });
                    return;
                }

                orderStates[sender] = { step: 'WAITING_FOR_QUANTITY', item: matchedItem };

                if (matchedItem.imageUrl) {
                    await sock.sendMessage(sender, {
                        image: { url: matchedItem.imageUrl },
                        caption: `*${matchedItem.name}* - Rs.${matchedItem.price}\n\nHow many would you like? (Enter quantity)\nType *cancel* to cancel.`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `*${matchedItem.name}* - Rs.${matchedItem.price}\n\nHow many would you like? (Enter quantity)\nType *cancel* to cancel.`
                    });
                }
                return;
            }

            if (text === "order") {
                await sock.sendMessage(sender, {
                    text: `*How to Order:*\n\nType: *order [dish name]*\nExample: _order pizza_\n\nType *menu* to see available items first.`
                });
                return;
            }

            // ─── My Orders ───
            if (text === "my orders" || text === "my order" || text === "orders" || text === "status") {
                const waNumber = sender.split('@')[0];
                const myOrders = await getOrders(o => o.phone === waNumber);

                if (myOrders.length === 0) {
                    await sock.sendMessage(sender, { text: 'You have no orders yet. Type *menu* to start ordering!' });
                } else {
                    const recent = myOrders.slice(-5);
                    await sock.sendMessage(sender, {
                        text: `*Your Recent Orders:*\n\n${formatOrderList(recent)}\n\nType *menu* to order again.`
                    });
                }
                return;
            }

            // ─── Menu ───
            if (text === "menu" || text === "price" || text === "list" || text === "food" || text === "prices") {
                const currentMenu = await getMenuFromApp();

                if (currentMenu.length === 0) {
                    await sock.sendMessage(sender, { text: 'Our menu is currently being updated. Please check back soon!' });
                    return;
                }

                let menuMessage = "*JAVAGOAT MENU*\n\n";
                currentMenu.forEach((item, idx) => {
                    menuMessage += `*${idx + 1}.* ${item.name} - Rs.${item.price}\n`;
                });
                menuMessage += "\n_To order, type:_ *order [dish name]*\n_Example:_ order pizza";

                await sock.sendMessage(sender, { text: menuMessage });
                return;
            }

            // ─── Help ───
            if (text === "help" || text === "commands" || text === "?") {
                await sock.sendMessage(sender, {
                    text: `*JavaGoat AI Assistant*\n\n*Commands:*\n- *menu* - View our menu\n- *order [dish]* - Order a dish\n- *my orders* - Check your orders\n- *cancel* - Cancel current order\n- *help* - Show this message\n\nYou can also chat with me in Urdu or English!`
                });
                return;
            }

            // ─── Admin Commands ───
            if (isAdmin(sender)) {
                if (text === 'admin orders' || text === 'all orders') {
                    const allOrders = await getOrders();
                    if (allOrders.length === 0) {
                        await sock.sendMessage(sender, { text: 'No orders yet.' });
                    } else {
                        const recent = allOrders.slice(-10);
                        await sock.sendMessage(sender, {
                            text: `*All Orders (${allOrders.length} total, showing last 10):*\n\n${formatOrderList(recent)}`
                        });
                    }
                    return;
                }

                if (text.startsWith('update ')) {
                    const parts = rawText.trim().substring('update '.length).split(' ');
                    const orderId = parts[0];
                    const newStatus = parts.slice(1).join(' ');
                    if (!orderId || !newStatus) {
                        await sock.sendMessage(sender, { text: 'Usage: *update [order-id] [status]*\nExample: update -ABC123 Delivered' });
                        return;
                    }
                    const success = await updateOrderStatus(orderId, newStatus);
                    await sock.sendMessage(sender, {
                        text: success ? `Order ${orderId} updated to: *${newStatus}*` : 'Failed to update order.'
                    });
                    return;
                }

                if (text === 'pending orders') {
                    const pending = await getOrders(o => o.status === 'Placed');
                    if (pending.length === 0) {
                        await sock.sendMessage(sender, { text: 'No pending orders!' });
                    } else {
                        await sock.sendMessage(sender, {
                            text: `*Pending Orders (${pending.length}):*\n\n${formatOrderList(pending)}`
                        });
                    }
                    return;
                }

                if (text === 'admin help') {
                    await sock.sendMessage(sender, {
                        text: `*Admin Commands:*\n\n- *admin orders* - View all orders\n- *pending orders* - View pending orders\n- *update [id] [status]* - Update order status\n- *admin help* - Show this message`
                    });
                    return;
                }
            }

            // ─── Greetings (fallback if no AI) ───
            if (!GEMINI_API_KEY) {
                if (text.includes("hi") || text.includes("hello") || text.includes("hey") || text.includes("salam") || text.includes("assalam")) {
                    await sock.sendMessage(sender, {
                        text: `*Welcome to JavaGoat!*\n\nI am your AI Assistant.\n\n- Type *menu* to see our food\n- Type *order [dish]* to order\n- Type *help* for all commands`
                    });
                    return;
                }

                await sock.sendMessage(sender, {
                    text: `Type *menu* to see our food, or *order [dish]* to place an order.\nType *help* for all commands.`
                });
                return;
            }

            // ─── AI Chat (Gemini) ───
            const aiReply = await askGemini(rawText, sender);
            if (aiReply) {
                await sock.sendMessage(sender, { text: aiReply });
            } else {
                await sock.sendMessage(sender, {
                    text: `Type *menu* to see our food, or *order [dish]* to place an order.\nType *help* for all commands.`
                });
            }

        } catch (error) {
            console.error("Message handling error:", error);
            await sock.sendMessage(sender, { text: 'Sorry, something went wrong. Please try again.' });
        }
    });
}

startBot().catch(err => console.error("Bot startup error:", err));
