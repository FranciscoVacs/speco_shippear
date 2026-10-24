#!/bin/bash
# usage: run.sh <id> <cond>   -> round 1, then rework rounds while hidden tests fail (max 3 rounds)
set -u
EXP=C:/Users/User/AppData/Local/Temp/claude/C--Users-User-orca-workspaces-speco-ia-launch/4205aa1d-f202-4621-b8f0-e0d8acf1ef76/scratchpad/exp
PY=C:/Users/User/orca/workspaces/speco.ia/launch/.venv/Scripts/python
ID=$1; C=$2; R=$EXP/runs/$ID
rm -rf $R; mkdir -p $R/specs/006-wire-transfer-limits
cp $EXP/specs_$C/* $R/specs/006-wire-transfer-limits/
FLAGS=(--model claude-sonnet-5-5 --output-format json --max-budget-usd 3 --permission-mode acceptEdits --allowedTools "Read,Write,Edit,Glob,Grep,Bash(python -m pytest:*)" --safe-mode --strict-mcp-config)
hidden() {
  ( cd $EXP/hidden && WIRES_DIR=$R PYTHONIOENCODING=utf-8 PYTHONDONTWRITEBYTECODE=1 $PY -m pytest -p no:cacheprovider -q test_hidden.py > $R/hidden_r$1.txt 2>&1 )
  grep -Eo '[0-9]+ passed' $R/hidden_r$1.txt | grep -Eo '[0-9]+' || echo 0
}
cd $R
claude -p "$(cat $EXP/prompt.txt)" "${FLAGS[@]}" > $R/round1.json 2> $R/round1.err
P=$(hidden 1); echo "$ID r1 passed=$P"
SID=$($PY -c "import json,sys;print(json.load(open(sys.argv[1]))['session_id'])" $R/round1.json)
for n in 2 3; do
  [ "$P" = "10" ] && break
  cd $R
  claude -p "$(cat $EXP/rework.txt)" --resume $SID "${FLAGS[@]}" > $R/round$n.json 2> $R/round$n.err
  P=$(hidden $n); echo "$ID r$n passed=$P"
done
echo "$ID done"
