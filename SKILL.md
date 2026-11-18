---
name: heizoelpreise
description: "Fetches heating oil prices from Swiss providers (Coop, Migrol, Agrola) and displays results via Hermes."
version: 1.0.0
author: Franky (migriert aus Hermes)
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [chromium, heizoelpreise, node, npm]
    related_skills: []
---

> Benötigt im Container: `node`, `npm` (Chromium/Puppeteer nur noch für Migrol/Agrola, nicht mehr für Coop)


# Heating Oil Price Tracker Skill

Fetches current heating oil prices from Swiss providers and displays results directly via Hermes.

## Usage

Frag mich einfach nach den Heizölpreisen:

```
!heizoel [PLZ] [Liter]
```

Beispiele:
- `!heizoel` → Preise für PLZ 8000 (Standard)
- `!heizoel 8000` → Preise für PLZ 8000
- `!heizoel 8000 3000` → Preise für PLZ 8000, 3000 Liter

## Providers

- **Coop** – Supermarkt
- **Migrol** – Größter Schweizer Brennstoffhändler
- **Agrola** – Regionaler Anbieter

## Output

Der Skill zeigt:
- Aktuelle Preise pro Anbieter
- Preistrend (📈 steigend, 📉 fallend, ➡️ stabil)
- Differenz zum Vortag
- Günstigsten Anbieter 🏆

## Manual Run

```bash
cd /opt/data/skills/research/heizoelpreise
node src/openclaw.js 8000 3000
```
