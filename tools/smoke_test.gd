extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var packed := load("res://scenes/main.tscn")
	if packed == null:
		push_error("Failed to load main.tscn")
		quit(1)
		return
	var scene: Node = packed.instantiate()
	root.add_child(scene)
	await process_frame
	await physics_frame
	await physics_frame
	await physics_frame
	var player := root.find_child("Player", true, false)
	if player == null:
		push_error("Player missing")
		quit(1)
		return
	print("SMOKE_OK player_at=", player.global_position, " state=", player.state_name())
	quit(0)
