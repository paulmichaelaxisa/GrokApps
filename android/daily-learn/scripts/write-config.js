// Writes www/config.local.js with the xAI key from env. Never prints the key.
const fs = require("fs"), path = require("path");
const key = (process.env.XAI_API_KEY || process.env.REHEARSAL_XAI_KEY || "").trim();
if (!/^xai-/.test(key)) { console.error("No valid XAI_API_KEY / REHEARSAL_XAI_KEY in env"); process.exit(1); }
const out = path.join(__dirname, "..", "www", "config.local.js");
fs.writeFileSync(out, "window.DAILY_LEARN_CONFIG = " + JSON.stringify({ xaiKey: key }) + ";\n", { mode: 0o600 });
console.log("Wrote www/config.local.js (key length " + key.length + ", source " + (process.env.XAI_API_KEY ? "XAI_API_KEY" : "REHEARSAL_XAI_KEY") + ")");
