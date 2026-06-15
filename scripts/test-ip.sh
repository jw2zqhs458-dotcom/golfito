#!/usr/bin/env bash
# Test de IP para Golfito / Club Newman.
#
# Corre el flujo de reserva (login -> inicio -> verificar -> confirmar) desde
# ESTA máquina (tu IP) y reporta si la reserva quedó confirmada en la planilla.
# Sirve para confirmar si el bloqueo de "confirmar reserva" es por IP.
#
# Uso:
#   bash test-ip.sh <MATRICULA> <CLAVE> [TORNEO_ID] [HORA_OBJETIVO]
# Ejemplo (jueves, objetivo 10:00):
#   bash test-ip.sh 129978 TU_CLAVE 5724 10
#
# Requiere: curl y python3 (ya vienen en macOS).
# NOTA: si la reserva queda hecha, BORRALA desde la web (la X roja) después.

set -euo pipefail

USER_MAT="${1:?Falta la matrícula. Uso: bash test-ip.sh MATRICULA CLAVE [TORNEO_ID] [HORA]}"
PASS="${2:?Falta la clave.}"
TID="${3:-5724}"
TARGET_H="${4:-10}"
BASE="https://www.clubnewmangolf.com/golf"
JAR="$(mktemp)"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

echo "→ Login..."
curl -s -m 30 -A "$UA" -c "$JAR" "$BASE/login.php" -o /dev/null
curl -s -m 30 -A "$UA" -b "$JAR" -c "$JAR" \
  --data-urlencode "username=$USER_MAT" --data-urlencode "password=$PASS" \
  --data-urlencode "autologin=1" --data-urlencode "submit=Ingresar" \
  "$BASE/login.php" -o /dev/null

echo "→ Buscando línea libre cerca de las ${TARGET_H}:00 en torneo $TID..."
SHEET="$(curl -s -m 30 -A "$UA" -b "$JAR" "$BASE/reservas.php?TorneoID=$TID&vuelta=index2.php")"
read -r H M HOYO < <(printf '%s' "$SHEET" | python3 -c '
import sys,re
t=sys.stdin.buffer.read().decode("latin-1")
mat="'"$USER_MAT"'"; target=int("'"$TARGET_H"'")*60
slots={}
for m in re.finditer(r"altaReserva\(\s*"+re.escape(mat)+r"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*\x27?\w+\x27?\s*,\s*(\d+)\s*\)", t):
    h,mi,ho=int(m.group(1)),int(m.group(2)),int(m.group(3))
    slots.setdefault((h,mi,ho),0)
if not slots:
    print("NONE 0 0"); sys.exit()
best=min(slots, key=lambda k: (abs(k[0]*60+k[1]-target), k[0]*60+k[1]))
print(best[0], best[1], best[2])
')

if [ "$H" = "NONE" ]; then
  echo "✗ No hay líneas libres en ese torneo (¿ya reservaste o está lleno?). Probá otro TORNEO_ID."
  exit 1
fi
printf '  Slot elegido: %02d:%02d (hoyo %s)\n' "$H" "$M" "$HOYO"

echo "→ INICIO..."
curl -s -m 30 -A "$UA" -b "$JAR" -c "$JAR" \
  --data-urlencode "txtkey=$USER_MAT" --data-urlencode "txtkey2=$H" --data-urlencode "txtkey3=$M" \
  --data-urlencode "txtkey4=$TID" --data-urlencode "txtkey5=$HOYO" --data-urlencode "txtaction=inicio" \
  "$BASE/reservasalta.php" -o /dev/null

echo "→ VERIFICAR matrícula..."
VR="$(curl -s -m 30 -A "$UA" -b "$JAR" -c "$JAR" \
  --data-urlencode "txtv=1" --data-urlencode "txtv2=$USER_MAT" --data-urlencode "txtv3=" \
  --data-urlencode "txtID1=$USER_MAT" --data-urlencode "txtName1=" \
  --data-urlencode "txtID2=" --data-urlencode "txtName2=" --data-urlencode "txtID3=" --data-urlencode "txtName3=" \
  --data-urlencode "txtID4=" --data-urlencode "txtName4=" \
  --data-urlencode "txtaction=verificar" \
  "$BASE/reservasalta.php")"
NAME="$(printf '%s' "$VR" | python3 -c '
import sys,re
t=sys.stdin.buffer.read().decode("latin-1")
m=re.search(r"name=\"txtName1\"\s+value=\"([^\"]*)\"", t)
print((m.group(1).strip() if m else ""))
')"
if [ -z "$NAME" ]; then echo "✗ No se pudo validar la matrícula."; exit 1; fi
echo "  Jugador: $NAME"

echo "→ CONFIRMAR reserva..."
curl -s -m 30 -A "$UA" -b "$JAR" -c "$JAR" \
  --data-urlencode "txtv=" --data-urlencode "txttag=" --data-urlencode "txtv2=" --data-urlencode "txtv3=" --data-urlencode "txtv4=" \
  --data-urlencode "txtID1=$USER_MAT" --data-urlencode "txtName1=$NAME" \
  --data-urlencode "txtID2=" --data-urlencode "txtName2=" --data-urlencode "txtID3=" --data-urlencode "txtName3=" \
  --data-urlencode "txtID4=" --data-urlencode "txtName4=" \
  --data-urlencode "txtaction=agregar" \
  "$BASE/reservasalta.php" -o /dev/null

echo "→ Verificando si quedó en la planilla..."
SHEET2="$(curl -s -m 30 -A "$UA" -b "$JAR" "$BASE/reservas.php?TorneoID=$TID&vuelta=index2.php&_=$RANDOM")"
TOTAL="$(printf '%s' "$SHEET2" | python3 -c 'import sys,re; m=re.search(r"Total de Reservas:\s*(\d+)", sys.stdin.buffer.read().decode("latin-1")); print(m.group(1) if m else "?")')"
if printf '%s' "$SHEET2" | grep -q "\[$USER_MAT-"; then
  echo ""
  echo "✅✅ RESERVA CONFIRMADA desde tu IP (Total de Reservas: $TOTAL)."
  echo "   => El bloqueo ES por IP. Hay que reservar desde tu red."
  echo "   ⚠️  Acordate de BORRAR esta reserva de prueba desde la web (la X roja)."
else
  echo ""
  echo "❌ NO se confirmó (Total de Reservas: $TOTAL) — igual que desde el servidor."
  echo "   => El bloqueo NO sería por IP; es otra cosa del sistema."
fi
rm -f "$JAR"
