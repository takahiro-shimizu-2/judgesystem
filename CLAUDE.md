# Judge System - AI Agent Guidelines

## Project Overview
入札適格性判定システム（Bid Eligibility Judgment System）
- Python処理エンジン: 公告PDF解析・OCR・判定ロジック
- Webアプリ: React + Express + PostgreSQL

## Architecture
- `source/bid_announcement_judgement_tools/` - Python判定エンジン
- `source/bid_apps/postgres/backend/` - Express API
- `source/bid_apps/postgres/frontend/` - React UI

## Integrated Tools
- **Miyabi**: Issue→PR自動化 (`.miyabi.yml`)
- **agent-skill-bus**: スキル監視 (`skills/`)
- **gitnexus-stable-ops**: コードグラフ (`.gitnexus/`)
- **portfolio-ops**: フリート管理

## Conventions
- Frontend: TypeScript strict, MUI v7, React Router v7
- Backend API: Express, 3-layer architecture (Controller→Service→Repository)
- Python: Python 3.12, SQLAlchemy, Gemini API for OCR
- Commit: Conventional Commits format
