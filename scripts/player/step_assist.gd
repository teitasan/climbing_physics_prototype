class_name StepAssist
extends RefCounted


static func try_step_up(body: CharacterBody3D, motion: Vector3) -> Vector3:
	if motion.length_squared() < 0.0001:
		return motion
	var space := body.get_world_3d().direct_space_state
	if space == null:
		return motion
	var from := body.global_position + Vector3.UP * 0.18
	var horiz := Vector3(motion.x, 0.0, motion.z)
	if horiz.length_squared() < 0.0001:
		return motion
	var dir := horiz.normalized()
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * 0.55)
	q.exclude = [body.get_rid()]
	q.collision_mask = 1
	var hit := space.intersect_ray(q)
	if hit.is_empty():
		return motion
	if absf(hit.normal.dot(Vector3.UP)) > 0.55:
		return motion
	var step := GameFeel.MAX_STEP_HEIGHT
	var shape := body.get_node_or_null("CollisionShape3D") as CollisionShape3D
	if shape == null or shape.shape == null:
		return motion
	var params := PhysicsShapeQueryParameters3D.new()
	params.shape = shape.shape
	params.exclude = [body.get_rid()]
	params.collision_mask = 1
	params.transform = Transform3D(Basis.IDENTITY, body.global_position + Vector3.UP * step)
	params.motion = Vector3(horiz.x, 0.0, horiz.z)
	var rest := space.intersect_shape(params, 1)
	if not rest.is_empty():
		return motion
	var down := PhysicsRayQueryParameters3D.create(
		body.global_position + Vector3.UP * (step + 0.05) + dir * 0.28,
		body.global_position + dir * 0.28 + Vector3.DOWN * 0.05
	)
	down.exclude = [body.get_rid()]
	var floor_hit := space.intersect_ray(down)
	if floor_hit.is_empty():
		return motion
	var dy: float = floor_hit.position.y - body.global_position.y
	if dy <= 0.02 or dy > step:
		return motion
	body.global_position.y += dy + 0.02
	return motion
