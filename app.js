// app.js
var express = require('express');
var app = express();

var ViewerController = require('./controllers/ViewerController');
app.use(express.static('html'));
app.use('/api', ViewerController);

module.exports = app;