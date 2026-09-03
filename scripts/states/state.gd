class_name State
extends Node

var machine: StateMachine
var player: Player
var state_name := "State"


func enter(_prev: String, _data: Dictionary = {}) -> void:
	pass


func exit(_next: String) -> void:
	pass


func physics_update(_delta: float) -> void:
	pass


func update(_delta: float) -> void:
	pass
