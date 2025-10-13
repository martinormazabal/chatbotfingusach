#!/usr/bin/env node
const path = require('path');

if (!process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'fake';
}

const routePath = path.join(__dirname, '..', 'routes', 'requests.js');
require(routePath);

console.log('requests route loaded successfully');