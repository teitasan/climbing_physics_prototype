class_name StateMachine
extends Node

var player: Player
var states: Dictionary = {}
var current: State
var current_name := ""


func setup(p: Player, initial: String) -> void:
	player = p
	for child in get_children():
		if child is State:
			var st := child as State
			st.machine = self
			st.player = p
			states[st.state_name] = st
	change(initial)


func change(to: String, data: Dictionary = {}) -> void:
	if not states.has(to):
		push_warning("Unknown state: %s" % to)
		return
	var prev := current_name
	if current:
		current.exit(to)
	current = states[to]
	current_name = to
	current.enter(prev, data)


func physics_update(delta: float) -> void:
	if current:
		current.physics_update(delta)


func update(delta: float) -> void:
	if current:
		current.update(delta)
