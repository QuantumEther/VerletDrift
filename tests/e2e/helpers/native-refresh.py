"""Send real X11 keys to the test-owned Chromium window (Linux/XTest only)."""
import ctypes
import sys

x11 = ctypes.CDLL('libX11.so.6')
xtest = ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x11.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
xtest.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
display = x11.XOpenDisplay(None)
if not display:
    raise RuntimeError('A headed X11 display is required')
window = int(sys.argv[1], 0)
x11.XRaiseWindow(display, window)
x11.XSetInputFocus(display, window, 1, 0)
keys = ['Control_L'] + (['Shift_L'] if sys.argv[2] == 'hard' else []) + ['r']
codes = [x11.XKeysymToKeycode(display, x11.XStringToKeysym(k.encode())) for k in keys]
for code in codes:
    xtest.XTestFakeKeyEvent(display, code, 1, 0)
for code in reversed(codes):
    xtest.XTestFakeKeyEvent(display, code, 0, 0)
x11.XSync(display, 0)
x11.XCloseDisplay(display)
