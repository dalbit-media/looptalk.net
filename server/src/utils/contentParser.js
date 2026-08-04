const axios = require("axios");
const dns = require("dns").promises;
const net = require("net");
const cheerio = require("cheerio");

const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([a-zA-Z0-9_-]{11})/;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_REDIRECTS = 3;

// Blocks SSRF by rejecting non-http(s) URLs and any hostname that resolves to
// a private, loopback, link-local, or otherwise non-public IP address.
const isPrivateOrReservedIp = (address) => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast/reserved
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }
  return true;
};

const assertPublicHttpUrl = async (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("UNSUPPORTED_PROTOCOL");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost") throw new Error("BLOCKED_HOST");

  const addresses = net.isIP(hostname)
    ? [hostname]
    : (await dns.lookup(hostname, { all: true })).map((entry) => entry.address);

  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
    throw new Error("BLOCKED_HOST");
  }
  return parsed;
};

// Fetches a URL while re-validating every redirect hop against SSRF rules.
const safeFetch = async (initialUrl, config = {}) => {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHttpUrl(currentUrl);
    const response = await axios.get(currentUrl, {
      ...config,
      maxRedirects: 0,
      maxContentLength: MAX_PREVIEW_BYTES,
      maxBodyLength: MAX_PREVIEW_BYTES,
      validateStatus: (status) => (status >= 200 && status < 300) || (status >= 300 && status < 400),
    });
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      currentUrl = new URL(response.headers.location, currentUrl).toString();
      continue;
    }
    return response;
  }
  throw new Error("TOO_MANY_REDIRECTS");
};

const extractYouTubeId = (url) => {
  const match = url.match(YOUTUBE_URL_REGEX);
  return match ? match[1] : null;
};

const getYouTubeMetadata = async (videoId) => {
  try {
    // Use YouTube oEmbed API for simple metadata extraction
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    
    const response = await axios.get(oembedUrl, { timeout: 5000 });
    const data = response.data;

    return {
      videoId,
      url,
      title: data.title,
      thumbnail: data.thumbnail_url,
      duration: null, // oEmbed doesn't provide duration
      author: data.author_name,
    };
  } catch (error) {
    console.error("Error fetching YouTube metadata:", error.message);
    // Return basic metadata if oEmbed fails
    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `YouTube Video - ${videoId}`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/0.jpg`,
    };
  }
};

const getLinkPreview = async (url) => {
  try {
    const response = await safeFetch(url, {
      timeout: 5000,
      responseType: "text",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const $ = cheerio.load(response.data);
    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text() ||
      "";
    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";
    const imageUrl = $('meta[property="og:image"]').attr("content") || null;

    // Extract favicon
    let faviconUrl = null;
    const iconLink = $(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
    ).first();
    if (iconLink.length) {
      faviconUrl = iconLink.attr("href");
      if (!faviconUrl.startsWith("http")) {
        const urlObj = new URL(url);
        faviconUrl = `${urlObj.origin}${faviconUrl}`;
      }
    }

    return {
      url,
      title: title.substring(0, 200),
      description: description.substring(0, 300),
      imageUrl,
      faviconUrl,
    };
  } catch (error) {
    console.error("Error fetching link preview:", error.message);
    return {
      url,
      title: "Link Preview",
    };
  }
};

const parseMessageContent = (content) => {
  const youtubeMatch = content.match(YOUTUBE_URL_REGEX);
  const urlMatches = content.match(/https?:\/\/[^\s]+/g);

  return {
    hasYouTube: !!youtubeMatch,
    youtubeId: youtubeMatch ? extractYouTubeId(content) : null,
    hasLinks: urlMatches && urlMatches.length > 0,
    links: urlMatches || [],
  };
};

module.exports = {
  extractYouTubeId,
  getYouTubeMetadata,
  getLinkPreview,
  parseMessageContent,
};
