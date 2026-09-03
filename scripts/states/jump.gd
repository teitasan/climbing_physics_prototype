class_name JumpState
extends State


func enter(_prev: String, _data: Dictionary = {}) -> void:
	player.velocity.y = GameFeel.JUMP_VELOCITY
	player.jumping = true


func physics_update(delta: float) -> void:
	player.apply_gravity(delta)
	player.move_air(delta)
	if player.try_grab():
		return
	if player.velocity.y <= 0.0:
		machine.change("Falling")
		return
	if player.is_on_floor():
		machine.change("Grounded")
