/**
 * team-page-scraper.js — Geonix-integrated team/about page scraper (v5)
 * Features:
 * ✅ Rotating Geonix authenticated proxies
 * ✅ Proxy health checks and refresh
 * ✅ Axios first for speed
 * ✅ Puppeteer fallback for JS-rendered sites
 * ✅ Full debug logging
 */

const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const dns = require("dns");
const { HttpsProxyAgent } = require("https-proxy-agent");
const puppeteer = require("puppeteer");

// ---------------------- DNS ----------------------
dns.setServers(["8.8.8.8", "1.1.1.1"]);
console.log("🔧 DNS servers set to Google + Cloudflare");

// ---------------------- Express ----------------------
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4404;

// ---------------------- Geonix Config ----------------------
const GEONIX_PROXY = {
  host: process.env.GEONIX_PROXY_HOST || "res.geonix.com",
  basePort: parseInt(process.env.GEONIX_PROXY_PORT || "10000", 10),
  username: process.env.GEONIX_PROXY_USER || "",
  password: process.env.GEONIX_PROXY_PASS || "",
  maxPorts: 10, // Number of rotating ports
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ---------------------- Proxy Helpers ----------------------
function buildProxyUrl(port) {
  const { username, password, host } = GEONIX_PROXY;
  return `https://${encodeURIComponent(username)}:${encodeURIComponent(
    password
  )}@${host}:${port}`;
}

function newProxyAgent(port) {
  const proxyUrl = buildProxyUrl(port);
  console.log(`🌐 [ProxyAgent] Using ${proxyUrl}`);
  try {
    return new HttpsProxyAgent(proxyUrl);
  } catch (err) {
    console.warn(
      `⚠️ Proxy agent creation failed for port ${port}:`,
      err.message
    );
    return null;
  }
}

function getRandomPort() {
  return (
    healthyPorts[Math.floor(Math.random() * healthyPorts.length)] ||
    GEONIX_PROXY.basePort
  );
}

// ---------------------- Proxy Health Checker ----------------------
async function testProxyPort(port) {
  const proxyUrl = buildProxyUrl(port);
  const agent = newProxyAgent(port);
  const testUrl = "https://httpbin.org/ip";

  try {
    const res = await axios.get(testUrl, {
      timeout: 8000,
      httpsAgent: agent,
      httpAgent: agent,
      proxy: false,
    });
    console.log(`✅ [Proxy ${port}] OK (${res.data.origin})`);
    return { port, ok: true };
  } catch (err) {
    console.warn(`❌ [Proxy ${port}] ${err.code || err.message}`);
    return { port, ok: false };
  }
}

let healthyPorts = [];

async function refreshHealthyPorts() {
  const results = await Promise.all(
    Array.from({ length: GEONIX_PROXY.maxPorts }, (_, i) =>
      testProxyPort(GEONIX_PROXY.basePort + i)
    )
  );
  healthyPorts = results.filter((r) => r.ok).map((r) => r.port);
  if (healthyPorts.length === 0) {
    healthyPorts = Array.from(
      { length: GEONIX_PROXY.maxPorts },
      (_, i) => GEONIX_PROXY.basePort + i
    );
    console.warn("⚠️ No healthy ports — using all ports as fallback");
  }
  console.log(`🌐 Healthy ports: ${healthyPorts.join(", ")}`);
}

(async () => {
  await refreshHealthyPorts();
  setInterval(refreshHealthyPorts, 10 * 60 * 1000);
})();

// ---------------------- Helpers ----------------------
const teamSlugs = ["/team", "/our-team", "/meet-the-team", "/staff", "/people"];
const aboutSlugs = ["/about", "/about-us", "/who-we-are"];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function looksLikeCaptcha(html) {
  const lower = String(html || "").toLowerCase();
  return (
    lower.includes("recaptcha") ||
    lower.includes("hcaptcha") ||
    lower.includes("cloudflare") ||
    lower.includes("please verify") ||
    lower.includes("are you human")
  );
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").replace(/\n/g, " ").trim();
}

// ---------------------- Puppeteer Fallback ----------------------
async function fetchWithPuppeteer(url, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const port = getRandomPort();
    const proxyFullUrl = buildProxyUrl(port);
    const proxyHostport = `${GEONIX_PROXY.host}:${port}`;

    console.log(`🦊 [Puppeteer Attempt ${attempt}] via ${proxyFullUrl}`);

    const launchArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--ignore-certificate-errors",
      `--proxy-server=https://${proxyHostport}`, // HTTPS proxy
    ];

    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || undefined,
      headless: true,
      args: launchArgs,
    });

    const page = await browser.newPage();

    try {
      await page.authenticate({
        username: GEONIX_PROXY.username,
        password: GEONIX_PROXY.password,
      });

      await page.setUserAgent(
        process.env.SCRAPER_USER_AGENT ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      console.log(`🌍 [Puppeteer] Navigating to ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 100000 });

      const content = await page.content();
      console.log(
        `✅ [Puppeteer] Page loaded (${content.length} chars) via ${proxyFullUrl}`
      );
      await browser.close();
      return content;
    } catch (err) {
      console.warn(`⚠️ [Puppeteer Attempt ${attempt}] ${err.message}`);
      await browser.close();

      if (attempt < maxAttempts) {
        console.log("🔁 Retrying Puppeteer with another proxy...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      console.error(`❌ [Puppeteer] All ${maxAttempts} attempts failed`);
      return null;
    }
  }
}

// ---------------------- Page Fetching (Axios First) ----------------------
async function fetchPage(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const port = getRandomPort();
    const proxyUrl = buildProxyUrl(port);
    const agent = newProxyAgent(port);

    console.log(
      `🌐 [Fetch Attempt ${attempt}/${retries}] ${url} via ${proxyUrl}`
    );

    try {
      const res = await axios.get(url, {
        timeout: 20000,
        httpsAgent: agent,
        httpAgent: agent,
        proxy: false,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      if (!res.headers["content-type"].includes("text/html")) continue;
      if (looksLikeCaptcha(res.data)) {
        console.warn("⚠️ CAPTCHA detected!");
        continue;
      }

      console.log(`✅ [Axios] Success (len=${res.data.length})`);
      return res.data;
    } catch (err) {
      console.warn(`❌ [Axios Attempt ${attempt}] ${err.message}`);
      await delay(1000 * attempt);
    }
  }
  return null;
}

// ---------------------- Find Team/About Page ----------------------
async function findTeamPage(baseUrl) {
  const slugs = [...teamSlugs, ...aboutSlugs];

  for (const slug of slugs) {
    const testUrl = `${baseUrl}${slug}`;
    console.log(`🔍 Trying ${testUrl}`);

    // First try Axios
    let html = await fetchPage(testUrl, 1);

    // If Axios fails or content too small / looks like captcha, fallback to Puppeteer
    if (!html || html.length < 300 || looksLikeCaptcha(html)) {
      console.warn(
        `⚠️ Axios failed or content too small for ${testUrl}, trying Puppeteer...`
      );
      html = await fetchWithPuppeteer(testUrl, 2);
    }

    if (html && html.length > 300) {
      console.log(`✅ Found team/about page: ${testUrl}`);
      return html;
    } else {
      console.warn(`⚠️ No valid content at ${testUrl}`);
    }
  }

  console.warn("⚠️ No team/about page found, trying homepage...");
  // final fallback to homepage
  let html = await fetchPage(baseUrl, 1);
  if (!html || html.length < 300) {
    html = await fetchWithPuppeteer(baseUrl, 2);
  }
  return html;
}

// ---------------------- Route ----------------------
app.get("/website", async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.json({ status: "failed", content: "" });

  let targetUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  console.log(`🚀 [Request] Scraping ${targetUrl}`);

  try {
    let html = await findTeamPage(targetUrl);

    if (!html || html.length < 300) {
      console.warn("⚠️ [Fallback] Axios gave empty result, 404");
      //   html = await fetchWithPuppeteer(targetUrl);
    }

    if (!html) {
      console.error("❌ No HTML retrieved 404");
      return res.json({ status: "failed", content: "" });
    }

    let $ = cheerio.load(html);
    $(
      "script, style, noscript, svg, img, video, audio, iframe, object, embed, link, meta"
    ).remove();

    let text = cleanText($("body").text());

    if (!text || text.length < 100) {
      console.warn(
        "⚠️ [Empty Text] Page likely JS-rendered — Puppeteer fallback if not yet used."
      );
      html = await fetchWithPuppeteer(targetUrl, 2);

      console.log("🔍 Sample body snippet:", $("body").html()?.slice(0, 500));
      if (html && !html.includes("<body")) {
        console.log("⚠️ HTML missing <body> tag — malformed content detected");
      }

      if (!html) {
        console.error("❌ No HTML retrieved even via Puppeteer");
        return res.json({ status: "failed", content: "" });
      }

      $ = cheerio.load(html);
      $(
        "script, style, noscript, svg, img, video, audio, iframe, object, embed, link, meta"
      ).remove();

      text = cleanText($("body").text());
    }

    console.log(`✅ [Success] Extracted text length: ${text.length}`);
    if (text.length == 0) {
      console.warn("⚠️ [Empty Text] No meaningful content extracted.");
      return res.json({ status: "failed", content: "" });
    }
    return res.json({ status: "success", content: text });
  } catch (err) {
    console.error("❌ [Error]", err.message);
    return res.json({ status: "failed", content: "" });
  }
});

// ---------------------- Health Route ----------------------
app.get("/health", (req, res) => {
  res.json({
    healthyPorts,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------- Start Server ----------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});
