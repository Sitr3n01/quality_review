# Unity / C# extension (future work)

This document sketches how the quality gate extends to Unity and C# projects. v1 ships heuristics tuned for JS/TS; this is the roadmap.

## Detection

`utils.detectStack()` sets `stack.unity = true` when both `Assets/` and `ProjectSettings/` exist. The `quality-gate.config.cjs` already includes Unity-friendly patterns:

```js
files: {
  include: [..., "Assets/**/*.cs", "**/*.cs"],
  exclude: [..., "Library/**", "Temp/**", "obj/**", "bin/**"],
}
```

So the file-size and complexity heuristics already work on `.cs` files. Only the Unity-specific rules below are TBD.

## Planned Unity-specific checks

### Test runner integration

```
unity -batchmode -projectPath . -runTests -testPlatform EditMode
unity -batchmode -projectPath . -runTests -testPlatform PlayMode
```

Wire these into `ci.yml` behind `if: stack.unity == true`. Capture results in NUnit XML, convert to the gate's JSON shape.

### MonoBehaviour size

- New `MonoBehaviour` > 400 lines → warning.
- New `MonoBehaviour` > 700 lines → blocking.
- Detection: `: MonoBehaviour` substring + class span analysis.

### Hot-path antipatterns

Static analysis of `Update()`, `FixedUpdate()`, `LateUpdate()`:

- `FindObjectOfType<>()` inside `Update` → blocking (catastrophic perf).
- Repeated `GetComponent<>()` without caching → warning/blocking depending on count.
- `Instantiate` / `Destroy` in loops without pooling → warning/blocking.
- `Resources.Load` in runtime-critical paths → warning.

These need a real C# parser. Likely candidate: Roslyn via a small console tool.

### Scene and prefab integrity

- Missing Script components in prefabs → blocking.
- Scenes referenced in code but not in Build Settings → blocking.
- Prefabs in `Assets/` not referenced from any scene/prefab → info (potential dead asset).

### Allocation tracking

Scan for likely per-frame allocations:

- `new List<>()` in `Update`
- string concatenation in `Update`
- `LINQ` in `Update`

These are warnings; many are legitimate, so the gate should not block by default.

### Editor vs runtime separation

Detect `using UnityEditor;` in non-editor scripts (anything outside an `Editor/` folder or guarded `#if UNITY_EDITOR`). Blocking — these break standalone builds.

## Implementation outline

To add Unity support without disturbing the existing collectors:

1. Add `scripts/quality/collect-unity.js`. Same shape: `{ available, ..., warnings }`.
2. Extend `compareBaseline()` with a `compareUnity(...)` that follows the same ratchet pattern.
3. Add `unity` section to `quality/quality-gate.config.cjs` with toggles.
4. Add `unity` section to `quality/baseline.json` schema (bump `schemaVersion` to 2).
5. Add `unity` rows to the Markdown summary table in `render-markdown.js`.

The schema bump is intentional: it forces every consumer of the JSON to acknowledge the new fields.

## Why this isn't in v1

- A real C# analyzer is a substantial dependency (Roslyn or similar).
- Unity has many version-specific quirks that need careful handling.
- The skill should ship usable on day one for the dominant case (JS/TS) and grow into Unity rather than launch with a half-finished Unity implementation.

## Working in the meantime

For a Unity project today:

- The file-size collector already flags oversized `.cs` files.
- The complexity heuristic already flags long methods and deep nesting in C#.
- Add Unity test runs to `ci.yml` manually if your team has set up Unity in CI.
- File Unity-specific findings as issues in the Unity team's backlog; the gate will land them when the C# analyzer integration is done.
