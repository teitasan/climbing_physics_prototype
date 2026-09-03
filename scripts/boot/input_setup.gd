extends Node


func _ready() -> void:
	_bind("move_left", [KEY_A, KEY_LEFT])
	_bind("move_right", [KEY_D, KEY_RIGHT])
	_bind("move_forward", [KEY_W, KEY_UP])
	_bind("move_back", [KEY_S, KEY_DOWN])
	_bind("jump", [KEY_SPACE])
	_bind("dash", [KEY_SHIFT])
	_bind("drop", [KEY_X, KEY_C])
	_bind("debug_toggle", [KEY_F1])
	_bind("mouse_toggle", [KEY_ESCAPE])
	_bind("reset", [KEY_R])


func _bind(action: String, keys: Array) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	for keycode in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = keycode
		if not InputMap.action_has_event(action, ev):
			InputMap.action_add_event(action, ev)
