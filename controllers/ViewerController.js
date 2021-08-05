// ViewerController.js

var express = require('express');
var router = express.Router();
router.use(express.json());

var Viewer = require('../models/Viewer');

function decodeCredentials(authorizationString) {
    var username = "";
    var password = "";
    
    if (typeof authorizationString == "string") {
        if (authorizationString.length > 6) {
            var base64part = authorizationString.substring(6); // Skip "Basic "
            var decoded = Buffer.from(base64part, 'base64').toString();
            var splitStr = decoded.split(":");
            if (splitStr.length == 2) {
                username = splitStr[0];
                password = splitStr[1];
            }
        }
    }
    
    return {username: username, password: password};
}

function validateCredentials (headers) {    
    if (Viewer.getAuthSettings().authenticationRequired) {
        if (typeof headers.authorization != "undefined") {
            var credentials = decodeCredentials(headers.authorization);
            var user = credentials.username.replace(/['"]+/g, '?');
            var pass = credentials.password.replace(/['"]+/g, '?');
            var success = Viewer.authenticate(user, pass);   
            console.log(new Date().toISOString() + ' User "' + user + 
                '": Authentication ' + (success ? 'successful' : 'failed'));
            return success;            
        }
        return false;
    } else { // Authentication is disabled in the config
        return true;
    }
}

function imageToBase64(data) {
    return null;
}

router.get('/events', function (req, res) {
    if (validateCredentials (req.headers)) {        
        Promise.all([Viewer.getEvents()])
            .then(function(results){
                console.log('ViewerController: "/events" accessed successfully');
                res.status(200).json({events: results[0]});
            })
            .catch(function(error){
                console.log('ViewerController: "/events" server error');
                res.status(500).json({errors:"Server error"});             
            });
    } else {
        console.log('ViewerController: "/events" access denied');
        res.status(401).json({errors:"Authorization required"});
    }
});

router.get('/image', function (req, res) {
    if (validateCredentials (req.headers)) {
        try 
        {
            var fileName    = req.query.filename;
            // TODO: Add checks to make sure filename is not malformed
            var imageData   = Viewer.getImage(fileName);
            var response    = { imageBase64: imageData.toString('base64') };
        } 
        catch(err)
        {
            console.log('ViewerController: "/image" bad request');
            res.status(400).json({errors:"Bad request"});
        }
        console.log('ViewerController: "/image" accessed successfully');
        res.status(200).json(response);
    } else {
        console.log('ViewerController: "/image" access denied');
        res.status(401).json({errors:"Authorization required"});
    }
});

module.exports = router;