class_name PlayerCamera
extends Node3D

## Over-the-shoulder third-person boom. Pivot sits on the chest, the camera
## lives behind the look direction (local +Z, Camera3D looks -Z) and a bit
## to the character's right so the body stays on the left of the frame.

@export var mouse_sensitivity := 0.0022
@export var pitch_min := -1.05
@export var pitch_max := 0.62
@export var arm_length := 3.45
@export var height := 1.36
@export var shoulder_offset := 0.58

var yaw := PI
var pitch := -0.30
var camera: Camera3D
var captured := true


func setup() -> void:
	top_level = true
	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.fov = 62.0
	camera.near = 0.12
	camera.far = 250.0
	add_child(camera)
	camera.current = true
	_sync_pivot()
	camera.position = _desired_local()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and captured:
		var motion := event as InputEventMouseMotion
		yaw -= motion.relative.x * mouse_sensitivity
		pitch -= motion.relative.y * mouse_sensitivity
		pitch = clampf(pitch, pitch_min, pitch_max)
	if event.is_action_pressed("mouse_toggle"):
		captured = not captured
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if captured else Input.MOUSE_MODE_VISIBLE


func _process(_delta: float) -> void:
	_sync_pivot()


func _physics_process(_delta: float) -> void:
	_sync_pivot()
	var desired := _desired_local()
	var space := get_world_3d().direct_space_state
	if space:
		var from := to_global(Vector3(-shoulder_offset, 0.08, 0.0))
		var to := to_global(desired)
		var q := PhysicsRayQueryParameters3D.create(from, to)
		q.collision_mask = 1
		var parent_body := get_parent()
		if parent_body is CollisionObject3D:
			q.exclude = [(parent_body as CollisionObject3D).get_rid()]
		var hit := space.intersect_ray(q)
		if hit:
			var hit_dist: float = from.distance_to(hit.position) - 0.2
			camera.position = Vector3(-shoulder_offset, 0.08, maxf(0.55, hit_dist))
		else:
			camera.position = desired
	else:
		camera.position = desired
	camera.rotation = Vector3.ZERO


func _sync_pivot() -> void:
	var p := get_parent() as Node3D
	if p == null:
		return
	global_position = p.global_position + Vector3.UP * height
	global_rotation = Vector3(pitch, yaw, 0.0)


func _desired_local() -> Vector3:
	return Vector3(-shoulder_offset, 0.08, arm_length)


func flat_forward() -> Vector3:
	var f := -camera.global_transform.basis.z
	f.y = 0.0
	if f.length_squared() < 0.0001:
		return Vector3(0.0, 0.0, 1.0)
	return f.normalized()


func flat_right() -> Vector3:
	var r := camera.global_transform.basis.x
	r.y = 0.0
	if r.length_squared() < 0.0001:
		return Vector3.RIGHT
	return r.normalized()
