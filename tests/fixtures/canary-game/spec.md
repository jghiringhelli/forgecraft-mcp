# Orbit Breaker

## Problem

Casual browser games die because of jank: dropped frames, input lag, and
loading hitches kill retention in the first 30 seconds. We want a physics
puzzle game that holds 60fps on mid-range phones.

## Users

- **Player**: plays 2-minute sessions on mobile browser, expects instant load
- **Level designer**: authors levels as JSON, previews them in a dev harness

## Goals

- 2D physics puzzle: launch a probe, use planet gravity wells to reach the goal
- 60 levels, each defined declaratively in JSON (positions, masses, win zone)
- 60fps on mid-range mobile; initial load < 3 seconds on 3G
- Progress saved locally; no accounts, no backend

## Components

- **Game loop**: fixed-timestep physics, interpolated rendering (Phaser 3)
- **Physics**: n-body gravity approximation, collision detection
- **Level loader**: JSON schema-validated level definitions
- **HUD**: launch angle/power controls, attempt counter, star rating
- **Save system**: localStorage progress persistence

## External Systems

- None at runtime. CDN for static hosting.

## Non-Functional Requirements

- Frame budget: 16.6ms — physics ≤4ms, render ≤8ms per frame
- Bundle ≤ 1.5 MB gzipped including engine
- Works offline after first load (service worker)
