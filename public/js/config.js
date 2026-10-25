/* ==================================================================
   MAKE STONK GREAT AGAIN — site settings
   Edit this file and push to GitHub: Vercel redeploys automatically.
   Everything here is public. Never put secrets in this file.
   ================================================================== */
const CONFIG = {
  links: {
    stonk: "https://stonkfun.xyz",   // Stonk launchpad
    x: "",                            // e.g. "https://x.com/yourhandle"
    dexscreener: ""                   // e.g. "https://dexscreener.com/solana/<pair address>"
  },

  // Official platform logos. Download them from each platform's own brand / press kit,
  // put the files in /public/assets/logos/ and set the paths, e.g. "assets/logos/dexscreener.svg".
  // While a value is empty, the button shows a dashed "LOGO" placeholder instead of a made-up logo.
  logos: {
    dexscreener: "",
    x: "",
    stonk: "",
    pumpfun: ""
  },

  contract: "",       // token contract address, shown in the footer once set
  launchDate: ""      // "YYYY-MM-DD" -> powers DAYS SINCE LAUNCH
};
