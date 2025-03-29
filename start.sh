#!/bin/bash
npm install
pip install -r requirements.txt
node server.js & node server1.js
wait
