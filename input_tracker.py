from pynput import keyboard, mouse
import json
import sys

key_stroke_count = 0
mouse_click_count = 0
mouse_move_count = 0

def on_key_press(key):
    global key_stroke_count
    key_stroke_count += 1
    print(json.dumps({"type": "keystroke", "count": key_stroke_count}))
    sys.stdout.flush()

def on_mouse_click(x, y, button, pressed):
    global mouse_click_count
    if pressed:
        mouse_click_count += 1
        print(json.dumps({"type": "mouseclick", "count": mouse_click_count}))
        sys.stdout.flush()

def on_mouse_move(x, y):
    global mouse_move_count
    mouse_move_count += 1
    print(json.dumps({"type": "mousemove", "count": mouse_move_count}))
    sys.stdout.flush()

# Start listeners
keyboard_listener = keyboard.Listener(on_press=on_key_press)
mouse_listener = mouse.Listener(on_click=on_mouse_click, on_move=on_mouse_move)

keyboard_listener.start()
mouse_listener.start()

keyboard_listener.join()
mouse_listener.join()
