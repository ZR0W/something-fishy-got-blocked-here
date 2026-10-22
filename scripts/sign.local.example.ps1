# Template for signing with your AMO API keys. Copy it to a git-ignored name first:
#
#     Copy-Item scripts\sign.local.example.ps1 sign.local.ps1
#
# then fill in the two values in sign.local.ps1 (NOT in this file) and run:
#
#     .\sign.local.ps1
#
# "*.local.ps1" is in .gitignore, so the copy never gets committed. Keys come from
# https://addons.mozilla.org/developers/addon/api/key/ (JWT issuer = key, JWT secret = secret).
$env:WEB_EXT_API_KEY = "user:00000000:000"   # JWT issuer
$env:WEB_EXT_API_SECRET = "paste-secret-here" # JWT secret
try {
    npm run sign
} finally {
    Remove-Item Env:WEB_EXT_API_KEY, Env:WEB_EXT_API_SECRET -ErrorAction SilentlyContinue
}
