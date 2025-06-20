const axios = require("axios");
const cheerio = require("cheerio");
const TelegramBot = require("node-telegram-bot-api");
const config = require("./config");

const bot = new TelegramBot(config.telegramBotToken, { polling: true });

let lastOtpCode = null;
let cookie = "";

async function login() {
  const payload = new URLSearchParams({
    username: config.username,
    password: config.password,
  });

  const res = await axios.post("http://94.23.120.156/ints/login", payload.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const setCookie = res.headers["set-cookie"];
  if (setCookie && setCookie[0]) {
    cookie = setCookie[0].split(";")[0];
    console.log("✅ Logged in and got session cookie:", cookie);
  } else {
    throw new Error("❌ Login failed. No session cookie returned.");
  }
}

async function fetchLatestOtp(sendEvenIfSame = false) {
  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;

    const payload = new URLSearchParams({
      fdate1: `${date} 00:00:00`,
      fdate2: `${date} 23:59:59`,
      frange: "",
      fnum: "",
      fcli: "",
    });

    const res = await axios.post(
      "http://94.23.120.156/ints/client/SMSCDRStats",
      payload.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
        },
      }
    );

    const $ = cheerio.load(res.data);
    const rows = $("table tbody tr");

    if (rows.length === 0) return;

    const lastRow = $(rows[0])
      .find("td")
      .map((i, el) => $(el).text().trim())
      .get();

    const [_, time, number, , service, code, msg] = lastRow;

    if (code && (code !== lastOtpCode || sendEvenIfSame)) {
      lastOtpCode = code;
      const message = `✨ OTP Received ✨

⏰ Time: ${time}
📞 Number: ${number}
🔧 Service: ${service}
🔐 OTP Code: ${code}
📝 Msg: ${msg}`;

      bot.sendMessage(config.telegramGroupId, message);
    }
  } catch (err) {
    console.log("⚠️ Error fetching OTP:", err.message);
    if (err.message.includes("403") || err.message.includes("401")) {
      await login(); // relogin if session expired
    }
  }
}

(async () => {
  console.log("🔐 Logging in to Seven1tel...");
  await login();
  bot.sendMessage(config.telegramGroupId, "🚀 Bot Started and Logged in Successfully!");
  await fetchLatestOtp(true); // Force send latest OTP even if same
  setInterval(fetchLatestOtp, 1000);
})();
