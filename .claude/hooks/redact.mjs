// Masks literal credential-shaped strings before they're written to
// .agent-logs/ (which gets committed to a public repo). Added after a real
// incident: a pasted Groq key got captured raw and GitHub's push protection
// blocked the push. This does not summarize or omit content — it only masks
// tokens matching known secret-key shapes; everything else in the raw
// prompt/response is preserved verbatim.

// Whole-match patterns: the entire match is replaced with ***REDACTED***.
// Prefix groups are non-capturing so they never get mistaken for the
// connection-string pattern's capture groups below.
const WHOLE_MATCH_PATTERNS = [
  /\b(?:sk|gsk|ghp|gho|ghu|ghs|ghr|ghc|pk|rk)_[A-Za-z0-9]{16,}\b/g, // Anthropic/Groq/GitHub/Stripe-style
  /\bAIza[0-9A-Za-z_-]{20,}\b/g, // Google API key
  /\bya29\.[0-9A-Za-z_-]{20,}\b/g, // Google OAuth access token
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g, // Slack tokens
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWTs
];

// Password-in-connection-string: keep the scheme/user and "@", mask only
// the password portion (capture groups 1 and 3 are preserved).
const CONNECTION_STRING_PATTERN = /(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/g;

export function redactSecrets(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const pattern of WHOLE_MATCH_PATTERNS) {
    out = out.replace(pattern, "***REDACTED***");
  }
  out = out.replace(CONNECTION_STRING_PATTERN, (_match, prefix, _password, at) => `${prefix}***REDACTED***${at}`);
  return out;
}

export function redactDeep(value) {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}
