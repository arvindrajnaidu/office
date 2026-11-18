# Keep Chromium tied to the browser runtime even if its Node parent crashes.
import ctypes
import os
import signal
import sys
parent = os.getppid()
ctypes.CDLL(None).prctl(1, signal.SIGTERM)
if os.getppid() != parent:
    sys.exit(1)
os.execv(sys.argv[1], sys.argv[1:])
