class_name FallingState
extends State


func physics_update(delta: float) -> void:
	player.apply_gravity(delta)
	player.move_air(delta)
	var boost := GameFeel.JUMP_GRAB_BOOST_M if player.time_now < player.jump_grab_until else 0.0
	if player.try_grab(boost, true):
		return
	if player.is_on_floor():
		machine.change("Grounded")
