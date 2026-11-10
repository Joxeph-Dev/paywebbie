// Verifies the PayPal and Gemini credentials in .env without printing them.
// Uses process.exitCode, not process.exit(): exiting while fetch's socket is open crashes Node on Windows.
import { GoogleGenAI } from "@google/genai";
import { hasCredentials, requestToken } from "./paypal.ts";
import { MODEL } from "./ai.ts";

if (!hasCredentials()) {
  console.error("ERROR: PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are missing. Copy .env.example to .env and fill them in.");
  process.exitCode = 1;
} else {
  try {
    const token = await requestToken();
    console.log(`OK: PayPal sandbox credentials work (app ${token.app_id ?? "unknown"}).`);
  } catch (err) {
    console.error(`ERROR: PayPal rejected the credentials: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

if (!process.env.GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY is missing. Create a free key at aistudio.google.com and add it to .env.");
  process.exitCode = 1;
} else {
  try {
    const model = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).models.get({ model: MODEL });
    console.log(`OK: Gemini key works and can use ${model.displayName ?? MODEL}.`);
  } catch (err) {
    console.error(`ERROR: Gemini rejected the key or model ${MODEL}: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
