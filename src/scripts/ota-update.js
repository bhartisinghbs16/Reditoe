#!/usr/bin/env node
/**
 * Publishes an over-the-air update for one app, aimed at one build profile.
 *
 *   cd user && npm run ota:preview -- "what changed"
 *   cd user && npm run ota:production -- "what changed"
 *
 * Run from inside the app's folder: it reads that app's eas.json.
 *
 * Why not just `eas update`? An update is bundled on THIS machine, and Expo
 * inlines EXPO_PUBLIC_* into the bundle while doing so - from the shell first,
 * then from .env.production, which in user/ and delivery/ points at localhost.
 * A bare `eas update` would therefore ship an app that talks to localhost to
 * every phone on the channel. The build profile in eas.json is what the APK
 * was compiled with (build-apps.sh rewrites it for exactly that reason), so
 * this takes the channel and the API address from the same place and the
 * update always matches the build it is replacing.
 *
 * An update only reaches builds whose runtime version matches. The policy is
 * "fingerprint": the runtime version is a hash of everything native about the
 * app (native modules, config plugins, permissions, eas.json, icons...), worked
 * out for you. Change any of that and the hash changes, so the update is
 * published for a runtime no installed build has - build and install again.
 * Change only JavaScript, and it matches the build already on phones.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const [profileName, ...messageParts] = process.argv.slice(2);

function fail(text) {
  console.error(`ota-update: ${text}`);
  process.exit(1);
}

const easPath = path.join(process.cwd(), "eas.json");
if (!fs.existsSync(easPath)) {
  fail("no eas.json here - run this from inside user/, vendor/ or delivery/.");
}

const profiles = JSON.parse(fs.readFileSync(easPath, "utf8")).build ?? {};
const profile = profiles[profileName];
if (!profile) {
  fail(`usage: ota-update.js <${Object.keys(profiles).join("|")}> ["message"]`);
}

const { channel, env = {} } = profile;
if (!channel) {
  fail(`the "${profileName}" profile in eas.json has no "channel".`);
}

const api = env.EXPO_PUBLIC_API_URL;
if (!api) {
  fail(`the "${profileName}" profile in eas.json has no env.EXPO_PUBLIC_API_URL.`);
}
if (/localhost|127\.0\.0\.1|10\.0\.2\.2/.test(api)) {
  fail(`${api} only answers on this machine - the update would break every phone.`);
}

// The message goes through a shell on its way to eas. Dollar signs and
// backticks are the two things a shell would act on inside double quotes.
const message =
  messageParts.join(" ").replace(/[`$]/g, "").trim() ||
  `OTA ${new Date().toISOString().slice(0, 16)}`;

console.log(`channel : ${channel}`);
console.log(`api     : ${api}`);
console.log(`message : ${message}\n`);

// --clear-cache is not optional. Metro's cache is not keyed on environment
// variables, so without it a second publish reuses the first one's transforms
// and the API address inlined by the previous run - preview's address could
// end up on the production channel. Costs a slower bundle each time.
//
// `eas` is eas.cmd on Windows, which only resolves through a shell.
const result = spawnSync(
  `eas update --channel ${channel} --platform android --clear-cache --message ${JSON.stringify(message)}`,
  { stdio: "inherit", shell: true, env: { ...process.env, ...env } }
);

process.exit(result.status ?? 1);
