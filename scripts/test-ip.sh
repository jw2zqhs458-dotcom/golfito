#!/usr/bin/env bash
# Test de reserva para Golfito / Club Newman.
#
# Corre el flujo completo (login -> inicio -> verificar -> confirmar) replicando
# EXACTAMENTE lo que hace el navegador:
#   - LECTURAS (planilla): con todas las cookies.
#   - ESCRITURAS (inicio/verificar/agregar): SOLO con danielap_newman + PHPSESSID
#     y headers de navegador real. (Con las cookies danielap_newman1..N el server
#     descarta el alta en silencio.)
#
# Uso:
#   bash test-ip.sh <MATRICULA> <CLAVE> [TORNEO_ID] [HORA_OBJETIVO]
# Ejemplo:
#   bash test-ip.sh 129978 TU_CLAVE 5724 10
#
# Requiere: curl y python3 (ya vienen en macOS).
# NOTA: si la reserva queda hecha, BORRALA desde la web (la X roja) después.
# IMPORTANTE: no lo corras muchas veces seguidas sobre el mismo torneo; el club
# bloquea temporalmente la cuenta ante reservas repetidas rápidas.

set -euo pipefail

USER_MAT="${1:?Falta la matrícula. Uso: bash test-ip.sh MATRICULA CLAVE [TORNEO_ID] [HORA]}"
PASS="${2:?Falta la clave.}"
TID="${3:-5724}"
TARGET_H="${4:-10}"
BASE="https://www.clubnewmangolf.com/golf"
JAR="$(mktemp)"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

# Headers de navegador para las escrituras.
WH=(-H "User-Agent: $UA"
    -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    -H "Accept-Language: es-419,es;q=0.9"
    -H "Origin: https://www.clubnewmangolf.com"
    -H "Referer: $BASE/reservasalta.php"
    -H "Sec-Fetch-Dest: document" -H "Sec-Fetch-Mode: navigate"
    -H "Sec-Fetch-Site: same-origin" -H "Sec-Fetch-User: ?1"
    -H "Upgrade-Insecure-Requests: 1")

echo "→ Login..."
curl -s -m 30 -A "$UA" -c "$JAR" "$BASE/login.php" -o /dev/null
curl -s -m 30 -A "$UA" -b "$JAR" -c "$JAR" \
  --data-urlencode "username=$USER_MAT" --data-urlencode "password=$PASS" \
  --data-urlencode "autologin=1" --data-urlencode "submit=Ingresar" \
  "$BASE/login.php" -o /dev/null

# Cookie de ESCRITURA: solo danielap_newman + PHPSESSID, leídas del cookie jar.
WCOOKIE="$(python3 -c '
import sys,re
want=["danielap_newman","PHPSESSID"]
vals={}
for line in open("'"$JAR"'"):
    p=line.rstrip("\n").split("\t")
    if len(p)>=7 and p[5] in want: vals[p[5]]=p[6]
print("; ".join("%s=%s"%(n,vals[n]) for n in want if n in vals))
')"

echo "→ Buscando línea libre cerca de las ${TARGET_H}:00 en torneo $TID..."
SHEET="$(curl -s -m 30 -A "$UA" -b "$JAR" "$BASE/reservas.php?TorneoID=$TID&vuelta=index2.php")"
read -r H M HOYO < <(printf '%s' "$SHEET" | python3 -c '
import sys,re
t=sys.stdin.buffer.read().decode("latin-1")
mat="'"$USER_MAT"'"; target=int("'"$TARGET_H"'")*60
slots={}
for m in re.finditer(r"altaReserva\(\s*"+re.escape(mat)+r"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*\x27?\w+\x27?\s*,\s*(\d+)\s*\)", t):
    slots.setdefault((int(m.group(1)),int(m.group(2)),int(m.group(3))),0)
if not slots:
    print("NONE 0 0"); sys.exit()
best=min(slots, key=lambda k: (abs(k[0]*60+k[1]-target), k[0]*60+k[1]))
print(best[0], best[1], best[2])
')

if [ "$H" = "NONE" ]; then
  echo "✗ No hay líneas libres en ese torneo. Probá otro TORNEO_ID."
  exit 1
fi
printf '  Slot elegido: %02d:%02d (hoyo %s)\n' "$H" "$M" "$HOYO"

echo "→ INICIO..."
curl -s -m 30 "${WH[@]}" -H "Cookie: $WCOOKIE" \
  --data-urlencode "txtkey=$USER_MAT" --data-urlencode "txtkey2=$H" --data-urlencode "txtkey3=$M" \
  --data-urlencode "txtkey4=$TID" --data-urlencode "txtkey5=$HOYO" --data-urlencode "txtaction=inicio" \
  "$BASE/reservasalta.php" -o /dev/null

echo "→ VERIFICAR matrícula..."
VR="$(curl -s -m 30 "${WH[@]}" -H "Cookie: $WCOOKIE" \
  --data-urlencode "txtv=1" --data-urlencode "txttag=" --data-urlencode "txtv2=$USER_MAT" --data-urlencode "txtv3=" --data-urlencode "txtv4=" \
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
curl -s -m 30 "${WH[@]}" -H "Cookie: $WCOOKIE" \
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
  echo "✅✅ RESERVA CONFIRMADA (Total de Reservas: $TOTAL)."
  echo "   ⚠️  Acordate de BORRARLA desde la web (la X roja) si era de prueba."
else
  echo ""
  echo "❌ NO se confirmó (Total de Reservas: $TOTAL)."
  echo "   Si recién hiciste varias pruebas, el club puede tener la cuenta"
  echo "   bloqueada un rato; esperá y probá de nuevo más tarde / en otro torneo."
fi
rm -f "$JAR"
