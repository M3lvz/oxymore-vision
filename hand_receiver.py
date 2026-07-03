#!/usr/bin/env python3
"""
hand_receiver.py
================
Récepteur temps réel pour le Hand Tracking Streamer (HTS) Meta Quest.

Protocoles supportés :
  TCP via ADB USB  localhost:8000  (recommandé, ~70 Hz, stable)
  UDP WiFi         0.0.0.0:9000   (sans fil, peut perdre des paquets)

Format paquet HTS (UTF-8 CSV, une ligne par donnée) :
  Right wrist: x, y, z, qx, qy, qz, qw        (7 floats, position + quaternion)
  Right landmarks: x,y,z, x,y,z, ... × 21     (63 floats, 21 joints OpenXR)
  Left wrist: ...
  Left landmarks: ...

Système de coordonnées : Unity left-hand → conversion Y-up standard : flip Z (z = -z).

Ordre des 21 joints (index OpenXR) :
  0=Wrist, 1-4=Thumb, 5-8=Index, 9-12=Middle, 13-16=Ring, 17-20=Little
"""

import json
import os
import select
import shutil
import socket
import subprocess
import threading
import time
from pathlib import Path


# =============================================================================
# ADB helper
# =============================================================================

def setup_adb_tunnel(port: int = 8000) -> tuple[bool, str]:
    """Configure le tunnel ADB : adb reverse tcp:PORT tcp:PORT.
    Retourne (succès, message)."""
    adb = shutil.which("adb")
    if not adb:
        return False, (
            "adb introuvable dans le PATH. "
            "Installez Android SDK Platform Tools et ajoutez-le au PATH, "
            "ou utilisez le mode UDP/WiFi à la place."
        )
    try:
        r = subprocess.run(
            [adb, "reverse", f"tcp:{port}", f"tcp:{port}"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0:
            return True, f"Tunnel ADB configuré : Quest:{port} → PC localhost:{port}"
        err = (r.stderr or r.stdout or "").strip()
        return False, f"adb reverse échoué : {err or 'aucun appareil connecté ?'}"
    except subprocess.TimeoutExpired:
        return False, "adb reverse timeout — Quest branché et déverrouillé ?"
    except Exception as e:
        return False, str(e)


def check_adb() -> dict:
    """Vérifie la présence d'adb et la liste des appareils connectés."""
    adb = shutil.which("adb")
    if not adb:
        return {"available": False, "devices": []}
    try:
        r = subprocess.run([adb, "devices"], capture_output=True, text=True, timeout=5)
        lines = [l.strip() for l in r.stdout.splitlines()[1:] if l.strip() and "device" in l]
        return {"available": True, "devices": lines}
    except Exception:
        return {"available": True, "devices": []}


# =============================================================================
# HandReceiver
# =============================================================================

class HandReceiver:
    """Capture les données HTS en arrière-plan et les sauvegarde en JSON."""

    JOINT_NAMES = [
        "Wrist",
        "ThumbMetacarpal", "ThumbProximal", "ThumbDistal", "ThumbTip",
        "IndexMetacarpal",  "IndexProximal",  "IndexIntermediate",  "IndexDistal",  "IndexTip",
        "MiddleMetacarpal", "MiddleProximal", "MiddleIntermediate", "MiddleDistal", "MiddleTip",
        "RingMetacarpal",   "RingProximal",   "RingIntermediate",   "RingDistal",   "RingTip",
        "LittleMetacarpal", "LittleProximal", "LittleIntermediate", "LittleDistal", "LittleTip",
    ]

    def __init__(self):
        self._thread: threading.Thread | None = None
        self._stop_ev = threading.Event()
        self._lock = threading.Lock()
        self._frames: list = []
        self._start_t: float | None = None
        self._output_path: str | None = None
        self._on_frame = None
        self._connected = False
        self._frame_count = 0
        self._fps = 0.0
        self._fps_count = 0
        self._fps_window_t = 0.0
        self._protocol = "tcp"
        self._port = 8000

    # ── Public API ─────────────────────────────────────────────────────────────

    def start(self, output_path: str, protocol: str = "tcp",
              port: int | None = None, on_frame=None) -> bool:
        """Démarre la capture. Retourne False si déjà en cours."""
        if self._thread and self._thread.is_alive():
            return False
        self._output_path = output_path
        self._protocol = protocol
        self._port = port if port is not None else (8000 if protocol == "tcp" else 9000)
        self._on_frame = on_frame
        self._frames = []
        self._start_t = None
        self._connected = False
        self._frame_count = 0
        self._fps = 0.0
        self._fps_count = 0
        self._fps_window_t = 0.0
        self._stop_ev.clear()
        target = self._run_tcp if protocol == "tcp" else self._run_udp
        self._thread = threading.Thread(target=target, daemon=True,
                                         name="HandReceiver")
        self._thread.start()
        return True

    def stop(self):
        """Arrête la capture et écrit le fichier JSON."""
        self._stop_ev.set()
        if self._thread:
            self._thread.join(timeout=4.0)
        self._connected = False
        self._flush()

    @property
    def status(self) -> dict:
        return {
            "running":     bool(self._thread and self._thread.is_alive()),
            "connected":   self._connected,
            "frame_count": self._frame_count,
            "fps":         round(self._fps, 1),
            "protocol":    self._protocol,
            "port":        self._port,
        }

    # ── Parsing ────────────────────────────────────────────────────────────────

    @staticmethod
    def _floats(s: str) -> list[float]:
        try:
            return [float(v) for v in s.split(",") if v.strip()]
        except ValueError:
            return []

    @staticmethod
    def _flip_z_landmarks(lm: list) -> list:
        """Convertit coordonnées Unity left-hand → Y-up standard (flip Z)."""
        return [[x, y, -z] for x, y, z in lm]

    @staticmethod
    def _flip_z_wrist(w: list) -> list:
        """Flip Z sur position + quaternion (qx, qy → -qy, -qx en LH→RH)."""
        x, y, z, qx, qy, qz, qw = w
        return [x, y, -z, -qy, -qx, qz, qw]

    def _process_line(self, line: str, pending: dict) -> dict | None:
        """Traite une ligne HTS. Retourne un frame complet ou None."""
        line = line.strip()
        if not line:
            return None
        for side_str, side_key in (("Right", "right"), ("Left", "left")):
            if line.startswith(f"{side_str} wrist:"):
                # Nouvelle main droite = nouveau frame
                if side_key == "right" and pending:
                    frame = pending.copy()
                    pending.clear()
                vals = self._floats(line.split(":", 1)[1])
                if len(vals) >= 7:
                    pending.setdefault(side_key, {})["wrist"] = self._flip_z_wrist(vals[:7])
                return None
            elif line.startswith(f"{side_str} landmarks:"):
                vals = self._floats(line.split(":", 1)[1])
                if len(vals) >= 63:
                    lm = [[vals[i*3], vals[i*3+1], vals[i*3+2]] for i in range(21)]
                    pending.setdefault(side_key, {})["landmarks"] = self._flip_z_landmarks(lm)
                # Si on a les deux mains complètes, émettre le frame
                if (pending.get("right", {}).get("wrist") and
                        pending.get("right", {}).get("landmarks") and
                        side_key == "left" and
                        pending.get("left",  {}).get("landmarks")):
                    frame = pending.copy()
                    pending.clear()
                    return frame
                return None
        return None

    def _record_frame(self, frame: dict):
        t = time.monotonic()
        if self._start_t is None:
            self._start_t = t
            self._fps_window_t = t
        rel_t = round(t - self._start_t, 4)
        entry = {"t": rel_t, **frame}
        with self._lock:
            self._frames.append(entry)
        self._frame_count += 1
        self._fps_count += 1
        elapsed = t - self._fps_window_t
        if elapsed >= 1.0:
            self._fps = self._fps_count / elapsed
            self._fps_count = 0
            self._fps_window_t = t
        if self._on_frame:
            try:
                self._on_frame({"t": rel_t, "fps": round(self._fps, 1), **frame})
            except Exception:
                pass

    # ── TCP thread ─────────────────────────────────────────────────────────────

    def _run_tcp(self):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            srv.bind(("localhost", self._port))
        except OSError as e:
            print(f"[HandReceiver] TCP bind échoué : {e}", flush=True)
            return
        srv.listen(1)
        srv.settimeout(1.0)
        print(f"[HandReceiver] TCP en attente sur localhost:{self._port}", flush=True)
        try:
            while not self._stop_ev.is_set():
                try:
                    conn, addr = srv.accept()
                except socket.timeout:
                    continue
                print(f"[HandReceiver] Quest connecté ({addr})", flush=True)
                self._connected = True
                buf = b""
                pending: dict = {}
                try:
                    conn.settimeout(2.0)
                    while not self._stop_ev.is_set():
                        try:
                            chunk = conn.recv(4096)
                        except socket.timeout:
                            continue
                        if not chunk:
                            break
                        buf += chunk
                        while b"\n" in buf:
                            raw_line, buf = buf.split(b"\n", 1)
                            line = raw_line.decode("utf-8", errors="replace")
                            frame = self._process_line(line, pending)
                            if frame:
                                self._record_frame(frame)
                except Exception as e:
                    print(f"[HandReceiver] TCP erreur : {e}", flush=True)
                finally:
                    if pending:
                        self._record_frame(pending)
                    conn.close()
                    self._connected = False
                    print("[HandReceiver] Quest déconnecté", flush=True)
        finally:
            srv.close()

    # ── UDP thread ─────────────────────────────────────────────────────────────

    def _run_udp(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("0.0.0.0", self._port))
        except OSError as e:
            print(f"[HandReceiver] UDP bind échoué : {e}", flush=True)
            return
        sock.setblocking(False)
        print(f"[HandReceiver] UDP en attente sur 0.0.0.0:{self._port}", flush=True)
        try:
            while not self._stop_ev.is_set():
                ready, _, _ = select.select([sock], [], [], 1.0)
                if not ready:
                    continue
                try:
                    data, _ = sock.recvfrom(65536)
                    self._connected = True
                    pending: dict = {}
                    for line in data.decode("utf-8", errors="replace").splitlines():
                        frame = self._process_line(line, pending)
                        if frame:
                            self._record_frame(frame)
                    if pending:
                        self._record_frame(pending)
                except Exception as e:
                    print(f"[HandReceiver] UDP erreur : {e}", flush=True)
        finally:
            sock.close()

    # ── Flush ──────────────────────────────────────────────────────────────────

    def _flush(self):
        """Écrit hand_tracking.json. Ne fait rien si aucun frame capturé."""
        if not self._output_path:
            return
        with self._lock:
            frames = list(self._frames)
        if not frames:
            print("[HandReceiver] Aucun frame capturé — fichier non créé.", flush=True)
            return
        os.makedirs(os.path.dirname(self._output_path), exist_ok=True)
        data = {
            "version":     1,
            "protocol":    self._protocol,
            "joint_names": self.JOINT_NAMES,
            "frame_count": len(frames),
            "frames":      frames,
        }
        Path(self._output_path).write_text(
            json.dumps(data, separators=(",", ":")), encoding="utf-8"
        )
        print(f"[HandReceiver] {len(frames)} frames → {self._output_path}", flush=True)
