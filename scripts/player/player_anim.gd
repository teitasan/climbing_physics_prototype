class_name PlayerAnimTree
extends AnimationTree

## Player state → UAL clips → blend. Climbing clips are not in the Standard pack.

const UAL_SCENE := "res://assets/animations/quaternius/AnimationLibrary_Godot_Standard.glb"

const CLIP_IDLE := "Idle"
const CLIP_WALK := "Walk"
const CLIP_JOG := "Jog_Fwd"
const CLIP_SPRINT := "Sprint"
const CLIP_JUMP_START := "Jump_Start"
const CLIP_JUMP_LOOP := "Jump"
const CLIP_JUMP_LAND := "Jump_Land"

## Native locomotion speeds from foot stride on this rig (`tools/measure_clips.gd`).
## Clips are in-place; BlendSpace is in m/s and TimeScale covers GameFeel speeds above Sprint.
const CLIP_MPS_IDLE := 0.0
const CLIP_MPS_WALK := 1.08
const CLIP_MPS_JOG := 2.65
const CLIP_MPS_SPRINT := 3.49

const PARAM_BLEND := "parameters/Locomotion/Blend/blend_position"
const PARAM_SCALE := "parameters/Locomotion/TimeScale/scale"

var player: Player
var ap: AnimationPlayer
var playback: AnimationNodeStateMachinePlayback
var using_tree := false
var _prev_state := "Grounded"
var _blend_mps := 0.0
var _jump_started := false
var _air_time := 0.0
var _air_down := 0.0


func setup(p: Player, skeleton: Skeleton3D, host: Node3D) -> bool:
	player = p
	if skeleton == null or host == null:
		return false
	if not ResourceLoader.exists(UAL_SCENE):
		return false
	ap = AnimationPlayer.new()
	ap.name = "AnimationPlayer"
	host.add_child(ap)
	ap.owner = host
	ap.root_node = NodePath("..")
	if not _install_library(skeleton):
		ap.queue_free()
		ap = null
		return false
	_plant_from_idle(skeleton)
	name = "AnimationTree"
	host.add_child(self)
	owner = host
	anim_player = ap.get_path()
	tree_root = _build_state_machine()
	active = true
	callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_IDLE
	playback = get("parameters/playback") as AnimationNodeStateMachinePlayback
	if playback == null:
		push_warning("PlayerAnimTree: no state machine playback")
		active = false
		if ap:
			ap.queue_free()
			ap = null
		return false
	playback.start("Locomotion")
	using_tree = true
	return true


func drive(delta: float) -> bool:
	if not using_tree or playback == null:
		return false
	if player == null or not player.visuals.auto_animate:
		active = false
		return false
	var st := player.state_name()
	if _is_climb(st):
		active = false
		_prev_state = st
		_jump_started = false
		_air_time = 0.0
		_air_down = 0.0
		return false
	if not active:
		active = true
		playback.start("Locomotion")
	var speed := Vector3(player.velocity.x, 0.0, player.velocity.z).length()
	_update_locomotion_params(delta, speed)
	var cur := str(playback.get_current_node())
	match st:
		"Jump":
			_air_time += delta
			_air_down = minf(_air_down, player.velocity.y)
			if _prev_state != "Jump":
				_jump_started = true
				_travel("JumpStart")
			elif cur == "JumpStart" and (player.velocity.y < 0.35 or _remaining() <= 0.08):
				_travel("JumpLoop")
		"Falling", "JumpGrab":
			_air_time += delta
			_air_down = minf(_air_down, player.velocity.y)
			if cur == "JumpStart" and (player.velocity.y < 0.0 or _remaining() <= 0.08):
				_travel("JumpLoop")
			elif cur != "JumpLoop" and cur != "JumpStart":
				_travel("JumpLoop")
		"Grounded":
			_jump_started = false
			if _is_air(_prev_state):
				if _air_down < -3.8 and speed < GameFeel.WALK_SPEED * 0.55:
					_travel("JumpLand")
				else:
					_travel("Locomotion")
			elif cur == "JumpLand":
				if speed > 0.45 or _remaining() <= 0.12:
					_travel("Locomotion")
			elif cur != "Locomotion":
				_travel("Locomotion")
			_air_time = 0.0
			_air_down = 0.0
		_:
			pass
	_prev_state = st
	return true


func stop_for_pose() -> void:
	active = false


func reset_locomotion() -> void:
	if not using_tree or playback == null:
		return
	active = true
	_prev_state = "Grounded"
	_blend_mps = 0.0
	_jump_started = false
	_air_time = 0.0
	_air_down = 0.0
	playback.start("Locomotion")


func _update_locomotion_params(delta: float, speed: float) -> void:
	var target := 0.0 if speed < 0.18 else speed
	_blend_mps = lerpf(_blend_mps, target, 1.0 - exp(-delta * 9.0))
	set(PARAM_BLEND, _blend_mps)
	if _blend_mps < 0.2:
		set(PARAM_SCALE, 1.0)
	else:
		var native := minf(_blend_mps, CLIP_MPS_SPRINT)
		set(PARAM_SCALE, _blend_mps / maxf(native, 0.2))


func _install_library(skeleton: Skeleton3D) -> bool:
	var packed := load(UAL_SCENE)
	if packed == null or not (packed is PackedScene):
		return false
	var donor: Node = packed.instantiate()
	var donor_ap := _find_ap(donor)
	if donor_ap == null:
		donor.free()
		return false
	var dest := AnimationLibrary.new()
	var copied := 0
	for lib_name in donor_ap.get_animation_library_list():
		var src: AnimationLibrary = donor_ap.get_animation_library(lib_name)
		if src == null:
			continue
		for clip in src.get_animation_list():
			var anim := src.get_animation(clip)
			if anim == null:
				continue
			dest.add_animation(clip, _localize_anim(anim, ap, skeleton))
			copied += 1
	donor.free()
	if copied == 0 or not dest.has_animation(CLIP_IDLE):
		return false
	if ap.has_animation_library(""):
		ap.remove_animation_library("")
	ap.add_animation_library("", dest)
	return true


func _localize_anim(src: Animation, mixer: AnimationMixer, skeleton: Skeleton3D) -> Animation:
	var anim: Animation = src.duplicate(true)
	var from_root := mixer.get_node(mixer.root_node)
	var skel_path := NodePath(str(from_root.get_path_to(skeleton)))
	for i in anim.get_track_count():
		var p := anim.track_get_path(i)
		var bone := String(p.get_concatenated_subnames())
		if bone.is_empty():
			continue
		anim.track_set_path(i, NodePath(str(skel_path) + ":" + bone))
	return anim


func _plant_from_idle(skeleton: Skeleton3D) -> void:
	if player == null or player.visuals == null or player.visuals.imported_root == null:
		return
	if not ap.has_animation(CLIP_IDLE):
		return
	ap.play(CLIP_IDLE)
	ap.speed_scale = 0.0
	ap.seek(0.0, true)
	ap.advance(0.0)
	skeleton.force_update_all_bone_transforms()
	var min_y := 999.0
	for bone_name in ["LeftFoot", "RightFoot", "LeftToes", "RightToes"]:
		var idx := skeleton.find_bone(bone_name)
		if idx < 0:
			continue
		min_y = minf(min_y, skeleton.get_bone_global_pose(idx).origin.y)
	ap.stop()
	ap.speed_scale = 1.0
	if min_y < 100.0:
		player.visuals.imported_root.position.y = -min_y


func _build_state_machine() -> AnimationNodeStateMachine:
	var sm := AnimationNodeStateMachine.new()
	sm.add_node("Locomotion", _build_locomotion(), Vector2(280, 140))
	sm.add_node("JumpStart", _clip(CLIP_JUMP_START, CLIP_JUMP_LOOP), Vector2(280, 20))
	sm.add_node("JumpLoop", _clip(CLIP_JUMP_LOOP, CLIP_IDLE), Vector2(520, 20))
	sm.add_node("JumpLand", _clip(CLIP_JUMP_LAND, CLIP_IDLE), Vector2(520, 140))
	_link(sm, "Start", "Locomotion", 0.0, true)
	_link(sm, "Locomotion", "JumpStart", 0.10)
	_link(sm, "Locomotion", "JumpLoop", 0.08)
	_link(sm, "Locomotion", "JumpLand", 0.08)
	_link(sm, "JumpStart", "JumpLoop", 0.08)
	_link(sm, "JumpStart", "JumpLand", 0.08)
	_link(sm, "JumpStart", "Locomotion", 0.10)
	_link(sm, "JumpLoop", "JumpLand", 0.10)
	_link(sm, "JumpLoop", "Locomotion", 0.10)
	_link(sm, "JumpLand", "Locomotion", 0.12)
	_link(sm, "JumpLand", "JumpStart", 0.08)
	_link(sm, "JumpLand", "JumpLoop", 0.08)
	return sm


func _build_locomotion() -> AnimationNodeBlendTree:
	var bs := AnimationNodeBlendSpace1D.new()
	bs.min_space = 0.0
	bs.max_space = maxf(CLIP_MPS_SPRINT, GameFeel.SPRINT_SPEED)
	bs.sync = true
	bs.add_blend_point(_clip(CLIP_IDLE, CLIP_IDLE), CLIP_MPS_IDLE, -1, "Idle")
	bs.add_blend_point(_clip(CLIP_WALK, CLIP_IDLE), CLIP_MPS_WALK, -1, "Walk")
	if _has_clip(CLIP_JOG):
		bs.add_blend_point(_clip(CLIP_JOG, CLIP_WALK), CLIP_MPS_JOG, -1, "Jog")
	bs.add_blend_point(_clip(CLIP_SPRINT if _has_clip(CLIP_SPRINT) else CLIP_WALK, CLIP_WALK), CLIP_MPS_SPRINT, -1, "Sprint")
	var ts := AnimationNodeTimeScale.new()
	var bt := AnimationNodeBlendTree.new()
	bt.add_node("Blend", bs, Vector2(0, 80))
	bt.add_node("TimeScale", ts, Vector2(220, 80))
	bt.connect_node("TimeScale", 0, "Blend")
	bt.connect_node("output", 0, "TimeScale")
	return bt


func _clip(clip_name: String, fallback: String) -> AnimationNodeAnimation:
	var node := AnimationNodeAnimation.new()
	if _has_clip(clip_name):
		node.animation = clip_name
	else:
		node.animation = fallback
	return node


func _has_clip(clip_name: String) -> bool:
	return ap != null and ap.has_animation(clip_name)


func _link(sm: AnimationNodeStateMachine, from: String, to: String, fade: float, auto := false) -> void:
	var trans := AnimationNodeStateMachineTransition.new()
	trans.xfade_time = fade
	trans.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
	trans.advance_mode = (
		AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO
		if auto
		else AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED
	)
	sm.add_transition(from, to, trans)


func _travel(node_name: String) -> void:
	if playback == null:
		return
	if str(playback.get_current_node()) == node_name:
		return
	playback.travel(node_name)


func _remaining() -> float:
	if playback == null:
		return 0.0
	return maxf(playback.get_current_length() - playback.get_current_play_position(), 0.0)


func _is_air(st: String) -> bool:
	return st == "Jump" or st == "Falling" or st == "JumpGrab"


func _is_climb(st: String) -> bool:
	return st == "Hang" or st == "Traverse" or st == "LedgeGrab" or st == "Mantle"


func _find_ap(n: Node) -> AnimationPlayer:
	if n is AnimationPlayer:
		return n
	for c in n.get_children():
		var a := _find_ap(c)
		if a:
			return a
	return null
