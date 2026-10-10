"""Writes the API address into an app's eas.json build profiles.

The apps reach the API at whatever address was compiled into them, and EAS
compiles from eas.json rather than from the shell, so changing the address
means changing that file. build-apps.sh calls this for each app.

    python3 scripts/set-api-url.py user/eas.json https://api.example.com/api
"""

import json
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    path, api = sys.argv[1], sys.argv[2].rstrip("/")

    with open(path) as handle:
        config = json.load(handle)

    for profile in config.get("build", {}).values():
        profile.setdefault("env", {})["EXPO_PUBLIC_API_URL"] = api

    with open(path, "w") as handle:
        json.dump(config, handle, indent=2)
        handle.write("\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
