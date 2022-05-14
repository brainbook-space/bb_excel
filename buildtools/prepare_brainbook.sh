#!/usr/bin/env bash

set -e

echo "Making Python3 sandbox"
if [ ! -e sandbox/venv ]; then
  python3 -m venv sandbox/venv
fi

echo "Updating Python3 packages"
sandbox/venv/bin/pip install --no-deps -r sandbox/requirements3.txt
echo "Python3 packages ready in sandbox/venv"

. sandbox/venv/bin/activate; pip3 install pyinstaller; pyinstaller --add-data "sandbox/grist/tzdata.data:." --onefile sandbox/grist/main.py
