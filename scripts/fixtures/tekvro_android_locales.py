"""Create owned resource inputs; Apktool compiles the actual APK in CI."""

from pathlib import Path
import sys

if len(sys.argv) != 2 or not Path(sys.argv[1]).is_absolute():
    raise SystemExit("Supply one absolute, absent fixture directory.")

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=False)
(root / "apktool.yml").write_text(
    """version: 3.0.2
apkFileName: tekvro-locales.apk
usesFramework:
  ids: [1]
sdkInfo:
  minSdkVersion: '24'
  targetSdkVersion: '35'
packageInfo:
  forcedPackageId: '127'
versionInfo:
  versionCode: '1'
  versionName: '1.0'
""",
    encoding="utf-8",
)
(root / "AndroidManifest.xml").write_text(
    """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="io.github.forcemind.tekvro.fixture.locales"
    android:versionCode="1" android:versionName="1.0">
  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="35"/>
  <application android:hasCode="false" android:label="@string/app_name"/>
</manifest>
""",
    encoding="utf-8",
)
for directory, greeting in (
    ("values", "Hello from Tekvro"),
    ("values-de", "Tekvro Ressourcen"),
    ("values-zh-rCN", "探核资源验证"),
):
    target = root / "res" / directory
    target.mkdir(parents=True)
    (target / "strings.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources><string name="app_name">Tekvro fixture</string>'
        '<string name="greeting">' + greeting + "</string></resources>\n",
        encoding="utf-8",
    )
