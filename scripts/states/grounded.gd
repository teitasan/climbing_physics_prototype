class_name GroundedState
extends State


func physics_update(delta: float) -> void:
	player.ik_weight = move_toward(player.ik_weight, 0.0, delta * 6.0)
	player.apply_gravity(delta)
	if player.consume_jump():
		machine.change("Jump")
		return
	player.move_ground(delta)
	if not player.is_on_floor():
		player.grab_coyote = GameFeel.GRAB_COYOTE_S
		machine.change("Falling")
		return
	# Chest-high wall in front while pushing: still require a jump, but keep
	# a nearby target so the jump immediately grabs.
	if player.wish_dir.length_squared() > 0.2:
		var t := player.detector.query({"airborne": false, "boost": 0.05})
		if t and t.valid and t.ledge_height_from_feet > 0.85 and t.ledge_height_from_feet < 1.45:
			player.active_target = t
