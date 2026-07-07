import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signJwtServiceAccount(credentials, scope) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri || DEFAULT_TOKEN_URI;
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: credentials.client_email,
      scope,
      aud: tokenUri,
      exp: nowSeconds + 3600,
      iat: nowSeconds,
    }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  signer.end();
  const signature = signer
    .sign(credentials.private_key, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return {
    assertion: `${header}.${claim}.${signature}`,
    tokenUri,
  };
}

async function exchangeServiceAccountJwt(credentialsPath, scope) {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS does not contain a service-account client_email/private_key.");
  }

  const { assertion, tokenUri } = signJwtServiceAccount(credentials, scope);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(`Service-account token exchange failed: HTTP ${response.status}`);
  }
  return payload.access_token;
}

function getGcloudAccessToken(commandArgs) {
  try {
    return execFileSync("gcloud", commandArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export async function getGoogleAccessToken(options = {}) {
  const scope = options.scope || CLOUD_PLATFORM_SCOPE;

  if (process.env.TTD_VISION_ACCESS_TOKEN) {
    return {
      accessToken: process.env.TTD_VISION_ACCESS_TOKEN,
      source: "TTD_VISION_ACCESS_TOKEN",
    };
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return {
      accessToken: await exchangeServiceAccountJwt(process.env.GOOGLE_APPLICATION_CREDENTIALS, scope),
      source: "GOOGLE_APPLICATION_CREDENTIALS",
    };
  }

  const adcToken = getGcloudAccessToken(["auth", "application-default", "print-access-token"]);
  if (adcToken) {
    return {
      accessToken: adcToken,
      source: "gcloud application-default",
    };
  }

  const gcloudToken = getGcloudAccessToken(["auth", "print-access-token"]);
  if (gcloudToken) {
    return {
      accessToken: gcloudToken,
      source: "gcloud active account",
    };
  }

  throw new Error(
    "No Google access token source available. Set GOOGLE_APPLICATION_CREDENTIALS, TTD_VISION_ACCESS_TOKEN, or authenticate gcloud.",
  );
}
