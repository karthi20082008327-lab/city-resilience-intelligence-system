#!/bin/bash
cd /mnt/ExtraSpace/ucrip/frontend
setsid node node_modules/.bin/vite --host 0.0.0.0 </dev/null >/tmp/vite.log 2>&1 &

