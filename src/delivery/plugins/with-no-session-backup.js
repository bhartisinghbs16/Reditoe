/**
 * Keep the signed-in session off Android's backup.
 *
 * `android:allowBackup` defaults to true, so Android copies the app's data
 * directory - which is where the session token lives - to the user's Google
 * account and restores it when the app is installed again. The reported
 * symptom is that reinstalling skips the login screen; the sharper problem is
 * that the same Google account on a different phone would be restored into
 * somebody's account without ever entering a password.
 *
 * Two switches are needed, because Android 12 split them:
 *   allowBackup           - cloud backup, all versions
 *   dataExtractionRules   - cloud backup and device-to-device transfer, 12+
 *
 * Nothing is lost by turning them off. Addresses, orders and the wallet live
 * on the server against the account; the only local state worth anything is
 * the token, and that is precisely what must not survive a reinstall.
 *
 * Written as a config plugin because `expo prebuild` regenerates the manifest,
 * so a hand edit to it disappears on the next build.
 */
const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const RULES_FILE = "session_backup_rules.xml";

/** Excludes everything: there is no app data worth restoring. */
const RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="file" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="file" />
    </device-transfer>
</data-extraction-rules>
`;

const withSessionBackupRulesFile = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, RULES_FILE), RULES_XML);
      return cfg;
    },
  ]);

const withSessionBackupManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$["android:allowBackup"] = "false";
    application.$["android:dataExtractionRules"] = `@xml/${RULES_FILE.replace(".xml", "")}`;
    // Pre-12 devices read this one; harmless on newer ones.
    application.$["android:fullBackupContent"] = "false";
    return cfg;
  });

module.exports = (config) =>
  withSessionBackupManifest(withSessionBackupRulesFile(config));
