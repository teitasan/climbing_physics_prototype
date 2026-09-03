# Third-party materials

This prototype's original code is MIT (`LICENSE`). External code was not copied from GPL or unlicensed repositories.

## Used or intended assets

### Quaternius Universal Base Characters

- URL: https://quaternius.com/packs/universalbasecharacters.html
- Also: https://quaternius.itch.io/universal-base-characters
- License: CC0 1.0 (`assets/characters/quaternius/License_Standard.txt`)
- Use: Player mesh. The free Standard pack contains Superhero Male / Female (Regular proportions are Source-only). This project uses `Superhero_Male_FullBody.gltf` plus `Hair_SimpleParted`.

### Quaternius Universal Animation Library

- URL: https://quaternius.com/packs/universalanimationlibrary.html
- Also: https://quaternius.itch.io/universal-animation-library
- License: CC0 (free Standard pack)
- Use: Optional future retarget onto the humanoid rig. Not required to play.

### Godot Engine

- URL: https://godotengine.org/
- License: MIT
- Use: Runtime (Godot 4.7, Forward+ renderer, optional Jolt Physics)

## Research only (no code copied)

### OpenClimber

- URL: https://github.com/kernelshreyak/openclimber
- License: **not declared** on the GitHub repository (`license: null` via the GitHub API at the time of writing)
- Use: Design notes only — physics-driven climbing, arbitrary climbable surfaces, limb placement that does not depend on a huge animation set
- Action: No files, snippets, or assets from this repo are included here

### ProjectUltraversal

- URL: https://github.com/Metal-666/ProjectUltraversal
- License: GPL-3.0
- Use: Design notes only — Ledge Grab, Cat Hang, Free Hang, Climb Up, Jump Grab, state split between grounded locomotion and traversal
- Action: No GPL code is included in this prototype

## Original implementation in this repo

Climb detection, state machine, reach units (25cm), IK, test course, and game-feel constants were written for this prototype. Algorithms follow common third-person traversal practice (wall ray → lip search → stand shapecast) and are not a copy of the research projects above.
