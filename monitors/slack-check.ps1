# Clawdeck monitor: unread Slack messages (Windows / PowerShell).
#
# This is a TEMPLATE. Point it at however you actually read Slack — an API call,
# a webhook count, a token from Credential Manager, etc. The only contract
# Clawdeck cares about is the two directive lines below.
#
# Output protocol:
#   STATUS: ok | warn | alert | info   -> tile color (green/yellow/red/blue)
#   LABEL:  <short text>                -> tile caption (<= ~14 chars)

$ErrorActionPreference = 'SilentlyContinue'

# --- replace this block with your real check ---------------------------------
$unread = if ($env:CLAWDECK_FAKE_UNREAD) { [int]$env:CLAWDECK_FAKE_UNREAD } else { 0 }
# -----------------------------------------------------------------------------

if ($unread -gt 0) {
  Write-Output "STATUS: warn"
  Write-Output "LABEL: $unread unread"
} else {
  Write-Output "STATUS: ok"
  Write-Output "LABEL: inbox zero"
}
