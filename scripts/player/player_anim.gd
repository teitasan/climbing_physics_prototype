class_name PlayerAnimTree
extends AnimationTree

## Runtime AnimationTree: Player state → UAL clips → blend. Climbing clips are
## not in the Standard pack, so Hang / Mantle stay on the procedural fallback.

const UAL_SCENE := "res://assets/animations/quaternius/AnimationLibrary_Godot_Standard.glb"

const CLIP_IDLE := "Idle"
const CLIP_WALK := "Walk"
const CLIP_JOG := "Jog_Fwd"
const CLIP_SPRINT := "Sprint"
const CLIP_JUMP_START := "Jump_Start"
const CLIP_JUMP_LOOP := "Jump"
const CLIP_JUMP_LAND := "Jump_Land"

var player: Player
var ap: AnimationPlayer
var playback: AnimationNodeStateMachinePlayback
var using_tree := false
var _prev_state := "Grounded"
var _blend := 0.0
var _jump_started := false
var _air_time := 0.0
var _air_down := 0.0
var _planted := false


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
		return false
	if not active:
		active = true
	var speed := Vector3(player.velocity.x, 0.0, player.velocity.z).length()
	_blend = lerpf(_blend, _speed_blend(speed), 1.0 - exp(-delta * 9.0))
	set("parameters/Locomotion/blend_position", _blend)
	var cur := str(playback.get_current_node())
	match st:
		"Jump":
			_air_time += delta
			_air_down = minf(_air_down, player.velocity.y)
			if _prev_state != "Jump":
				_jump_started = true
				_travel("JumpStart")
			elif _jump_started and player.velocity.y < 0.35:
				_force("JumpLoop")
		"Falling", "JumpGrab":
			_air_time += delta
			_air_down = minf(_air_down, player.velocity.y)
			if cur == "JumpStart" and player.velocity.y < 0.0:
				_force("JumpLoop")
			elif cur != "JumpLoop" and cur != "JumpStart":
				_travel("JumpLoop")
		"Grounded":
			_jump_started = false
			if _is_air(_prev_state):
				if _air_down < -3.8 and speed < GameFeel.WALK_SPEED * 0.55:
					_travel("JumpLand")
				else:
					_force("Locomotion")
			elif speed > 0.45:
				_force("Locomotion")
			elif cur != "JumpLand" and cur != "Locomotion":
				_travel("Locomotion")
			_air_time = 0.0
			_air_down = 0.0
			if not _planted and str(playback.get_current_node()) == "Locomotion":
				_plant_feet()
		_:
			pass
	_prev_state = st
	return true


func stop_for_pose() -> void:
	active = false


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


func _build_state_machine() -> AnimationNodeStateMachine:
	var sm := AnimationNodeStateMachine.new()
	sm.add_node("Locomotion", _build_locomotion(), Vector2(280, 140))
	sm.add_node("JumpStart", _clip(CLIP_JUMP_START, CLIP_JUMP_LOOP), Vector2(280, 20))
	sm.add_node("JumpLoop", _clip(CLIP_JUMP_LOOP, CLIP_IDLE), Vector2(520, 20))
	sm.add_node("JumpLand", _clip(CLIP_JUMP_LAND, CLIP_IDLE), Vector2(520, 140))
	_link(sm, "Start", "Locomotion", 0.0, false, true)
	_link(sm, "Locomotion", "JumpStart", 0.10)
	_link(sm, "Locomotion", "JumpLoop", 0.08)
	_link(sm, "Locomotion", "JumpLand", 0.08)
	_link(sm, "JumpStart", "JumpLoop", 0.06, true, true)
	_link(sm, "JumpStart", "JumpLand", 0.08)
	_link(sm, "JumpStart", "Locomotion", 0.10)
	_link(sm, "JumpLoop", "JumpLand", 0.10)
	_link(sm, "JumpLoop", "Locomotion", 0.10)
	_link(sm, "JumpLand", "Locomotion", 0.12, true, true)
	_link(sm, "JumpLand", "JumpStart", 0.08)
	_link(sm, "JumpLand", "JumpLoop", 0.08)
	return sm


func _build_locomotion() -> AnimationNodeBlendSpace1D:
	var bs := AnimationNodeBlendSpace1D.new()
	bs.min_space = 0.0
	bs.max_space = 1.0
	bs.sync = true
	bs.add_blend_point(_clip(CLIP_IDLE, CLIP_IDLE), 0.0, -1, "Idle")
	bs.add_blend_point(_clip(CLIP_WALK, CLIP_IDLE), 0.38, -1, "Walk")
	if _has_clip(CLIP_JOG):
		bs.add_blend_point(_clip(CLIP_JOG, CLIP_WALK), 0.72, -1, "Jog")
	bs.add_blend_point(_clip(CLIP_SPRINT if _has_clip(CLIP_SPRINT) else CLIP_WALK, CLIP_WALK), 1.0, -1, "Sprint")
	return bs


func _clip(clip_name: String, fallback: String) -> AnimationNodeAnimation:
	var node := AnimationNodeAnimation.new()
	if _has_clip(clip_name):
		node.animation = clip_name
	else:
		node.animation = fallback
	return node


func _has_clip(clip_name: String) -> bool:
	return ap != null and ap.has_animation(clip_name)


func _link(sm: AnimationNodeStateMachine, from: String, to: String, fade: float, at_end := false, auto := false) -> void:
	var trans := AnimationNodeStateMachineTransition.new()
	trans.xfade_time = fade
	if at_end:
		trans.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END
	if auto:
		trans.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO
	else:
		trans.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED
	sm.add_transition(from, to, trans)


func _travel(node_name: String) -> void:
	if playback == null:
		return
	if str(playback.get_current_node()) == node_name:
		return
	playback.travel(node_name)


func _force(node_name: String) -> void:
	if playback == null:
		return
	if str(playback.get_current_node()) == node_name:
		return
	playback.start(node_name)


func _plant_feet() -> void:
	if _planted or player == null or player.visuals == null:
		return
	var skel: Skeleton3D = player.visuals.skeleton
	var root_n: Node3D = player.visuals.imported_root
	if skel == null or root_n == null:
		return
	skel.force_update_all_bone_transforms()
	var min_y := 999.0
	for bone_name in ["LeftFoot", "RightFoot", "LeftToes", "RightToes"]:
		var idx := skel.find_bone(bone_name)
		if idx < 0:
			continue
		var world_y := (skel.global_transform * skel.get_bone_global_pose(idx)).origin.y
		min_y = minf(min_y, world_y)
	if min_y > 100.0:
		return
	root_n.position.y += player.global_position.y - min_y
	_planted = true


func _speed_blend(speed: float) -> float:
	if speed < 0.18:
		return 0.0
	var walk := GameFeel.WALK_SPEED
	var sprint := GameFeel.SPRINT_SPEED
	if speed < walk:
		return lerpf(0.0, 0.42, clampf(speed / walk, 0.0, 1.0))
	return lerpf(0.42, 1.0, clampf((speed - walk) / maxf(sprint - walk, 0.1), 0.0, 1.0))


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
