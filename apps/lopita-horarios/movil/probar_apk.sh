#!/bin/sh
# Instala el .apk en el emulador, lo abre y ejecuta probar_apk.mjs contra su WebView.
# El socket de depuración de la WebView se llama webview_devtools_remote_<pid de la app>; se calcula con
# pidof porque en Android reciente /proc/net/unix no se puede leer desde adb shell.
# Recién arrancado, el emulador a veces reinicia Google Play Services y Android mata la app con él
# («depends on provider ... in dying proc»): si la app ya no está, se vuelve a abrir, hasta tres veces.
set -eu
APK="$1"
PAQUETE=es.lopita.horarios.demo
registro() { adb logcat -d | grep -iE "chromium|capacitor|console|$PAQUETE" | tail -n 200 || true; }
adb install -r "$APK"
for apertura in 1 2 3; do
  adb shell am start -W -n "$PAQUETE/.MainActivity"
  # Android a veces recrea la actividad nada más abrirla: se deja asentar antes de buscar el proceso.
  sleep 15
  PID=""
  for i in $(seq 1 30); do
    PID=$(adb shell pidof "$PAQUETE" | tr -d '\r' || true)
    [ -n "$PID" ] && break
    sleep 2
  done
  [ -n "$PID" ] || { echo "La app no está en marcha"; registro; exit 1; }
  adb forward tcp:9222 "localabstract:webview_devtools_remote_$PID"
  node "$(dirname "$0")/probar_apk.mjs" http://localhost:9222 && exit 0
  AHORA=$(adb shell pidof "$PAQUETE" | tr -d '\r' || true)
  if [ "$AHORA" = "$PID" ]; then registro; exit 1; fi
  echo "Android cerró la app (apertura $apertura); se vuelve a abrir"
  adb forward --remove tcp:9222 || true
done
registro
exit 1
