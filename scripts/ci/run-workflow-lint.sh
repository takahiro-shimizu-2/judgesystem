#!/usr/bin/env bash
set -euo pipefail

ACTIONLINT_VERSION="${ACTIONLINT_VERSION:-1.7.8}"
SHELLCHECK_VERSION="${SHELLCHECK_VERSION:-0.10.0}"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/judgesystem-ci/actionlint"
INSTALL_DIR="$CACHE_ROOT/$ACTIONLINT_VERSION"
BIN_PATH="$INSTALL_DIR/actionlint"
SHELLCHECK_CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/judgesystem-ci/shellcheck"
SHELLCHECK_INSTALL_DIR="$SHELLCHECK_CACHE_ROOT/$SHELLCHECK_VERSION"
SHELLCHECK_BIN_PATH="$SHELLCHECK_INSTALL_DIR/shellcheck"

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

detect_shellcheck_arch() {
  case "$(uname -m)" in
    x86_64 | amd64)
      echo "x86_64"
      ;;
    arm64 | aarch64)
      echo "aarch64"
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

if [[ ! -x "$SHELLCHECK_BIN_PATH" ]]; then
  ARCH="$(detect_shellcheck_arch)"
  ARCHIVE_NAME="shellcheck-v${SHELLCHECK_VERSION}.linux.${ARCH}.tar.xz"
  DOWNLOAD_URL="https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/${ARCHIVE_NAME}"

  rm -rf "$SHELLCHECK_INSTALL_DIR"
  mkdir -p "$SHELLCHECK_INSTALL_DIR"

  curl -fsSL "$DOWNLOAD_URL" -o "$SHELLCHECK_INSTALL_DIR/shellcheck.tar.xz"
  tar -xJf "$SHELLCHECK_INSTALL_DIR/shellcheck.tar.xz" -C "$SHELLCHECK_INSTALL_DIR"
  cp "$SHELLCHECK_INSTALL_DIR/shellcheck-v${SHELLCHECK_VERSION}/shellcheck" "$SHELLCHECK_BIN_PATH"
  chmod +x "$SHELLCHECK_BIN_PATH"
fi

"$BIN_PATH" -shellcheck "$SHELLCHECK_BIN_PATH" "$@"
