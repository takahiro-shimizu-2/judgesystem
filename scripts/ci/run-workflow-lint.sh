#!/usr/bin/env bash
set -euo pipefail

ACTIONLINT_VERSION="${ACTIONLINT_VERSION:-1.7.8}"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/judgesystem-ci/actionlint"
INSTALL_DIR="$CACHE_ROOT/$ACTIONLINT_VERSION"
BIN_PATH="$INSTALL_DIR/actionlint"

detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64)
      echo "amd64"
      ;;
    arm64 | aarch64)
      echo "arm64"
      ;;
    *)
      echo "unsupported architecture: $(uname -m)" >&2
      return 1
      ;;
  esac
}

if [[ ! -x "$BIN_PATH" ]]; then
  ARCH="$(detect_arch)"
  OS="$(uname | tr '[:upper:]' '[:lower:]')"
  ARCHIVE_NAME="actionlint_${ACTIONLINT_VERSION}_${OS}_${ARCH}.tar.gz"
  DOWNLOAD_URL="https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/${ARCHIVE_NAME}"

  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/actionlint.tar.gz"
  tar -xzf "$INSTALL_DIR/actionlint.tar.gz" -C "$INSTALL_DIR"
  chmod +x "$BIN_PATH"
fi

"$BIN_PATH" "$@"
