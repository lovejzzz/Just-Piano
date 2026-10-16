#!/bin/sh
# Local, version-pinned analysis entry point; does not alter global MCP settings.
export GHIDRA_INSTALL_DIR="$HOME/.local/share/ghidra/ghidra_12.1.4_PUBLIC"
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export GHIDRA_HEADLESS_MAXMEM=4G
export REA_GHIDRA_STARTUP_TIMEOUT_MS=900000
exec npx --yes rea-agents@6.5.0 "$@"
