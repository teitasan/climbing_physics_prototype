class_name GameFeel
extends RefCounted

## Forgiveness / juice knobs. Tighten these later for a harder sim.
## Distances are meters unless noted.

const WALK_SPEED := 4.35
const SPRINT_SPEED := 7.1
const GROUND_ACCEL := 32.0
const GROUND_DECEL := 28.0
const AIR_ACCEL := 14.0
const AIR_DECEL := 6.0
const ROTATE_SPEED := 14.0
const JUMP_VELOCITY := 6.35
const GRAVITY := 19.5
const COYOTE_TIME := 0.14
const JUMP_BUFFER := 0.12
const MAX_STEP_HEIGHT := 0.46
const FLOOR_MAX_ANGLE := 0.9
const FLOOR_SNAP := 0.28

## Climb reach / magnet. Generous on purpose for the prototype.
const GRAB_MAGNET_M := 0.48
const GRAB_FORWARD_M := 0.95
const GRAB_UP_SEARCH_M := 1.85
const GRAB_DOWN_SEARCH_M := 0.55
const GRAB_COYOTE_S := 0.20
const GRAB_AIR_BONUS_M := 0.22
const LEDGE_ALIGN_M := 0.16
const MANTLE_STAND_INSET_M := 0.42
const HANG_BACK_BRACED_M := 0.48
const HANG_BACK_FREE_M := 0.42
const HANG_DROP_BRACED_M := 0.98
const HANG_DROP_FREE_M := 1.18
const TRAVERSE_SPEED := 1.85
const MANTLE_DURATION := 0.58
const DROP_LOCKOUT_S := 0.28
const REGRAB_SAME_LEDGE_M := 0.50
const JUMP_GRAB_MIN_SEPARATION_M := 1.35
const JUMP_GRAB_BOOST_M := 0.55
const JUMP_GRAB_WINDOW_S := 0.45
const CORNER_SEARCH_M := 0.70
const INPUT_INTENT_WEIGHT := 0.72
const MIN_LEDGE_DEPTH_M := 0.06
const MAX_WALL_UP_DOT := 0.52
const MIN_LEDGE_UP_DOT := 0.42
const FOOT_SUPPORT_MAX_M := 0.85
const AUTO_GRAB := true
