class_name Player
extends CharacterBody3D

var body := BodyProfile.new()
var reach := ReachQuery.new()
var machine: StateMachine
var detector: ClimbDetector
var visuals: PlayerVisuals
var camera_rig: PlayerCamera
var debug_draw: ClimbDebug
var hud: DebugHud

var wish_dir := Vector3.ZERO
var input_vec := Vector2.ZERO
var jumping := false
var sprinting := false
var coyote := 0.0
var jump_buffer := 0.0
var grab_coyote := 0.0
var drop_lock_until := 0.0
var no_regrab_point := Vector3.ZERO
var no_regrab_until := 0.0
var jump_grab_until := 0.0
var spawn_position := Vector3(0, 1, 0)
var debug_enabled := false
var ik_weight := 0.0
var grab_alpha := 0.0
var hang_motion_t := 0.0
var hang_style: int = ClimbTarget.HangStyle.BRACED
var active_target: ClimbTarget
var last_hang_target: ClimbTarget
var time_now := 0.0


func _ready() -> void:
	reach.profile = body
	collision_layer = 2
	collision_mask = 1
	floor_max_angle = GameFeel.FLOOR_MAX_ANGLE
	floor_snap_length = GameFeel.FLOOR_SNAP
	safe_margin = 0.06
	_build_collision()
	visuals = PlayerVisuals.new()
	visuals.name = "Visuals"
	add_child(visuals)
	visuals.setup(self)
	camera_rig = PlayerCamera.new()
	camera_rig.name = "CameraRig"
	add_child(camera_rig)
	camera_rig.setup()
	visuals.snap_facing(camera_rig.flat_forward())
	detector = ClimbDetector.new()
	detector.name = "ClimbDetector"
	add_child(detector)
	detector.setup(self)
	machine = StateMachine.new()
	machine.name = "StateMachine"
	add_child(machine)
	_add_state(GroundedState.new(), "Grounded")
	_add_state(JumpState.new(), "Jump")
	_add_state(FallingState.new(), "Falling")
	_add_state(LedgeGrabState.new(), "LedgeGrab")
	_add_state(HangState.new(), "Hang")
	_add_state(TraverseState.new(), "Traverse")
	_add_state(MantleState.new(), "Mantle")
	_add_state(JumpGrabState.new(), "JumpGrab")
	machine.setup(self, "Grounded")
	debug_draw = ClimbDebug.new()
	debug_draw.name = "ClimbDebug"
	add_child(debug_draw)
	debug_draw.setup(self)
	hud = DebugHud.new()
	add_child(hud)
	hud.setup(self)


func _add_state(state: State, nam: String) -> void:
	state.state_name = nam
	machine.add_child(state)


func _build_collision() -> void:
	var col := CollisionShape3D.new()
	col.name = "CollisionShape3D"
	var shape := CapsuleShape3D.new()
	shape.radius = 0.32
	shape.height = 1.64
	col.shape = shape
	col.position = Vector3(0, 0.82, 0)
	add_child(col)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("debug_toggle"):
		debug_enabled = not debug_enabled
	if event.is_action_pressed("reset"):
		reset_to_spawn()


func _physics_process(delta: float) -> void:
	time_now += delta
	_read_input()
	if is_on_floor():
		coyote = GameFeel.COYOTE_TIME
	else:
		coyote = maxf(coyote - delta, 0.0)
	if Input.is_action_just_pressed("jump"):
		jump_buffer = GameFeel.JUMP_BUFFER
	else:
		jump_buffer = maxf(jump_buffer - delta, 0.0)
	grab_coyote = maxf(grab_coyote - delta, 0.0)
	if global_position.y < -18.0:
		reset_to_spawn()
		return
	machine.physics_update(delta)
	debug_draw.sync()


func _process(delta: float) -> void:
	machine.update(delta)
	visuals.update_visuals(delta)
	hud.refresh()


func _read_input() -> void:
	input_vec = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	sprinting = Input.is_action_pressed("dash")
	var f := camera_rig.flat_forward()
	var r := camera_rig.flat_right()
	wish_dir = (f * -input_vec.y + r * input_vec.x)
	if wish_dir.length_squared() > 1.0:
		wish_dir = wish_dir.normalized()
	elif wish_dir.length_squared() > 0.0001:
		wish_dir = wish_dir.normalized() * wish_dir.length()


func intent_flat() -> Vector3:
	if wish_dir.length_squared() > 0.04:
		return wish_dir.normalized()
	return camera_rig.flat_forward()


func visual_facing() -> Vector3:
	return visuals.facing_dir()


func limb_sockets_world() -> Dictionary:
	var yaw_basis := Basis(Vector3.UP, visuals.facing_yaw)
	var out := {}
	for limb_id in Limb.ALL:
		out[limb_id] = global_position + yaw_basis * body.socket_offset(limb_id)
	return out


func state_name() -> String:
	return machine.current_name if machine else ""


func apply_gravity(delta: float) -> void:
	velocity.y -= GameFeel.GRAVITY * delta


func move_ground(delta: float) -> void:
	var speed := GameFeel.SPRINT_SPEED if sprinting else GameFeel.WALK_SPEED
	var target := wish_dir * speed
	var accel := GameFeel.GROUND_ACCEL if wish_dir.length_squared() > 0.01 else GameFeel.GROUND_DECEL
	velocity.x = move_toward(velocity.x, target.x, accel * delta)
	velocity.z = move_toward(velocity.z, target.z, accel * delta)
	var motion := Vector3(velocity.x, 0.0, velocity.z) * delta
	StepAssist.try_step_up(self, motion)
	move_and_slide()


func move_air(delta: float) -> void:
	var speed := GameFeel.WALK_SPEED * 0.92
	var target := wish_dir * speed
	var accel := GameFeel.AIR_ACCEL if wish_dir.length_squared() > 0.01 else GameFeel.AIR_DECEL
	velocity.x = move_toward(velocity.x, target.x, accel * delta)
	velocity.z = move_toward(velocity.z, target.z, accel * delta)
	move_and_slide()


func consume_jump() -> bool:
	if jump_buffer > 0.0 and coyote > 0.0:
		jump_buffer = 0.0
		coyote = 0.0
		return true
	return false


func try_grab(boost: float = 0.0, force_air := false) -> bool:
	if time_now < drop_lock_until:
		return false
	var airborne := force_air or (not is_on_floor()) or grab_coyote > 0.0
	if not airborne:
		return false
	var t := detector.query({
		"airborne": true,
		"boost": boost,
		"facing": intent_flat(),
		"origin": global_position,
	})
	if t == null or not t.valid:
		return false
	if time_now < no_regrab_until and t.ledge_point.distance_to(no_regrab_point) < GameFeel.REGRAB_SAME_LEDGE_M:
		return false
	if not GameFeel.AUTO_GRAB and not Input.is_action_pressed("jump"):
		# Auto-grab is on for this prototype; keep the branch for later difficulty.
		pass
	active_target = t
	last_hang_target = t
	hang_style = t.hang_style
	machine.change("LedgeGrab", {"target": t})
	return true


func lock_regrab(point: Vector3, duration: float = GameFeel.DROP_LOCKOUT_S) -> void:
	no_regrab_point = point
	no_regrab_until = time_now + duration
	drop_lock_until = time_now + duration * 0.6


func reset_to_spawn() -> void:
	global_position = spawn_position
	velocity = Vector3.ZERO
	active_target = null
	ik_weight = 0.0
	grab_alpha = 0.0
	hang_motion_t = 0.0
	drop_lock_until = 0.0
	no_regrab_until = 0.0
	jump_grab_until = 0.0
	if machine:
		machine.change("Grounded")
	if visuals and visuals.anim_tree:
		visuals.anim_tree.reset_locomotion()
	if visuals:
		visuals.grab_xfade.clear()
	if visuals and camera_rig:
		visuals.snap_facing(camera_rig.flat_forward())


func hang_to(target: ClimbTarget, align: float = 1.0) -> void:
	if target == null:
		return
	var dest := target.hang_pelvis
	var a := clampf(align, 0.0, 1.0)
	global_position = global_position.lerp(dest, a)
	velocity = Vector3.ZERO
	visuals.facing_yaw = lerp_angle(visuals.facing_yaw, visuals.yaw_for_dir(target.facing_dir()), a)
	visuals.rotation.y = visuals.facing_yaw
	active_target = target
	hang_style = target.hang_style
