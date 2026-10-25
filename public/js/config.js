/* ==================================================================
   MAKE STONK GREAT AGAIN — site settings
   Edit this file and push to GitHub: Vercel redeploys automatically.
   Everything here is public. Never put secrets in this file.
   ================================================================== */
const CONFIG = {
  links: {
    stonk: "https://stonkfun.xyz",   // Stonk launchpad
    x: "",                            // e.g. "https://x.com/yourhandle"
    dexscreener: "https://dexscreener.com/solana/FubKncLirKhy1Ds1odwDi3kn8RE2aFZVd4gc6CAUV8WB"
  },

  // Official platform logos. Download them from each platform's own brand / press kit,
  // put the files in /public/assets/logos/ and set the paths, e.g. "assets/logos/dexscreener.svg".
  // While a value is empty, the button shows a generic XP-style icon (chart / rocket / X) instead.
  logos: {
    dexscreener: "",
    x: "",
    stonk: "",
    pumpfun: ""
  },

  contract: "FubKncLirKhy1Ds1odwDi3kn8RE2aFZVd4gc6CAUV8WB",   // token contract address (footer)
  launchDate: ""      // "YYYY-MM-DD" -> powers DAYS SINCE LAUNCH
};
