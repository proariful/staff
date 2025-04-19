from pynput import keyboard, mouse
import json
import sys

key_stroke_count = 0
mouse_click_count = 0
mouse_move_count = 0

def reset_counters():
    global key_stroke_count, mouse_click_count, mouse_move_count
    key_stroke_count = 0
    mouse_click_count = 0
    mouse_move_count = 0
    print(json.dumps({"type": "reset_ack"}))  # Acknowledge the reset
    sys.stdout.flush()

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

# Main loop to handle messages from the main process
for line in sys.stdin:
    try:
        message = json.loads(line.strip())
        if message["type"] == "reset":
            reset_counters()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.stderr.flush()

keyboard_listener.join()
mouse_listener.join()
